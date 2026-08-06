"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminContext } from "@/lib/portal/access";
import { checkbox, formValue } from "@/lib/portal/validation";

function propertyPath(propertyId: string) {
  return `/admin/properties/${propertyId}`;
}

function go(propertyId: string, key: "status" | "error", message: string): never {
  redirect(`${propertyPath(propertyId)}?view=leistungen&${key}=${encodeURIComponent(message)}`);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function requirePropertyService(
  admin: Awaited<ReturnType<typeof requireAdminContext>>["admin"],
  propertyId: string,
  serviceId: string,
) {
  if (!isUuid(propertyId) || !isUuid(serviceId)) return null;
  const [serviceResult, propertyResult] = await Promise.all([
    admin
      .from("property_services")
      .select("id,status")
      .eq("id", serviceId)
      .eq("property_id", propertyId)
      .maybeSingle(),
    admin
      .from("properties")
      .select("id,status")
      .eq("id", propertyId)
      .maybeSingle(),
  ]);
  if (serviceResult.error || propertyResult.error) {
    throw serviceResult.error ?? propertyResult.error;
  }
  if (
    !serviceResult.data ||
    !propertyResult.data ||
    propertyResult.data.status === "archived" ||
    serviceResult.data.status === "archived"
  ) {
    return null;
  }
  return serviceResult.data;
}

export async function addServiceChecklistItemAction(formData: FormData) {
  const { profile, admin } = await requireAdminContext();
  const propertyId = formValue(formData, "propertyId");
  const serviceId = formValue(formData, "serviceId");
  const label = formValue(formData, "label");
  const sortOrder = Number(formValue(formData, "sortOrder") || "0");
  if (!label || label.length > 300 || !Number.isSafeInteger(sortOrder)) {
    go(propertyId, "error", "Bitte einen gültigen Checklistenpunkt eingeben.");
  }

  try {
    if (!(await requirePropertyService(admin, propertyId, serviceId))) {
      go(propertyId, "error", "Die Leistung gehört nicht zu dieser Immobilie.");
    }
    const { data: item, error } = await admin
      .from("service_checklist_items")
      .insert({
        property_service_id: serviceId,
        label,
        required: checkbox(formData, "required"),
        sort_order: sortOrder,
      })
      .select("id")
      .single();
    if (error || !item) throw error ?? new Error("Checklist item missing");
    const { error: auditError } = await admin.from("audit_logs").insert({
      actor_id: profile.id,
      action: "service.checklist_item_created",
      entity_table: "service_checklist_items",
      entity_id: item.id,
      metadata: { property_id: propertyId, property_service_id: serviceId },
    });
    if (auditError) throw auditError;
  } catch {
    go(propertyId, "error", "Der Checklistenpunkt konnte nicht gespeichert werden.");
  }

  revalidatePath(propertyPath(propertyId));
  go(propertyId, "status", "Checklistenpunkt wurde gespeichert.");
}

export async function removeServiceChecklistItemAction(formData: FormData) {
  const { profile, admin } = await requireAdminContext();
  const propertyId = formValue(formData, "propertyId");
  const serviceId = formValue(formData, "serviceId");
  const itemId = formValue(formData, "itemId");
  if (!isUuid(itemId)) go(propertyId, "error", "Ungültiger Checklistenpunkt.");

  try {
    if (!(await requirePropertyService(admin, propertyId, serviceId))) {
      go(propertyId, "error", "Die Leistung gehört nicht zu dieser Immobilie.");
    }
    const { data, error } = await admin
      .from("service_checklist_items")
      .delete()
      .eq("id", itemId)
      .eq("property_service_id", serviceId)
      .select("id")
      .maybeSingle();
    if (error || !data) throw error ?? new Error("Checklist item missing");
    const { error: auditError } = await admin.from("audit_logs").insert({
      actor_id: profile.id,
      action: "service.checklist_item_deleted",
      entity_table: "service_checklist_items",
      entity_id: itemId,
      metadata: { property_id: propertyId, property_service_id: serviceId },
    });
    if (auditError) throw auditError;
  } catch {
    go(propertyId, "error", "Der Checklistenpunkt konnte nicht entfernt werden.");
  }

  revalidatePath(propertyPath(propertyId));
  go(propertyId, "status", "Checklistenpunkt wurde entfernt.");
}

export async function assignServiceEquipmentAction(formData: FormData) {
  const { profile, admin } = await requireAdminContext();
  const propertyId = formValue(formData, "propertyId");
  const serviceId = formValue(formData, "serviceId");
  const equipmentId = formValue(formData, "equipmentId");
  const requiredQuantity = Number(
    formValue(formData, "requiredQuantity").replace(",", ".") || "1",
  );
  if (!isUuid(equipmentId) || !Number.isFinite(requiredQuantity) || requiredQuantity <= 0) {
    go(propertyId, "error", "Bitte gültiges Equipment und eine positive Menge wählen.");
  }

  try {
    const [service, equipmentResult] = await Promise.all([
      requirePropertyService(admin, propertyId, serviceId),
      admin
        .from("equipment")
        .select("id")
        .eq("id", equipmentId)
        .eq("status", "active")
        .maybeSingle(),
    ]);
    if (!service || equipmentResult.error || !equipmentResult.data) {
      go(propertyId, "error", "Leistung oder Equipment ist nicht verfügbar.");
    }
    const { error } = await admin.from("service_equipment").upsert(
      {
        property_service_id: serviceId,
        equipment_id: equipmentId,
        required_quantity: requiredQuantity,
      },
      { onConflict: "property_service_id,equipment_id" },
    );
    if (error) throw error;
    const { error: auditError } = await admin.from("audit_logs").insert({
      actor_id: profile.id,
      action: "service.equipment_assigned",
      entity_table: "service_equipment",
      entity_id: serviceId,
      metadata: { property_id: propertyId, equipment_id: equipmentId, required_quantity: requiredQuantity },
    });
    if (auditError) throw auditError;
  } catch {
    go(propertyId, "error", "Das Equipment konnte der Leistung nicht zugeordnet werden.");
  }

  revalidatePath(propertyPath(propertyId));
  go(propertyId, "status", "Equipment wurde der Leistung zugeordnet.");
}

export async function removeServiceEquipmentAction(formData: FormData) {
  const { profile, admin } = await requireAdminContext();
  const propertyId = formValue(formData, "propertyId");
  const serviceId = formValue(formData, "serviceId");
  const equipmentId = formValue(formData, "equipmentId");
  if (!isUuid(equipmentId)) go(propertyId, "error", "Ungültiges Equipment.");

  try {
    if (!(await requirePropertyService(admin, propertyId, serviceId))) {
      go(propertyId, "error", "Die Leistung gehört nicht zu dieser Immobilie.");
    }
    const { data, error } = await admin
      .from("service_equipment")
      .delete()
      .eq("property_service_id", serviceId)
      .eq("equipment_id", equipmentId)
      .select("equipment_id")
      .maybeSingle();
    if (error || !data) throw error ?? new Error("Service equipment missing");
    const { error: auditError } = await admin.from("audit_logs").insert({
      actor_id: profile.id,
      action: "service.equipment_removed",
      entity_table: "service_equipment",
      entity_id: serviceId,
      metadata: { property_id: propertyId, equipment_id: equipmentId },
    });
    if (auditError) throw auditError;
  } catch {
    go(propertyId, "error", "Die Equipmentzuordnung konnte nicht entfernt werden.");
  }

  revalidatePath(propertyPath(propertyId));
  go(propertyId, "status", "Equipmentzuordnung wurde entfernt.");
}
