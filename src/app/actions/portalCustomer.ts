"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCustomerContext } from "@/lib/portal/access";
import { uploadPortalFile } from "@/lib/portal/files";
import {
  MAX_IMAGE_BYTES,
  validateUploadContents,
} from "@/lib/portal/security";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  complaintSchema,
  damageSchema,
  firstZodError,
  formValue,
  messageSchema,
} from "@/lib/portal/validation";

function go(path: string, key: "status" | "error", value: string): never {
  redirect(`${path}?${key}=${encodeURIComponent(value)}`);
}

const MAX_COMPLAINT_IMAGES = 8;

function complaintImages(formData: FormData) {
  return formData
    .getAll("images")
    .filter(
      (entry): entry is File => entry instanceof File && entry.size > 0,
    );
}

export async function sendCustomerPropertyMessageAction(formData: FormData) {
  const { profile, supabase } = await requireCustomerContext();
  const propertyId = formValue(formData, "propertyId");
  const fallback = `/portal/properties/${propertyId}`;
  const parsed = messageSchema.safeParse({
    propertyId,
    body: formValue(formData, "body"),
  });
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

export async function createCustomerComplaintAction(formData: FormData) {
  const { profile, supabase } = await requireCustomerContext();
  const propertyId = formValue(formData, "propertyId");
  const fallback = `/portal/properties/${propertyId}`;
  const parsed = complaintSchema.safeParse({
    propertyId,
    visitId: formValue(formData, "visitId"),
    title: formValue(formData, "title"),
    description: formValue(formData, "description"),
  });
  if (!parsed.success) go(fallback, "error", firstZodError(parsed.error));

  const images = complaintImages(formData);
  if (images.length > MAX_COMPLAINT_IMAGES) {
    go(
      fallback,
      "error",
      `Bitte wählen Sie höchstens ${MAX_COMPLAINT_IMAGES} Bilder aus.`,
    );
  }
  const totalImageBytes = images.reduce((total, image) => total + image.size, 0);
  if (totalImageBytes > MAX_IMAGE_BYTES) {
    go(
      fallback,
      "error",
      `Alle Bilder zusammen dürfen höchstens ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)} MB groß sein.`,
    );
  }
  for (const image of images) {
    const validation = await validateUploadContents(image, "image");
    if (!validation.ok) go(fallback, "error", validation.message);
  }

  if (parsed.data.visitId) {
    const { data: visit, error: visitError } = await supabase
      .from("visits")
      .select("id")
      .eq("id", parsed.data.visitId)
      .eq("property_id", parsed.data.propertyId)
      .eq("status", "completed")
      .maybeSingle();
    if (visitError || !visit) {
      go(
        fallback,
        "error",
        "Der ausgewählte Einsatz ist für diese Beschwerde nicht verfügbar.",
      );
    }
  }

  const { data: complaint, error } = await supabase
    .from("complaints")
    .insert({
      property_id: parsed.data.propertyId,
      visit_id: parsed.data.visitId || null,
      submitted_by: profile.id,
      title: parsed.data.title,
      description: parsed.data.description,
      status: "new",
    })
    .select("id")
    .single();
  if (error || !complaint)
    go(fallback, "error", "Beschwerde konnte nicht übermittelt werden.");

  const uploadedImages: Array<
    Awaited<ReturnType<typeof uploadPortalFile>>
  > = [];
  let attachmentFailure: unknown = null;
  try {
    for (const image of images) {
      const uploaded = await uploadPortalFile({
        client: supabase,
        bucket: "complaint-attachments",
        ownerPath: `${profile.id}/${complaint.id}`,
        file: image,
      });
      uploadedImages.push(uploaded);
    }
    if (uploadedImages.length) {
      const { error: attachmentError } = await supabase
        .from("complaint_attachments")
        .insert(
          uploadedImages.map((uploaded) => ({
            complaint_id: complaint.id,
            bucket: uploaded.bucket,
            path: uploaded.path,
            filename: uploaded.filename,
            mime_type: uploaded.mimeType,
            size_bytes: uploaded.size,
            uploaded_by: profile.id,
          })),
        );
      if (attachmentError) throw attachmentError;
    }
  } catch (uploadError) {
    attachmentFailure = uploadError;
  }

  if (attachmentFailure) {
    const admin = createSupabaseAdminClient();
    const cleanupErrors: unknown[] = [];
    const { error: attachmentCleanupError } = await admin
      .from("complaint_attachments")
      .delete()
      .eq("complaint_id", complaint.id);
    if (attachmentCleanupError) cleanupErrors.push(attachmentCleanupError);
    if (uploadedImages.length) {
      const { error: storageCleanupError } = await admin.storage
        .from("complaint-attachments")
        .remove(uploadedImages.map((uploaded) => uploaded.path));
      if (storageCleanupError) cleanupErrors.push(storageCleanupError);
    }
    const { error: notificationCleanupError } = await admin
      .from("notifications")
      .delete()
      .eq("entity_type", "complaints")
      .eq("entity_id", complaint.id);
    if (notificationCleanupError) cleanupErrors.push(notificationCleanupError);
    const { error: complaintCleanupError } = await admin
      .from("complaints")
      .delete()
      .eq("id", complaint.id)
      .eq("submitted_by", profile.id);
    if (complaintCleanupError) cleanupErrors.push(complaintCleanupError);
    if (cleanupErrors.length) {
      console.error("[Hausvia complaint] Compensation cleanup failed", {
        complaintId: complaint.id,
        errors: cleanupErrors,
      });
    }
    go(
      fallback,
      "error",
      "Beschwerde und Bilder konnten nicht vollständig gespeichert werden. Bitte versuchen Sie es erneut.",
    );
  }

  revalidatePath(fallback);
  revalidatePath(`/admin/properties/${parsed.data.propertyId}`);
  go(
    fallback,
    "status",
    images.length === 1
      ? "Ihre Beschwerde mit Bild wurde vertraulich an Hausvia übermittelt."
      : images.length > 1
        ? `Ihre Beschwerde mit ${images.length} Bildern wurde vertraulich an Hausvia übermittelt.`
        : "Ihre Beschwerde wurde vertraulich an Hausvia übermittelt.",
  );
}

export async function createCustomerDamageAction(formData: FormData) {
  const { profile, supabase } = await requireCustomerContext();
  const buildingId = formValue(formData, "buildingId");
  const propertyId = formValue(formData, "propertyId");
  const fallback = `/portal/properties/${propertyId}`;
  const parsed = damageSchema.safeParse({
    buildingId,
    title: formValue(formData, "title"),
    description: formValue(formData, "description"),
    priority: formValue(formData, "priority") || "normal",
  });
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
    .eq("property_id", propertyId)
    .maybeSingle();
  if (!building)
    go(fallback, "error", "Das Gebäude gehört nicht zu dieser Immobilie.");
  const { data: damage, error } = await supabase
    .from("damage_reports")
    .insert({
      property_id: building.property_id,
      building_id: parsed.data.buildingId,
      source: "customer",
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
    go(fallback, "error", "Schaden konnte nicht gemeldet werden.");
  let attachmentFailed = false;
  if (image instanceof File && image.size > 0) {
    try {
      const uploaded = await uploadPortalFile({
        client: supabase,
        bucket: "damage-attachments",
        ownerPath: `${profile.id}/${building.property_id}/${damage.id}`,
        file: image,
      });
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

export async function markCustomerNotificationReadAction(formData: FormData) {
  const { profile, supabase } = await requireCustomerContext();
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", formValue(formData, "notificationId"))
    .eq("recipient_id", profile.id);
  revalidatePath("/portal/notifications");
}
