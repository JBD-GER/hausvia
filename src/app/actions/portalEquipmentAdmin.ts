"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdminContext } from "@/lib/portal/access";
import { parseEuroToCents } from "@/lib/portal/core";
import { uploadPortalFile } from "@/lib/portal/files";
import { validateUploadContents } from "@/lib/portal/security";
import { checkbox, firstZodError, formValue } from "@/lib/portal/validation";

const equipmentPath = "/admin/equipment";

const equipmentCategories = [
  "device",
  "tool",
  "consumable",
  "cleaning_product",
  "rental",
  "protective_clothing",
  "other",
] as const;

const equipmentConditions = [
  "available",
  "in_use",
  "empty",
  "defective",
  "in_repair",
  "lost",
  "archived",
] as const;

const decimalInput = z
  .string()
  .trim()
  .regex(/^\d{1,9}(?:[.,]\d{1,3})?$/, "Bitte einen gültigen Bestand eingeben.")
  .transform((value) => Number(value.replace(",", ".")))
  .refine((value) => Number.isFinite(value) && value >= 0, "Der Bestand darf nicht negativ sein.");

const positiveQuantityInput = z
  .string()
  .trim()
  .regex(/^\d{1,9}(?:[.,]\d{1,3})?$/, "Bitte eine gültige Menge eingeben.")
  .transform((value) => Number(value.replace(",", ".")))
  .refine((value) => Number.isFinite(value) && value > 0, "Die Menge muss größer als null sein.");

const euroInput = z
  .string()
  .trim()
  .regex(/^\d{1,9}(?:[.,]\d{1,2})?$/, "Bitte gültige Mietkosten eingeben.");

const createEquipmentSchema = z.object({
  name: z.string().trim().min(1, "Der Name ist erforderlich.").max(180),
  category: z.enum(equipmentCategories),
  description: z.string().trim().max(4_000),
  sku: z.string().trim().max(100),
  unit: z.string().trim().min(1, "Die Einheit ist erforderlich.").max(50),
  currentStock: decimalInput,
  minimumStock: decimalInput,
  condition: z.enum(equipmentConditions).exclude(["archived"]),
  ownershipType: z.enum(["owned", "rented"]),
  supplier: z.string().trim().max(180),
  rentalCost: euroInput,
  storageLocation: z.string().trim().max(180),
});

const updateEquipmentSchema = createEquipmentSchema.extend({
  equipmentId: z.string().uuid("Ungültiges Equipment."),
  expectedUpdatedAt: z.string().datetime({ offset: true }),
  expectedDetailsUpdatedAt: z.string().datetime({ offset: true }).optional().or(z.literal("")),
  condition: z.enum(equipmentConditions),
});

const equipmentStateSchema = z.object({
  equipmentId: z.string().uuid("Ungültiges Equipment."),
  condition: z.enum(equipmentConditions),
  status: z.enum(["active", "archived"]),
  expectedUpdatedAt: z.string().datetime({ offset: true }),
});

const equipmentMutationIdentitySchema = z.object({
  equipmentId: z.string().uuid("Ungültiges Equipment."),
  expectedUpdatedAt: z.string().datetime({ offset: true }),
});

const employeeAssignmentSchema = z.object({
  equipmentId: z.string().uuid("Ungültiges Equipment."),
  employeeId: z.string().uuid("Ungültiger Mitarbeiter."),
});

const visitAssignmentSchema = z.object({
  equipmentId: z.string().uuid("Ungültiges Equipment."),
  visitId: z.string().uuid("Ungültiger Einsatz."),
  requiredQuantity: positiveQuantityInput,
  provisionNote: z.string().trim().max(2_000),
  rental: z.boolean(),
});

const assignmentIdentitySchema = z.object({
  equipmentId: z.string().uuid("Ungültiges Equipment."),
  visitId: z.string().uuid("Ungültiger Einsatz."),
});

function go(key: "status" | "error", value: string): never {
  redirect(`${equipmentPath}?${key}=${encodeURIComponent(value)}`);
}

function logRollbackFailure(context: string, error: unknown) {
  console.error(`[Hausvia Equipment] ${context}`, error);
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

async function removeStorageObject(
  admin: Awaited<ReturnType<typeof requireAdminContext>>["admin"],
  bucket: string,
  path: string,
) {
  const { error } = await admin.storage.from(bucket).remove([path]);
  if (error) logRollbackFailure(`Storage-Objekt ${bucket}/${path} konnte nicht entfernt werden.`, error);
  return !error;
}

async function removeEquipmentImageIfUnreferenced(
  admin: Awaited<ReturnType<typeof requireAdminContext>>["admin"],
  bucket: string,
  path: string,
) {
  const { count, error } = await admin
    .from("visit_equipment")
    .select("visit_id", { count: "exact", head: true })
    .contains("equipment_snapshot", { image_bucket: bucket, image_path: path });
  if (error) {
    logRollbackFailure("Historische Referenzen des Gerätefotos konnten nicht geprüft werden.", error);
    return false;
  }
  if ((count ?? 0) > 0) return false;
  return removeStorageObject(admin, bucket, path);
}

async function rollbackCreatedEquipment({
  admin,
  equipmentId,
  uploaded,
}: {
  admin: Awaited<ReturnType<typeof requireAdminContext>>["admin"];
  equipmentId: string;
  uploaded?: { bucket: string; path: string } | null;
}) {
  if (uploaded) await removeStorageObject(admin, uploaded.bucket, uploaded.path);
  const { error: detailsError } = await admin
    .from("equipment_admin_details")
    .delete()
    .eq("equipment_id", equipmentId);
  if (detailsError) logRollbackFailure("Equipmentdetails konnten nicht zurückgerollt werden.", detailsError);
  const { error: equipmentError } = await admin.from("equipment").delete().eq("id", equipmentId);
  if (equipmentError) logRollbackFailure("Equipment konnte nicht zurückgerollt werden.", equipmentError);
}

function revalidateEquipmentConsumers({ employeeId, visitId }: { employeeId?: string; visitId?: string } = {}) {
  revalidatePath(equipmentPath);
  revalidatePath("/app/today");
  if (employeeId) revalidatePath(`/admin/employees/${employeeId}`);
  if (visitId) revalidatePath(`/app/visits/${visitId}`);
}

export async function createEquipmentAction(formData: FormData) {
  const { profile, admin } = await requireAdminContext();
  const parsed = createEquipmentSchema.safeParse({
    name: formValue(formData, "name"),
    category: formValue(formData, "category"),
    description: formValue(formData, "description"),
    sku: formValue(formData, "sku"),
    unit: formValue(formData, "unit") || "Stück",
    currentStock: formValue(formData, "currentStock") || "0",
    minimumStock: formValue(formData, "minimumStock") || "0",
    condition: formValue(formData, "condition") || "available",
    ownershipType: formValue(formData, "ownershipType") || "owned",
    supplier: formValue(formData, "supplier"),
    rentalCost: formValue(formData, "rentalCost") || "0,00",
    storageLocation: formValue(formData, "storageLocation"),
  });
  if (!parsed.success) go("error", firstZodError(parsed.error));

  const image = formData.get("photo");
  const hasImage = image instanceof File && image.size > 0;
  if (hasImage) {
    const validation = await validateUploadContents(image, "image");
    if (!validation.ok) go("error", validation.message);
  }

  const value = parsed.data;
  const { data: equipment, error: equipmentError } = await admin
    .from("equipment")
    .insert({
      name: value.name,
      category: value.category,
      description: value.description || null,
      sku: value.sku || null,
      unit: value.unit,
      current_stock: value.currentStock,
      minimum_stock: value.minimumStock,
      condition: value.condition,
      ownership_type: value.ownershipType,
      storage_location: value.storageLocation || null,
      status: "active",
      created_by: profile.id,
    })
    .select("id")
    .single();
  if (equipmentError || !equipment) go("error", "Equipment konnte nicht gespeichert werden.");

  const { error: detailsError } = await admin.from("equipment_admin_details").insert({
    equipment_id: equipment.id,
    supplier: value.supplier || null,
    rental_cost_cents: parseEuroToCents(value.rentalCost),
  });
  if (detailsError) {
    await rollbackCreatedEquipment({ admin, equipmentId: equipment.id });
    go("error", "Interne Equipmentangaben konnten nicht gespeichert werden.");
  }

  let uploaded: Awaited<ReturnType<typeof uploadPortalFile>> | null = null;
  if (hasImage) {
    try {
      uploaded = await uploadPortalFile({
        client: admin,
        bucket: "equipment-images",
        ownerPath: `${profile.id}/${equipment.id}`,
        file: image,
      });
    } catch (error) {
      await rollbackCreatedEquipment({ admin, equipmentId: equipment.id });
      go(
        "error",
        error instanceof Error ? error.message : "Das Gerätefoto konnte nicht gespeichert werden.",
      );
    }

    const { data: linked, error: linkError } = await admin
      .from("equipment")
      .update({ image_bucket: uploaded.bucket, image_path: uploaded.path })
      .eq("id", equipment.id)
      .select("id")
      .maybeSingle();
    if (linkError || !linked) {
      await rollbackCreatedEquipment({ admin, equipmentId: equipment.id, uploaded });
      go("error", "Das Gerätefoto konnte nicht sicher mit dem Equipment verknüpft werden.");
    }
  }

  const { error: auditError } = await admin.from("audit_logs").insert({
    actor_id: profile.id,
    action: "equipment.created",
    entity_table: "equipment",
    entity_id: equipment.id,
    metadata: {
      category: value.category,
      condition: value.condition,
      ownership_type: value.ownershipType,
      has_image: Boolean(uploaded),
    },
  });
  if (auditError) {
    await rollbackCreatedEquipment({ admin, equipmentId: equipment.id, uploaded });
    go("error", "Equipment konnte nicht revisionssicher angelegt werden.");
  }

  revalidateEquipmentConsumers();
  go("status", "Equipment wurde angelegt.");
}

export async function uploadEquipmentPhotoAction(formData: FormData) {
  const { profile, admin, supabase } = await requireAdminContext();
  const equipmentId = formValue(formData, "equipmentId");
  const parsedId = z.string().uuid().safeParse(equipmentId);
  const photo = formData.get("photo");
  if (!parsedId.success || !(photo instanceof File) || photo.size <= 0) {
    go("error", "Bitte Equipment und ein Gerätefoto auswählen.");
  }

  const validation = await validateUploadContents(photo, "image");
  if (!validation.ok) go("error", validation.message);

  const { data: equipment, error: equipmentError } = await admin
    .from("equipment")
    .select("id,name,image_bucket,image_path,updated_at")
    .eq("id", equipmentId)
    .maybeSingle();
  if (equipmentError || !equipment) go("error", "Equipment wurde nicht gefunden.");

  let uploaded: Awaited<ReturnType<typeof uploadPortalFile>>;
  try {
    uploaded = await uploadPortalFile({
      client: admin,
      bucket: "equipment-images",
      ownerPath: `${profile.id}/${equipment.id}`,
      file: photo,
    });
  } catch (error) {
    go(
      "error",
      error instanceof Error ? error.message : "Das Gerätefoto konnte nicht gespeichert werden.",
    );
  }

  const { error: linkError } = await supabase.rpc("link_equipment_image", {
    p_equipment_id: equipment.id,
    p_expected_updated_at: equipment.updated_at,
    p_bucket: uploaded.bucket,
    p_path: uploaded.path,
  });
  if (linkError) {
    await removeStorageObject(admin, uploaded.bucket, uploaded.path);
    go("error", "Das Gerätefoto konnte wegen einer zwischenzeitlichen Änderung nicht verknüpft werden.");
  }

  if (equipment.image_bucket && equipment.image_path) {
    await removeEquipmentImageIfUnreferenced(
      admin,
      equipment.image_bucket,
      equipment.image_path,
    );
  }
  revalidateEquipmentConsumers();
  go("status", "Gerätefoto wurde aktualisiert.");
}

export async function updateEquipmentDetailsAction(formData: FormData) {
  const { profile, admin } = await requireAdminContext();
  const parsed = updateEquipmentSchema.safeParse({
    equipmentId: formValue(formData, "equipmentId"),
    expectedUpdatedAt: formValue(formData, "expectedUpdatedAt"),
    expectedDetailsUpdatedAt: formValue(formData, "expectedDetailsUpdatedAt"),
    name: formValue(formData, "name"),
    category: formValue(formData, "category"),
    description: formValue(formData, "description"),
    sku: formValue(formData, "sku"),
    unit: formValue(formData, "unit"),
    currentStock: formValue(formData, "currentStock"),
    minimumStock: formValue(formData, "minimumStock"),
    condition: formValue(formData, "currentCondition"),
    ownershipType: formValue(formData, "ownershipType"),
    supplier: formValue(formData, "supplier"),
    rentalCost: formValue(formData, "rentalCost"),
    storageLocation: formValue(formData, "storageLocation"),
  });
  if (!parsed.success) go("error", firstZodError(parsed.error));
  const value = parsed.data;

  const equipmentResult = await admin
    .from("equipment")
    .select(
      "id,name,category,description,sku,unit,current_stock,minimum_stock,condition,ownership_type,storage_location,updated_at",
    )
    .eq("id", value.equipmentId)
    .eq("updated_at", value.expectedUpdatedAt)
    .maybeSingle();
  if (equipmentResult.error || !equipmentResult.data) {
    go("error", "Die Stammdaten wurden zwischenzeitlich geändert. Bitte laden Sie die Seite neu.");
  }

  let detailsQuery = admin
    .from("equipment_admin_details")
    .select("equipment_id,supplier,rental_cost_cents,updated_at")
    .eq("equipment_id", value.equipmentId);
  if (value.expectedDetailsUpdatedAt) {
    detailsQuery = detailsQuery.eq("updated_at", value.expectedDetailsUpdatedAt);
  }
  const detailsResult = await detailsQuery.maybeSingle();
  if (
    detailsResult.error ||
    (value.expectedDetailsUpdatedAt && !detailsResult.data) ||
    (!value.expectedDetailsUpdatedAt && detailsResult.data)
  ) {
    go("error", "Die internen Equipmentangaben wurden zwischenzeitlich geändert.");
  }

  const equipment = equipmentResult.data;
  const details = detailsResult.data;
  const previousEquipment = {
    name: equipment.name,
    category: equipment.category,
    description: equipment.description,
    sku: equipment.sku,
    unit: equipment.unit,
    current_stock: Number(equipment.current_stock),
    minimum_stock: Number(equipment.minimum_stock),
    ownership_type: equipment.ownership_type,
    storage_location: equipment.storage_location,
  };
  const nextEquipment = {
    name: value.name,
    category: value.category,
    description: value.description || null,
    sku: value.sku || null,
    unit: value.unit,
    current_stock: value.currentStock,
    minimum_stock: value.minimumStock,
    ownership_type: value.ownershipType,
    storage_location: value.storageLocation || null,
  };
  const previousDetails = {
    supplier: details?.supplier ?? null,
    rental_cost_cents: Number(details?.rental_cost_cents ?? 0),
  };
  const nextDetails = {
    supplier: value.supplier || null,
    rental_cost_cents: parseEuroToCents(value.rentalCost),
  };
  const changes = {
    ...changedFields(previousEquipment, nextEquipment),
    ...changedFields(previousDetails, nextDetails),
  };
  if (!Object.keys(changes).length) go("status", "Die Equipmentstammdaten sind bereits aktuell.");

  const { data: updatedEquipment, error: equipmentUpdateError } = await admin
    .from("equipment")
    .update(nextEquipment)
    .eq("id", value.equipmentId)
    .eq("updated_at", value.expectedUpdatedAt)
    .select("id,updated_at")
    .maybeSingle();
  if (equipmentUpdateError || !updatedEquipment) {
    go("error", "Die Stammdaten wurden zwischenzeitlich geändert und nicht überschrieben.");
  }

  const detailsMutation = details
    ? admin
        .from("equipment_admin_details")
        .update(nextDetails)
        .eq("equipment_id", value.equipmentId)
        .eq("updated_at", details.updated_at)
        .select("equipment_id,updated_at")
        .maybeSingle()
    : admin
        .from("equipment_admin_details")
        .insert({ equipment_id: value.equipmentId, ...nextDetails })
        .select("equipment_id,updated_at")
        .single();
  const { data: updatedDetails, error: detailsUpdateError } = await detailsMutation;
  if (detailsUpdateError || !updatedDetails) {
    const { data: rolledBack, error: rollbackError } = await admin
      .from("equipment")
      .update(previousEquipment)
      .eq("id", value.equipmentId)
      .eq("updated_at", updatedEquipment.updated_at)
      .select("id")
      .maybeSingle();
    if (rollbackError || !rolledBack) {
      logRollbackFailure("Stammdaten konnten nach Detailfehler nicht zurückgerollt werden.", rollbackError);
    }
    go("error", "Interne Equipmentangaben konnten nicht gespeichert werden.");
  }

  const { error: auditError } = await admin.from("audit_logs").insert({
    actor_id: profile.id,
    action: "equipment.details_updated",
    entity_table: "equipment",
    entity_id: value.equipmentId,
    metadata: { changes },
  });
  if (auditError) {
    const detailsRollback = details
      ? await admin
          .from("equipment_admin_details")
          .update(previousDetails)
          .eq("equipment_id", value.equipmentId)
          .eq("updated_at", updatedDetails.updated_at)
          .select("equipment_id")
          .maybeSingle()
      : await admin
          .from("equipment_admin_details")
          .delete()
          .eq("equipment_id", value.equipmentId)
          .eq("updated_at", updatedDetails.updated_at)
          .select("equipment_id")
          .maybeSingle();
    const equipmentRollback = await admin
      .from("equipment")
      .update(previousEquipment)
      .eq("id", value.equipmentId)
      .eq("updated_at", updatedEquipment.updated_at)
      .select("id")
      .maybeSingle();
    if (detailsRollback.error || !detailsRollback.data) {
      logRollbackFailure("Equipmentdetails konnten nach Auditfehler nicht zurückgerollt werden.", detailsRollback.error);
    }
    if (equipmentRollback.error || !equipmentRollback.data) {
      logRollbackFailure("Equipmentstammdaten konnten nach Auditfehler nicht zurückgerollt werden.", equipmentRollback.error);
    }
    go("error", "Die Stammdaten konnten nicht revisionssicher gespeichert werden.");
  }

  revalidateEquipmentConsumers();
  go("status", "Equipmentstammdaten wurden aktualisiert.");
}

export async function updateEquipmentStateAction(formData: FormData) {
  const { supabase } = await requireAdminContext();
  const parsed = equipmentStateSchema.safeParse({
    equipmentId: formValue(formData, "equipmentId"),
    condition: formValue(formData, "condition"),
    status: formValue(formData, "status"),
    expectedUpdatedAt: formValue(formData, "expectedUpdatedAt"),
  });
  if (!parsed.success) go("error", firstZodError(parsed.error));

  const requested = parsed.data;
  if (requested.status === "active" && requested.condition === "archived") {
    go("error", "Aktives Equipment benötigt einen aktiven Zustand.");
  }
  const { data: mutation, error } = await supabase.rpc("set_equipment_state", {
    p_equipment_id: requested.equipmentId,
    p_expected_updated_at: requested.expectedUpdatedAt,
    p_status: requested.status,
    p_condition: requested.condition,
  });
  if (error) {
    go("error", "Der Equipmentstatus wurde zwischenzeitlich geändert und nicht überschrieben.");
  }

  revalidateEquipmentConsumers();
  if (mutation === "unchanged") go("status", "Der Equipmentstatus ist bereits aktuell.");
  go(
    "status",
    requested.status === "archived" ? "Equipment wurde archiviert." : "Equipmentstatus wurde aktualisiert.",
  );
}

export async function archiveEquipmentAction(formData: FormData) {
  const parsed = equipmentMutationIdentitySchema.safeParse({
    equipmentId: formValue(formData, "equipmentId"),
    expectedUpdatedAt: formValue(formData, "expectedUpdatedAt"),
  });
  if (!parsed.success) go("error", firstZodError(parsed.error));

  const archiveData = new FormData();
  archiveData.set("equipmentId", parsed.data.equipmentId);
  archiveData.set("condition", "archived");
  archiveData.set("status", "archived");
  archiveData.set("expectedUpdatedAt", parsed.data.expectedUpdatedAt);
  await updateEquipmentStateAction(archiveData);
}

export async function assignEquipmentEmployeeAction(formData: FormData) {
  const { supabase } = await requireAdminContext();
  const parsed = employeeAssignmentSchema.safeParse({
    equipmentId: formValue(formData, "equipmentId"),
    employeeId: formValue(formData, "employeeId"),
  });
  if (!parsed.success) go("error", firstZodError(parsed.error));
  const { equipmentId, employeeId } = parsed.data;

  const { error } = await supabase.rpc("set_equipment_employee_assignment", {
    p_equipment_id: equipmentId,
    p_employee_id: employeeId,
    p_return: false,
  });
  if (error) go("error", "Mitarbeiterzuweisung konnte nicht gespeichert werden.");

  revalidateEquipmentConsumers({ employeeId });
  go("status", "Equipment wurde dem Mitarbeiter zugewiesen.");
}

export async function returnEquipmentEmployeeAction(formData: FormData) {
  const { supabase } = await requireAdminContext();
  const parsed = employeeAssignmentSchema.safeParse({
    equipmentId: formValue(formData, "equipmentId"),
    employeeId: formValue(formData, "employeeId"),
  });
  if (!parsed.success) go("error", firstZodError(parsed.error));
  const value = parsed.data;

  const { error } = await supabase.rpc("set_equipment_employee_assignment", {
    p_equipment_id: value.equipmentId,
    p_employee_id: value.employeeId,
    p_return: true,
  });
  if (error) go("error", "Mitarbeiterzuweisung konnte nicht beendet werden.");

  revalidateEquipmentConsumers({ employeeId: value.employeeId });
  go("status", "Equipmentrückgabe wurde gespeichert.");
}

export async function assignEquipmentVisitAction(formData: FormData) {
  const { supabase } = await requireAdminContext();
  const parsed = visitAssignmentSchema.safeParse({
    equipmentId: formValue(formData, "equipmentId"),
    visitId: formValue(formData, "visitId"),
    requiredQuantity: formValue(formData, "requiredQuantity") || "1",
    provisionNote: formValue(formData, "provisionNote"),
    rental: checkbox(formData, "rental"),
  });
  if (!parsed.success) go("error", firstZodError(parsed.error));
  const value = parsed.data;

  const { data: mutation, error } = await supabase.rpc("set_visit_equipment_assignment", {
    p_visit_id: value.visitId,
    p_equipment_id: value.equipmentId,
    p_required_quantity: value.requiredQuantity,
    p_rental: value.rental,
    p_provision_note: value.provisionNote || null,
    p_remove: false,
  });
  if (error) go("error", "Einsatzzuweisung konnte nicht gespeichert werden.");

  revalidateEquipmentConsumers({ visitId: value.visitId });
  go(
    "status",
    mutation === "updated"
      ? "Einsatzzuweisung wurde aktualisiert."
      : "Equipment wurde dem Einsatz zugeordnet.",
  );
}

export async function removeEquipmentVisitAction(formData: FormData) {
  const { supabase } = await requireAdminContext();
  const parsed = assignmentIdentitySchema.safeParse({
    equipmentId: formValue(formData, "equipmentId"),
    visitId: formValue(formData, "visitId"),
  });
  if (!parsed.success) go("error", firstZodError(parsed.error));
  const { equipmentId, visitId } = parsed.data;

  const { error } = await supabase.rpc("set_visit_equipment_assignment", {
    p_visit_id: visitId,
    p_equipment_id: equipmentId,
    p_required_quantity: 1,
    p_rental: false,
    p_provision_note: null,
    p_remove: true,
  });
  if (error) go("error", "Einsatzzuweisung konnte nicht entfernt werden.");

  revalidateEquipmentConsumers({ visitId });
  go("status", "Equipment wurde aus dem Einsatz entfernt.");
}
