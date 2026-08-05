"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminContext } from "@/lib/portal/access";
import { formValue } from "@/lib/portal/validation";

function pathFor(propertyId: string) {
  return `/admin/properties/${propertyId}`;
}

function go(propertyId: string, key: "status" | "error", value: string): never {
  redirect(`${pathFor(propertyId)}?${key}=${encodeURIComponent(value)}#uebersicht`);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function updatePropertyStatusAction(formData: FormData) {
  const { supabase } = await requireAdminContext();
  const propertyId = formValue(formData, "propertyId");
  const status = formValue(formData, "status");
  if (!isUuid(propertyId) || !["planning", "active", "paused", "archived"].includes(status)) {
    go(propertyId, "error", "Ungültige Statusänderung.");
  }

  const { data: mutation, error } = await supabase.rpc("set_property_status", {
    p_property_id: propertyId,
    p_status: status,
  });
  if (error) {
    go(
      propertyId,
      "error",
      status === "archived"
        ? "Die Immobilie konnte nicht archiviert werden. Prüfen Sie insbesondere, ob noch ein Einsatz läuft."
        : "Der Immobilienstatus konnte nicht sicher gespeichert werden.",
    );
  }

  revalidatePath("/admin/properties");
  revalidatePath(pathFor(propertyId));
  revalidatePath("/admin/equipment");
  revalidatePath("/admin/winter-service");
  revalidatePath("/app/today");
  revalidatePath("/app/properties");
  revalidatePath("/portal/properties");
  if (mutation === "unchanged") {
    go(propertyId, "status", "Die Immobilie hat bereits den gewählten Status.");
  }
  go(propertyId, "status", "Immobilienstatus wurde aktualisiert.");
}

export async function updateBuildingStatusAction(formData: FormData) {
  const { supabase } = await requireAdminContext();
  const propertyId = formValue(formData, "propertyId");
  const buildingId = formValue(formData, "buildingId");
  const status = formValue(formData, "status");
  const expectedStatus = formValue(formData, "expectedStatus");
  if (
    !isUuid(propertyId) ||
    !isUuid(buildingId) ||
    !["active", "archived"].includes(status) ||
    !["active", "archived"].includes(expectedStatus)
  ) {
    go(propertyId, "error", "Ungültige Gebäudestatusänderung.");
  }

  const { data: mutation, error } = await supabase.rpc("set_building_status", {
    p_property_id: propertyId,
    p_building_id: buildingId,
    p_status: status,
    p_expected_status: expectedStatus,
  });
  if (error) {
    go(
      propertyId,
      "error",
      status === "archived"
        ? "Das Gebäude konnte nicht archiviert werden. Es muss mindestens ein aktives Gebäude verbleiben; entfernen Sie außerdem zuerst aktive Leistungs-, Equipment-, Plan- und Einsatzbezüge."
        : "Das Gebäude konnte nicht reaktiviert werden. Bitte laden Sie die Seite neu und prüfen Sie den Immobilienstatus.",
    );
  }

  revalidatePath(pathFor(propertyId));
  if (mutation === "unchanged") {
    go(propertyId, "status", "Das Gebäude hat bereits den gewählten Status.");
  }
  go(propertyId, "status", "Gebäudestatus wurde aktualisiert.");
}
