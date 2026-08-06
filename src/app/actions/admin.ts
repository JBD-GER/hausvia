"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/supabase/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  latestInvitationIdForEmail,
  revokeInvitationById,
  sendInvitationById,
} from "@/lib/invitationLifecycle";
import {
  isValidInvitationEmail,
  normalizeInvitationEmail,
} from "@/lib/invitations";
import {
  calculateTotals,
  createDocumentNumber,
  dueDateBeforePeriodStart,
  isRecurringBillingMode,
  monthPeriodFromStart,
  nextMonthAfter,
  nextServiceMonth,
  normalizeLineItems,
  parseDecimal,
} from "@/lib/commerce";
import { sendPortalDocumentEmail } from "@/lib/mail";
import { acceptOfferAndActivateCustomer } from "@/lib/offerAcceptance";
import { getInvoiceDocument, getOfferDocument } from "@/lib/portalDocuments";
import {
  canCancelInvoice,
  canMarkInvoicePaid,
  hasPartialStoredInvoiceOriginal,
  hasStoredInvoiceOriginal,
  invoicePdfSha256,
  invoiceRecipientEmail,
  isInvoiceContentImmutable,
  normalizeInvoiceCancellationReason,
  safeInvoicePdfFilename,
  verifyInvoicePdfSha256,
} from "@/lib/invoiceIntegrity";
import type { MaterialRequestStatus, ProjectStatus, ShiftStatus } from "@/lib/supabase/types";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function numberValue(formData: FormData, key: string) {
  return parseDecimal(formData.get(key));
}

function required(value: string, fallback = "/admin?error=missing") {
  if (!value) redirect(fallback);
  return value;
}

async function ensureInvoiceLifecycleAudit({
  admin,
  actorId,
  action,
  invoiceId,
  metadata,
}: {
  admin: ReturnType<typeof createSupabaseAdminClient>;
  actorId: string;
  action: string;
  invoiceId: string;
  metadata: Record<string, unknown>;
}) {
  const { data: existingAudit, error: lookupError } = await admin
    .from("audit_logs")
    .select("id")
    .eq("action", action)
    .eq("entity_table", "invoices")
    .eq("entity_id", invoiceId)
    .limit(1)
    .maybeSingle();
  if (lookupError) return false;
  if (existingAudit) return true;

  const { error: insertError } = await admin.from("audit_logs").insert({
    actor_id: actorId,
    action,
    entity_table: "invoices",
    entity_id: invoiceId,
    metadata,
  });
  return !insertError;
}

function list(formData: FormData, key: string) {
  return formData.getAll(key).map((item) => String(item ?? "").trim());
}

function lineItemsFromForm(formData: FormData) {
  const titles = list(formData, "itemTitle");
  const descriptions = list(formData, "itemDescription");
  const quantities = list(formData, "quantity");
  const units = list(formData, "unit");
  const unitNets = list(formData, "unitNet");

  return normalizeLineItems(
    titles.map((title, index) => ({
      title,
      description: descriptions[index],
      quantity: parseDecimal(quantities[index]),
      unit: units[index] || "Pauschale",
      unitNet: parseDecimal(unitNets[index]),
      sortOrder: index,
    })),
  );
}

export async function inviteEmployeeAction(formData: FormData) {
  const profile = await requireProfile(["admin"]);
  const email = normalizeInvitationEmail(required(text(formData, "email"), "/admin/employees?error=email"));
  if (!isValidInvitationEmail(email)) redirect("/admin/employees?error=email");
  const fullName = required(text(formData, "fullName"), "/admin/employees?error=name");
  const phone = text(formData, "phone");
  const notes = text(formData, "notes");
  const category = text(formData, "category") || "minijob";
  const admin = createSupabaseAdminClient();

  const { data: employee, error: employeeError } = await admin
    .from("employee_profiles")
    .insert({
      user_id: null,
      full_name: fullName,
      email,
      phone,
      category,
      status: "invited",
      notes,
    })
    .select("id")
    .single();
  if (employeeError || !employee) redirect("/admin/employees?error=create");

  const { error: invitationError } = await admin.from("invitations").insert({
    email,
    role: "employee",
    category,
    employee_id: employee.id,
    status: "draft",
    invited_by: profile.id,
  });
  if (invitationError) redirect("/admin/employees?error=invitation");

  revalidatePath("/admin/employees");
  redirect("/admin/employees?status=draft");
}

export async function inviteCustomerAction(formData: FormData) {
  const profile = await requireProfile(["admin"]);
  const email = normalizeInvitationEmail(required(text(formData, "email"), "/admin/customers?error=email"));
  if (!isValidInvitationEmail(email)) redirect("/admin/customers?error=email");
  const fullName = required(text(formData, "contactName"), "/admin/customers?error=name");
  const companyName = text(formData, "companyName");
  const phone = text(formData, "phone");
  const billingAddress = text(formData, "billingAddress");
  const customerId = text(formData, "customerId");
  const category = text(formData, "category") || "private";
  const admin = createSupabaseAdminClient();

  let linkedCustomerId: string;
  if (customerId) {
    const { data: customer, error } = await admin
      .from("customers")
      .update({
        contact_name: fullName,
        company_name: companyName,
        category,
        email,
        phone,
        billing_address: billingAddress,
      })
      .eq("id", customerId)
      .select("id")
      .single();
    if (error || !customer) redirect("/admin/customers?error=create");
    linkedCustomerId = customer.id;
  } else {
    const { data: customer, error } = await admin
      .from("customers")
      .insert({
        portal_user_id: null,
        status: "inactive",
        category,
        contact_name: fullName,
        company_name: companyName,
        email,
        phone,
        billing_address: billingAddress,
      })
      .select("id")
      .single();
    if (error || !customer) redirect("/admin/customers?error=create");
    linkedCustomerId = customer.id;
  }

  const { error: invitationError } = await admin.from("invitations").insert({
    email,
    role: "customer",
    category,
    customer_id: linkedCustomerId,
    status: "draft",
    invited_by: profile.id,
  });
  if (invitationError) redirect("/admin/customers?error=invitation");

  revalidatePath("/admin/customers");
  redirect("/admin/customers?status=draft");
}

async function invitationIdFromForm(formData: FormData) {
  const invitationId = text(formData, "invitationId");
  if (invitationId) return invitationId;
  return latestInvitationIdForEmail(text(formData, "email"), text(formData, "role"));
}

async function sendInvitationFromForm(formData: FormData) {
  const profile = await requireProfile(["admin"]);
  const invitationId = await invitationIdFromForm(formData);
  if (!invitationId) redirect("/admin/invitations?error=invitation");

  try {
    await sendInvitationById(invitationId, profile.id);
  } catch {
    redirect("/admin/invitations?error=send");
  }

  revalidatePath("/admin/invitations");
  revalidatePath("/admin/customers");
  revalidatePath("/admin/employees");
  redirect("/admin/invitations?status=sent");
}

export async function sendInvitationAction(formData: FormData) {
  return sendInvitationFromForm(formData);
}

export async function resendInvitationAction(formData: FormData) {
  return sendInvitationFromForm(formData);
}

export async function renewInvitationAction(formData: FormData) {
  return sendInvitationFromForm(formData);
}

export async function revokeInvitationAction(formData: FormData) {
  const profile = await requireProfile(["admin"]);
  const invitationId = required(text(formData, "invitationId"), "/admin/invitations?error=invitation");
  try {
    await revokeInvitationById(invitationId, profile.id);
  } catch {
    redirect("/admin/invitations?error=revoke");
  }
  revalidatePath("/admin/invitations");
  revalidatePath("/admin/customers");
  revalidatePath("/admin/employees");
  redirect("/admin/invitations?status=revoked");
}

export async function deactivateUserAction(formData: FormData) {
  await requireProfile(["admin"]);
  const profileId = required(text(formData, "profileId"));
  const admin = createSupabaseAdminClient();
  await admin.from("user_profiles").update({ status: "disabled" }).eq("id", profileId);
  await admin.from("employee_profiles").update({ status: "disabled" }).eq("user_id", profileId);
  revalidatePath("/admin");
}

export async function createProjectAction(formData: FormData) {
  await requireProfile(["admin"]);
  const customerId = required(text(formData, "customerId"), "/admin/projects?error=customer");
  const name = required(text(formData, "name"), "/admin/projects?error=name");
  const objectAddress = required(text(formData, "objectAddress"), "/admin/projects?error=address");
  const admin = createSupabaseAdminClient();
  await admin.from("projects").insert({
    customer_id: customerId,
    name,
    object_address: objectAddress,
    object_type: text(formData, "objectType"),
    employee_instructions: text(formData, "employeeInstructions"),
    public_notes: text(formData, "publicNotes"),
    admin_notes: text(formData, "adminNotes"),
  });
  revalidatePath("/admin/projects");
  redirect("/admin/projects?status=created");
}

export async function updateProjectStatusAction(formData: FormData) {
  await requireProfile(["admin"]);
  const projectId = required(text(formData, "projectId"));
  const status = required(text(formData, "status")) as ProjectStatus;
  const admin = createSupabaseAdminClient();
  await admin.from("projects").update({ status }).eq("id", projectId);
  revalidatePath("/admin/projects");
}

export async function assignEmployeeAction(formData: FormData) {
  const profile = await requireProfile(["admin"]);
  const projectId = required(text(formData, "projectId"), "/admin/projects?error=project");
  const employeeId = required(text(formData, "employeeId"), "/admin/projects?error=employee");
  const admin = createSupabaseAdminClient();
  await admin.from("project_assignments").upsert({
    project_id: projectId,
    employee_id: employeeId,
    assigned_by: profile.id,
    active: true,
  });
  await admin.from("projects").update({ primary_employee_id: employeeId }).eq("id", projectId);
  revalidatePath("/admin/projects");
}

export async function createTaskAction(formData: FormData) {
  await requireProfile(["admin"]);
  const projectId = required(text(formData, "projectId"), "/admin/projects?error=project");
  const title = required(text(formData, "title"), "/admin/projects?error=task");
  const intervalLabel = text(formData, "intervalLabel") || "nach Vereinbarung";
  const seasonal = formData.get("seasonal") === "on";
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("project_tasks")
    .insert({
      project_id: projectId,
      title,
      description: text(formData, "description"),
      category: text(formData, "category") || "Objektbetreuung",
      interval_label: intervalLabel,
      interval_unit: seasonal ? "seasonal" : "custom",
      seasonal,
      visible_to_customer: formData.get("visibleToCustomer") !== "off",
      employee_notes: text(formData, "employeeNotes"),
    })
    .select("id")
    .single();

  if (data?.id) {
    await admin.from("task_intervals").insert({
      task_id: data.id,
      label: intervalLabel,
      interval_unit: seasonal ? "seasonal" : "custom",
    });
  }

  revalidatePath("/admin/projects");
}

export async function promoteLeadToCustomerAction(formData: FormData) {
  await requireProfile(["admin"]);
  const leadId = required(text(formData, "leadId"));
  const customerId = required(text(formData, "customerId"));
  const admin = createSupabaseAdminClient();
  await admin.from("customers").update({ status: "active" }).eq("id", customerId);
  await admin.from("leads").update({ status: "converted" }).eq("id", leadId);
  await admin.from("projects").update({ status: "active", care_started_at: new Date().toISOString().slice(0, 10) }).eq("customer_id", customerId);
  revalidatePath("/admin/leads");
  revalidatePath("/admin/customers");
}

export async function createOfferFromLeadAction(formData: FormData) {
  await requireProfile(["admin"]);
  const leadId = required(text(formData, "leadId"), "/admin/leads?error=lead");
  const admin = createSupabaseAdminClient();

  const { data: lead } = await admin
    .from("leads")
    .select(
      "id,customer_id,company_name,contact_name,email,phone,object_address,object_type,requested_services,frequency,message,estimate,payload,desired_start_date,preferred_callback_time",
    )
    .eq("id", leadId)
    .single();

  if (!lead) redirect("/admin/leads?error=lead");

  let customerId = lead.customer_id as string | null;

  if (!customerId) {
    const { data: customer } = await admin
      .from("customers")
      .insert({
        status: "lead",
        company_name: lead.company_name,
        contact_name: lead.contact_name || lead.email || "Ansprechpartner prüfen",
        email: lead.email || "",
        phone: lead.phone,
        billing_address: lead.object_address,
        notes: "Aus bestehendem Lead für Angebotsworkflow erstellt.",
      })
      .select("id")
      .single();
    customerId = customer?.id ?? null;
    if (customerId) {
      await admin.from("leads").update({ customer_id: customerId }).eq("id", lead.id);
    }
  }

  if (!customerId) redirect("/admin/leads?error=customer");

  const { data: existingOffers } = await admin
    .from("offers")
    .select("id,status,created_at")
    .eq("customer_id", customerId)
    .in("status", ["draft", "released", "accepted"])
    .order("created_at", { ascending: false })
    .limit(1);

  if (existingOffers?.[0]?.id) {
    redirect(`/admin/offers/${existingOffers[0].id}`);
  }

  await admin.from("leads").update({ status: "qualified" }).eq("id", lead.id);
  revalidatePath("/admin/leads");
  redirect(`/admin/offers/new?customerId=${encodeURIComponent(customerId)}&leadId=${encodeURIComponent(lead.id)}`);
}

export async function createOfferAction(formData: FormData) {
  await requireProfile(["admin"]);
  const customerId = required(text(formData, "customerId"), "/admin/offers?error=customer");
  const projectId = text(formData, "projectId") || null;
  const title = text(formData, "title") || "Hausvia Angebot";
  const itemTitle = text(formData, "itemTitle") || "Objektbetreuung";
  const quantity = numberValue(formData, "quantity") || 1;
  const unitNet = numberValue(formData, "unitNet");
  const totalNet = quantity * unitNet;
  const taxRate = 19;
  const taxTotal = totalNet * (taxRate / 100);
  const grossTotal = totalNet + taxTotal;
  const admin = createSupabaseAdminClient();

  const { data } = await admin
    .from("offers")
    .insert({
      customer_id: customerId,
      project_id: projectId,
      title,
      intro: text(formData, "intro"),
      net_total: totalNet,
      tax_rate: taxRate,
      tax_total: taxTotal,
      gross_total: grossTotal,
      admin_notes: text(formData, "adminNotes"),
    })
    .select("id")
    .single();

  if (data?.id) {
    await admin.from("offer_items").insert({
      offer_id: data.id,
      title: itemTitle,
      description: text(formData, "itemDescription"),
      quantity,
      unit: text(formData, "unit") || "Pauschale",
      unit_net: unitNet,
      total_net: totalNet,
    });
  }

  revalidatePath("/admin/offers");
  redirect("/admin/offers?status=created");
}

export async function saveOfferAction(formData: FormData) {
  await requireProfile(["admin"]);
  const offerId = text(formData, "offerId");
  const customerId = required(text(formData, "customerId"), offerId ? `/admin/offers/${offerId}?error=customer` : "/admin/offers?error=customer");
  const projectId = text(formData, "projectId") || null;
  const title = text(formData, "title") || "Hausvia Angebot";
  const items = lineItemsFromForm(formData);

  if (!items.length) {
    redirect(offerId ? `/admin/offers/${offerId}?error=items` : "/admin/offers?error=items");
  }

  const totals = calculateTotals(items);
  const admin = createSupabaseAdminClient();
  const payload = {
    customer_id: customerId,
    project_id: projectId,
    offer_number: text(formData, "offerNumber") || createDocumentNumber("ANG", offerId || undefined),
    title,
    intro: text(formData, "intro"),
    closing_text: text(formData, "closingText"),
    net_total: totals.netTotal,
    tax_rate: totals.taxRate,
    tax_total: totals.taxTotal,
    gross_total: totals.grossTotal,
    admin_notes: text(formData, "adminNotes"),
    billing_mode: text(formData, "billingMode") || "one_time",
    billing_interval_label: text(formData, "billingIntervalLabel"),
    billing_in_advance: formData.get("billingInAdvance") === "on",
    payment_due_days_before_month_end: numberValue(formData, "paymentDueDaysBeforeMonthEnd") || 15,
  };

  let savedOfferId = offerId;

  if (offerId) {
    await admin.from("offers").update(payload).eq("id", offerId);
    await admin.from("offer_items").delete().eq("offer_id", offerId);
  } else {
    const { data } = await admin.from("offers").insert({ ...payload, status: "draft" }).select("id").single();
    savedOfferId = data?.id ?? "";
  }

  if (!savedOfferId) redirect("/admin/offers?error=save");

  await admin.from("offer_items").insert(
    items.map((item) => ({
      offer_id: savedOfferId,
      title: item.title,
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      unit_net: item.unitNet,
      total_net: item.totalNet,
      sort_order: item.sortOrder ?? 0,
    })),
  );

  revalidatePath("/admin/offers");
  revalidatePath(`/admin/offers/${savedOfferId}`);
  redirect(`/admin/offers/${savedOfferId}?status=saved`);
}

export async function sendOfferAction(formData: FormData) {
  await requireProfile(["admin"]);
  const offerId = required(text(formData, "offerId"));
  const admin = createSupabaseAdminClient();

  const { data: offer } = await admin.from("offers").select("offer_number").eq("id", offerId).single();
  if (!offer?.offer_number) {
    await admin.from("offers").update({ offer_number: createDocumentNumber("ANG", offerId) }).eq("id", offerId);
  }

  const document = await getOfferDocument(admin, offerId);
  if (!document.customerEmail) redirect(`/admin/offers/${offerId}?error=email`);

  await sendPortalDocumentEmail({
    to: document.customerEmail,
    subject: `Ihr Hausvia Angebot ${document.number}`,
    headline: "Ihr Hausvia Angebot ist bereit",
    intro: "wir haben Ihr Angebot für die Objektbetreuung vorbereitet. Das Dokument befindet sich im Anhang und ist zusätzlich in Ihrem Hausvia Portal sichtbar.",
    note: "Bitte prüfen Sie die Positionen, den Leistungsumfang und die Abrechnung. Bei Rückfragen melden Sie sich direkt bei Hausvia.",
    attachment: {
      filename: document.filename,
      content: document.pdf.toString("base64"),
    },
  });

  await admin
    .from("offers")
    .update({
      status: "released",
      released_at: new Date().toISOString(),
      sent_at: new Date().toISOString(),
      document_path: `generated://offers/${offerId}.pdf`,
    })
    .eq("id", offerId);

  revalidatePath("/admin/offers");
  revalidatePath(`/admin/offers/${offerId}`);
  revalidatePath("/portal/offers");
  redirect(`/admin/offers/${offerId}?status=sent`);
}

export async function releaseOfferAction(formData: FormData) {
  await sendOfferAction(formData);
}

export async function acceptOfferByAdminAction(formData: FormData) {
  const profile = await requireProfile(["admin"]);
  const offerId = required(text(formData, "offerId"));
  const acceptanceName = text(formData, "acceptanceName") || "Manuell durch Hausvia bestätigt";
  const acceptanceSignature =
    text(formData, "acceptanceSignature") ||
    "Der Kunde hat die Annahme außerhalb des Portals bestätigt. Die Bestätigung wurde im Adminbereich dokumentiert.";
  const admin = createSupabaseAdminClient();

  await acceptOfferAndActivateCustomer({
    admin,
    offerId,
    acceptedBy: profile.id,
    acceptanceName,
    acceptanceSignature,
    requireReleased: false,
  });

  revalidatePath("/admin/leads");
  revalidatePath("/admin/customers");
  revalidatePath("/admin/projects");
  revalidatePath("/admin/offers");
  revalidatePath(`/admin/offers/${offerId}`);
  redirect(`/admin/offers/${offerId}?status=accepted`);
}

export async function createInvoiceAction(formData: FormData) {
  await requireProfile(["admin"]);
  const customerId = required(text(formData, "customerId"), "/admin/invoices?error=customer");
  const projectId = text(formData, "projectId") || null;
  const grossTotal = numberValue(formData, "grossTotal");
  const taxRate = 19;
  const netTotal = grossTotal / 1.19;
  const taxTotal = grossTotal - netTotal;
  const admin = createSupabaseAdminClient();

  const { data } = await admin
    .from("invoices")
    .insert({
      customer_id: customerId,
      project_id: projectId,
      invoice_number: text(formData, "invoiceNumber"),
      title: text(formData, "title") || "Hausvia Rechnung",
      due_date: text(formData, "dueDate") || null,
      net_total: netTotal,
      tax_rate: taxRate,
      tax_total: taxTotal,
      gross_total: grossTotal,
    })
    .select("id")
    .single();

  if (data?.id) {
    await admin.from("invoice_items").insert({
      invoice_id: data.id,
      title: text(formData, "itemTitle") || "Objektbetreuung",
      quantity: 1,
      unit: "Pauschale",
      unit_net: netTotal,
      total_net: netTotal,
    });
  }

  revalidatePath("/admin/invoices");
  redirect("/admin/invoices?status=created");
}

export async function saveInvoiceAction(formData: FormData) {
  await requireProfile(["admin"]);
  const invoiceId = text(formData, "invoiceId");
  const invoiceContentPath = invoiceId ? `/admin/invoices/${invoiceId}?view=content` : "";
  const customerId = required(text(formData, "customerId"), invoiceId ? `${invoiceContentPath}&error=customer` : "/admin/invoices?error=customer");
  const projectId = text(formData, "projectId") || null;
  const items = lineItemsFromForm(formData);

  if (!items.length) {
    redirect(invoiceId ? `${invoiceContentPath}&error=items` : "/admin/invoices?error=items");
  }

  const totals = calculateTotals(items);
  const admin = createSupabaseAdminClient();

  if (invoiceId) {
    const { data: existingInvoice, error: existingInvoiceError } = await admin
      .from("invoices")
      .select(
        "id,status,invoice_kind,invoice_cycle_id,billing_month,immutable_at,original_pdf_bucket,original_pdf_path",
      )
      .eq("id", invoiceId)
      .maybeSingle();
    if (existingInvoiceError || !existingInvoice) {
      redirect(`${invoiceContentPath}&error=load`);
    }
    if (isInvoiceContentImmutable(existingInvoice)) {
      redirect(`${invoiceContentPath}&error=immutable`);
    }
  }

  const payload = {
    customer_id: customerId,
    project_id: projectId,
    invoice_number: text(formData, "invoiceNumber") || createDocumentNumber("RE", invoiceId || undefined),
    title: text(formData, "title") || "Hausvia Rechnung",
    due_date: text(formData, "dueDate") || null,
    net_total: totals.netTotal,
    tax_rate: totals.taxRate,
    tax_total: totals.taxTotal,
    gross_total: totals.grossTotal,
    source_offer_id: text(formData, "sourceOfferId") || null,
    invoice_cycle_id: text(formData, "invoiceCycleId") || null,
    service_period_start: text(formData, "servicePeriodStart") || null,
    service_period_end: text(formData, "servicePeriodEnd") || null,
    billing_note: text(formData, "billingNote"),
  };

  let savedInvoiceId = invoiceId;

  if (invoiceId) {
    await admin.from("invoices").update(payload).eq("id", invoiceId);
    await admin.from("invoice_items").delete().eq("invoice_id", invoiceId);
  } else {
    const { data } = await admin.from("invoices").insert({ ...payload, status: "draft" }).select("id").single();
    savedInvoiceId = data?.id ?? "";
  }

  if (!savedInvoiceId) redirect("/admin/invoices?error=save");

  await admin.from("invoice_items").insert(
    items.map((item) => ({
      invoice_id: savedInvoiceId,
      title: item.title,
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      unit_net: item.unitNet,
      total_net: item.totalNet,
      sort_order: item.sortOrder ?? 0,
    })),
  );

  revalidatePath("/admin/invoices");
  revalidatePath(`/admin/invoices/${savedInvoiceId}`);
  redirect(`/admin/invoices/${savedInvoiceId}?view=content&status=saved`);
}

export async function sendInvoiceAction(formData: FormData) {
  await requireProfile(["admin"]);
  const invoiceId = required(text(formData, "invoiceId"));
  const admin = createSupabaseAdminClient();

  const { data: invoice, error: invoiceError } = await admin
    .from("invoices")
    .select(
      "id,status,invoice_number,invoice_kind,invoice_cycle_id,billing_month,immutable_at,sent_at,processing_token,recipient_snapshot,original_pdf_bucket,original_pdf_path,original_pdf_sha256",
    )
    .eq("id", invoiceId)
    .maybeSingle();
  if (invoiceError || !invoice) {
    redirect(`/admin/invoices/${invoiceId}?error=load`);
  }

  if (hasPartialStoredInvoiceOriginal(invoice)) {
    redirect(`/admin/invoices/${invoiceId}?error=integrity`);
  }

  if (hasStoredInvoiceOriginal(invoice)) {
    if (invoice.status === "canceled") {
      redirect(`/admin/invoices/${invoiceId}?error=canceled`);
    }
    if (invoice.processing_token) {
      redirect(`/admin/invoices/${invoiceId}?error=processing`);
    }
    if (!invoice.invoice_number) {
      redirect(`/admin/invoices/${invoiceId}?error=number`);
    }

    const recipientEmail = invoiceRecipientEmail(invoice.recipient_snapshot);
    if (!recipientEmail) {
      redirect(`/admin/invoices/${invoiceId}?error=email`);
    }

    const { data: storedPdf, error: storedPdfError } = await admin.storage
      .from(invoice.original_pdf_bucket!)
      .download(invoice.original_pdf_path!);
    if (storedPdfError || !storedPdf) {
      redirect(`/admin/invoices/${invoiceId}?error=original`);
    }
    let pdf: Buffer;
    try {
      pdf = Buffer.from(await storedPdf.arrayBuffer());
    } catch {
      redirect(`/admin/invoices/${invoiceId}?error=original`);
    }
    if (!verifyInvoicePdfSha256(pdf, invoice.original_pdf_sha256)) {
      redirect(`/admin/invoices/${invoiceId}?error=integrity`);
    }

    try {
      await sendPortalDocumentEmail({
        to: recipientEmail,
        idempotencyKey:
          invoice.invoice_kind === "regular" && !invoice.sent_at
            ? `hausvia-monthly-invoice-${invoice.id}`
            : `hausvia-admin-invoice-resend-${invoice.id}-${invoice.original_pdf_sha256}`,
        subject: `Ihre Hausvia Rechnung ${invoice.invoice_number}`,
        headline: `Rechnung ${invoice.invoice_number}`,
        intro: "Ihre Rechnung befindet sich als unverändertes Original im Anhang und ist zusätzlich in Ihrem Hausvia Portal sichtbar.",
        note: "Bitte beachten Sie das Fälligkeitsdatum und den angegebenen Leistungszeitraum. Bei Rückfragen melden Sie sich direkt bei Hausvia.",
        attachment: {
          filename: safeInvoicePdfFilename(invoice.invoice_number),
          content: pdf.toString("base64"),
        },
      });
    } catch {
      redirect(`/admin/invoices/${invoiceId}?error=mail`);
    }

    if (invoice.status === "released" || invoice.status === "draft") {
      const { data: updatedInvoice, error: updateError } = await admin
        .from("invoices")
        .update({
          status: "open",
          sent_at: invoice.sent_at || new Date().toISOString(),
        })
        .eq("id", invoiceId)
        .eq("status", invoice.status)
        .is("processing_token", null)
        .select("id")
        .maybeSingle();
      if (updateError || !updatedInvoice) {
        redirect(`/admin/invoices/${invoiceId}?error=state`);
      }
    }

    revalidatePath("/admin/invoices");
    revalidatePath(`/admin/invoices/${invoiceId}`);
    revalidatePath("/portal/invoices");
    redirect(
      `/admin/invoices/${invoiceId}?status=${invoice.sent_at ? "resent" : "sent"}`,
    );
  }

  if (isInvoiceContentImmutable(invoice) || invoice.status !== "draft") {
    redirect(`/admin/invoices/${invoiceId}?error=immutable`);
  }

  let invoiceNumber = invoice.invoice_number;
  if (!invoiceNumber) {
    invoiceNumber = createDocumentNumber("RE", invoiceId);
    const { data: numberedInvoice, error: numberError } = await admin
      .from("invoices")
      .update({ invoice_number: invoiceNumber })
      .eq("id", invoiceId)
      .eq("status", "draft")
      .is("immutable_at", null)
      .select("id")
      .maybeSingle();
    if (numberError || !numberedInvoice) {
      redirect(`/admin/invoices/${invoiceId}?error=number`);
    }
  }

  let document: Awaited<ReturnType<typeof getInvoiceDocument>>;
  try {
    document = await getInvoiceDocument(admin, invoiceId);
  } catch {
    redirect(`/admin/invoices/${invoiceId}?error=document`);
  }
  if (!document.customerEmail) {
    redirect(`/admin/invoices/${invoiceId}?error=email`);
  }

  try {
    await sendPortalDocumentEmail({
      to: document.customerEmail,
      idempotencyKey: `hausvia-legacy-invoice-${invoiceId}-${invoicePdfSha256(document.pdf)}`,
      subject: `Ihre Hausvia Rechnung ${document.number}`,
      headline: "Ihre Hausvia Rechnung ist erstellt",
      intro: "Ihre Rechnung wurde erstellt. Das Dokument befindet sich im Anhang und ist zusätzlich in Ihrem Hausvia Portal sichtbar.",
      note: "Bitte beachten Sie das Fälligkeitsdatum und den angegebenen Leistungszeitraum. Bei Rückfragen melden Sie sich direkt bei Hausvia.",
      attachment: {
        filename: document.filename,
        content: document.pdf.toString("base64"),
      },
    });
  } catch {
    redirect(`/admin/invoices/${invoiceId}?error=mail`);
  }

  const now = new Date().toISOString();
  const { data: releasedInvoice, error: releaseError } = await admin
    .from("invoices")
    .update({
      status: "released",
      released_at: now,
      sent_at: now,
      document_path: `generated://invoices/${invoiceId}.pdf`,
    })
    .eq("id", invoiceId)
    .eq("status", "draft")
    .is("immutable_at", null)
    .select("id")
    .maybeSingle();
  if (releaseError || !releasedInvoice) {
    redirect(`/admin/invoices/${invoiceId}?error=state`);
  }

  revalidatePath("/admin/invoices");
  revalidatePath(`/admin/invoices/${invoiceId}`);
  revalidatePath("/portal/invoices");
  redirect(`/admin/invoices/${invoiceId}?status=sent`);
}

export async function releaseInvoiceAction(formData: FormData) {
  await sendInvoiceAction(formData);
}

export async function markInvoicePaidAction(formData: FormData) {
  const profile = await requireProfile(["admin"]);
  const invoiceId = required(
    text(formData, "invoiceId"),
    "/admin/invoices?error=invoice",
  );
  const fallback = `/admin/invoices/${invoiceId}`;
  const admin = createSupabaseAdminClient();
  const { data: invoice, error: invoiceError } = await admin
    .from("invoices")
    .select("id,status,invoice_number,paid_at,processing_token")
    .eq("id", invoiceId)
    .maybeSingle();
  if (invoiceError || !invoice) redirect(`${fallback}?error=load`);
  if (invoice.processing_token) redirect(`${fallback}?error=processing`);
  if (invoice.status === "paid") {
    const auditWritten = await ensureInvoiceLifecycleAudit({
      admin,
      actorId: profile.id,
      action: "invoice.manually_marked_paid",
      invoiceId,
      metadata: {
        invoice_number: invoice.invoice_number,
        previous_status: "paid",
        new_status: "paid",
        paid_at: invoice.paid_at,
        reconciled: true,
      },
    });
    if (!auditWritten) redirect(`${fallback}?error=audit`);
    redirect(`${fallback}?status=paid`);
  }
  if (!canMarkInvoicePaid(invoice.status)) {
    redirect(`${fallback}?error=paid-transition`);
  }

  const paidAt = new Date().toISOString();
  const { data: updatedInvoice, error: updateError } = await admin
    .from("invoices")
    .update({ status: "paid", paid_at: paidAt })
    .eq("id", invoiceId)
    .eq("status", invoice.status)
    .is("processing_token", null)
    .select("id")
    .maybeSingle();
  if (updateError || !updatedInvoice) {
    redirect(`${fallback}?error=state`);
  }

  const auditWritten = await ensureInvoiceLifecycleAudit({
    admin,
    actorId: profile.id,
    action: "invoice.manually_marked_paid",
    invoiceId,
    metadata: {
      invoice_number: invoice.invoice_number,
      previous_status: invoice.status,
      new_status: "paid",
      paid_at: paidAt,
    },
  });

  revalidatePath("/admin/invoices");
  revalidatePath(fallback);
  revalidatePath("/portal/invoices");
  if (!auditWritten) redirect(`${fallback}?error=audit`);
  redirect(`${fallback}?status=paid`);
}

export async function cancelInvoiceAction(formData: FormData) {
  const profile = await requireProfile(["admin"]);
  const invoiceId = required(
    text(formData, "invoiceId"),
    "/admin/invoices?error=invoice",
  );
  const fallback = `/admin/invoices/${invoiceId}`;
  const reason = normalizeInvoiceCancellationReason(
    formData.get("cancellationReason"),
  );
  if (!reason) redirect(`${fallback}?error=cancel-reason`);

  const admin = createSupabaseAdminClient();
  const { data: invoice, error: invoiceError } = await admin
    .from("invoices")
    .select(
      "id,status,invoice_number,canceled_at,cancellation_reason,processing_token",
    )
    .eq("id", invoiceId)
    .maybeSingle();
  if (invoiceError || !invoice) redirect(`${fallback}?error=load`);
  if (invoice.processing_token) redirect(`${fallback}?error=processing`);
  if (invoice.status === "canceled") {
    if (invoice.cancellation_reason !== reason) {
      redirect(`${fallback}?error=cancel-transition`);
    }
    const auditWritten = await ensureInvoiceLifecycleAudit({
      admin,
      actorId: profile.id,
      action: "invoice.canceled",
      invoiceId,
      metadata: {
        invoice_number: invoice.invoice_number,
        previous_status: "canceled",
        new_status: "canceled",
        canceled_at: invoice.canceled_at,
        reason,
        reconciled: true,
      },
    });
    if (!auditWritten) redirect(`${fallback}?error=audit`);
    redirect(`${fallback}?status=canceled`);
  }
  if (!canCancelInvoice(invoice.status)) {
    redirect(`${fallback}?error=cancel-transition`);
  }

  const canceledAt = new Date().toISOString();
  const { data: canceledInvoice, error: updateError } = await admin
    .from("invoices")
    .update({
      status: "canceled",
      canceled_at: canceledAt,
      cancellation_reason: reason,
    })
    .eq("id", invoiceId)
    .eq("status", invoice.status)
    .is("processing_token", null)
    .select("id")
    .maybeSingle();
  if (updateError || !canceledInvoice) {
    redirect(`${fallback}?error=state`);
  }

  const auditWritten = await ensureInvoiceLifecycleAudit({
    admin,
    actorId: profile.id,
    action: "invoice.canceled",
    invoiceId,
    metadata: {
      invoice_number: invoice.invoice_number,
      previous_status: invoice.status,
      new_status: "canceled",
      canceled_at: canceledAt,
      reason,
    },
  });

  revalidatePath("/admin/invoices");
  revalidatePath(fallback);
  revalidatePath("/portal/invoices");
  if (!auditWritten) redirect(`${fallback}?error=audit`);
  redirect(`${fallback}?status=canceled`);
}

export async function createInvoiceFromOfferAction(formData: FormData) {
  await requireProfile(["admin"]);
  const offerId = required(text(formData, "offerId"));
  const period = monthPeriodFromStart(text(formData, "servicePeriodStart") || nextServiceMonth().start);
  const admin = createSupabaseAdminClient();
  const { data: offer } = await admin
    .from("offers")
    .select("id,title,customer_id,project_id,net_total,tax_rate,tax_total,gross_total,billing_in_advance,payment_due_days_before_month_end,offer_items(title,description,quantity,unit,unit_net,total_net,sort_order)")
    .eq("id", offerId)
    .single();

  if (!offer) redirect(`/admin/offers/${offerId}?error=invoice`);

  const dueDays = Number(offer.payment_due_days_before_month_end ?? 15);
  const dueDate = text(formData, "dueDate") || dueDateBeforePeriodStart(period.start, dueDays);
  const billingNote =
    offer.billing_in_advance
      ? `Diese Rechnung betrifft den kommenden Leistungsmonat ${period.start} bis ${period.end}. Die Zahlung vor Leistungsbeginn wurde im Angebot als Abrechnungsgrundlage vorgesehen.`
      : `Diese Rechnung betrifft den Leistungszeitraum ${period.start} bis ${period.end}.`;

  const { data: invoice } = await admin
    .from("invoices")
    .insert({
      customer_id: offer.customer_id,
      project_id: offer.project_id,
      source_offer_id: offer.id,
      invoice_number: createDocumentNumber("RE", offer.id),
      title: text(formData, "title") || `Rechnung zu ${offer.title}`,
      due_date: dueDate,
      net_total: offer.net_total,
      tax_rate: offer.tax_rate,
      tax_total: offer.tax_total,
      gross_total: offer.gross_total,
      service_period_start: period.start,
      service_period_end: period.end,
      billing_note: billingNote,
      status: "draft",
    })
    .select("id")
    .single();

  if (invoice?.id) {
    const items = Array.isArray(offer.offer_items) ? offer.offer_items : [];
    await admin.from("invoice_items").insert(
      items.map((item: {
        title: string;
        description: string | null;
        quantity: number;
        unit: string;
        unit_net: number;
        total_net: number;
        sort_order: number | null;
      }) => ({
        invoice_id: invoice.id,
        title: item.title,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        unit_net: item.unit_net,
        total_net: item.total_net,
        sort_order: item.sort_order ?? 0,
      })),
    );
  }

  revalidatePath("/admin/invoices");
  redirect(invoice?.id ? `/admin/invoices/${invoice.id}?status=created` : `/admin/offers/${offerId}?error=invoice`);
}

export async function createInvoiceCycleAction(formData: FormData) {
  await requireProfile(["admin"]);
  const offerId = required(text(formData, "offerId"));
  const admin = createSupabaseAdminClient();
  const { data: offer } = await admin
    .from("offers")
    .select("id,title,customer_id,project_id,net_total,tax_rate,tax_total,gross_total,billing_mode,billing_in_advance,payment_due_days_before_month_end")
    .eq("id", offerId)
    .single();

  if (!offer) redirect(`/admin/offers/${offerId}?error=cycle`);

  const frequency = text(formData, "frequency") || offer.billing_mode || "monthly";
  if (!isRecurringBillingMode(frequency)) redirect(`/admin/offers/${offerId}?error=cycle-mode`);

  await admin.from("invoice_cycles").insert({
    customer_id: offer.customer_id,
    project_id: offer.project_id,
    offer_id: offer.id,
    title: text(formData, "title") || `Rechnungszyklus: ${offer.title}`,
    frequency,
    amount_net: offer.net_total,
    tax_rate: offer.tax_rate,
    tax_total: offer.tax_total,
    amount_gross: offer.gross_total,
    billing_in_advance: formData.get("billingInAdvance") === "on" || offer.billing_in_advance,
    generate_days_before_month_end:
      numberValue(formData, "generateDaysBeforeMonthEnd") || offer.payment_due_days_before_month_end || 15,
    next_period_start: text(formData, "nextPeriodStart") || nextServiceMonth().start,
    admin_notes: text(formData, "adminNotes"),
  });

  revalidatePath(`/admin/offers/${offerId}`);
  redirect(`/admin/offers/${offerId}?status=cycle-created`);
}

export async function createInvoiceFromCycleAction(formData: FormData) {
  await requireProfile(["admin"]);
  const cycleId = required(text(formData, "cycleId"));
  const admin = createSupabaseAdminClient();
  const { data: cycle } = await admin
    .from("invoice_cycles")
    .select("id,title,customer_id,project_id,offer_id,amount_net,tax_rate,tax_total,amount_gross,billing_in_advance,generate_days_before_month_end,next_period_start,offers(offer_items(title,description,quantity,unit,unit_net,total_net,sort_order))")
    .eq("id", cycleId)
    .single();

  if (!cycle) redirect("/admin/invoices?error=cycle");

  const period = monthPeriodFromStart(cycle.next_period_start || nextServiceMonth().start);
  const dueDate = dueDateBeforePeriodStart(period.start, Number(cycle.generate_days_before_month_end ?? 15));
  const { data: invoice } = await admin
    .from("invoices")
    .insert({
      customer_id: cycle.customer_id,
      project_id: cycle.project_id,
      source_offer_id: cycle.offer_id,
      invoice_cycle_id: cycle.id,
      invoice_number: createDocumentNumber("RE", cycle.id),
      title: cycle.title,
      due_date: dueDate,
      net_total: cycle.amount_net,
      tax_rate: cycle.tax_rate,
      tax_total: cycle.tax_total,
      gross_total: cycle.amount_gross,
      service_period_start: period.start,
      service_period_end: period.end,
      billing_note: cycle.billing_in_advance
        ? `Diese Rechnung betrifft den kommenden Leistungsmonat ${period.start} bis ${period.end}. Die Zahlung vor Leistungsbeginn wurde vereinbart.`
        : `Diese Rechnung betrifft den Leistungszeitraum ${period.start} bis ${period.end}.`,
      status: "draft",
    })
    .select("id")
    .single();

  if (invoice?.id) {
    const offer = Array.isArray(cycle.offers) ? cycle.offers[0] : cycle.offers;
    const items = Array.isArray(offer?.offer_items) ? offer.offer_items : [];
    await admin.from("invoice_items").insert(
      items.map((item: {
        title: string;
        description: string | null;
        quantity: number;
        unit: string;
        unit_net: number;
        total_net: number;
        sort_order: number | null;
      }) => ({
        invoice_id: invoice.id,
        title: item.title,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        unit_net: item.unit_net,
        total_net: item.total_net,
        sort_order: item.sort_order ?? 0,
      })),
    );

    await admin
      .from("invoice_cycles")
      .update({ next_period_start: nextMonthAfter(period.start), last_generated_at: new Date().toISOString() })
      .eq("id", cycle.id);
  }

  revalidatePath("/admin/invoices");
  redirect(invoice?.id ? `/admin/invoices/${invoice.id}?status=created` : "/admin/invoices?error=cycle");
}

export async function reviewShiftAction(formData: FormData) {
  const profile = await requireProfile(["admin"]);
  const shiftId = required(text(formData, "shiftId"));
  const status = required(text(formData, "status")) as ShiftStatus;
  const admin = createSupabaseAdminClient();
  await admin
    .from("shifts")
    .update({
      status,
      customer_visible: status === "approved",
      reviewed_by: profile.id,
      reviewed_at: new Date().toISOString(),
      review_note: text(formData, "reviewNote"),
    })
    .eq("id", shiftId);
  revalidatePath("/admin/shifts");
}

export async function updateMaterialRequestStatusAction(formData: FormData) {
  await requireProfile(["admin"]);
  const requestId = required(text(formData, "requestId"));
  const status = required(text(formData, "status")) as MaterialRequestStatus;
  const admin = createSupabaseAdminClient();
  await admin
    .from("material_requests")
    .update({ status, admin_comment: text(formData, "adminComment") })
    .eq("id", requestId);
  revalidatePath("/admin/orders");
}

export async function uploadDocumentAction(formData: FormData) {
  const profile = await requireProfile(["admin"]);
  const file = formData.get("file");
  const bucket = text(formData, "bucket") || "customer-documents";
  const customerId = text(formData, "customerId") || null;
  const projectId = text(formData, "projectId") || null;
  const visibility = text(formData, "visibility") || "admin";

  if (!(file instanceof File) || !file.name) redirect("/admin/documents?error=file");

  const admin = createSupabaseAdminClient();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const path = `${customerId ?? "general"}/${Date.now()}-${safeName}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error } = await admin.storage.from(bucket).upload(path, buffer, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });

  if (error) redirect("/admin/documents?error=upload");

  await admin.from("documents").insert({
    customer_id: customerId,
    project_id: projectId,
    bucket,
    path,
    filename: file.name,
    mime_type: file.type,
    visibility,
    released_to_customer: formData.get("releasedToCustomer") === "on",
    uploaded_by: profile.id,
  });

  revalidatePath("/admin/documents");
  redirect("/admin/documents?status=uploaded");
}
