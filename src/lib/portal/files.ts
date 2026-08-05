import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  safeStorageFilename,
  validateUploadContents,
} from "@/lib/portal/security";

export async function uploadPortalFile({
  client,
  bucket,
  ownerPath,
  file,
  kind = "image",
}: {
  client: SupabaseClient;
  bucket: string;
  ownerPath: string;
  file: File;
  kind?: "image" | "chat";
}) {
  const validation = await validateUploadContents(file, kind);
  if (!validation.ok) throw new Error(validation.message);
  const filename = safeStorageFilename(file.name, file.type);
  const path = `${ownerPath}/${filename}`;
  const { error } = await client.storage
    .from(bucket)
    .upload(path, Buffer.from(await file.arrayBuffer()), {
      contentType: file.type,
      cacheControl: "3600",
      upsert: false,
    });
  if (error)
    throw new Error("Die Datei konnte nicht sicher gespeichert werden.");
  return {
    bucket,
    path,
    filename: file.name,
    mimeType: file.type,
    size: file.size,
  };
}

export async function createPrivateDownloadUrl(
  client: SupabaseClient,
  bucket: string,
  path: string,
  expiresIn = 300,
) {
  const { data, error } = await client.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn);
  if (error || !data?.signedUrl)
    throw new Error("Die Datei ist derzeit nicht verfügbar.");
  return data.signedUrl;
}

export async function createPrivateAttachmentUrls(
  client: SupabaseClient,
  attachments: { id: string; bucket: string; path: string }[],
  expiresIn = 300,
) {
  const entries = await Promise.all(
    attachments.map(async (attachment) => {
      try {
        const signedUrl = await createPrivateDownloadUrl(
          client,
          attachment.bucket,
          attachment.path,
          expiresIn,
        );
        return [attachment.id, signedUrl] as const;
      } catch {
        return null;
      }
    }),
  );

  return Object.fromEntries(entries.filter((entry) => entry !== null));
}
