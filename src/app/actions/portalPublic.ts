"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  damageSchema,
  firstZodError,
  formValue,
} from "@/lib/portal/validation";
import {
  normalizePlainText,
  safeStorageFilename,
  sha256,
  validateUploadContents,
} from "@/lib/portal/security";

function failed(token: string, message: string): never {
  redirect(
    `/meldung/${encodeURIComponent(token)}?error=${encodeURIComponent(message)}`,
  );
}

export async function submitPublicDamageAction(formData: FormData) {
  const token = formValue(formData, "token");
  if (!token || token.length > 200) redirect("/meldung/ungueltig");
  const admin = createSupabaseAdminClient();
  const tokenHash = sha256(token);
  const { data: building } = await admin
    .from("buildings")
    .select(
      "id,property_id,status,properties!inner(status)",
    )
    .eq("qr_token_hash", tokenHash)
    .eq("status", "active")
    .eq("properties.status", "active")
    .maybeSingle();
  if (!building || !building.properties) redirect("/meldung/ungueltig");

  const parsed = damageSchema.safeParse({
    buildingId: building.id,
    title: formValue(formData, "title"),
    description: formValue(formData, "description"),
    priority: "normal",
  });
  if (!parsed.success) failed(token, firstZodError(parsed.error));
  const image = formData.get("image");
  if (image instanceof File && image.size > 0) {
    const validation = await validateUploadContents(image, "image");
    if (!validation.ok) failed(token, validation.message);
  }

  const requestHeaders = await headers();
  const forwardedFor =
    requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const userAgent = requestHeaders.get("user-agent") || "unknown";
  const rateSecret =
    process.env.PUBLIC_FORM_RATE_LIMIT_SECRET || process.env.QR_TOKEN_SECRET;
  if (!rateSecret || rateSecret.length < 32) {
    failed(
      token,
      "Das Formular ist vorübergehend nicht verfügbar. Bitte versuchen Sie es später erneut.",
    );
  }
  const fingerprint = sha256(
    `${rateSecret}|${forwardedFor}|${userAgent}|${tokenHash}`,
  );
  const { data: allowed, error: rateError } = await admin.rpc(
    "consume_public_submission_limit",
    {
      p_fingerprint: fingerprint,
      p_limit: 5,
      p_window_minutes: 15,
    },
  );
  if (rateError || allowed !== true) {
    failed(
      token,
      "Zu viele Versuche. Bitte warten Sie 15 Minuten und versuchen Sie es erneut.",
    );
  }

  const { data: damageId, error } = await admin.rpc("create_public_damage", {
    p_property_id: building.property_id,
    p_building_id: building.id,
    p_title: normalizePlainText(parsed.data.title, 180),
    p_description: normalizePlainText(parsed.data.description, 5_000),
    p_fingerprint: fingerprint,
  });
  if (error || !damageId)
    failed(
      token,
      "Die Meldung konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.",
    );

  if (image instanceof File && image.size > 0) {
    const path = `${building.property_id}/${building.id}/${damageId}/${safeStorageFilename(image.name, image.type)}`;
    let uploaded = false;
    try {
      const { error: uploadError } = await admin.storage
        .from("damage-attachments")
        .upload(path, Buffer.from(await image.arrayBuffer()), {
          contentType: image.type,
          upsert: false,
        });
      if (uploadError) throw uploadError;
      uploaded = true;
      const { error: attachmentError } = await admin
        .from("damage_attachments")
        .insert({
        damage_report_id: damageId,
        bucket: "damage-attachments",
        path,
        filename: image.name,
        mime_type: image.type,
        size_bytes: image.size,
      });
      if (attachmentError) throw attachmentError;
    } catch {
      if (uploaded) {
        await admin.storage.from("damage-attachments").remove([path]);
      }
      await admin
        .from("notifications")
        .delete()
        .eq("entity_type", "damage_reports")
        .eq("entity_id", damageId);
      await admin
        .from("property_messages")
        .delete()
        .eq("related_type", "damage_reports")
        .eq("related_id", damageId);
      const { error: cleanupError } = await admin
        .from("damage_reports")
        .delete()
        .eq("id", damageId)
        .eq("source", "public_qr");
      if (cleanupError) {
        console.error(
          "[Hausvia QR] Failed attachment compensation cleanup",
          cleanupError,
        );
      }
      failed(
        token,
        "Das Bild und die Meldung konnten nicht vollständig gespeichert werden. Bitte senden Sie die Meldung erneut.",
      );
    }
  }
  redirect("/meldung/erfolg");
}
