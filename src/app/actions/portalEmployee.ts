"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireEmployeeContext } from "@/lib/portal/access";
import { uploadPortalFile } from "@/lib/portal/files";
import { validateUploadContents } from "@/lib/portal/security";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  damageSchema,
  firstZodError,
  formValue,
  messageSchema,
  operationalReportSchema,
} from "@/lib/portal/validation";

function go(path: string, key: "status" | "error", value: string): never {
  redirect(`${path}?${key}=${encodeURIComponent(value)}`);
}

export async function startVisitAction(formData: FormData) {
  const { supabase } = await requireEmployeeContext();
  const visitId = formValue(formData, "visitId");
  if (!visitId) go("/app/today", "error", "Einsatz wurde nicht gefunden.");
  const { data, error } = await supabase.rpc("start_visit", {
    p_visit_id: visitId,
  });
  if (error)
    go(
      `/app/visits/${visitId}`,
      "error",
      error.message || "Der Einsatz konnte nicht gestartet werden.",
    );
  revalidatePath("/app/today");
  revalidatePath(`/app/visits/${visitId}`);
  redirect(
    `/app/visits/${visitId}?status=started&server=${encodeURIComponent(String(data ?? ""))}`,
  );
}

export async function updateVisitTaskAction(formData: FormData) {
  const { profile, supabase } = await requireEmployeeContext();
  const visitId = formValue(formData, "visitId");
  const taskId = formValue(formData, "taskId");
  const status = formValue(formData, "status");
  const blockedReason = formValue(formData, "blockedReason");
  if (
    !visitId ||
    !taskId ||
    !["open", "in_progress", "done", "blocked"].includes(status)
  ) {
    go(`/app/visits/${visitId}`, "error", "Ungültige Aufgabenänderung.");
  }
  if (status === "blocked" && blockedReason.length < 3) {
    go(
      `/app/visits/${visitId}`,
      "error",
      "Bei „nicht ausführbar“ ist eine Begründung erforderlich.",
    );
  }

  const { data: task, error: taskError } = await supabase
    .from("visit_tasks")
    .select("id,photo_required")
    .eq("id", taskId)
    .eq("visit_id", visitId)
    .maybeSingle();
  if (taskError || !task)
    go(`/app/visits/${visitId}`, "error", "Aufgabe wurde nicht gefunden.");

  const file = formData.get("photo");
  let uploaded: Awaited<ReturnType<typeof uploadPortalFile>> | null = null;
  let attachmentId: string | null = null;
  if (file instanceof File && file.size > 0) {
    try {
      uploaded = await uploadPortalFile({
        client: supabase,
        bucket: "visit-task-attachments",
        ownerPath: `${profile.id}/${visitId}/${taskId}`,
        file,
      });
    } catch (error) {
      go(
        `/app/visits/${visitId}`,
        "error",
        error instanceof Error
          ? error.message
          : "Foto konnte nicht gespeichert werden.",
      );
    }
  }
  if (status === "done" && task.photo_required && !uploaded) {
    const { count, error: countError } = await supabase
      .from("visit_task_attachments")
      .select("id", { count: "exact", head: true })
      .eq("visit_task_id", taskId);
    if (countError || !count)
      go(
        `/app/visits/${visitId}`,
        "error",
        "Für diese Aufgabe ist ein Foto erforderlich.",
      );
  }

  if (uploaded) {
    const { data: attachment, error: attachmentError } = await supabase
      .from("visit_task_attachments")
      .insert({
        visit_task_id: taskId,
        bucket: uploaded.bucket,
        path: uploaded.path,
        filename: uploaded.filename,
        mime_type: uploaded.mimeType,
        size_bytes: uploaded.size,
        uploaded_by: profile.id,
      })
      .select("id")
      .single();
    if (attachmentError || !attachment) {
      await supabase.storage.from(uploaded.bucket).remove([uploaded.path]);
      go(
        `/app/visits/${visitId}`,
        "error",
        "Das Foto konnte nicht sicher mit der Aufgabe verknüpft werden.",
      );
    }
    attachmentId = attachment.id;
  }
  const { error } = await supabase
    .from("visit_tasks")
    .update({
      status,
      blocked_reason: status === "blocked" ? blockedReason : null,
      completed_at:
        status === "done" || status === "blocked"
          ? new Date().toISOString()
          : null,
      completed_by:
        status === "done" || status === "blocked" ? profile.id : null,
    })
    .eq("id", taskId)
    .eq("visit_id", visitId);
  if (error) {
    if (uploaded) {
      const admin = createSupabaseAdminClient();
      if (attachmentId) {
        await admin
          .from("visit_task_attachments")
          .delete()
          .eq("id", attachmentId)
          .eq("uploaded_by", profile.id);
      }
      await admin.storage.from(uploaded.bucket).remove([uploaded.path]);
    }
    go(
      `/app/visits/${visitId}`,
      "error",
      "Aufgabe konnte nicht aktualisiert werden.",
    );
  }
  revalidatePath(`/app/visits/${visitId}`);
}

export async function completeVisitAction(formData: FormData) {
  const { supabase } = await requireEmployeeContext();
  const visitId = formValue(formData, "visitId");
  const { error } = await supabase.rpc("complete_visit", {
    p_visit_id: visitId,
  });
  if (error)
    go(
      `/app/visits/${visitId}`,
      "error",
      error.message || "Der Einsatz kann noch nicht abgeschlossen werden.",
    );
  revalidatePath("/app/today");
  revalidatePath("/app/time");
  revalidatePath(`/app/visits/${visitId}`);
  redirect(`/app/visits/${visitId}?status=completed`);
}

export async function createOperationalReportAction(formData: FormData) {
  const { profile, employee, supabase } = await requireEmployeeContext();
  const parsed = operationalReportSchema.safeParse({
    propertyId: formValue(formData, "propertyId"),
    buildingId: formValue(formData, "buildingId"),
    equipmentId: formValue(formData, "equipmentId"),
    visitId: formValue(formData, "visitId"),
    category: formValue(formData, "category"),
    urgency: formValue(formData, "urgency") || "normal",
    title: formValue(formData, "title"),
    description: formValue(formData, "description"),
  });
  const fallback = formValue(formData, "visitId")
    ? `/app/visits/${formValue(formData, "visitId")}`
    : "/app/properties";
  if (!parsed.success) go(fallback, "error", firstZodError(parsed.error));
  const value = parsed.data;
  const file = formData.get("photo");
  if (file instanceof File && file.size > 0) {
    const validation = await validateUploadContents(file, "image");
    if (!validation.ok) go(fallback, "error", validation.message);
  }
  const [
    visitResult,
    buildingResult,
    visitBuildingResult,
    equipmentResult,
  ] = await Promise.all([
    value.visitId
      ? supabase
          .from("visits")
          .select("id")
          .eq("id", value.visitId)
          .eq("property_id", value.propertyId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    value.buildingId
      ? supabase
          .from("buildings")
          .select("id")
          .eq("id", value.buildingId)
          .eq("property_id", value.propertyId)
          .eq("status", "active")
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    value.visitId && value.buildingId
      ? supabase
          .from("visit_buildings")
          .select("building_id")
          .eq("visit_id", value.visitId)
          .eq("building_id", value.buildingId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    value.equipmentId
      ? value.visitId
        ? supabase
            .from("visit_equipment")
            .select("equipment_id")
            .eq("visit_id", value.visitId)
            .eq("equipment_id", value.equipmentId)
            .maybeSingle()
        : supabase
            .from("property_equipment")
            .select("equipment_id")
            .eq("property_id", value.propertyId)
            .eq("equipment_id", value.equipmentId)
            .eq("active", true)
            .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (
    visitResult.error ||
    buildingResult.error ||
    visitBuildingResult.error ||
    equipmentResult.error ||
    (value.visitId && !visitResult.data) ||
    (value.buildingId && !buildingResult.data) ||
    (value.visitId && value.buildingId && !visitBuildingResult.data) ||
    (value.equipmentId && !equipmentResult.data)
  ) {
    go(
      fallback,
      "error",
      "Einsatz, Gebäude oder Equipment gehört nicht zu dieser Meldung.",
    );
  }
  const { data: report, error } = await supabase
    .from("operational_reports")
    .insert({
      property_id: value.propertyId,
      building_id: value.buildingId || null,
      equipment_id: value.equipmentId || null,
      visit_id: value.visitId || null,
      employee_id: employee.id,
      created_by: profile.id,
      category: value.category,
      urgency: value.urgency,
      title: value.title,
      description: value.description,
      status: "new",
    })
    .select("id")
    .single();
  if (error || !report)
    go(fallback, "error", "Meldung konnte nicht gespeichert werden.");

  if (file instanceof File && file.size > 0) {
    let uploadedPath: string | null = null;
    try {
      const uploaded = await uploadPortalFile({
        client: supabase,
        bucket: "operational-report-attachments",
        ownerPath: `${profile.id}/${report.id}`,
        file,
      });
      uploadedPath = uploaded.path;
      const { error: attachmentError } = await supabase
        .from("operational_report_attachments")
        .insert({
        operational_report_id: report.id,
        bucket: uploaded.bucket,
        path: uploaded.path,
        filename: uploaded.filename,
        mime_type: uploaded.mimeType,
        size_bytes: uploaded.size,
        uploaded_by: profile.id,
      });
      if (attachmentError) throw attachmentError;
    } catch (uploadError) {
      const admin = createSupabaseAdminClient();
      if (uploadedPath) {
        await admin.storage
          .from("operational-report-attachments")
          .remove([uploadedPath]);
      }
      await admin
        .from("notifications")
        .delete()
        .eq("entity_type", "operational_reports")
        .eq("entity_id", report.id);
      await admin
        .from("operational_reports")
        .delete()
        .eq("id", report.id)
        .eq("created_by", profile.id);
      go(
        fallback,
        "error",
        uploadError instanceof Error
          ? `Die Meldung wurde nicht gespeichert: ${uploadError.message}`
          : "Meldung und Foto konnten nicht sicher gespeichert werden.",
      );
    }
  }
  revalidatePath(fallback);
  go(fallback, "status", "Betriebliche Meldung wurde übermittelt.");
}

export async function createEmployeeDamageAction(formData: FormData) {
  const { profile, supabase } = await requireEmployeeContext();
  const parsed = damageSchema.safeParse({
    buildingId: formValue(formData, "buildingId"),
    title: formValue(formData, "title"),
    description: formValue(formData, "description"),
    priority: formValue(formData, "priority") || "normal",
  });
  const visitId = formValue(formData, "visitId");
  const fallback = visitId ? `/app/visits/${visitId}` : "/app/properties";
  if (!parsed.success) go(fallback, "error", firstZodError(parsed.error));
  const image = formData.get("image");
  if (image instanceof File && image.size > 0) {
    const validation = await validateUploadContents(image, "image");
    if (!validation.ok) go(fallback, "error", validation.message);
  }
  const { data: building } = await supabase
    .from("buildings")
    .select("property_id")
    .eq("id", parsed.data.buildingId)
    .single();
  if (!building) go(fallback, "error", "Gebäude ist nicht verfügbar.");
  if (visitId) {
    const { data: visitBuilding, error: visitBuildingError } = await supabase
      .from("visit_buildings")
      .select("building_id")
      .eq("visit_id", visitId)
      .eq("building_id", parsed.data.buildingId)
      .maybeSingle();
    if (visitBuildingError || !visitBuilding) {
      go(
        fallback,
        "error",
        "Das ausgewählte Gebäude gehört nicht zu diesem Einsatz.",
      );
    }
  }
  const { data: damage, error } = await supabase
    .from("damage_reports")
    .insert({
      property_id: building.property_id,
      building_id: parsed.data.buildingId,
      source: "employee",
      title: parsed.data.title,
      description: parsed.data.description,
      priority: parsed.data.priority,
      status: "new",
      created_by: profile.id,
      planned_next_visit: true,
    })
    .select("id")
    .single();
  if (error || !damage)
    go(fallback, "error", "Schaden konnte nicht gespeichert werden.");
  let attachmentFailed = false;
  if (image instanceof File && image.size > 0) {
    let uploadedPath: string | null = null;
    try {
      const uploaded = await uploadPortalFile({
        client: supabase,
        bucket: "damage-attachments",
        ownerPath: `${profile.id}/${building.property_id}/${damage.id}`,
        file: image,
      });
      uploadedPath = uploaded.path;
      const { error: attachmentError } = await supabase
        .from("damage_attachments")
        .insert({
          damage_report_id: damage.id,
          bucket: uploaded.bucket,
          path: uploaded.path,
          filename: uploaded.filename,
          mime_type: uploaded.mimeType,
          size_bytes: uploaded.size,
          uploaded_by: profile.id,
        });
      attachmentFailed = Boolean(attachmentError);
    } catch {
      attachmentFailed = true;
    }
    if (attachmentFailed && uploadedPath) {
      const admin = createSupabaseAdminClient();
      await admin.storage.from("damage-attachments").remove([uploadedPath]);
    }
  }
  revalidatePath(fallback);
  go(
    fallback,
    "status",
    attachmentFailed
      ? "Der Schaden wurde gemeldet; nur das optionale Bild konnte nicht gespeichert werden."
      : "Schaden wurde gemeldet.",
  );
}

export async function sendEmployeePropertyMessageAction(formData: FormData) {
  const { profile, supabase } = await requireEmployeeContext();
  const parsed = messageSchema.safeParse({
    propertyId: formValue(formData, "propertyId"),
    body: formValue(formData, "body"),
  });
  const fallback = `/app/properties/${formValue(formData, "propertyId")}`;
  if (!parsed.success) go(fallback, "error", firstZodError(parsed.error));
  const file = formData.get("attachment");
  if (file instanceof File && file.size > 0) {
    const validation = await validateUploadContents(file, "chat");
    if (!validation.ok) go(fallback, "error", validation.message);
  }
  const { data: message, error } = await supabase
    .from("property_messages")
    .insert({
      property_id: parsed.data.propertyId,
      sender_id: profile.id,
      body: parsed.data.body,
      message_type: "user",
    })
    .select("id")
    .single();
  if (error || !message)
    go(fallback, "error", "Nachricht konnte nicht gesendet werden.");
  if (file instanceof File && file.size > 0) {
    let uploadedPath: string | null = null;
    try {
      const uploaded = await uploadPortalFile({
        client: supabase,
        bucket: "property-message-attachments",
        ownerPath: `${parsed.data.propertyId}/${message.id}`,
        file,
        kind: "chat",
      });
      uploadedPath = uploaded.path;
      const { error: attachmentError } = await supabase
        .from("message_attachments")
        .insert({
        message_id: message.id,
        bucket: uploaded.bucket,
        path: uploaded.path,
        filename: uploaded.filename,
        mime_type: uploaded.mimeType,
        size_bytes: uploaded.size,
        uploaded_by: profile.id,
      });
      if (attachmentError) throw attachmentError;
    } catch (uploadError) {
      const admin = createSupabaseAdminClient();
      if (uploadedPath) {
        await admin.storage
          .from("property-message-attachments")
          .remove([uploadedPath]);
      }
      await admin
        .from("property_messages")
        .delete()
        .eq("id", message.id)
        .eq("sender_id", profile.id);
      go(
        fallback,
        "error",
        uploadError instanceof Error
          ? `Nachricht wurde nicht gesendet: ${uploadError.message}`
          : "Nachricht und Datei konnten nicht gespeichert werden.",
      );
    }
  }
  revalidatePath(fallback);
}

export async function markEmployeeNotificationReadAction(formData: FormData) {
  const { profile, supabase } = await requireEmployeeContext();
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", formValue(formData, "notificationId"))
    .eq("recipient_id", profile.id);
  revalidatePath("/app/notifications");
}
