"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  buildingSchema,
  cancelVisitSchema,
  checkbox,
  companySettingsSchema,
  customerSchema,
  damageSchema,
  employeeSchema,
  extraChargeSchema,
  firstZodError,
  formValue,
  formValues,
  manualVisitSchema,
  messageSchema,
  propertyAdminSettingsSchema,
  propertyBillingProfileSchema,
  propertySchema,
  propertyServiceSchema,
  rescheduleVisitSchema,
  visitPlanSchema,
  visitPlanStatusSchema,
} from "@/lib/portal/validation";
import {
  calculateTaxCents,
  calculateTimedChargeCents,
  formatAddress,
  formatGermanDate,
  parseBerlinDateTimeLocal,
  parseEuroToCents,
} from "@/lib/portal/core";
import { canCancelExtraCharge } from "@/lib/monthlyBilling";
import { requireAdminContext } from "@/lib/portal/access";
import {
  type PropertyMessageActionState,
  propertyMessageActionError,
  propertyMessageActionSuccess,
} from "@/lib/portal/chatActionState";
import { uploadPortalFile } from "@/lib/portal/files";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  deriveBuildingQrToken,
  newQrNonce,
  normalizePlainText,
  safeStorageFilename,
  sha256,
  validateUploadContents,
} from "@/lib/portal/security";

function go(path: string, key: "status" | "error", value: string): never {
  const separator = path.includes("?") ? "&" : "?";
  redirect(`${path}${separator}${key}=${encodeURIComponent(value)}`);
}

function propertyViewPath(propertyId: string, view: string) {
  return `/admin/properties/${propertyId}?view=${encodeURIComponent(view)}`;
}

async function requireMutableProperty(
  admin: Awaited<ReturnType<typeof requireAdminContext>>["admin"],
  propertyId: string,
  fallback = `/admin/properties/${propertyId}`,
) {
  const { data: property, error } = await admin
    .from("properties")
    .select("id,status")
    .eq("id", propertyId)
    .maybeSingle();
  if (error || !property) {
    go(fallback, "error", "Die Immobilie wurde nicht gefunden.");
  }
  if (property.status === "archived") {
    go(
      fallback,
      "error",
      "Archivierte Immobilien sind geschlossen und können nicht mehr operativ geändert werden.",
    );
  }
  return property;
}

function customerPayload(formData: FormData) {
  return {
    category: formValue(formData, "category"),
    companyName: formValue(formData, "companyName"),
    firstName: formValue(formData, "firstName"),
    lastName: formValue(formData, "lastName"),
    contactFirstName: formValue(formData, "contactFirstName"),
    contactLastName: formValue(formData, "contactLastName"),
    email: formValue(formData, "email"),
    phone: formValue(formData, "phone"),
    street: formValue(formData, "street"),
    houseNumber: formValue(formData, "houseNumber"),
    postalCode: formValue(formData, "postalCode"),
    city: formValue(formData, "city"),
    country: formValue(formData, "country") || "Deutschland",
    notes: formValue(formData, "notes"),
  };
}

function changedFields(
  previous: Record<string, unknown>,
  next: Record<string, unknown>,
) {
  return Object.fromEntries(
    Object.entries(next)
      .filter(([key, value]) => previous[key] !== value)
      .map(([key, value]) => [
        key,
        { previous: previous[key] ?? null, next: value ?? null },
      ]),
  );
}

export async function createCustomerAction(formData: FormData) {
  const { profile, admin } = await requireAdminContext();
  const parsed = customerSchema.safeParse(customerPayload(formData));
  if (!parsed.success)
    go("/admin/customers", "error", firstZodError(parsed.error));
  const value = parsed.data;
  const contactName = [
    value.contactFirstName || value.firstName,
    value.contactLastName || value.lastName,
  ]
    .filter(Boolean)
    .join(" ");
  const billingAddress = formatAddress(value);

  const { data: existing, error: existingError } = await admin
    .from("customers")
    .select("id,status")
    .ilike("email", value.email)
    .neq("status", "archived")
    .maybeSingle();
  if (existingError)
    go("/admin/customers", "error", "Bestehende Kundendaten konnten nicht geprüft werden.");
  if (existing)
    go(
      "/admin/customers",
      "error",
      "Für diese E-Mail existiert bereits ein Kunde.",
    );

  const { data: customer, error } = await admin
    .from("customers")
    .insert({
      category: value.category,
      company_name: value.companyName || null,
      first_name: value.firstName || null,
      last_name: value.lastName || null,
      contact_first_name: value.contactFirstName || null,
      contact_last_name: value.contactLastName || null,
      contact_name: contactName,
      email: value.email,
      phone: value.phone || null,
      billing_street: value.street,
      billing_house_number: value.houseNumber,
      billing_postal_code: value.postalCode,
      billing_city: value.city,
      billing_country: value.country,
      billing_address: billingAddress,
      notes: value.notes || null,
      status: "inactive",
    })
    .select("id")
    .single();
  if (error || !customer)
    go("/admin/customers", "error", "Kunde konnte nicht gespeichert werden.");

  const { error: invitationError } = await admin.from("invitations").insert({
    email: value.email,
    role: "customer",
    category: value.category,
    customer_id: customer.id,
    status: "draft",
    invited_by: profile.id,
  });
  if (invitationError) {
    await admin.from("customers").delete().eq("id", customer.id);
    go(
      "/admin/customers",
      "error",
      "Der Kunde konnte nicht zusammen mit einer Einladung angelegt werden.",
    );
  }
  const { error: auditError } = await admin.from("audit_logs").insert({
    actor_id: profile.id,
    action: "customer.created",
    entity_table: "customers",
    entity_id: customer.id,
    metadata: { category: value.category },
  });
  if (auditError) {
    await admin.from("invitations").delete().eq("customer_id", customer.id).eq("status", "draft");
    await admin.from("customers").delete().eq("id", customer.id);
    go("/admin/customers", "error", "Die Anlage konnte nicht revisionssicher protokolliert werden.");
  }
  revalidatePath("/admin/customers");
  go(
    "/admin/customers",
    "status",
    "Kunde wurde angelegt. Die Einladung kann jetzt versendet werden.",
  );
}

export async function updateCustomerAction(formData: FormData) {
  const { profile, admin } = await requireAdminContext();
  const customerId = formValue(formData, "customerId");
  const expectedUpdatedAt = formValue(formData, "updatedAt");
  const detailPath = `/admin/customers/${customerId}`;
  const fallback = `${detailPath}?view=details`;
  if (!/^[0-9a-f-]{36}$/i.test(customerId) || !expectedUpdatedAt) {
    go("/admin/customers", "error", "Ungültiger Kundenbezug.");
  }
  const parsed = customerSchema.safeParse(customerPayload(formData));
  if (!parsed.success) go(fallback, "error", firstZodError(parsed.error));
  const value = parsed.data;
  const { data: existing, error: existingError } = await admin
    .from("customers")
    .select("*")
    .eq("id", customerId)
    .maybeSingle();
  if (existingError || !existing) {
    go("/admin/customers", "error", "Der Kunde wurde nicht gefunden.");
  }
  if (existing.updated_at !== expectedUpdatedAt) {
    go(fallback, "error", "Die Kundendaten wurden zwischenzeitlich geändert. Bitte laden Sie die Seite neu.");
  }
  if (existing.portal_user_id && value.email !== existing.email) {
    go(
      fallback,
      "error",
      "Die Login-E-Mail eines bereits aktivierten Kunden kann hier nicht geändert werden.",
    );
  }
  const { data: duplicate, error: duplicateError } = await admin
    .from("customers")
    .select("id")
    .ilike("email", value.email)
    .neq("id", customerId)
    .neq("status", "archived")
    .limit(1)
    .maybeSingle();
  if (duplicateError) {
    go(fallback, "error", "Die E-Mail konnte nicht auf Eindeutigkeit geprüft werden.");
  }
  if (duplicate) {
    go(fallback, "error", "Für diese E-Mail existiert bereits ein anderer Kunde.");
  }

  const contactName = [
    value.contactFirstName || value.firstName,
    value.contactLastName || value.lastName,
  ]
    .filter(Boolean)
    .join(" ");
  const updates = {
    category: value.category,
    company_name: value.companyName || null,
    first_name: value.firstName || null,
    last_name: value.lastName || null,
    contact_first_name: value.contactFirstName || null,
    contact_last_name: value.contactLastName || null,
    contact_name: contactName,
    email: value.email,
    phone: value.phone,
    billing_street: value.street,
    billing_house_number: value.houseNumber,
    billing_postal_code: value.postalCode,
    billing_city: value.city,
    billing_country: value.country,
    billing_address: formatAddress(value),
    notes: value.notes || null,
  };
  const previousValues = Object.fromEntries(
    Object.keys(updates).map((key) => [key, existing[key]]),
  );
  const changes = changedFields(existing, updates);
  if (!Object.keys(changes).length) {
    go(fallback, "status", "Es lagen keine Änderungen vor.");
  }
  const { data: invitation } = await admin
    .from("invitations")
    .select("id,email,category")
    .eq("customer_id", customerId)
    .in("status", ["draft", "sent"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: updated, error: updateError } = await admin
    .from("customers")
    .update(updates)
    .eq("id", customerId)
    .eq("updated_at", expectedUpdatedAt)
    .select("id")
    .maybeSingle();
  if (updateError || !updated) {
    go(fallback, "error", "Die Kundendaten wurden zwischenzeitlich geändert und nicht überschrieben.");
  }
  if (invitation) {
    const { error: invitationError } = await admin
      .from("invitations")
      .update({ email: value.email, category: value.category })
      .eq("id", invitation.id)
      .in("status", ["draft", "sent"]);
    if (invitationError) {
      await admin.from("customers").update(previousValues).eq("id", customerId);
      go(fallback, "error", "Kundendaten und offene Einladung konnten nicht gemeinsam aktualisiert werden.");
    }
  }
  const { error: auditError } = await admin.from("audit_logs").insert({
    actor_id: profile.id,
    action: "customer.updated",
    entity_table: "customers",
    entity_id: customerId,
    metadata: { changes },
  });
  if (auditError) {
    await admin.from("customers").update(previousValues).eq("id", customerId);
    if (invitation) {
      await admin
        .from("invitations")
        .update({ email: invitation.email, category: invitation.category })
        .eq("id", invitation.id);
    }
    go(fallback, "error", "Die Änderung konnte nicht revisionssicher protokolliert werden.");
  }
  revalidatePath("/admin/customers");
  revalidatePath(detailPath);
  go(fallback, "status", "Die Kundendaten wurden aktualisiert.");
}

export async function updateCustomerStatusAction(formData: FormData) {
  const { supabase } = await requireAdminContext();
  const customerId = formValue(formData, "customerId");
  const status = formValue(formData, "status");
  if (
    !/^[0-9a-f-]{36}$/i.test(customerId) ||
    !["active", "inactive", "archived"].includes(status)
  ) {
    go("/admin/customers", "error", "Ungültige Statusänderung.");
  }
  const { error } = await supabase.rpc("set_customer_status", {
    p_customer_id: customerId,
    p_status: status,
  });
  if (error) {
    go("/admin/customers", "error", "Der Kundenstatus konnte nicht sicher geändert werden.");
  }
  revalidatePath("/admin/customers");
  revalidatePath(`/admin/customers/${customerId}`);
  go(`/admin/customers/${customerId}`, "status", "Der Kundenstatus wurde aktualisiert.");
}

export async function createEmployeeAction(formData: FormData) {
  const { profile, admin } = await requireAdminContext();
  const parsed = employeeSchema.safeParse({
    firstName: formValue(formData, "firstName"),
    lastName: formValue(formData, "lastName"),
    category: formValue(formData, "category"),
    companyName: formValue(formData, "companyName"),
    email: formValue(formData, "email"),
    phone: formValue(formData, "phone"),
    street: formValue(formData, "street"),
    houseNumber: formValue(formData, "houseNumber"),
    postalCode: formValue(formData, "postalCode"),
    city: formValue(formData, "city"),
    country: formValue(formData, "country") || "Deutschland",
    notes: formValue(formData, "notes"),
  });
  if (!parsed.success)
    go("/admin/employees", "error", firstZodError(parsed.error));
  const value = parsed.data;
  const fullName = `${value.firstName} ${value.lastName}`;
  const { data: existing, error: existingError } = await admin
    .from("employee_profiles")
    .select("id")
    .ilike("email", value.email)
    .neq("status", "disabled")
    .maybeSingle();
  if (existingError)
    go("/admin/employees", "error", "Bestehende Mitarbeiterdaten konnten nicht geprüft werden.");
  if (existing)
    go(
      "/admin/employees",
      "error",
      "Für diese E-Mail existiert bereits ein Mitarbeiter.",
    );

  const { data: employee, error } = await admin
    .from("employee_profiles")
    .insert({
      first_name: value.firstName,
      last_name: value.lastName,
      full_name: fullName,
      category: value.category,
      company_name:
        value.category === "freelancer" ? value.companyName || null : null,
      email: value.email,
      phone: value.phone || null,
      address_street: value.street,
      address_house_number: value.houseNumber,
      address_postal_code: value.postalCode,
      address_city: value.city,
      address_country: value.country,
      address_formatted: formatAddress(value),
      notes: value.notes || null,
      status: "invited",
    })
    .select("id")
    .single();
  if (error || !employee)
    go(
      "/admin/employees",
      "error",
      "Mitarbeiter konnte nicht gespeichert werden.",
    );
  const { error: invitationError } = await admin.from("invitations").insert({
    email: value.email,
    role: "employee",
    category: value.category,
    employee_id: employee.id,
    status: "draft",
    invited_by: profile.id,
  });
  if (invitationError) {
    await admin.from("employee_profiles").delete().eq("id", employee.id);
    go(
      "/admin/employees",
      "error",
      "Der Mitarbeiter konnte nicht zusammen mit einer Einladung angelegt werden.",
    );
  }
  const { error: auditError } = await admin.from("audit_logs").insert({
    actor_id: profile.id,
    action: "employee.created",
    entity_table: "employee_profiles",
    entity_id: employee.id,
    metadata: { category: value.category },
  });
  if (auditError) {
    await admin.from("invitations").delete().eq("employee_id", employee.id).eq("status", "draft");
    await admin.from("employee_profiles").delete().eq("id", employee.id);
    go("/admin/employees", "error", "Die Anlage konnte nicht revisionssicher protokolliert werden.");
  }
  revalidatePath("/admin/employees");
  go(
    "/admin/employees",
    "status",
    "Mitarbeiter wurde angelegt. Die Einladung kann jetzt versendet werden.",
  );
}

export async function updateEmployeeAction(formData: FormData) {
  const { profile, admin } = await requireAdminContext();
  const employeeId = formValue(formData, "employeeId");
  const expectedUpdatedAt = formValue(formData, "updatedAt");
  const detailPath = `/admin/employees/${employeeId}`;
  const fallback = `${detailPath}?view=details`;
  if (!/^[0-9a-f-]{36}$/i.test(employeeId) || !expectedUpdatedAt) {
    go("/admin/employees", "error", "Ungültiger Mitarbeiterbezug.");
  }
  const parsed = employeeSchema.safeParse({
    firstName: formValue(formData, "firstName"),
    lastName: formValue(formData, "lastName"),
    category: formValue(formData, "category"),
    companyName: formValue(formData, "companyName"),
    email: formValue(formData, "email"),
    phone: formValue(formData, "phone"),
    street: formValue(formData, "street"),
    houseNumber: formValue(formData, "houseNumber"),
    postalCode: formValue(formData, "postalCode"),
    city: formValue(formData, "city"),
    country: formValue(formData, "country") || "Deutschland",
    notes: formValue(formData, "notes"),
  });
  if (!parsed.success) go(fallback, "error", firstZodError(parsed.error));
  const value = parsed.data;
  const { data: existing, error: existingError } = await admin
    .from("employee_profiles")
    .select("*")
    .eq("id", employeeId)
    .maybeSingle();
  if (existingError || !existing) {
    go("/admin/employees", "error", "Der Mitarbeiter wurde nicht gefunden.");
  }
  if (existing.updated_at !== expectedUpdatedAt) {
    go(fallback, "error", "Die Mitarbeiterdaten wurden zwischenzeitlich geändert. Bitte laden Sie die Seite neu.");
  }
  if (existing.user_id && value.email !== existing.email) {
    go(
      fallback,
      "error",
      "Die Login-E-Mail eines bereits aktivierten Mitarbeiters kann hier nicht geändert werden.",
    );
  }
  const { data: duplicate, error: duplicateError } = await admin
    .from("employee_profiles")
    .select("id")
    .ilike("email", value.email)
    .neq("id", employeeId)
    .neq("status", "disabled")
    .limit(1)
    .maybeSingle();
  if (duplicateError) {
    go(fallback, "error", "Die E-Mail konnte nicht auf Eindeutigkeit geprüft werden.");
  }
  if (duplicate) {
    go(fallback, "error", "Für diese E-Mail existiert bereits ein anderer Mitarbeiter.");
  }

  const updates = {
    first_name: value.firstName,
    last_name: value.lastName,
    full_name: `${value.firstName} ${value.lastName}`,
    category: value.category,
    company_name:
      value.category === "freelancer" ? value.companyName || null : null,
    email: value.email,
    phone: value.phone,
    address_street: value.street,
    address_house_number: value.houseNumber,
    address_postal_code: value.postalCode,
    address_city: value.city,
    address_country: value.country,
    address_formatted: formatAddress(value),
    notes: value.notes || null,
  };
  const previousValues = Object.fromEntries(
    Object.keys(updates).map((key) => [key, existing[key]]),
  );
  const changes = changedFields(existing, updates);
  if (!Object.keys(changes).length) {
    go(fallback, "status", "Es lagen keine Änderungen vor.");
  }
  const { data: invitation } = await admin
    .from("invitations")
    .select("id,email,category")
    .eq("employee_id", employeeId)
    .in("status", ["draft", "sent"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: updated, error: updateError } = await admin
    .from("employee_profiles")
    .update(updates)
    .eq("id", employeeId)
    .eq("updated_at", expectedUpdatedAt)
    .select("id")
    .maybeSingle();
  if (updateError || !updated) {
    go(fallback, "error", "Die Mitarbeiterdaten wurden zwischenzeitlich geändert und nicht überschrieben.");
  }
  if (invitation) {
    const { error: invitationError } = await admin
      .from("invitations")
      .update({ email: value.email, category: value.category })
      .eq("id", invitation.id)
      .in("status", ["draft", "sent"]);
    if (invitationError) {
      await admin
        .from("employee_profiles")
        .update(previousValues)
        .eq("id", employeeId);
      go(fallback, "error", "Mitarbeiterdaten und offene Einladung konnten nicht gemeinsam aktualisiert werden.");
    }
  }
  const { error: auditError } = await admin.from("audit_logs").insert({
    actor_id: profile.id,
    action: "employee.updated",
    entity_table: "employee_profiles",
    entity_id: employeeId,
    metadata: { changes },
  });
  if (auditError) {
    await admin
      .from("employee_profiles")
      .update(previousValues)
      .eq("id", employeeId);
    if (invitation) {
      await admin
        .from("invitations")
        .update({ email: invitation.email, category: invitation.category })
        .eq("id", invitation.id);
    }
    go(fallback, "error", "Die Änderung konnte nicht revisionssicher protokolliert werden.");
  }
  revalidatePath("/admin/employees");
  revalidatePath(detailPath);
  go(fallback, "status", "Die Mitarbeiterdaten wurden aktualisiert.");
}

export async function updateEmployeeStatusAction(formData: FormData) {
  const { supabase } = await requireAdminContext();
  const employeeId = formValue(formData, "employeeId");
  const status = formValue(formData, "status");
  if (
    !/^[0-9a-f-]{36}$/i.test(employeeId) ||
    !["active", "disabled"].includes(status)
  ) {
    go("/admin/employees", "error", "Ungültige Statusänderung.");
  }
  const { error } = await supabase.rpc("set_employee_status", {
    p_employee_id: employeeId,
    p_status: status,
  });
  if (error) {
    go("/admin/employees", "error", "Der Mitarbeiterstatus konnte nicht sicher geändert werden.");
  }
  revalidatePath("/admin/employees");
  revalidatePath(`/admin/employees/${employeeId}`);
  go(`/admin/employees/${employeeId}`, "status", "Der Mitarbeiterstatus wurde aktualisiert.");
}

export async function createPropertyAction(formData: FormData) {
  const { admin } = await requireAdminContext();
  const acceptedOfferVersionId = formValue(formData, "acceptedOfferVersionId") || null;
  const acceptedOfferScope = formValue(formData, "acceptedOfferScope") || "property";
  if (acceptedOfferVersionId && !/^[0-9a-f-]{36}$/i.test(acceptedOfferVersionId)) {
    go("/admin/properties", "error", "Das ausgewählte Angebot ist ungültig.");
  }
  if (acceptedOfferVersionId && !["property", "first_building"].includes(acceptedOfferScope)) {
    go("/admin/properties", "error", "Der Geltungsbereich der Angebotsleistungen ist ungültig.");
  }
  const parsed = propertySchema.safeParse({
    customerId: formValue(formData, "customerId"),
    name: formValue(formData, "name"),
    objectKey: formValue(formData, "objectKey"),
    propertyType: formValue(formData, "propertyType"),
    ownershipName: formValue(formData, "ownershipName"),
    status: formValue(formData, "status") || "active",
    monthlyFee: formValue(formData, "monthlyFee"),
    taxRate: formValue(formData, "taxRate") || "19",
    maxVisitMinutes: formValue(formData, "maxVisitMinutes"),
    internalBriefing: formValue(formData, "internalBriefing"),
    careStartDate: formValue(formData, "careStartDate"),
    buildingLabel: formValue(formData, "buildingLabel"),
    accessNotes: formValue(formData, "accessNotes"),
    street: formValue(formData, "street"),
    houseNumber: formValue(formData, "houseNumber"),
    postalCode: formValue(formData, "postalCode"),
    city: formValue(formData, "city"),
    country: formValue(formData, "country") || "Deutschland",
  });
  if (!parsed.success)
    go("/admin/properties", "error", firstZodError(parsed.error));
  const value = parsed.data;
  const propertyId = randomUUID();
  const buildingId = randomUUID();
  const nonce = newQrNonce();
  const token = deriveBuildingQrToken(buildingId, nonce);
  const monthlyFeeNetCents = parseEuroToCents(value.monthlyFee);
  const taxRateBps = Math.round(value.taxRate * 100);
  const { data: customer } = await admin
    .from("customers")
    .select(
      "id,company_name,first_name,last_name,contact_name,email,billing_street,billing_house_number,billing_postal_code,billing_city,billing_country",
    )
    .eq("id", value.customerId)
    .maybeSingle();
  if (!customer) go("/admin/properties", "error", "Der ausgewählte Kunde wurde nicht gefunden.");

  const formattedAddress = formatAddress(value);
  const recipientName =
    customer.company_name ||
    [customer.first_name, customer.last_name].filter(Boolean).join(" ") ||
    customer.contact_name ||
    customer.email;
  const supabase = await createSupabaseServerClient();
  const propertyRpcPayload = {
      p_customer_id: value.customerId,
      p_name: value.name,
      p_property_type: value.propertyType,
      p_care_start_date: value.careStartDate,
      p_building_id: buildingId,
      p_street: value.street,
      p_house_number: value.houseNumber,
      p_postal_code: value.postalCode,
      p_city: value.city,
      p_country: value.country,
      p_formatted_address: formattedAddress,
      p_qr_token_nonce: nonce,
      p_qr_token_hash: sha256(token),
      p_monthly_fee_net_cents: monthlyFeeNetCents,
      p_tax_rate_bps: taxRateBps,
      p_max_visit_minutes: value.maxVisitMinutes,
      p_property_id: propertyId,
      p_object_key: value.objectKey || null,
      p_ownership_name: value.ownershipName || null,
      p_property_status: value.status,
      p_building_label: value.buildingLabel || null,
      p_internal_briefing: value.internalBriefing || null,
      p_internal_notes: null,
      p_access_notes: value.accessNotes || null,
      p_billing_recipient_name: recipientName,
      p_billing_address_addition: null,
      p_billing_street: customer.billing_street,
      p_billing_house_number: customer.billing_house_number,
      p_billing_postal_code: customer.billing_postal_code,
      p_billing_city: customer.billing_city,
      p_billing_country: customer.billing_country || "Deutschland",
      p_billing_email: customer.email,
    };
  const atomicOfferPayload = {
    customer_id: value.customerId,
    name: value.name,
    property_type: value.propertyType,
    care_start_date: value.careStartDate,
    building_id: buildingId,
    street: value.street,
    house_number: value.houseNumber,
    postal_code: value.postalCode,
    city: value.city,
    country: value.country,
    formatted_address: formattedAddress,
    qr_token_nonce: nonce,
    qr_token_hash: sha256(token),
    monthly_fee_net_cents: monthlyFeeNetCents,
    tax_rate_bps: taxRateBps,
    max_visit_minutes: value.maxVisitMinutes,
    property_id: propertyId,
    object_key: value.objectKey || null,
    ownership_name: value.ownershipName || null,
    property_status: value.status,
    building_label: value.buildingLabel || null,
    internal_briefing: value.internalBriefing || null,
    internal_notes: null,
    access_notes: value.accessNotes || null,
    billing_recipient_name: recipientName,
    billing_address_addition: null,
    billing_street: customer.billing_street,
    billing_house_number: customer.billing_house_number,
    billing_postal_code: customer.billing_postal_code,
    billing_city: customer.billing_city,
    billing_country: customer.billing_country || "Deutschland",
    billing_email: customer.email,
  };
  let offerAssignments: Array<{ item_id: string; scope: "buildings"; building_ids: string[] }> = [];
  if (acceptedOfferVersionId && acceptedOfferScope === "first_building") {
    const { data: offerItems, error: offerItemsError } = await admin
      .from("offer_version_items")
      .select("id")
      .eq("offer_version_id", acceptedOfferVersionId);
    if (offerItemsError || !offerItems?.length) {
      go("/admin/properties", "error", "Die Angebotspositionen konnten nicht für das erste Gebäude vorbereitet werden.");
    }
    offerAssignments = offerItems.map((item) => ({
      item_id: item.id,
      scope: "buildings" as const,
      building_ids: [buildingId],
    }));
  }
  const { data: created, error: createError } = acceptedOfferVersionId
    ? await supabase.rpc("admin_create_property_from_offer", {
        p_property_payload: atomicOfferPayload,
        p_offer_version_id: acceptedOfferVersionId,
        p_assignments: offerAssignments,
      })
    : await supabase.rpc("admin_create_property", propertyRpcPayload);
  const createdProperty = Array.isArray(created) ? created[0] : created;
  if (
    createError ||
    !createdProperty ||
    createdProperty.property_id !== propertyId ||
    createdProperty.building_id !== buildingId
  ) {
    go(
      "/admin/properties",
      "error",
      "Immobilie und erstes Gebäude konnten nicht vollständig gespeichert werden.",
    );
  }
  revalidatePath("/admin/properties");
  if (acceptedOfferVersionId) {
    revalidatePath("/admin/offers");
    revalidatePath("/portal/offers");
  }
  redirect(`${propertyViewPath(propertyId, "uebersicht")}&status=created`);
}

export async function addBuildingAction(formData: FormData) {
  const { profile, admin, supabase } = await requireAdminContext();
  const acceptedOfferVersionId = formValue(formData, "acceptedOfferVersionId") || null;
  const parsed = buildingSchema.safeParse({
    propertyId: formValue(formData, "propertyId"),
    label: formValue(formData, "label"),
    accessNotes: formValue(formData, "accessNotes"),
    street: formValue(formData, "street"),
    houseNumber: formValue(formData, "houseNumber"),
    postalCode: formValue(formData, "postalCode"),
    city: formValue(formData, "city"),
    country: formValue(formData, "country") || "Deutschland",
  });
  const fallback = propertyViewPath(formValue(formData, "propertyId"), "gebaeude");
  if (acceptedOfferVersionId && !/^[0-9a-f-]{36}$/i.test(acceptedOfferVersionId)) {
    go(fallback, "error", "Das ausgewählte Angebot ist ungültig.");
  }
  if (!parsed.success) go(fallback, "error", firstZodError(parsed.error));
  const value = parsed.data;
  await requireMutableProperty(admin, value.propertyId, fallback);
  const id = randomUUID();
  const nonce = newQrNonce();
  const token = deriveBuildingQrToken(id, nonce);
  if (acceptedOfferVersionId) {
    const { data: created, error: createError } = await supabase.rpc("admin_create_building_from_offer", {
      p_building_payload: {
        building_id: id,
        property_id: value.propertyId,
        label: value.label || null,
        street: value.street,
        house_number: value.houseNumber,
        postal_code: value.postalCode,
        city: value.city,
        country: value.country,
        formatted_address: formatAddress(value),
        qr_token_nonce: nonce,
        qr_token_hash: sha256(token),
        access_notes: value.accessNotes || null,
      },
      p_offer_version_id: acceptedOfferVersionId,
    });
    const createdBuilding = Array.isArray(created) ? created[0] : created;
    if (createError || !createdBuilding || createdBuilding.building_id !== id) {
      go(fallback, "error", createError?.message || "Gebäude und Angebot konnten nicht atomar verknüpft werden.");
    }
    revalidatePath(fallback);
    revalidatePath("/admin/offers");
    revalidatePath("/portal/offers");
    go(fallback, "status", "Gebäude wurde angelegt und das angenommene Angebot vollständig zugeordnet.");
  }
  const { error } = await admin.from("buildings").insert({
    id,
    property_id: value.propertyId,
    label: value.label || null,
    street: value.street,
    house_number: value.houseNumber,
    postal_code: value.postalCode,
    city: value.city,
    country: value.country,
    formatted_address: formatAddress(value),
    qr_token_nonce: nonce,
    qr_token_hash: sha256(token),
    status: "active",
  });
  if (error) go(fallback, "error", "Gebäude konnte nicht gespeichert werden.");
  const { error: accessNoteError } = await admin
    .from("building_access_notes")
    .insert({
      building_id: id,
      access_notes: value.accessNotes || null,
      updated_by: profile.id,
    });
  if (accessNoteError) {
    await admin.from("buildings").delete().eq("id", id);
    go(fallback, "error", "Interne Zugangshinweise konnten nicht gespeichert werden.");
  }
  const { error: auditError } = await admin.from("audit_logs").insert({
    actor_id: profile.id,
    action: "building.created",
    entity_table: "buildings",
    entity_id: id,
  });
  if (auditError) {
    await admin.from("building_access_notes").delete().eq("building_id", id);
    await admin.from("buildings").delete().eq("id", id);
    go(fallback, "error", "Das Gebäude konnte nicht revisionssicher angelegt werden.");
  }
  revalidatePath(fallback);
  go(fallback, "status", "Gebäude wurde hinzugefügt.");
}

export async function rotateBuildingQrTokenAction(formData: FormData) {
  const { profile, admin } = await requireAdminContext();
  const buildingId = formValue(formData, "buildingId");
  const propertyId = formValue(formData, "propertyId");
  const fallback = propertyViewPath(propertyId, "gebaeude");
  if (!/^[0-9a-f-]{36}$/i.test(buildingId) || !/^[0-9a-f-]{36}$/i.test(propertyId)) {
    go("/admin/properties", "error", "Ungültiger Gebäudebezug.");
  }
  await requireMutableProperty(admin, propertyId, fallback);
  const { data: building, error: buildingError } = await admin
    .from("buildings")
    .select("id,qr_token_nonce,qr_token_hash,updated_at")
    .eq("id", buildingId)
    .eq("property_id", propertyId)
    .eq("status", "active")
    .maybeSingle();
  if (buildingError || !building) {
    go(fallback, "error", "Das aktive Gebäude wurde nicht gefunden.");
  }
  const nonce = newQrNonce();
  const token = deriveBuildingQrToken(buildingId, nonce);
  const { data: updated, error: updateError } = await admin
    .from("buildings")
    .update({ qr_token_nonce: nonce, qr_token_hash: sha256(token) })
    .eq("id", buildingId)
    .eq("property_id", propertyId)
    .eq("updated_at", building.updated_at)
    .select("id")
    .maybeSingle();
  if (updateError || !updated) {
    go(fallback, "error", "Der QR-Code wurde zwischenzeitlich geändert. Bitte neu laden.");
  }
  const { error: auditError } = await admin.from("audit_logs").insert({
    actor_id: profile.id,
    action: "building.qr_rotated",
    entity_table: "buildings",
    entity_id: buildingId,
    metadata: { property_id: propertyId },
  });
  if (auditError) {
    await admin
      .from("buildings")
      .update({
        qr_token_nonce: building.qr_token_nonce,
        qr_token_hash: building.qr_token_hash,
      })
      .eq("id", buildingId)
      .eq("property_id", propertyId);
    go(fallback, "error", "Die QR-Rotation konnte nicht revisionssicher protokolliert werden.");
  }
  revalidatePath(fallback);
  go(fallback, "status", "Der bisherige QR-Code wurde widerrufen und neu erzeugt.");
}

export async function assignPropertyEmployeeAction(formData: FormData) {
  const { supabase } = await requireAdminContext();
  const propertyId = formValue(formData, "propertyId");
  const employeeId = formValue(formData, "employeeId");
  const fallback = propertyViewPath(propertyId, "team");
  if (!/^[0-9a-f-]{36}$/i.test(propertyId) || !/^[0-9a-f-]{36}$/i.test(employeeId)) {
    go(fallback, "error", "Mitarbeiter auswählen.");
  }
  const { error } = await supabase.rpc("set_property_employee_assignment", {
    p_property_id: propertyId,
    p_employee_id: employeeId,
    p_active: true,
    p_expected_updated_at: null,
  });
  if (error) {
    go(fallback, "error", "Der Mitarbeiter konnte nicht zugeordnet werden.");
  }
  revalidatePath(fallback);
  revalidatePath(`/admin/employees/${employeeId}`);
  revalidatePath("/app/properties");
  go(fallback, "status", "Mitarbeiter wurde der Immobilie zugeordnet.");
}

export async function createPropertyServiceAction(formData: FormData) {
  const { supabase, admin } = await requireAdminContext();
  const propertyId = formValue(formData, "propertyId");
  const catalogId = formValue(formData, "catalogId");
  let catalog: {
    service_key: string;
    name: string;
    category: string;
    customer_description: string | null;
    default_execution_rule: string;
    default_occurrences_per_period: number;
    default_seasonal: boolean;
    default_season_start_month: number | null;
    default_season_end_month: number | null;
    sort_order: number;
  } | null = null;
  if (catalogId) {
    if (!/^[0-9a-f-]{36}$/i.test(catalogId)) {
      go(propertyViewPath(propertyId, "leistungen"), "error", "Ungültige Leistungsvorlage.");
    }
    const { data, error } = await admin
      .from("service_catalog")
      .select(
        "service_key,name,category,customer_description,default_execution_rule,default_occurrences_per_period,default_seasonal,default_season_start_month,default_season_end_month,sort_order",
      )
      .eq("id", catalogId)
      .eq("status", "active")
      .maybeSingle();
    if (error || !data) {
      go(
        propertyViewPath(propertyId, "leistungen"),
        "error",
        "Die ausgewählte Leistungsvorlage ist nicht verfügbar.",
      );
    }
    catalog = data;
  }
  const useCatalogDefaults =
    Boolean(catalog) && formValue(formData, "catalogDefaultsApplied") !== "1";
  const submittedName = formValue(formData, "name");
  const parsed = propertyServiceSchema.safeParse({
    propertyId,
    catalogId,
    name: useCatalogDefaults ? catalog?.name : submittedName,
    serviceKey: catalog?.service_key ||
      formValue(formData, "serviceKey") ||
      submittedName
        .toLowerCase()
        .replace(/[^a-z0-9äöüß]+/gi, "-")
        .replace(/^-|-$/g, ""),
    category: useCatalogDefaults
      ? catalog?.category
      : formValue(formData, "category") || "Individuell",
    customerDescription: useCatalogDefaults
      ? catalog?.customer_description || ""
      : formValue(formData, "customerDescription"),
    internalInstruction: formValue(formData, "internalInstruction"),
    executionRule: useCatalogDefaults
      ? catalog?.default_execution_rule
      : formValue(formData, "executionRule"),
    occurrencesPerPeriod: useCatalogDefaults
      ? catalog?.default_occurrences_per_period
      : formValue(formData, "occurrencesPerPeriod") || "1",
    seasonal: useCatalogDefaults
      ? catalog?.default_seasonal
      : checkbox(formData, "seasonal"),
    seasonStartMonth: useCatalogDefaults
      ? catalog?.default_season_start_month ?? undefined
      : formValue(formData, "seasonStartMonth") || undefined,
    seasonEndMonth: useCatalogDefaults
      ? catalog?.default_season_end_month ?? undefined
      : formValue(formData, "seasonEndMonth") || undefined,
    startDate: formValue(formData, "startDate"),
    endDate: formValue(formData, "endDate"),
    estimatedMinutes: formValue(formData, "estimatedMinutes") || undefined,
    sortOrder: useCatalogDefaults
      ? catalog?.sort_order
      : formValue(formData, "sortOrder") || "0",
    customerVisible: checkbox(formData, "customerVisible"),
    photoRequired: checkbox(formData, "photoRequired"),
    buildingIds: formValues(formData, "buildingId"),
  });
  if (!parsed.success)
    go(propertyViewPath(propertyId, "leistungen"), "error", firstZodError(parsed.error));
  const value = parsed.data;
  await requireMutableProperty(admin, value.propertyId);
  const { error } = await supabase.rpc(
    "create_property_service_configuration",
    {
      p_property_id: value.propertyId,
      p_catalog_id: value.catalogId || null,
      p_service_key: value.serviceKey,
      p_name: value.name,
      p_category: value.category,
      p_customer_description: value.customerDescription || null,
      p_execution_rule: value.executionRule,
      p_occurrences_per_period: value.occurrencesPerPeriod,
      p_seasonal: value.seasonal,
      p_season_start_month: value.seasonal
        ? value.seasonStartMonth ?? null
        : null,
      p_season_end_month: value.seasonal ? value.seasonEndMonth ?? null : null,
      p_start_date: value.startDate,
      p_end_date: value.endDate || null,
      p_estimated_minutes: value.estimatedMinutes ?? null,
      p_customer_visible: value.customerVisible,
      p_photo_required: value.photoRequired,
      p_sort_order: value.sortOrder,
      p_status: "active",
      p_internal_instruction: value.internalInstruction || null,
      p_building_ids: Array.from(new Set(value.buildingIds)),
    },
  );
  if (error) {
    go(
      propertyViewPath(propertyId, "leistungen"),
      "error",
      error.code === "23505"
        ? "Für diese Immobilie besteht bereits eine Leistung mit demselben Schlüssel."
        : "Die vollständige Leistungskonfiguration konnte nicht gespeichert werden.",
    );
  }
  revalidatePath(`/admin/properties/${propertyId}`);
  revalidatePath("/admin/winter-service");
  go(propertyViewPath(propertyId, "leistungen"), "status", "Leistung wurde zugewiesen.");
}

export async function togglePropertyServiceAction(formData: FormData) {
  const { profile, admin } = await requireAdminContext();
  const propertyId = formValue(formData, "propertyId");
  const serviceId = formValue(formData, "serviceId");
  const fallback = propertyViewPath(propertyId, "leistungen");
  if (!/^[0-9a-f-]{36}$/i.test(propertyId) || !/^[0-9a-f-]{36}$/i.test(serviceId)) {
    go("/admin/properties", "error", "Ungültige Leistungszuordnung.");
  }
  await requireMutableProperty(admin, propertyId, fallback);
  const { data: service, error: serviceError } = await admin
    .from("property_services")
    .select("id,status,updated_at")
    .eq("id", serviceId)
    .eq("property_id", propertyId)
    .maybeSingle();
  if (serviceError || !service || !["active", "inactive"].includes(service.status)) {
    go(fallback, "error", "Die Leistung wurde nicht gefunden oder ist archiviert.");
  }
  const status = service.status === "active" ? "inactive" : "active";
  const { data: updated, error: updateError } = await admin
    .from("property_services")
    .update({ status })
    .eq("id", serviceId)
    .eq("property_id", propertyId)
    .eq("updated_at", service.updated_at)
    .select("id")
    .maybeSingle();
  if (updateError || !updated) {
    go(fallback, "error", "Der Leistungsstatus konnte nicht gespeichert werden.");
  }
  const { error: auditError } = await admin.from("audit_logs").insert({
    actor_id: profile.id,
    action: "property_service.status_changed",
    entity_table: "property_services",
    entity_id: serviceId,
    metadata: { previous_status: service.status, status, property_id: propertyId },
  });
  if (auditError) {
    await admin.from("property_services").update({ status: service.status }).eq("id", serviceId);
    go(fallback, "error", "Die Änderung konnte nicht revisionssicher protokolliert werden.");
  }
  revalidatePath(fallback);
  revalidatePath("/admin/winter-service");
  go(fallback, "status", "Leistungsstatus wurde aktualisiert.");
}

export async function updatePropertyServiceSortOrderAction(formData: FormData) {
  const { profile, admin } = await requireAdminContext();
  const propertyId = formValue(formData, "propertyId");
  const serviceId = formValue(formData, "serviceId");
  const expectedUpdatedAt = formValue(formData, "updatedAt");
  const sortOrder = Number(formValue(formData, "sortOrder"));
  const fallback = propertyViewPath(propertyId, "leistungen");
  if (
    !/^[0-9a-f-]{36}$/i.test(propertyId) ||
    !/^[0-9a-f-]{36}$/i.test(serviceId) ||
    !expectedUpdatedAt ||
    !Number.isInteger(sortOrder) ||
    sortOrder < 0 ||
    sortOrder > 100_000
  ) {
    go(fallback, "error", "Ungültige Sortierreihenfolge.");
  }
  await requireMutableProperty(admin, propertyId, fallback);
  const { data: service, error: serviceError } = await admin
    .from("property_services")
    .select("id,name,sort_order,updated_at")
    .eq("id", serviceId)
    .eq("property_id", propertyId)
    .maybeSingle();
  if (serviceError || !service) {
    go(fallback, "error", "Die Leistung wurde nicht gefunden.");
  }
  if (service.updated_at !== expectedUpdatedAt) {
    go(fallback, "error", "Die Leistung wurde zwischenzeitlich geändert. Bitte neu laden.");
  }
  if (service.sort_order === sortOrder) {
    go(fallback, "status", "Die Leistung hat bereits diese Sortierposition.");
  }
  const { data: updated, error: updateError } = await admin
    .from("property_services")
    .update({ sort_order: sortOrder })
    .eq("id", serviceId)
    .eq("property_id", propertyId)
    .eq("updated_at", expectedUpdatedAt)
    .select("id")
    .maybeSingle();
  if (updateError || !updated) {
    go(fallback, "error", "Die Sortierposition konnte nicht gespeichert werden.");
  }
  const { error: auditError } = await admin.from("audit_logs").insert({
    actor_id: profile.id,
    action: "property_service.sort_order_changed",
    entity_table: "property_services",
    entity_id: serviceId,
    metadata: {
      previous_sort_order: service.sort_order,
      sort_order: sortOrder,
    },
  });
  if (auditError) {
    await admin
      .from("property_services")
      .update({ sort_order: service.sort_order })
      .eq("id", serviceId);
    go(fallback, "error", "Die Änderung konnte nicht revisionssicher protokolliert werden.");
  }
  revalidatePath(fallback);
  go(fallback, "status", `Sortierposition für „${service.name}“ aktualisiert.`);
}

function visitPlanMutationError(message: string) {
  const normalized = message.toLowerCase();
  if (
    normalized.includes("kein freier termin") ||
    normalized.includes("kein freier slot") ||
    normalized.includes("kein freier mitarbeitertermin")
  ) {
    return "Im gewählten Zeitfenster ist für das eingeplante Team kein freier Termin verfügbar. Bitte das Zeitfenster vergrößern, die Dauer verkürzen oder einen anderen Mitarbeiter wählen.";
  }
  if (
    normalized.includes("überschneidet") ||
    normalized.includes("bereits belegt") ||
    normalized.includes("bereits eingeplant")
  ) {
    return "Die feste Uhrzeit überschneidet sich mit einem anderen Einsatz des Mitarbeiters. Bitte eine andere Uhrzeit oder ein smartes Zeitfenster wählen.";
  }
  if (
    normalized.includes("zeitfenster") &&
    (normalized.includes("dauer") || normalized.includes("kürzer"))
  ) {
    return "Die geplante Einsatzdauer passt nicht vollständig in das gewählte Zeitfenster.";
  }
  if (normalized.includes("leistung")) {
    return "Mindestens eine ausgewählte Leistung ist nicht mehr aktiv, gehört nicht zu dieser Immobilie oder kann nur bei einem manuellen Einsatz verwendet werden.";
  }
  return "Der Besuchsplan konnte nicht atomar gespeichert werden. Prüfen Sie Immobilienstatus, Zeitraum, Team, Leistungen und Gebäudezuordnungen.";
}

export async function createVisitPlanAction(formData: FormData) {
  const { supabase } = await requireAdminContext();
  const propertyId = formValue(formData, "propertyId");
  const fallback = propertyViewPath(propertyId, "einsaetze");
  const parsed = visitPlanSchema.safeParse({
    propertyId,
    label: formValue(formData, "label"),
    frequency: formValue(formData, "frequency"),
    repeatEvery: formValue(formData, "repeatEvery"),
    weekdays: formValues(formData, "weekday"),
    monthDays: formValues(formData, "monthDay"),
    desiredTime: formValue(formData, "desiredTime"),
    windowStart: formValue(formData, "windowStart"),
    windowEnd: formValue(formData, "windowEnd"),
    startDate: formValue(formData, "startDate"),
    endDate: formValue(formData, "endDate"),
    primaryEmployeeId: formValue(formData, "primaryEmployeeId"),
    maxVisitMinutes: formValue(formData, "maxVisitMinutes"),
    serviceIds: formValues(formData, "serviceId"),
    acceptsUnplannedTasks: formData.has("acceptsUnplannedTasks"),
    buildingIds: formValues(formData, "buildingId"),
    additionalEmployeeIds: formValues(formData, "additionalEmployeeId"),
  });
  if (!parsed.success) go(fallback, "error", firstZodError(parsed.error));
  const value = parsed.data;
  const buildingIds = Array.from(new Set(value.buildingIds));
  const additionalEmployeeIds = Array.from(
    new Set(
      value.additionalEmployeeIds.filter(
        (employeeId) => employeeId !== value.primaryEmployeeId,
      ),
    ),
  );
  const { error } = await supabase.rpc("create_visit_plan_configuration_v3", {
    p_property_id: value.propertyId,
    p_label: value.label,
    p_frequency: value.frequency,
    p_repeat_every: value.repeatEvery,
    p_weekdays: value.weekdays,
    p_month_days: value.monthDays,
    p_desired_time: value.desiredTime || null,
    p_window_start: value.windowStart || null,
    p_window_end: value.windowEnd || null,
    p_start_date: value.startDate,
    p_end_date: value.endDate || null,
    p_primary_employee_id: value.primaryEmployeeId,
    p_max_visit_minutes: value.maxVisitMinutes,
    p_service_ids: value.serviceIds,
    p_accepts_unplanned_tasks: value.acceptsUnplannedTasks,
    p_building_ids: buildingIds,
    p_additional_employee_ids: additionalEmployeeIds,
  });
  if (error) {
    go(fallback, "error", visitPlanMutationError(error.message));
  }
  revalidatePath(fallback);
  revalidatePath("/app/today");
  go(
    fallback,
    "status",
    "Besuchsplan, Termine und fällige Checklisten wurden im Voraus erstellt.",
  );
}

export async function updateVisitPlanAction(formData: FormData) {
  const { supabase } = await requireAdminContext();
  const propertyId = formValue(formData, "propertyId");
  const visitPlanId = formValue(formData, "visitPlanId");
  const expectedUpdatedAt = formValue(formData, "updatedAt");
  const fallback = propertyViewPath(propertyId, "einsaetze");
  if (!/^[0-9a-f-]{36}$/i.test(visitPlanId) || !expectedUpdatedAt) {
    go(fallback, "error", "Ungültiger Besuchsplanbezug.");
  }
  const parsed = visitPlanSchema.safeParse({
    propertyId,
    label: formValue(formData, "label"),
    frequency: formValue(formData, "frequency"),
    repeatEvery: formValue(formData, "repeatEvery"),
    weekdays: formValues(formData, "weekday"),
    monthDays: formValues(formData, "monthDay"),
    desiredTime: formValue(formData, "desiredTime"),
    windowStart: formValue(formData, "windowStart"),
    windowEnd: formValue(formData, "windowEnd"),
    startDate: formValue(formData, "startDate"),
    endDate: formValue(formData, "endDate"),
    primaryEmployeeId: formValue(formData, "primaryEmployeeId"),
    maxVisitMinutes: formValue(formData, "maxVisitMinutes"),
    serviceIds: formValues(formData, "serviceId"),
    acceptsUnplannedTasks: formData.has("acceptsUnplannedTasks"),
    buildingIds: formValues(formData, "buildingId"),
    additionalEmployeeIds: formValues(formData, "additionalEmployeeId"),
  });
  if (!parsed.success) go(fallback, "error", firstZodError(parsed.error));
  const value = parsed.data;
  const buildingIds = Array.from(new Set(value.buildingIds));
  const additionalEmployeeIds = Array.from(
    new Set(
      value.additionalEmployeeIds.filter(
        (employeeId) => employeeId !== value.primaryEmployeeId,
      ),
    ),
  );
  const { error } = await supabase.rpc("update_visit_plan_configuration_v3", {
    p_property_id: value.propertyId,
    p_visit_plan_id: visitPlanId,
    p_expected_updated_at: expectedUpdatedAt,
    p_label: value.label,
    p_frequency: value.frequency,
    p_repeat_every: value.repeatEvery,
    p_weekdays: value.weekdays,
    p_month_days: value.monthDays,
    p_desired_time: value.desiredTime || null,
    p_window_start: value.windowStart || null,
    p_window_end: value.windowEnd || null,
    p_start_date: value.startDate,
    p_end_date: value.endDate || null,
    p_primary_employee_id: value.primaryEmployeeId,
    p_max_visit_minutes: value.maxVisitMinutes,
    p_service_ids: value.serviceIds,
    p_accepts_unplanned_tasks: value.acceptsUnplannedTasks,
    p_building_ids: buildingIds,
    p_additional_employee_ids: additionalEmployeeIds,
  });
  if (error?.code === "40001" || error?.message.includes("zwischenzeitlich")) {
    go(
      fallback,
      "error",
      "Der Besuchsplan wurde zwischenzeitlich geändert. Bitte laden Sie die Seite neu.",
    );
  }
  if (error) {
    go(fallback, "error", visitPlanMutationError(error.message));
  }
  revalidatePath(fallback);
  revalidatePath("/app/today");
  go(
    fallback,
    "status",
    "Besuchsplan aktualisiert. Zukünftige Termine und Checklisten wurden neu berechnet; manuell angepasste und bereits gestartete Termine blieben unverändert.",
  );
}

export async function deleteVisitPlanAction(formData: FormData) {
  const { supabase } = await requireAdminContext();
  const propertyId = formValue(formData, "propertyId");
  const visitPlanId = formValue(formData, "visitPlanId");
  const expectedUpdatedAt = formValue(formData, "updatedAt");
  const fallback = propertyViewPath(propertyId, "einsaetze");
  if (
    !/^[0-9a-f-]{36}$/i.test(propertyId) ||
    !/^[0-9a-f-]{36}$/i.test(visitPlanId) ||
    !expectedUpdatedAt
  ) {
    go(fallback, "error", "Ungültiger Besuchsplanbezug.");
  }

  const { data: result, error } = await supabase.rpc(
    "delete_visit_plan_configuration",
    {
      p_property_id: propertyId,
      p_visit_plan_id: visitPlanId,
      p_expected_updated_at: expectedUpdatedAt,
    },
  );
  if (error) {
    const message = error.message.toLowerCase();
    go(
      fallback,
      "error",
      message.includes("laufend") || message.includes("gestartet")
        ? "Ein laufender Einsatz muss zuerst abgeschlossen werden, bevor der Plan entfernt werden kann."
        : message.includes("zwischenzeitlich")
          ? "Der Besuchsplan wurde zwischenzeitlich geändert. Bitte laden Sie die Seite neu."
          : "Der Besuchsplan konnte nicht sicher entfernt werden.",
    );
  }

  const mutation = (result ?? {}) as {
    deleted_visits?: number;
    preserved_history?: number;
  };
  revalidatePath(fallback);
  revalidatePath("/app/today");
  const removed = Number(mutation.deleted_visits ?? 0);
  const preserved = Number(mutation.preserved_history ?? 0);
  go(
    fallback,
    "status",
    preserved
      ? `Besuchsplan entfernt. ${removed} offene Termine wurden gelöscht; ${preserved} abgeschlossene oder stornierte Einsätze bleiben revisionssicher erhalten.`
      : `Besuchsplan und ${removed} offene Termine wurden vollständig entfernt.`,
  );
}

export async function updateVisitPlanStatusAction(formData: FormData) {
  const { supabase } = await requireAdminContext();
  const expectedStatus = formValue(formData, "expectedStatus");
  const parsed = visitPlanStatusSchema.safeParse({
    propertyId: formValue(formData, "propertyId"),
    visitPlanId: formValue(formData, "visitPlanId"),
    status: formValue(formData, "status"),
  });
  if (!parsed.success) {
    go("/admin/properties", "error", firstZodError(parsed.error));
  }
  const value = parsed.data;
  const fallback = propertyViewPath(value.propertyId, "einsaetze");
  if (!["active", "paused", "archived"].includes(expectedStatus)) {
    go(fallback, "error", "Ungültiger vorheriger Besuchsplanstatus.");
  }
  const { data: mutation, error } = await supabase.rpc(
    "set_visit_plan_status",
    {
      p_property_id: value.propertyId,
      p_visit_plan_id: value.visitPlanId,
      p_status: value.status,
      p_expected_status: expectedStatus,
    },
  );
  if (error) {
    go(
      fallback,
      "error",
      "Der Besuchsplan wurde zwischenzeitlich geändert oder kann im aktuellen Immobilien-/Gebäudestatus nicht gespeichert werden.",
    );
  }

  revalidatePath(fallback);
  revalidatePath("/app/today");
  if (mutation === "unchanged") {
    go(fallback, "status", "Der Besuchsplan hat bereits den gewählten Status.");
  }
  go(fallback, "status", "Der Status des Besuchsplans wurde aktualisiert.");
}

export async function rescheduleVisitAction(formData: FormData) {
  const { profile, admin } = await requireAdminContext();
  const parsed = rescheduleVisitSchema.safeParse({
    propertyId: formValue(formData, "propertyId"),
    visitId: formValue(formData, "visitId"),
    scheduledDate: formValue(formData, "scheduledDate"),
    plannedStartTime: formValue(formData, "plannedStartTime"),
    windowStart: formValue(formData, "windowStart"),
    windowEnd: formValue(formData, "windowEnd"),
    reason: formValue(formData, "reason"),
  });
  if (!parsed.success) {
    go("/admin/properties", "error", firstZodError(parsed.error));
  }
  const value = parsed.data;
  const fallback = propertyViewPath(value.propertyId, "einsaetze");
  const scheduledStart = parseBerlinDateTimeLocal(
    `${value.scheduledDate}T${value.plannedStartTime}`,
  );
  if (!scheduledStart) {
    go(
      fallback,
      "error",
      "Datum und Uhrzeit sind in der Zeitzone Europe/Berlin nicht gültig.",
    );
  }
  if (new Date(scheduledStart).getTime() <= Date.now()) {
    go(fallback, "error", "Ein Einsatz kann nur in die Zukunft verschoben werden.");
  }

  const { data: visit, error: visitError } = await admin
    .from("visits")
    .select(
      "id,status,primary_employee_id,scheduled_date,planned_start_time,scheduled_start,window_start,window_end",
    )
    .eq("id", value.visitId)
    .eq("property_id", value.propertyId)
    .maybeSingle();
  if (visitError || !visit) {
    go(fallback, "error", "Der Einsatz gehört nicht zu dieser Immobilie.");
  }
  if (visit.status !== "scheduled") {
    go(
      fallback,
      "error",
      "Nur ein noch nicht gestarteter Einsatz kann verschoben werden.",
    );
  }
  if (!visit.primary_employee_id) {
    go(
      fallback,
      "error",
      "Dem Einsatz ist kein primärer Mitarbeiter zugewiesen.",
    );
  }
  const [{ data: employee }, { data: assignment }] = await Promise.all([
    admin
      .from("employee_profiles")
      .select("id,status")
      .eq("id", visit.primary_employee_id)
      .eq("status", "active")
      .maybeSingle(),
    admin
      .from("property_employee_assignments")
      .select("employee_id,starts_on,ends_on")
      .eq("property_id", value.propertyId)
      .eq("employee_id", visit.primary_employee_id)
      .eq("active", true)
      .maybeSingle(),
  ]);
  if (
    !employee ||
    !assignment ||
    assignment.starts_on > value.scheduledDate ||
    (assignment.ends_on && assignment.ends_on < value.scheduledDate)
  ) {
    go(
      fallback,
      "error",
      "Der primäre Mitarbeiter ist am neuen Termin nicht aktiv dieser Immobilie zugewiesen.",
    );
  }

  const { data: updatedVisit, error: updateError } = await admin
    .from("visits")
    .update({
      scheduled_date: value.scheduledDate,
      planned_start_time: value.plannedStartTime,
      scheduled_start: scheduledStart,
      window_start: value.windowStart || null,
      window_end: value.windowEnd || null,
      manually_adjusted: true,
    })
    .eq("id", value.visitId)
    .eq("property_id", value.propertyId)
    .eq("status", "scheduled")
    .select("id")
    .maybeSingle();
  if (updateError || !updatedVisit) {
    go(
      fallback,
      "error",
      updateError?.message.toLowerCase().includes("bereits eingeplant")
        ? "Der Mitarbeiter hat in diesem Zeitraum bereits einen anderen Einsatz. Bitte wählen Sie eine freie Uhrzeit."
        : "Der Einsatz wurde zwischenzeitlich geändert und konnte nicht verschoben werden.",
    );
  }
  const reason = normalizePlainText(value.reason, 1_000);
  const [{ error: auditError }] = await Promise.all([
    admin.from("audit_logs").insert({
      actor_id: profile.id,
      action: "visit.rescheduled",
      entity_table: "visits",
      entity_id: value.visitId,
      metadata: {
        property_id: value.propertyId,
        reason,
        previous_scheduled_start: visit.scheduled_start,
        scheduled_start: scheduledStart,
      },
    }),
    admin.from("property_messages").insert({
      property_id: value.propertyId,
      message_type: "system",
      body: `Der Einsatz am ${formatGermanDate(
        `${value.scheduledDate}T12:00:00Z`,
      )} wurde auf ${value.plannedStartTime} Uhr terminiert.`,
      related_type: "visit",
      related_id: value.visitId,
    }),
  ]);
  if (auditError) {
    go(
      fallback,
      "error",
      "Der Termin wurde verschoben, konnte aber nicht revisionssicher protokolliert werden.",
    );
  }

  revalidatePath(fallback);
  revalidatePath("/app/today");
  revalidatePath("/app/time");
  revalidatePath(`/portal/properties/${value.propertyId}`);
  go(fallback, "status", "Der Einsatz wurde verschoben und die Beteiligten wurden informiert.");
}

export async function cancelVisitAction(formData: FormData) {
  const { profile, admin } = await requireAdminContext();
  const parsed = cancelVisitSchema.safeParse({
    propertyId: formValue(formData, "propertyId"),
    visitId: formValue(formData, "visitId"),
    reason: formValue(formData, "reason"),
  });
  if (!parsed.success) {
    go("/admin/properties", "error", firstZodError(parsed.error));
  }
  const value = parsed.data;
  const fallback = propertyViewPath(value.propertyId, "einsaetze");
  const { data: visit, error: visitError } = await admin
    .from("visits")
    .select("id,status,scheduled_start")
    .eq("id", value.visitId)
    .eq("property_id", value.propertyId)
    .maybeSingle();
  if (visitError || !visit) {
    go(fallback, "error", "Der Einsatz gehört nicht zu dieser Immobilie.");
  }
  if (visit.status !== "scheduled") {
    go(
      fallback,
      "error",
      "Nur ein noch nicht gestarteter Einsatz kann abgesagt werden.",
    );
  }
  const reason = normalizePlainText(value.reason, 1_000);
  const canceledAt = new Date().toISOString();
  const { data: canceledVisit, error: cancelError } = await admin
    .from("visits")
    .update({
      status: "canceled",
      canceled_at: canceledAt,
      cancellation_reason: reason,
      manually_adjusted: true,
    })
    .eq("id", value.visitId)
    .eq("property_id", value.propertyId)
    .eq("status", "scheduled")
    .select("id")
    .maybeSingle();
  if (cancelError || !canceledVisit) {
    go(
      fallback,
      "error",
      "Der Einsatz wurde zwischenzeitlich geändert und konnte nicht abgesagt werden.",
    );
  }
  const [{ error: auditError }] = await Promise.all([
    admin.from("audit_logs").insert({
      actor_id: profile.id,
      action: "visit.canceled",
      entity_table: "visits",
      entity_id: value.visitId,
      metadata: {
        property_id: value.propertyId,
        reason,
        scheduled_start: visit.scheduled_start,
        canceled_at: canceledAt,
      },
    }),
    admin.from("property_messages").insert({
      property_id: value.propertyId,
      message_type: "system",
      body: `Der Einsatz am ${formatGermanDate(visit.scheduled_start, {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })} wurde abgesagt.`,
      related_type: "visit",
      related_id: value.visitId,
    }),
  ]);
  if (auditError) {
    go(
      fallback,
      "error",
      "Der Termin wurde abgesagt, konnte aber nicht revisionssicher protokolliert werden.",
    );
  }

  revalidatePath(fallback);
  revalidatePath("/app/today");
  revalidatePath("/app/time");
  revalidatePath(`/portal/properties/${value.propertyId}`);
  go(fallback, "status", "Der Einsatz wurde abgesagt und die Beteiligten wurden informiert.");
}

export async function completeAdminVisitTaskAction(formData: FormData) {
  const { profile, supabase, admin } = await requireAdminContext();
  const visitId = formValue(formData, "visitId");
  const taskId = formValue(formData, "taskId");
  if (
    !/^[0-9a-f-]{36}$/i.test(visitId) ||
    !/^[0-9a-f-]{36}$/i.test(taskId)
  ) {
    go("/admin/properties", "error", "Die Aufgabe konnte nicht eindeutig zugeordnet werden.");
  }

  const { data: task, error: taskError } = await supabase
    .from("visit_tasks")
    .select("id,visit_id,property_id,status,photo_required")
    .eq("id", taskId)
    .eq("visit_id", visitId)
    .maybeSingle();
  if (taskError || !task) {
    go("/admin/properties", "error", "Die Einsatzaufgabe wurde nicht gefunden.");
  }

  const fallback = `${propertyViewPath(task.property_id, "einsaetze")}&visit=${encodeURIComponent(visitId)}`;
  const { data: visit, error: visitError } = await supabase
    .from("visits")
    .select("id,status")
    .eq("id", visitId)
    .eq("property_id", task.property_id)
    .maybeSingle();
  if (visitError || !visit) {
    go(fallback, "error", "Der Einsatz wurde nicht gefunden.");
  }
  if (visit.status !== "started") {
    go(
      fallback,
      "error",
      "Aufgaben können erst während eines gestarteten Einsatzes erledigt werden.",
    );
  }
  if (task.status === "done") {
    revalidatePath(`/admin/properties/${task.property_id}`);
    return;
  }

  if (task.photo_required) {
    const { count, error: attachmentError } = await supabase
      .from("visit_task_attachments")
      .select("id", { count: "exact", head: true })
      .eq("visit_task_id", task.id);
    if (attachmentError || !count) {
      go(
        fallback,
        "error",
        "Für diese Aufgabe ist vor dem Erledigen ein Foto erforderlich.",
      );
    }
  }

  const { data: completedTask, error: updateError } = await supabase
    .from("visit_tasks")
    .update({ status: "done", blocked_reason: null })
    .eq("id", task.id)
    .eq("visit_id", visit.id)
    .neq("status", "done")
    .select("id")
    .maybeSingle();
  if (updateError) {
    go(fallback, "error", "Die Aufgabe konnte nicht als erledigt gespeichert werden.");
  }
  if (!completedTask) {
    revalidatePath(`/admin/properties/${task.property_id}`);
    return;
  }

  const { error: auditError } = await admin.from("audit_logs").insert({
    actor_id: profile.id,
    action: "visit.task_completed_by_admin",
    entity_table: "visit_tasks",
    entity_id: task.id,
    metadata: {
      property_id: task.property_id,
      visit_id: visit.id,
      previous_status: task.status,
    },
  });
  if (auditError) {
    console.error("[Hausvia admin visit task] Audit logging failed", {
      taskId: task.id,
      visitId: visit.id,
      error: auditError,
    });
  }

  revalidatePath(`/admin/properties/${task.property_id}`);
  revalidatePath(`/app/visits/${visit.id}`);
}

function monthIsInSeason(month: number, startMonth: number, endMonth: number) {
  return startMonth <= endMonth
    ? month >= startMonth && month <= endMonth
    : month >= startMonth || month <= endMonth;
}

export async function createManualVisitAction(formData: FormData) {
  const { profile, admin } = await requireAdminContext();
  const parsed = manualVisitSchema.safeParse({
    propertyId: formValue(formData, "propertyId"),
    scheduledDate: formValue(formData, "scheduledDate"),
    plannedStartTime: formValue(formData, "plannedStartTime"),
    windowStart: formValue(formData, "windowStart"),
    windowEnd: formValue(formData, "windowEnd"),
    primaryEmployeeId: formValue(formData, "primaryEmployeeId"),
    maxVisitMinutes: formValue(formData, "maxVisitMinutes"),
    buildingIds: formValues(formData, "buildingId"),
    serviceIds: formValues(formData, "serviceId"),
  });
  if (!parsed.success) {
    go("/admin/properties", "error", firstZodError(parsed.error));
  }
  const value = parsed.data;
  const fallback = propertyViewPath(value.propertyId, "einsaetze");
  const buildingIds = Array.from(new Set(value.buildingIds));
  const serviceIds = Array.from(new Set(value.serviceIds));
  const scheduledStart = parseBerlinDateTimeLocal(
    `${value.scheduledDate}T${value.plannedStartTime}`,
  );
  if (!scheduledStart) {
    go(
      fallback,
      "error",
      "Datum und Uhrzeit sind in der Zeitzone Europe/Berlin nicht gültig.",
    );
  }
  if (new Date(scheduledStart).getTime() <= Date.now()) {
    go(fallback, "error", "Ein neuer Bedarfs-Einsatz muss in der Zukunft liegen.");
  }

  const [
    propertyResult,
    employeeResult,
    assignmentResult,
    buildingResult,
    serviceResult,
    serviceBuildingResult,
    instructionResult,
    propertyEquipmentResult,
    serviceEquipmentResult,
  ] = await Promise.all([
    admin
      .from("properties")
      .select("id,status")
      .eq("id", value.propertyId)
      .eq("status", "active")
      .maybeSingle(),
    admin
      .from("employee_profiles")
      .select("id,status")
      .eq("id", value.primaryEmployeeId)
      .eq("status", "active")
      .maybeSingle(),
    admin
      .from("property_employee_assignments")
      .select("employee_id,starts_on,ends_on")
      .eq("property_id", value.propertyId)
      .eq("employee_id", value.primaryEmployeeId)
      .eq("active", true)
      .maybeSingle(),
    admin
      .from("buildings")
      .select("id")
      .eq("property_id", value.propertyId)
      .eq("status", "active")
      .in("id", buildingIds),
    admin
      .from("property_services")
      .select(
        "id,property_id,name,customer_description,category,execution_rule,start_date,end_date,seasonal,season_start_month,season_end_month,photo_required,customer_visible,service_checklist_items(id,label,required,sort_order)",
      )
      .eq("property_id", value.propertyId)
      .eq("status", "active")
      .in("execution_rule", ["on_demand", "manual"])
      .in("id", serviceIds),
    admin
      .from("property_service_buildings")
      .select("property_service_id,building_id")
      .in("property_service_id", serviceIds),
    admin
      .from("property_service_instructions")
      .select("property_service_id,internal_instruction")
      .in("property_service_id", serviceIds),
    admin
      .from("property_equipment")
      .select(
        "equipment_id,building_id,required_quantity,rental,provision_note,seasonal,season_start_month,season_end_month",
      )
      .eq("property_id", value.propertyId)
      .eq("active", true),
    admin
      .from("service_equipment")
      .select("property_service_id,equipment_id,required_quantity")
      .in("property_service_id", serviceIds),
  ]);
  if (
    propertyResult.error ||
    employeeResult.error ||
    assignmentResult.error ||
    buildingResult.error ||
    serviceResult.error ||
    serviceBuildingResult.error ||
    instructionResult.error ||
    propertyEquipmentResult.error ||
    serviceEquipmentResult.error
  ) {
    go(
      fallback,
      "error",
      "Immobilie, Mitarbeiter, Gebäude und Leistungen konnten nicht vollständig geprüft werden.",
    );
  }
  if (!propertyResult.data) {
    go(fallback, "error", "Nur eine aktive Immobilie kann eingeplant werden.");
  }
  if (
    !employeeResult.data ||
    !assignmentResult.data ||
    assignmentResult.data.starts_on > value.scheduledDate ||
    (assignmentResult.data.ends_on &&
      assignmentResult.data.ends_on < value.scheduledDate)
  ) {
    go(
      fallback,
      "error",
      "Der Mitarbeiter ist am gewählten Termin nicht aktiv dieser Immobilie zugewiesen.",
    );
  }
  if ((buildingResult.data ?? []).length !== buildingIds.length) {
    go(
      fallback,
      "error",
      "Mindestens ein ausgewähltes Gebäude gehört nicht aktiv zu dieser Immobilie.",
    );
  }
  if ((serviceResult.data ?? []).length !== serviceIds.length) {
    go(
      fallback,
      "error",
      "Mindestens eine Leistung ist nicht aktiv oder keine Bedarfs-/Manuell-Leistung dieser Immobilie.",
    );
  }

  const scheduledMonth = Number(value.scheduledDate.slice(5, 7));
  const services = serviceResult.data ?? [];
  for (const service of services) {
    if (
      service.start_date > value.scheduledDate ||
      (service.end_date && service.end_date < value.scheduledDate)
    ) {
      go(
        fallback,
        "error",
        `Die Leistung „${service.name}“ ist am gewählten Datum nicht aktiv.`,
      );
    }
    if (
      service.seasonal &&
      (!service.season_start_month ||
        !service.season_end_month ||
        !monthIsInSeason(
          scheduledMonth,
          service.season_start_month,
          service.season_end_month,
        ))
    ) {
      go(
        fallback,
        "error",
        `Die Leistung „${service.name}“ liegt außerhalb ihrer Saison.`,
      );
    }
  }

  const selectedBuildingIds = new Set(buildingIds);
  const serviceBuildings = new Map<string, string[]>();
  for (const link of serviceBuildingResult.data ?? []) {
    const ids = serviceBuildings.get(link.property_service_id) ?? [];
    ids.push(link.building_id);
    serviceBuildings.set(link.property_service_id, ids);
  }
  for (const service of services) {
    const linkedBuildings = serviceBuildings.get(service.id) ?? [];
    if (
      linkedBuildings.length > 0 &&
      !linkedBuildings.some((buildingId) => selectedBuildingIds.has(buildingId))
    ) {
      go(
        fallback,
        "error",
        `Die Leistung „${service.name}“ ist keinem ausgewählten Gebäude zugeordnet.`,
      );
    }
  }

  const visitId = randomUUID();
  const taskRows = services.flatMap((service) => {
    const linkedBuildings = serviceBuildings.get(service.id) ?? [];
    const targets = linkedBuildings.length
      ? linkedBuildings.filter((buildingId) => selectedBuildingIds.has(buildingId))
      : [null];
    const checklist = [...(service.service_checklist_items ?? [])]
      .sort(
        (left, right) =>
          Number(left.sort_order ?? 0) - Number(right.sort_order ?? 0),
      )
      .map((item) => ({
        id: item.id,
        label: item.label,
        required: item.required,
      }));
    return targets.map((buildingId) => ({
      id: randomUUID(),
      visit_id: visitId,
      property_id: value.propertyId,
      building_id: buildingId,
      property_service_id: service.id,
      source_type: "service",
      source_id: service.id,
      title: service.name,
      description: service.customer_description || null,
      category: service.category,
      checklist_snapshot: checklist,
      status: "open",
      photo_required: service.photo_required,
      customer_visible: service.customer_visible,
      due_period_key: `manual:${visitId}`,
      dedupe_key: `manual-service:${visitId}:${service.id}:${buildingId ?? "property"}`,
      created_by: profile.id,
    }));
  });
  const taskIdByServiceAndBuilding = new Map(
    taskRows.map((task) => [
      `${task.property_service_id}:${task.building_id ?? "property"}`,
      task.id,
    ]),
  );
  const instructionsByService = new Map(
    (instructionResult.data ?? []).map((instruction) => [
      instruction.property_service_id,
      instruction.internal_instruction,
    ]),
  );
  const instructionRows = taskRows.flatMap((task) => {
    const instruction = instructionsByService.get(task.property_service_id);
    return instruction
      ? [{ visit_task_id: task.id, internal_instruction: instruction }]
      : [];
  });

  type VisitEquipmentRow = {
    visit_id: string;
    equipment_id: string;
    required_quantity: number;
    rental: boolean;
    provision_note: string | null;
  };
  const equipmentById = new Map<string, VisitEquipmentRow>();
  function mergeEquipment(
    equipmentId: string,
    requiredQuantity: number,
    rental = false,
    provisionNote: string | null = null,
  ) {
    const current = equipmentById.get(equipmentId);
    equipmentById.set(equipmentId, {
      visit_id: visitId,
      equipment_id: equipmentId,
      required_quantity: Math.max(
        Number(current?.required_quantity ?? 0),
        requiredQuantity,
      ),
      rental: Boolean(current?.rental) || rental,
      provision_note: current?.provision_note || provisionNote,
    });
  }
  for (const item of propertyEquipmentResult.data ?? []) {
    if (item.building_id && !selectedBuildingIds.has(item.building_id)) continue;
    if (
      item.seasonal &&
      (!item.season_start_month ||
        !item.season_end_month ||
        !monthIsInSeason(
          scheduledMonth,
          item.season_start_month,
          item.season_end_month,
        ))
    ) {
      continue;
    }
    mergeEquipment(
      item.equipment_id,
      Number(item.required_quantity),
      item.rental,
      item.provision_note,
    );
  }
  for (const item of serviceEquipmentResult.data ?? []) {
    mergeEquipment(item.equipment_id, Number(item.required_quantity));
  }

  async function rollbackManualVisit() {
    const taskIds = taskRows.map((task) => task.id);
    if (taskIds.length) {
      await admin
        .from("visit_task_instructions")
        .delete()
        .in("visit_task_id", taskIds);
      await admin.from("visit_tasks").delete().in("id", taskIds);
    }
    await admin.from("visit_equipment").delete().eq("visit_id", visitId);
    await admin.from("visit_admin_metrics").delete().eq("visit_id", visitId);
    await admin.from("visit_buildings").delete().eq("visit_id", visitId);
    await admin
      .from("notifications")
      .delete()
      .eq("entity_type", "visits")
      .eq("entity_id", visitId);
    await admin.from("visits").delete().eq("id", visitId);
  }

  const { error: visitError } = await admin.from("visits").insert({
    id: visitId,
    visit_plan_id: null,
    property_id: value.propertyId,
    primary_employee_id: value.primaryEmployeeId,
    scheduled_date: value.scheduledDate,
    planned_start_time: value.plannedStartTime,
    scheduled_start: scheduledStart,
    window_start: value.windowStart || null,
    window_end: value.windowEnd || null,
    planned_duration_minutes: value.maxVisitMinutes,
    status: "scheduled",
    manually_adjusted: true,
  });
  if (visitError) {
    go(
      fallback,
      "error",
      visitError.message.toLowerCase().includes("bereits eingeplant")
        ? "Der Mitarbeiter hat in diesem Zeitraum bereits einen anderen Einsatz. Bitte wählen Sie eine andere Uhrzeit."
        : "Der Bedarfs-Einsatz konnte nicht angelegt werden.",
    );
  }
  const { error: buildingLinksError } = await admin
    .from("visit_buildings")
    .insert(
      buildingIds.map((buildingId) => ({
        visit_id: visitId,
        building_id: buildingId,
      })),
    );
  if (buildingLinksError) {
    await rollbackManualVisit();
    go(
      fallback,
      "error",
      "Die Gebäude des Bedarfs-Einsatzes konnten nicht gespeichert werden.",
    );
  }
  const [metrics, tasks, equipment] = await Promise.all([
    admin.from("visit_admin_metrics").insert({
      visit_id: visitId,
      max_visit_minutes: value.maxVisitMinutes,
    }),
    admin.from("visit_tasks").insert(taskRows),
    equipmentById.size
      ? admin.from("visit_equipment").insert(Array.from(equipmentById.values()))
      : Promise.resolve({ error: null }),
  ]);
  if (metrics.error || tasks.error || equipment.error) {
    await rollbackManualVisit();
    go(
      fallback,
      "error",
      "Gebäude, Aufgaben oder Equipment des Bedarfs-Einsatzes konnten nicht gespeichert werden.",
    );
  }
  if (instructionRows.length) {
    const { error: instructionError } = await admin
      .from("visit_task_instructions")
      .insert(instructionRows);
    if (instructionError) {
      await rollbackManualVisit();
      go(
        fallback,
        "error",
        "Die internen Aufgabenanweisungen konnten nicht gespeichert werden.",
      );
    }
  }
  const { error: auditError } = await admin.from("audit_logs").insert({
    actor_id: profile.id,
    action: "visit.manual_created",
    entity_table: "visits",
    entity_id: visitId,
    metadata: {
      property_id: value.propertyId,
      scheduled_start: scheduledStart,
      employee_id: value.primaryEmployeeId,
      building_ids: buildingIds,
      service_ids: serviceIds,
      task_ids: Array.from(taskIdByServiceAndBuilding.values()),
    },
  });
  if (auditError) {
    await rollbackManualVisit();
    go(
      fallback,
      "error",
      "Der Bedarfs-Einsatz konnte nicht revisionssicher angelegt werden.",
    );
  }
  await admin.from("property_messages").insert({
    property_id: value.propertyId,
    message_type: "system",
    body: `Ein Bedarfs-Einsatz wurde für den ${formatGermanDate(
      `${value.scheduledDate}T12:00:00Z`,
    )} um ${value.plannedStartTime} Uhr eingeplant.`,
    related_type: "visit",
    related_id: visitId,
  });

  revalidatePath(fallback);
  revalidatePath("/app/today");
  revalidatePath(`/portal/properties/${value.propertyId}`);
  go(
    fallback,
    "status",
    "Der Bedarfs-Einsatz mit Aufgaben und Equipment wurde angelegt.",
  );
}

export async function generateVisitsAction() {
  const { admin } = await requireAdminContext();
  const { error } = await admin.rpc("generate_upcoming_visits", {
    p_horizon_days: 90,
    p_plan_id: null,
  });
  if (error) {
    go(
      "/admin/properties",
      "error",
      "Die nächsten Termine konnten nicht erzeugt werden.",
    );
  }
  revalidatePath("/admin/properties");
  revalidatePath("/app/today");
  go("/admin/properties", "status", "Termine wurden für 90 Tage ergänzt.");
}

export async function createEquipmentAction(formData: FormData) {
  const { profile, admin } = await requireAdminContext();
  const name = formValue(formData, "name");
  const category = formValue(formData, "category");
  if (!name || !category)
    go("/admin/equipment", "error", "Name und Kategorie sind erforderlich.");
  const { data: equipment, error } = await admin
    .from("equipment")
    .insert({
      name: name.slice(0, 180),
      category,
      description: formValue(formData, "description").slice(0, 4_000) || null,
      sku: formValue(formData, "sku").slice(0, 100) || null,
      unit: formValue(formData, "unit").slice(0, 50) || "Stück",
      current_stock: Number(formValue(formData, "currentStock") || "0"),
      minimum_stock: Number(formValue(formData, "minimumStock") || "0"),
      condition: formValue(formData, "condition") || "available",
      ownership_type: formValue(formData, "ownershipType") || "owned",
      storage_location:
        formValue(formData, "storageLocation").slice(0, 180) || null,
      status: "active",
      created_by: profile.id,
    })
    .select("id")
    .single();
  if (error || !equipment)
    go(
      "/admin/equipment",
      "error",
      "Equipment konnte nicht gespeichert werden.",
    );
  const { error: detailsError } = await admin.from("equipment_admin_details").insert({
    equipment_id: equipment.id,
    supplier: formValue(formData, "supplier").slice(0, 180) || null,
    rental_cost_cents: parseEuroToCents(formValue(formData, "rentalCost")),
  });
  if (detailsError) {
    await admin.from("equipment").delete().eq("id", equipment.id);
    go("/admin/equipment", "error", "Interne Equipmentangaben konnten nicht gespeichert werden.");
  }
  revalidatePath("/admin/equipment");
  go("/admin/equipment", "status", "Equipment wurde angelegt.");
}

export async function assignPropertyEquipmentAction(formData: FormData) {
  const { supabase } = await requireAdminContext();
  const propertyId = formValue(formData, "propertyId");
  const equipmentId = formValue(formData, "equipmentId");
  const buildingId = formValue(formData, "buildingId") || null;
  const provisionNote = formValue(formData, "provisionNote");
  const requiredQuantity = Number(
    formValue(formData, "requiredQuantity").replace(",", ".") || "1",
  );
  const seasonal = checkbox(formData, "seasonal");
  const seasonStartMonth = Number(formValue(formData, "seasonStartMonth") || "0") || null;
  const seasonEndMonth = Number(formValue(formData, "seasonEndMonth") || "0") || null;
  const notificationLeadHours = Number(formValue(formData, "notificationLeadHours") || "48");
  if (
    !/^[0-9a-f-]{36}$/i.test(propertyId) ||
    !/^[0-9a-f-]{36}$/i.test(equipmentId) ||
    (buildingId !== null && !/^[0-9a-f-]{36}$/i.test(buildingId)) ||
    !Number.isFinite(requiredQuantity) ||
    requiredQuantity <= 0 ||
    requiredQuantity > 1_000_000_000 ||
    !Number.isSafeInteger(notificationLeadHours) ||
    notificationLeadHours < 0 ||
    notificationLeadHours > 87_600 ||
    (seasonStartMonth !== null && (seasonStartMonth < 1 || seasonStartMonth > 12)) ||
    (seasonEndMonth !== null && (seasonEndMonth < 1 || seasonEndMonth > 12)) ||
    (seasonal && (!seasonStartMonth || !seasonEndMonth)) ||
    provisionNote.length > 2_000
  )
    go(propertyViewPath(propertyId, "team"), "error", "Bitte gültige Equipmentangaben eingeben.");
  const { error } = await supabase.rpc("set_property_equipment_assignment", {
    p_property_id: propertyId,
    p_equipment_id: equipmentId,
    p_building_id: buildingId,
    p_required_quantity: requiredQuantity,
    p_seasonal: seasonal,
    p_season_start_month: seasonal ? seasonStartMonth : null,
    p_season_end_month: seasonal ? seasonEndMonth : null,
    p_rental: checkbox(formData, "rental"),
    p_notification_lead_hours: notificationLeadHours,
    p_provision_note: provisionNote || null,
    p_assignment_id: null,
    p_expected_updated_at: null,
    p_deactivate: false,
  });
  if (error) {
    go(
      propertyViewPath(propertyId, "team"),
      "error",
      "Equipmentzuordnung konnte nicht gespeichert werden.",
    );
  }
  revalidatePath(`/admin/properties/${propertyId}`);
  revalidatePath("/admin/winter-service");
  revalidatePath("/admin/equipment");
  revalidatePath("/app/today");
  go(propertyViewPath(propertyId, "team"), "status", "Equipment wurde zugeordnet.");
}

export async function createExtraChargeAction(formData: FormData) {
  const { profile, admin } = await requireAdminContext();
  const propertyId = formValue(formData, "propertyId");
  const parsed = extraChargeSchema.safeParse({
    propertyId,
    visitId: formValue(formData, "visitId"),
    description: formValue(formData, "description"),
    serviceDate: formValue(formData, "serviceDate"),
    durationMinutes: formValue(formData, "durationMinutes") || "0",
    hourlyRate: formValue(formData, "hourlyRate"),
    manualNetAmount: formValue(formData, "manualNetAmount"),
    materialCost: formValue(formData, "materialCost"),
    taxRate: formValue(formData, "taxRate") || "19",
    internalNote: formValue(formData, "internalNote"),
    billable: checkbox(formData, "billable"),
  });
  if (!parsed.success) {
    go(
      propertyViewPath(propertyId, "abrechnung"),
      "error",
      firstZodError(parsed.error),
    );
  }
  const value = parsed.data;
  const [{ data: companySettings }, { data: property }, visitResult] =
    await Promise.all([
      admin
        .from("company_settings")
        .select("default_hourly_rate_cents")
        .eq("id", true)
        .maybeSingle(),
      admin.from("properties").select("id").eq("id", propertyId).maybeSingle(),
      value.visitId
        ? admin
            .from("visits")
            .select("id")
            .eq("id", value.visitId)
            .eq("property_id", propertyId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
  if (!property || (value.visitId && !visitResult.data)) {
    go(
      propertyViewPath(propertyId, "abrechnung"),
      "error",
      "Immobilie oder Einsatzbezug ist ungültig.",
    );
  }
  const durationMinutes = value.durationMinutes;
  const hourlyRateCents = value.hourlyRate
    ? parseEuroToCents(value.hourlyRate)
    : Number(companySettings?.default_hourly_rate_cents ?? 0);
  const calculatedNetCents = calculateTimedChargeCents(
    durationMinutes,
    hourlyRateCents,
  );
  const hasManualNetAmount = value.manualNetAmount !== "";
  const manualNetCents = hasManualNetAmount
    ? parseEuroToCents(value.manualNetAmount)
    : null;
  const netCents = manualNetCents ?? calculatedNetCents;
  const materialCostCents = value.materialCost
    ? parseEuroToCents(value.materialCost)
    : 0;
  const taxRateBps = Math.round(value.taxRate * 100);
  const { data: charge, error } = await admin
    .from("extra_charges")
    .insert({
      property_id: propertyId,
      visit_id: value.visitId || null,
      description: normalizePlainText(value.description, 1_000),
      service_date: value.serviceDate,
      duration_minutes: durationMinutes || null,
      hourly_rate_cents: hourlyRateCents || null,
      net_amount_cents: netCents,
      tax_rate_bps: taxRateBps,
      tax_amount_cents: calculateTaxCents(
        netCents + materialCostCents,
        taxRateBps,
      ),
      material_cost_cents: materialCostCents,
      manual_price: hasManualNetAmount,
      original_net_amount_cents: hasManualNetAmount
        ? calculatedNetCents
        : null,
      internal_note: value.internalNote || null,
      billable: value.billable,
      billing_status: "open",
      created_by: profile.id,
    })
    .select("id")
    .single();
  if (error || !charge)
    go(
      propertyViewPath(propertyId, "abrechnung"),
      "error",
      "Zusatzkosten konnten nicht gespeichert werden.",
    );
  const auditEntries = [
    {
      actor_id: profile.id,
      action: "extra_charge.created",
      entity_table: "extra_charges",
      entity_id: charge.id,
      metadata: {
        service_date: value.serviceDate,
        net_amount_cents: netCents,
        material_cost_cents: materialCostCents,
        tax_rate_bps: taxRateBps,
        billable: value.billable,
        manual_price: hasManualNetAmount,
      },
    },
    ...(hasManualNetAmount
      ? [
          {
            actor_id: profile.id,
            action: "extra_charge.manual_price",
            entity_table: "extra_charges",
            entity_id: charge.id,
            metadata: {
              duration_minutes: durationMinutes,
              hourly_rate_cents: hourlyRateCents,
              original_net_amount_cents: calculatedNetCents,
              net_amount_cents: netCents,
            },
          },
        ]
      : []),
  ];
  const { error: auditError } = await admin.from("audit_logs").insert(auditEntries);
  if (auditError) {
    await admin.from("extra_charges").delete().eq("id", charge.id);
    go(
      propertyViewPath(propertyId, "abrechnung"),
      "error",
      "Die Zusatzkosten konnten nicht revisionssicher protokolliert werden.",
    );
  }
  revalidatePath(`/admin/properties/${propertyId}`);
}

export async function cancelExtraChargeAction(formData: FormData) {
  const { profile, admin } = await requireAdminContext();
  const propertyId = formValue(formData, "propertyId");
  const chargeId = formValue(formData, "chargeId");
  const reason = normalizePlainText(formValue(formData, "reason"), 500);
  const fallback = propertyViewPath(propertyId, "abrechnung");
  if (
    !/^[0-9a-f-]{36}$/i.test(propertyId) ||
    !/^[0-9a-f-]{36}$/i.test(chargeId) ||
    reason.length < 3
  ) {
    go(fallback, "error", "Für die Stornierung ist ein nachvollziehbarer Grund erforderlich.");
  }
  const { data: existing, error: existingError } = await admin
    .from("extra_charges")
    .select("id,billable,billing_status,invoice_item_id")
    .eq("id", chargeId)
    .eq("property_id", propertyId)
    .maybeSingle();
  if (
    existingError ||
    !existing ||
    !canCancelExtraCharge(existing.billing_status, existing.invoice_item_id)
  ) {
    go(fallback, "error", "Nur offene, noch nicht abgerechnete Zusatzkosten können storniert werden.");
  }
  const { data: canceled, error: cancelError } = await admin
    .from("extra_charges")
    .update({ billing_status: "canceled", billable: false })
    .eq("id", chargeId)
    .eq("property_id", propertyId)
    .eq("billing_status", "open")
    .is("invoice_item_id", null)
    .select("id")
    .maybeSingle();
  if (cancelError || !canceled) {
    go(fallback, "error", "Die Zusatzkosten wurden zwischenzeitlich verändert und nicht storniert.");
  }
  const { error: auditError } = await admin.from("audit_logs").insert({
    actor_id: profile.id,
    action: "extra_charge.canceled",
    entity_table: "extra_charges",
    entity_id: chargeId,
    metadata: { reason },
  });
  if (auditError) {
    await admin
      .from("extra_charges")
      .update({ billing_status: "open", billable: existing.billable })
      .eq("id", chargeId)
      .eq("property_id", propertyId)
      .eq("billing_status", "canceled")
      .is("invoice_item_id", null);
    go(fallback, "error", "Die Stornierung konnte nicht revisionssicher protokolliert werden.");
  }
  revalidatePath(fallback);
  go(fallback, "status", "Die Zusatzkosten wurden storniert und werden nicht abgerechnet.");
}

export async function createAdminDamageAction(formData: FormData) {
  const { profile, admin } = await requireAdminContext();
  const propertyId = formValue(formData, "propertyId");
  const fallback = propertyViewPath(propertyId, "schaeden");
  const parsed = damageSchema.safeParse({
    buildingId: formValue(formData, "buildingId"),
    title: formValue(formData, "title"),
    description: formValue(formData, "description"),
    priority: formValue(formData, "priority") || "normal",
  });
  if (!parsed.success) go(fallback, "error", firstZodError(parsed.error));

  const imageEntry = formData.get("image");
  const image =
    imageEntry instanceof File && imageEntry.size > 0 ? imageEntry : null;
  if (image) {
    const validation = await validateUploadContents(image, "image");
    if (!validation.ok) go(fallback, "error", validation.message);
  }

  const [
    { data: property, error: propertyError },
    { data: building, error: buildingError },
  ] = await Promise.all([
      admin
        .from("properties")
        .select("id,status")
        .eq("id", propertyId)
        .maybeSingle(),
      admin
        .from("buildings")
        .select("id,property_id,status")
        .eq("id", parsed.data.buildingId)
        .eq("property_id", propertyId)
        .eq("status", "active")
        .maybeSingle(),
    ]);
  if (
    propertyError ||
    buildingError ||
    !property ||
    property.status === "archived" ||
    !building
  ) {
    go(
      fallback,
      "error",
      "Immobilie und aktives Gebäude konnten nicht eindeutig zugeordnet werden.",
    );
  }

  const { data: damage, error: damageError } = await admin
    .from("damage_reports")
    .insert({
      property_id: property.id,
      building_id: building.id,
      source: "admin",
      title: normalizePlainText(parsed.data.title, 180),
      description: normalizePlainText(parsed.data.description, 5_000),
      priority: parsed.data.priority,
      status: "new",
      created_by: profile.id,
      planned_next_visit: true,
    })
    .select("id")
    .single();
  if (damageError || !damage) {
    go(fallback, "error", "Die Schadensmeldung konnte nicht angelegt werden.");
  }

  let uploadedImage: Awaited<ReturnType<typeof uploadPortalFile>> | null = null;
  let creationFailure = false;
  if (image) {
    try {
      uploadedImage = await uploadPortalFile({
        client: admin,
        bucket: "damage-attachments",
        ownerPath: `${profile.id}/${property.id}/${damage.id}`,
        file: image,
      });
      const { error: attachmentError } = await admin
        .from("damage_attachments")
        .insert({
          damage_report_id: damage.id,
          bucket: uploadedImage.bucket,
          path: uploadedImage.path,
          filename: uploadedImage.filename,
          mime_type: uploadedImage.mimeType,
          size_bytes: uploadedImage.size,
          uploaded_by: profile.id,
        });
      creationFailure = Boolean(attachmentError);
    } catch {
      creationFailure = true;
    }
  }

  if (!creationFailure) {
    const { error: auditError } = await admin.from("audit_logs").insert({
      actor_id: profile.id,
      action: "damage.created_by_admin",
      entity_table: "damage_reports",
      entity_id: damage.id,
      metadata: {
        property_id: property.id,
        building_id: building.id,
        priority: parsed.data.priority,
        attachment_count: uploadedImage ? 1 : 0,
      },
    });
    creationFailure = Boolean(auditError);
  }

  if (creationFailure) {
    const cleanupErrors: unknown[] = [];
    const { error: attachmentCleanupError } = await admin
      .from("damage_attachments")
      .delete()
      .eq("damage_report_id", damage.id);
    if (attachmentCleanupError) cleanupErrors.push(attachmentCleanupError);
    if (uploadedImage) {
      const { error: storageCleanupError } = await admin.storage
        .from("damage-attachments")
        .remove([uploadedImage.path]);
      if (storageCleanupError) cleanupErrors.push(storageCleanupError);
    }
    const [notificationCleanup, messageCleanup] = await Promise.all([
      admin
        .from("notifications")
        .delete()
        .eq("entity_type", "damage_reports")
        .eq("entity_id", damage.id),
      admin
        .from("property_messages")
        .delete()
        .eq("related_type", "damage_reports")
        .eq("related_id", damage.id),
    ]);
    if (notificationCleanup.error) cleanupErrors.push(notificationCleanup.error);
    if (messageCleanup.error) cleanupErrors.push(messageCleanup.error);
    const { error: damageCleanupError } = await admin
      .from("damage_reports")
      .delete()
      .eq("id", damage.id)
      .eq("source", "admin");
    if (damageCleanupError) cleanupErrors.push(damageCleanupError);
    if (cleanupErrors.length) {
      console.error("[Hausvia admin damage] Compensation cleanup failed", {
        damageId: damage.id,
        errors: cleanupErrors,
      });
    }
    go(
      fallback,
      "error",
      "Schadensmeldung, Bild und Audit konnten nicht vollständig gespeichert werden. Bitte versuchen Sie es erneut.",
    );
  }

  revalidatePath(fallback);
  revalidatePath(`/portal/properties/${property.id}`);
  revalidatePath(`/app/properties/${property.id}`);
  go(fallback, "status", "Die Schadensmeldung wurde angelegt und vorgemerkt.");
}

export async function updateDamageStatusAction(formData: FormData) {
  const { profile, admin } = await requireAdminContext();
  const propertyId = formValue(formData, "propertyId");
  const damageId = formValue(formData, "damageId");
  const status = formValue(formData, "status");
  if (
    !damageId ||
    ![
      "new",
      "reviewed",
      "scheduled",
      "in_progress",
      "resolved",
      "rejected",
    ].includes(status)
  ) {
    go(
      propertyViewPath(propertyId, "schaeden"),
      "error",
      "Ungültiger Schadensstatus.",
    );
  }
  const { error } = await admin
    .from("damage_reports")
    .update({
      status,
      resolved_at: status === "resolved" ? new Date().toISOString() : null,
      resolution_note: formValue(formData, "resolutionNote") || null,
      reviewed_by: profile.id,
    })
    .eq("id", damageId)
    .eq("property_id", propertyId);
  if (error) {
    go(
      propertyViewPath(propertyId, "schaeden"),
      "error",
      "Der Schadensstatus konnte nicht gespeichert werden.",
    );
  }
  revalidatePath(`/admin/properties/${propertyId}`);
}

export async function updateOperationalReportStatusAction(formData: FormData) {
  const { profile, admin } = await requireAdminContext();
  const propertyId = formValue(formData, "propertyId");
  const reportId = formValue(formData, "reportId");
  const status = formValue(formData, "status");
  if (!reportId || !["new", "reviewing", "organized", "resolved"].includes(status)) {
    go(propertyViewPath(propertyId, "schaeden"), "error", "Ungültiger Meldungsstatus.");
  }
  const { error } = await admin
    .from("operational_reports")
    .update({
      status,
      reviewed_by: profile.id,
      resolved_at: status === "resolved" ? new Date().toISOString() : null,
      resolved_by: status === "resolved" ? profile.id : null,
    })
    .eq("id", reportId)
    .eq("property_id", propertyId);
  if (error) go(propertyViewPath(propertyId, "schaeden"), "error", "Meldungsstatus konnte nicht gespeichert werden.");
  await admin.from("audit_logs").insert({
    actor_id: profile.id,
    action: "operational_report.status_changed",
    entity_table: "operational_reports",
    entity_id: reportId,
    metadata: { status },
  });
  revalidatePath(`/admin/properties/${propertyId}`);
}

export async function updateComplaintStatusAction(formData: FormData) {
  const { profile, admin } = await requireAdminContext();
  const propertyId = formValue(formData, "propertyId");
  const complaintId = formValue(formData, "complaintId");
  const status = formValue(formData, "status");
  const internalNote = normalizePlainText(formValue(formData, "internalNote"), 8_000);
  if (!complaintId || !["new", "in_review", "answered", "resolved"].includes(status)) {
    go(propertyViewPath(propertyId, "schaeden"), "error", "Ungültiger Beschwerdestatus.");
  }
  const now = new Date().toISOString();
  const [{ error: complaintError }, { error: noteError }] = await Promise.all([
    admin
      .from("complaints")
      .update({
        status,
        answered_at: status === "answered" ? now : null,
        resolved_at: status === "resolved" ? now : null,
      })
      .eq("id", complaintId)
      .eq("property_id", propertyId),
    admin.from("complaint_admin_notes").upsert(
      {
        complaint_id: complaintId,
        internal_note: internalNote || null,
        updated_by: profile.id,
      },
      { onConflict: "complaint_id" },
    ),
  ]);
  if (complaintError || noteError) {
    go(propertyViewPath(propertyId, "schaeden"), "error", "Beschwerde konnte nicht aktualisiert werden.");
  }
  await admin.from("audit_logs").insert({
    actor_id: profile.id,
    action: "complaint.status_changed",
    entity_table: "complaints",
    entity_id: complaintId,
    metadata: { status },
  });
  revalidatePath(`/admin/properties/${propertyId}`);
}

export async function correctVisitTimeAction(formData: FormData) {
  await requireAdminContext();
  const visitId = formValue(formData, "visitId");
  const propertyId = formValue(formData, "propertyId");
  const reason = formValue(formData, "reason");
  const newStartedAt = parseBerlinDateTimeLocal(formValue(formData, "startedAt"));
  const newCompletedAt = parseBerlinDateTimeLocal(formValue(formData, "completedAt"));
  if (!reason || reason.length < 5 || !newStartedAt || !newCompletedAt) {
    go(
      propertyViewPath(propertyId, "einsaetze"),
      "error",
      "Zeitkorrekturen benötigen Start, Ende und eine Begründung.",
    );
  }
  const durationMinutes = Math.round(
    (new Date(newCompletedAt).getTime() - new Date(newStartedAt).getTime()) /
      60_000,
  );
  if (durationMinutes <= 0) {
    go(
      propertyViewPath(propertyId, "einsaetze"),
      "error",
      "Das Einsatzende muss nach dem Start liegen.",
    );
  }
  const supabase = await createSupabaseServerClient();
  const { data: savedDuration, error } = await supabase.rpc(
    "correct_visit_time",
    {
      p_visit_id: visitId,
      p_property_id: propertyId,
      p_started_at: newStartedAt,
      p_completed_at: newCompletedAt,
      p_reason: normalizePlainText(reason, 1_000),
    },
  );
  if (error || savedDuration !== durationMinutes) {
    go(
      propertyViewPath(propertyId, "einsaetze"),
      "error",
      "Die Zeitkorrektur konnte nicht gespeichert werden.",
    );
  }
  revalidatePath(`/admin/properties/${propertyId}`);
  go(
    propertyViewPath(propertyId, "einsaetze"),
    "status",
    "Die Einsatzzeit wurde korrigiert und revisionssicher protokolliert.",
  );
}

export async function updateCompanySettingsAction(formData: FormData) {
  const { profile, admin } = await requireAdminContext();
  const requestedView = formValue(formData, "returnView");
  const returnView = ["company", "billing"].includes(requestedView)
    ? requestedView
    : "company";
  const fallback = `/admin/settings?view=${returnView}`;
  const parsed = companySettingsSchema.safeParse({
    legalName: formValue(formData, "legalName"),
    brandName: formValue(formData, "brandName"),
    street: formValue(formData, "street"),
    houseNumber: formValue(formData, "houseNumber"),
    postalCode: formValue(formData, "postalCode"),
    city: formValue(formData, "city"),
    country: formValue(formData, "country") || "Deutschland",
    taxNumber: formValue(formData, "taxNumber"),
    vatId: formValue(formData, "vatId"),
    commercialRegister: formValue(formData, "commercialRegister"),
    management: formValue(formData, "management"),
    email: formValue(formData, "email"),
    phone: formValue(formData, "phone"),
    bankName: formValue(formData, "bankName"),
    iban: formValue(formData, "iban"),
    bic: formValue(formData, "bic"),
    paymentDueDays: formValue(formData, "paymentDueDays"),
    invoicePrefix: formValue(formData, "invoicePrefix"),
    defaultTaxRate: formValue(formData, "defaultTaxRate"),
    defaultHourlyRate: formValue(formData, "defaultHourlyRate"),
    invoiceEmailFrom: formValue(formData, "invoiceEmailFrom"),
    invoiceEmailReplyTo: formValue(formData, "invoiceEmailReplyTo"),
  });
  if (!parsed.success) {
    const billingFields = new Set([
      "bankName",
      "iban",
      "bic",
      "paymentDueDays",
      "invoicePrefix",
      "defaultTaxRate",
      "defaultHourlyRate",
      "invoiceEmailFrom",
      "invoiceEmailReplyTo",
    ]);
    const invalidField = String(parsed.error.issues[0]?.path[0] ?? "");
    const errorView = billingFields.has(invalidField) ? "billing" : "company";
    go(
      `/admin/settings?view=${errorView}`,
      "error",
      firstZodError(parsed.error),
    );
  }
  const value = parsed.data;
  const { error } = await admin.from("company_settings").upsert(
    {
      id: true,
      legal_name: value.legalName,
      brand_name: value.brandName,
      street: value.street || null,
      house_number: value.houseNumber || null,
      postal_code: value.postalCode || null,
      city: value.city || null,
      country: value.country,
      tax_number: value.taxNumber || null,
      vat_id: value.vatId || null,
      commercial_register: value.commercialRegister || null,
      management: value.management || null,
      email: value.email,
      phone: value.phone || null,
      bank_name: value.bankName || null,
      iban: value.iban?.replace(/\s+/g, "").toUpperCase() || null,
      bic: value.bic?.replace(/\s+/g, "").toUpperCase() || null,
      payment_due_days: value.paymentDueDays,
      invoice_prefix: value.invoicePrefix.toUpperCase(),
      default_tax_rate_bps: Math.round(value.defaultTaxRate * 100),
      default_hourly_rate_cents: parseEuroToCents(value.defaultHourlyRate),
      invoice_email_from: value.invoiceEmailFrom,
      invoice_email_reply_to: value.invoiceEmailReplyTo,
    },
    { onConflict: "id" },
  );
  if (error)
    go(
      fallback,
      "error",
      "Unternehmenseinstellungen konnten nicht gespeichert werden.",
    );
  await admin.from("audit_logs").insert({
    actor_id: profile.id,
    action: "company_settings.updated",
    entity_table: "company_settings",
    metadata: { invoice_prefix: value.invoicePrefix.toUpperCase() },
  });
  revalidatePath("/admin/settings");
  go(
    fallback,
    "status",
    "Unternehmens- und Rechnungseinstellungen wurden gespeichert.",
  );
}

export async function updatePropertyAdminSettingsAction(formData: FormData) {
  const { profile, admin } = await requireAdminContext();
  const propertyId = formValue(formData, "propertyId");
  const parsed = propertyAdminSettingsSchema.safeParse({
    propertyId,
    monthlyFee: formValue(formData, "monthlyFee"),
    taxRate: formValue(formData, "taxRate"),
    maxVisitMinutes: formValue(formData, "maxVisitMinutes"),
    validFrom: formValue(formData, "validFrom"),
    validUntil: formValue(formData, "validUntil"),
    internalNotes: formValue(formData, "internalNotes"),
    internalBriefing: formValue(formData, "internalBriefing"),
  });
  const fallback = propertyViewPath(propertyId, "uebersicht");
  if (!parsed.success) go(fallback, "error", firstZodError(parsed.error));
  const value = parsed.data;
  const monthlyFeeNetCents = parseEuroToCents(value.monthlyFee);
  const taxRateBps = Math.round(value.taxRate * 100);
  const supabase = await createSupabaseServerClient();
  const { error: rateError } = await supabase.rpc(
    "upsert_property_compensation_rate",
    {
      p_property_id: propertyId,
      p_net_amount_cents: monthlyFeeNetCents,
      p_tax_rate_bps: taxRateBps,
      p_valid_from: value.validFrom,
      p_valid_until: value.validUntil || null,
      p_internal_note: value.internalNotes || null,
    },
  );
  if (rateError) {
    go(
      fallback,
      "error",
      "Der Gültigkeitszeitraum der Grundvergütung überschneidet sich oder konnte nicht gespeichert werden.",
    );
  }
  const [{ error: settingsError }, { error: briefingError }] = await Promise.all([
    admin
      .from("property_admin_settings")
      .update(
      {
        max_visit_minutes: value.maxVisitMinutes,
        internal_notes: value.internalNotes || null,
        updated_by: profile.id,
      },
      )
      .eq("property_id", propertyId),
    admin.from("property_briefings").upsert(
      {
        property_id: propertyId,
        internal_briefing: value.internalBriefing || null,
        updated_by: profile.id,
      },
      { onConflict: "property_id" },
    ),
  ]);
  if (settingsError || briefingError) {
    go(
      fallback,
      "error",
      "Interne Immobilien- und Abrechnungsangaben konnten nicht vollständig gespeichert werden.",
    );
  }
  await admin.from("audit_logs").insert({
    actor_id: profile.id,
    action: "property.admin_settings_updated",
    entity_table: "properties",
    entity_id: propertyId,
    metadata: {
      monthly_fee_net_cents: monthlyFeeNetCents,
      tax_rate_bps: taxRateBps,
      valid_from: value.validFrom,
      valid_until: value.validUntil || null,
    },
  });
  revalidatePath(fallback);
  go(
    fallback,
    "status",
    "Interne Angaben und Grundvergütung wurden aktualisiert.",
  );
}

export async function updatePropertyBillingProfileAction(formData: FormData) {
  const { profile, admin } = await requireAdminContext();
  const propertyId = formValue(formData, "propertyId");
  const fallback = propertyViewPath(propertyId, "abrechnung");
  const parsed = propertyBillingProfileSchema.safeParse({
    propertyId,
    recipientName: formValue(formData, "recipientName"),
    addressAddition: formValue(formData, "addressAddition"),
    street: formValue(formData, "street"),
    houseNumber: formValue(formData, "houseNumber"),
    postalCode: formValue(formData, "postalCode"),
    city: formValue(formData, "city"),
    country: formValue(formData, "country") || "Deutschland",
    email: formValue(formData, "email"),
  });
  if (!parsed.success) go(fallback, "error", firstZodError(parsed.error));
  const value = parsed.data;
  const { error } = await admin.from("property_billing_profiles").upsert(
    {
      property_id: propertyId,
      recipient_name: value.recipientName,
      address_addition: value.addressAddition || null,
      street: value.street,
      house_number: value.houseNumber,
      postal_code: value.postalCode,
      city: value.city,
      country: value.country,
      email: value.email,
      is_override: true,
    },
    { onConflict: "property_id" },
  );
  if (error)
    go(
      fallback,
      "error",
      "Rechnungsempfänger konnte nicht gespeichert werden.",
    );
  await admin.from("audit_logs").insert({
    actor_id: profile.id,
    action: "property.billing_profile_updated",
    entity_table: "properties",
    entity_id: propertyId,
  });
  revalidatePath(fallback);
  go(fallback, "status", "Rechnungsempfänger wurde gespeichert.");
}

export async function markNotificationReadAction(formData: FormData) {
  const { profile, admin } = await requireAdminContext();
  await admin
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", formValue(formData, "notificationId"))
    .eq("recipient_id", profile.id);
  revalidatePath("/admin/notifications");
}

export async function sendAdminPropertyMessageAction(
  previousState: PropertyMessageActionState,
  formData: FormData,
): Promise<PropertyMessageActionState> {
  const { profile, admin } = await requireAdminContext();
  const propertyId = formValue(formData, "propertyId");
  const fallback = propertyViewPath(propertyId, "chat");
  const parsed = messageSchema.safeParse({
    propertyId,
    body: formValue(formData, "body"),
  });
  if (!parsed.success) {
    return propertyMessageActionError(
      previousState,
      firstZodError(parsed.error),
    );
  }
  const { data: property, error: propertyError } = await admin
    .from("properties")
    .select("id,status")
    .eq("id", parsed.data.propertyId)
    .maybeSingle();
  if (propertyError || !property) {
    return propertyMessageActionError(
      previousState,
      "Die Immobilie wurde nicht gefunden.",
    );
  }
  if (property.status === "archived") {
    return propertyMessageActionError(
      previousState,
      "Der Chat dieser archivierten Immobilie ist schreibgeschützt.",
    );
  }
  const file = formData.get("attachment");
  if (file instanceof File && file.size > 0) {
    const validation = await validateUploadContents(file, "chat");
    if (!validation.ok) {
      return propertyMessageActionError(previousState, validation.message);
    }
  }
  const { data: message, error } = await admin
    .from("property_messages")
    .insert({
      property_id: parsed.data.propertyId,
      sender_id: profile.id,
      body: parsed.data.body,
      message_type: "user",
    })
    .select("id")
    .single();
  if (error || !message) {
    return propertyMessageActionError(
      previousState,
      "Nachricht konnte nicht gesendet werden.",
    );
  }
  if (file instanceof File && file.size > 0) {
    const path = `${parsed.data.propertyId}/${message.id}/${safeStorageFilename(file.name, file.type)}`;
    const { error: uploadError } = await admin.storage
      .from("property-message-attachments")
      .upload(path, Buffer.from(await file.arrayBuffer()), {
        contentType: file.type,
        upsert: false,
      });
    if (uploadError) {
      await admin
        .from("property_messages")
        .delete()
        .eq("id", message.id)
        .eq("sender_id", profile.id);
      revalidatePath(fallback);
      return propertyMessageActionError(
        previousState,
        "Nachricht und Datei konnten nicht gespeichert werden. Bitte versuchen Sie es erneut.",
      );
    }
    const { error: attachmentError } = await admin
      .from("message_attachments")
      .insert({
        message_id: message.id,
        bucket: "property-message-attachments",
        path,
        filename: file.name,
        mime_type: file.type,
        size_bytes: file.size,
        uploaded_by: profile.id,
      });
    if (attachmentError) {
      await admin.storage.from("property-message-attachments").remove([path]);
      await admin
        .from("property_messages")
        .delete()
        .eq("id", message.id)
        .eq("sender_id", profile.id);
      revalidatePath(fallback);
      return propertyMessageActionError(
        previousState,
        "Nachricht und Datei konnten nicht vollständig gespeichert werden. Bitte versuchen Sie es erneut.",
      );
    }
  }
  revalidatePath(fallback);
  return propertyMessageActionSuccess(previousState);
}
