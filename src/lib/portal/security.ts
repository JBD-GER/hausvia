import "server-only";

import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import {
  matchesUploadSignature,
  validateUploadMetadata,
} from "@/lib/portal/uploadPolicy";

// Keep Server Action uploads below Vercel's 4.5 MB request-body ceiling,
// including multipart form overhead. Larger media needs a direct-to-storage flow.
export { MAX_CHAT_FILE_BYTES, MAX_IMAGE_BYTES } from "@/lib/portal/uploadPolicy";

export function createOpaqueToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function safeHashEquals(value: string, expectedHash: string) {
  const actual = Buffer.from(sha256(value), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function qrSecret() {
  const secret = process.env.QR_TOKEN_SECRET;
  if (!secret || secret.length < 32)
    throw new Error("QR_TOKEN_SECRET muss mindestens 32 Zeichen lang sein.");
  return secret;
}

export function newQrNonce() {
  return randomUUID();
}

export function deriveBuildingQrToken(buildingId: string, nonce: string) {
  return createHmac("sha256", qrSecret())
    .update(`${buildingId}:${nonce}`)
    .digest("base64url");
}

export function validateUpload(
  file: File,
  kind: "image" | "chat" = "image",
): { ok: true } | { ok: false; message: string } {
  return validateUploadMetadata(file, kind);
}

export async function validateUploadContents(
  file: File,
  kind: "image" | "chat" = "image",
): Promise<{ ok: true } | { ok: false; message: string }> {
  const metadata = validateUpload(file, kind);
  if (!metadata.ok) return metadata;

  const bytes = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  const valid = matchesUploadSignature(bytes, file.type);

  return valid
    ? { ok: true }
    : {
        ok: false,
        message:
          "Der tatsächliche Dateiinhalt passt nicht zum angegebenen Dateityp.",
      };
}

export function safeStorageFilename(name: string, mimeType?: string) {
  const extensions: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/heic": ".heic",
    "image/heif": ".heif",
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
    "video/webm": ".webm",
    "application/pdf": ".pdf",
  };
  const originalExtension = name.includes(".")
    ? `.${name
        .split(".")
        .pop()
        ?.toLowerCase()
        .replace(/[^a-z0-9]/g, "")}`
    : "";
  const extension = (mimeType && extensions[mimeType]) || originalExtension;
  return `${Date.now()}-${randomUUID()}${extension === "." ? "" : extension}`;
}

export function normalizePlainText(value: unknown, maxLength: number) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, maxLength);
}
