"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdminContext } from "@/lib/portal/access";
import { formatAddress } from "@/lib/portal/core";
import {
  buildingSchema,
  checkbox,
  firstZodError,
  formValue,
  formValues,
  propertyServiceSchema,
} from "@/lib/portal/validation";

const propertyTypes = [
  "single_family",
  "multi_family",
  "residential_complex",
  "weg",
  "commercial",
  "office_practice",
  "mixed",
  "other",
] as const;

const propertyCoreSchema = z.object({
  propertyId: z.string().uuid("Ungültige Immobilie."),
  updatedAt: z.string().datetime({ offset: true }),
  name: z.string().trim().min(1, "Der Immobilienname ist erforderlich.").max(180),
  objectKey: z.string().trim().max(80),
  propertyType: z.enum(propertyTypes),
  ownershipName: z.string().trim().max(180),
  careStartDate: z.string().date(),
});

const buildingUpdateSchema = buildingSchema.extend({
  buildingId: z.string().uuid("Ungültiges Gebäude."),
  updatedAt: z.string().datetime({ offset: true }),
});

const assignmentSchema = z.object({
  propertyId: z.string().uuid("Ungültige Immobilie."),
  employeeId: z.string().uuid("Ungültiger Mitarbeiter."),
  updatedAt: z.string().datetime({ offset: true }),
});

const positiveQuantity = z
  .string()
  .trim()
  .regex(/^\d{1,9}(?:[.,]\d{1,3})?$/, "Bitte eine gültige Menge eingeben.")
  .transform((value) => Number(value.replace(",", ".")))
  .refine((value) => Number.isFinite(value) && value > 0, "Die Menge muss größer als null sein.");

const propertyEquipmentSchema = z
  .object({
    propertyId: z.string().uuid("Ungültige Immobilie."),
    assignmentId: z.string().uuid("Ungültige Equipmentzuordnung."),
    updatedAt: z.string().datetime({ offset: true }),
    buildingId: z.string().uuid().optional().or(z.literal("")),
    requiredQuantity: positiveQuantity,
    seasonal: z.boolean(),
    seasonStartMonth: z.coerce.number().int().min(1).max(12).optional(),
    seasonEndMonth: z.coerce.number().int().min(1).max(12).optional(),
    rental: z.boolean(),
    notificationLeadHours: z.coerce.number().int().min(0).max(87_600),
    provisionNote: z.string().trim().max(2_000),
  })
  .superRefine((value, context) => {
    if (value.seasonal && (!value.seasonStartMonth || !value.seasonEndMonth)) {
      context.addIssue({
        code: "custom",
        path: ["seasonStartMonth"],
        message: "Für saisonales Equipment müssen Start- und Endmonat gewählt werden.",
      });
    }
  });

const propertyEquipmentIdentitySchema = z.object({
  propertyId: z.string().uuid("Ungültige Immobilie."),
  assignmentId: z.string().uuid("Ungültige Equipmentzuordnung."),
  updatedAt: z.string().datetime({ offset: true }),
});

function propertyPath(propertyId: string) {
  return `/admin/properties/${propertyId}`;
}

function go(
  propertyId: string,
  anchor: string,
  key: "status" | "error",
  message: string,
): never {
  redirect(
    `${propertyPath(propertyId)}?view=${encodeURIComponent(anchor)}&${key}=${encodeURIComponent(message)}`,
  );
}

async function requireMutableProperty(
  admin: Awaited<ReturnType<typeof requireAdminContext>>["admin"],
  propertyId: string,
  anchor: string,
) {
  const { data: property, error } = await admin
    .from("properties")
    .select("id,status")
    .eq("id", propertyId)
    .maybeSingle();
  if (error || !property) {
    go(propertyId, anchor, "error", "Die Immobilie wurde nicht gefunden.");
  }
  if (property.status === "archived") {
    go(
      propertyId,
      anchor,
      "error",
      "Archivierte Immobilien sind geschlossen und können nicht mehr operativ geändert werden.",
    );
  }
  return property;
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

function logRollbackFailure(context: string, error: unknown) {
  console.error(`[Hausvia Immobilienverwaltung] ${context}`, error);
}

function revalidateProperty(propertyId: string) {
  revalidatePath("/admin/properties");
  revalidatePath(propertyPath(propertyId));
  revalidatePath("/admin/winter-service");
}

export async function updatePropertyCoreAction(formData: FormData) {
  const { profile, admin } = await requireAdminContext();
  const parsed = propertyCoreSchema.safeParse({
    propertyId: formValue(formData, "propertyId"),
    updatedAt: formValue(formData, "updatedAt"),
    name: formValue(formData, "name"),
    objectKey: formValue(formData, "objectKey"),
    propertyType: formValue(formData, "propertyType"),
    ownershipName: formValue(formData, "ownershipName"),
    careStartDate: formValue(formData, "careStartDate"),
  });
  const fallbackId = formValue(formData, "propertyId");
  if (!parsed.success) go(fallbackId, "uebersicht", "error", firstZodError(parsed.error));
  const value = parsed.data;

  const { data: property, error: propertyError } = await admin
    .from("properties")
    .select(
      "id,name,object_key,property_type,ownership_name,care_start_date,care_end_date,status,updated_at",
    )
    .eq("id", value.propertyId)
    .maybeSingle();
  if (propertyError || !property) {
    go(value.propertyId, "uebersicht", "error", "Die Immobilie wurde nicht gefunden.");
  }
  if (property.status === "archived") {
    go(
      value.propertyId,
      "uebersicht",
      "error",
      "Archivierte Immobilien können nicht mehr inhaltlich geändert werden.",
    );
  }
  if (property.updated_at !== value.updatedAt) {
    go(
      value.propertyId,
      "uebersicht",
      "error",
      "Die Immobilie wurde zwischenzeitlich geändert. Bitte neu laden.",
    );
  }
  if (property.care_end_date && value.careStartDate > property.care_end_date) {
    go(
      value.propertyId,
      "uebersicht",
      "error",
      "Der Betreuungsbeginn darf nicht nach dem Betreuungsende liegen.",
    );
  }

  const next = {
    name: value.name,
    object_key: value.objectKey || null,
    property_type: value.propertyType,
    ownership_name: value.ownershipName || null,
    care_start_date: value.careStartDate,
  };
  const previous = {
    name: property.name,
    object_key: property.object_key,
    property_type: property.property_type,
    ownership_name: property.ownership_name,
    care_start_date: property.care_start_date,
  };
  const changes = changedFields(previous, next);
  if (!Object.keys(changes).length) {
    go(value.propertyId, "uebersicht", "status", "Die Stammdaten sind bereits aktuell.");
  }

  const { data: updated, error: updateError } = await admin
    .from("properties")
    .update(next)
    .eq("id", value.propertyId)
    .eq("updated_at", value.updatedAt)
    .select("id,updated_at")
    .maybeSingle();
  if (updateError || !updated) {
    go(
      value.propertyId,
      "uebersicht",
      "error",
      "Die Immobilien-Stammdaten konnten nicht gespeichert werden.",
    );
  }

  const { error: auditError } = await admin.from("audit_logs").insert({
    actor_id: profile.id,
    action: "property.master_data_updated",
    entity_table: "properties",
    entity_id: value.propertyId,
    metadata: { changes },
  });
  if (auditError) {
    const { data: rolledBack, error: rollbackError } = await admin
      .from("properties")
      .update(previous)
      .eq("id", value.propertyId)
      .eq("updated_at", updated.updated_at)
      .select("id")
      .maybeSingle();
    if (rollbackError || !rolledBack) {
      logRollbackFailure("Immobilienstammdaten konnten nicht zurückgerollt werden.", rollbackError);
    }
    go(
      value.propertyId,
      "uebersicht",
      "error",
      "Die Änderung konnte nicht revisionssicher gespeichert werden.",
    );
  }

  revalidateProperty(value.propertyId);
  go(value.propertyId, "uebersicht", "status", "Immobilien-Stammdaten wurden aktualisiert.");
}

export async function updateBuildingDetailsAction(formData: FormData) {
  const { profile, admin } = await requireAdminContext();
  const propertyId = formValue(formData, "propertyId");
  const parsed = buildingUpdateSchema.safeParse({
    propertyId,
    buildingId: formValue(formData, "buildingId"),
    updatedAt: formValue(formData, "updatedAt"),
    label: formValue(formData, "label"),
    accessNotes: formValue(formData, "accessNotes"),
    street: formValue(formData, "street"),
    houseNumber: formValue(formData, "houseNumber"),
    postalCode: formValue(formData, "postalCode"),
    city: formValue(formData, "city"),
    country: formValue(formData, "country") || "Deutschland",
  });
  if (!parsed.success) go(propertyId, "gebaeude", "error", firstZodError(parsed.error));
  const value = parsed.data;
  await requireMutableProperty(admin, value.propertyId, "gebaeude");

  const [buildingResult, noteResult] = await Promise.all([
    admin
      .from("buildings")
      .select(
        "id,label,street,house_number,postal_code,city,country,formatted_address,status,updated_at",
      )
      .eq("id", value.buildingId)
      .eq("property_id", value.propertyId)
      .maybeSingle(),
    admin
      .from("building_access_notes")
      .select("building_id,access_notes,updated_by")
      .eq("building_id", value.buildingId)
      .maybeSingle(),
  ]);
  if (buildingResult.error || noteResult.error || !buildingResult.data) {
    go(value.propertyId, "gebaeude", "error", "Das Gebäude konnte nicht geladen werden.");
  }
  const building = buildingResult.data;
  if (building.status === "archived") {
    go(
      value.propertyId,
      "gebaeude",
      "error",
      "Archivierte Gebäude können nicht mehr inhaltlich geändert werden.",
    );
  }
  if (building.updated_at !== value.updatedAt) {
    go(
      value.propertyId,
      "gebaeude",
      "error",
      "Das Gebäude wurde zwischenzeitlich geändert. Bitte neu laden.",
    );
  }

  const nextBuilding = {
    label: value.label || null,
    street: value.street,
    house_number: value.houseNumber,
    postal_code: value.postalCode,
    city: value.city,
    country: value.country,
    formatted_address: formatAddress(value),
  };
  const previousBuilding = {
    label: building.label,
    street: building.street,
    house_number: building.house_number,
    postal_code: building.postal_code,
    city: building.city,
    country: building.country,
    formatted_address: building.formatted_address,
  };
  const previousNote = noteResult.data;

  const { data: updated, error: updateError } = await admin
    .from("buildings")
    .update(nextBuilding)
    .eq("id", value.buildingId)
    .eq("property_id", value.propertyId)
    .eq("updated_at", value.updatedAt)
    .select("id,updated_at")
    .maybeSingle();
  if (updateError || !updated) {
    go(value.propertyId, "gebaeude", "error", "Das Gebäude konnte nicht gespeichert werden.");
  }

  const { error: noteError } = await admin.from("building_access_notes").upsert(
    {
      building_id: value.buildingId,
      access_notes: value.accessNotes || null,
      updated_by: profile.id,
    },
    { onConflict: "building_id" },
  );

  const restore = async () => {
    const { error: buildingRollbackError } = await admin
      .from("buildings")
      .update(previousBuilding)
      .eq("id", value.buildingId)
      .eq("property_id", value.propertyId)
      .eq("updated_at", updated.updated_at);
    if (buildingRollbackError) {
      logRollbackFailure("Gebäudedaten konnten nicht zurückgerollt werden.", buildingRollbackError);
    }
    const noteRollback = previousNote
      ? await admin.from("building_access_notes").upsert(previousNote, {
          onConflict: "building_id",
        })
      : await admin
          .from("building_access_notes")
          .delete()
          .eq("building_id", value.buildingId);
    if (noteRollback.error) {
      logRollbackFailure("Gebäudehinweise konnten nicht zurückgerollt werden.", noteRollback.error);
    }
  };

  if (noteError) {
    await restore();
    go(
      value.propertyId,
      "gebaeude",
      "error",
      "Die Zugangshinweise konnten nicht sicher gespeichert werden.",
    );
  }

  const { error: auditError } = await admin.from("audit_logs").insert({
    actor_id: profile.id,
    action: "building.master_data_updated",
    entity_table: "buildings",
    entity_id: value.buildingId,
    metadata: {
      property_id: value.propertyId,
      changes: changedFields(previousBuilding, nextBuilding),
      access_notes_changed: (previousNote?.access_notes || "") !== value.accessNotes,
    },
  });
  if (auditError) {
    await restore();
    go(
      value.propertyId,
      "gebaeude",
      "error",
      "Die Gebäudeänderung konnte nicht revisionssicher gespeichert werden.",
    );
  }

  revalidateProperty(value.propertyId);
  go(value.propertyId, "gebaeude", "status", "Gebäudedaten wurden aktualisiert.");
}

export async function endPropertyEmployeeAssignmentAction(formData: FormData) {
  const { supabase } = await requireAdminContext();
  const parsed = assignmentSchema.safeParse({
    propertyId: formValue(formData, "propertyId"),
    employeeId: formValue(formData, "employeeId"),
    updatedAt: formValue(formData, "updatedAt"),
  });
  const propertyId = formValue(formData, "propertyId");
  if (!parsed.success) go(propertyId, "team", "error", firstZodError(parsed.error));
  const value = parsed.data;
  const { error } = await supabase.rpc("set_property_employee_assignment", {
    p_property_id: value.propertyId,
    p_employee_id: value.employeeId,
    p_active: false,
    p_expected_updated_at: value.updatedAt,
  });
  if (error) {
    go(
      value.propertyId,
      "team",
      "error",
      "Die Mitarbeiterzuordnung wurde zwischenzeitlich geändert oder konnte nicht beendet werden.",
    );
  }

  revalidateProperty(value.propertyId);
  revalidatePath(`/admin/employees/${value.employeeId}`);
  revalidatePath("/app/properties");
  go(value.propertyId, "team", "status", "Mitarbeiterzuordnung wurde beendet.");
}

export async function updatePropertyEquipmentAssignmentAction(formData: FormData) {
  const { supabase } = await requireAdminContext();
  const propertyId = formValue(formData, "propertyId");
  const parsed = propertyEquipmentSchema.safeParse({
    propertyId,
    assignmentId: formValue(formData, "assignmentId"),
    updatedAt: formValue(formData, "updatedAt"),
    buildingId: formValue(formData, "buildingId"),
    requiredQuantity: formValue(formData, "requiredQuantity"),
    seasonal: checkbox(formData, "seasonal"),
    seasonStartMonth: formValue(formData, "seasonStartMonth") || undefined,
    seasonEndMonth: formValue(formData, "seasonEndMonth") || undefined,
    rental: checkbox(formData, "rental"),
    notificationLeadHours: formValue(formData, "notificationLeadHours") || "48",
    provisionNote: formValue(formData, "provisionNote"),
  });
  if (!parsed.success) go(propertyId, "team", "error", firstZodError(parsed.error));
  const value = parsed.data;
  const { error } = await supabase.rpc("set_property_equipment_assignment", {
    p_property_id: value.propertyId,
    p_equipment_id: null,
    p_building_id: value.buildingId || null,
    p_required_quantity: value.requiredQuantity,
    p_seasonal: value.seasonal,
    p_season_start_month: value.seasonal ? value.seasonStartMonth ?? null : null,
    p_season_end_month: value.seasonal ? value.seasonEndMonth ?? null : null,
    p_rental: value.rental,
    p_notification_lead_hours: value.notificationLeadHours,
    p_provision_note: value.provisionNote || null,
    p_assignment_id: value.assignmentId,
    p_expected_updated_at: value.updatedAt,
    p_deactivate: false,
  });
  if (error) {
    go(
      value.propertyId,
      "team",
      "error",
      error.code === "23505"
        ? "Für dieses Equipment und Gebäude besteht bereits eine Zuordnung."
        : "Die Equipmentzuordnung wurde zwischenzeitlich geändert oder konnte nicht gespeichert werden.",
    );
  }

  revalidateProperty(value.propertyId);
  revalidatePath("/admin/equipment");
  revalidatePath("/app/today");
  go(value.propertyId, "team", "status", "Equipmentzuordnung wurde aktualisiert.");
}

export async function deactivatePropertyEquipmentAssignmentAction(formData: FormData) {
  const { supabase } = await requireAdminContext();
  const parsed = propertyEquipmentIdentitySchema.safeParse({
    propertyId: formValue(formData, "propertyId"),
    assignmentId: formValue(formData, "assignmentId"),
    updatedAt: formValue(formData, "updatedAt"),
  });
  const propertyId = formValue(formData, "propertyId");
  if (!parsed.success) go(propertyId, "team", "error", firstZodError(parsed.error));
  const value = parsed.data;
  const { error } = await supabase.rpc("set_property_equipment_assignment", {
    p_property_id: value.propertyId,
    p_equipment_id: null,
    p_building_id: null,
    p_required_quantity: 1,
    p_seasonal: false,
    p_season_start_month: null,
    p_season_end_month: null,
    p_rental: false,
    p_notification_lead_hours: 0,
    p_provision_note: null,
    p_assignment_id: value.assignmentId,
    p_expected_updated_at: value.updatedAt,
    p_deactivate: true,
  });
  if (error) {
    go(
      value.propertyId,
      "team",
      "error",
      "Die aktive Equipmentzuordnung wurde nicht gefunden, zwischenzeitlich geändert oder konnte nicht beendet werden.",
    );
  }

  revalidateProperty(value.propertyId);
  revalidatePath("/admin/equipment");
  revalidatePath("/app/today");
  go(value.propertyId, "team", "status", "Equipmentzuordnung wurde beendet.");
}

export async function updatePropertyServiceAction(formData: FormData) {
  const { supabase, admin } = await requireAdminContext();
  const propertyId = formValue(formData, "propertyId");
  const serviceId = formValue(formData, "serviceId");
  const expectedUpdatedAt = formValue(formData, "updatedAt");
  const expectedInstructionVersion = formValue(
    formData,
    "instructionUpdatedAt",
  );
  const identity = z
    .object({
      propertyId: z.string().uuid(),
      serviceId: z.string().uuid(),
      updatedAt: z.string().datetime({ offset: true }),
      instructionUpdatedAt: z
        .string()
        .datetime({ offset: true })
        .optional()
        .or(z.literal("")),
    })
    .safeParse({
      propertyId,
      serviceId,
      updatedAt: expectedUpdatedAt,
      instructionUpdatedAt: expectedInstructionVersion,
    });
  if (!identity.success) {
    go(propertyId, "leistungen", "error", "Ungültige Leistungszuordnung.");
  }
  await requireMutableProperty(admin, propertyId, "leistungen");

  const serviceResult = await admin
    .from("property_services")
    .select("*")
    .eq("id", serviceId)
    .eq("property_id", propertyId)
    .maybeSingle();
  if (serviceResult.error || !serviceResult.data) {
    go(propertyId, "leistungen", "error", "Die Leistung konnte nicht geladen werden.");
  }
  const service = serviceResult.data;
  if (service.status === "archived") {
    go(propertyId, "leistungen", "error", "Archivierte Leistungen können nicht geändert werden.");
  }
  if (service.updated_at !== expectedUpdatedAt) {
    go(
      propertyId,
      "leistungen",
      "error",
      "Die Leistung wurde zwischenzeitlich geändert. Bitte neu laden.",
    );
  }

  const parsed = propertyServiceSchema.safeParse({
    propertyId,
    catalogId: service.catalog_id || "",
    name: formValue(formData, "name"),
    serviceKey: service.service_key,
    category: formValue(formData, "category"),
    customerDescription: formValue(formData, "customerDescription"),
    internalInstruction: formValue(formData, "internalInstruction"),
    executionRule: formValue(formData, "executionRule"),
    occurrencesPerPeriod: formValue(formData, "occurrencesPerPeriod") || "1",
    seasonal: checkbox(formData, "seasonal"),
    seasonStartMonth: formValue(formData, "seasonStartMonth") || undefined,
    seasonEndMonth: formValue(formData, "seasonEndMonth") || undefined,
    startDate: formValue(formData, "startDate"),
    endDate: formValue(formData, "endDate"),
    estimatedMinutes: formValue(formData, "estimatedMinutes") || undefined,
    sortOrder: formValue(formData, "sortOrder") || "0",
    customerVisible: checkbox(formData, "customerVisible"),
    photoRequired: checkbox(formData, "photoRequired"),
    buildingIds: formValues(formData, "buildingId"),
  });
  if (!parsed.success) go(propertyId, "leistungen", "error", firstZodError(parsed.error));
  const value = parsed.data;
  const { error } = await supabase.rpc(
    "update_property_service_configuration",
    {
      p_property_id: propertyId,
      p_property_service_id: serviceId,
      p_expected_updated_at: expectedUpdatedAt,
      p_catalog_id: service.catalog_id || null,
      p_service_key: service.service_key,
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
      p_status: service.status,
      p_internal_instruction: value.internalInstruction || null,
      p_expected_instruction_version: expectedInstructionVersion || null,
      p_building_ids: Array.from(new Set(value.buildingIds)),
    },
  );
  if (error) {
    go(
      propertyId,
      "leistungen",
      "error",
      error.code === "40001"
        ? "Die Leistung oder Arbeitsanweisung wurde zwischenzeitlich geändert. Bitte neu laden."
        : "Die vollständige Leistungskonfiguration konnte nicht sicher gespeichert werden.",
    );
  }

  revalidateProperty(propertyId);
  revalidatePath("/app/properties");
  revalidatePath("/portal/properties");
  go(propertyId, "leistungen", "status", "Leistung wurde aktualisiert.");
}
