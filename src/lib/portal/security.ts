import "server-only";

import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

const IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);
const CHAT_MIME_TYPES = new Set([
  ...IMAGE_MIME_TYPES,
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "application/pdf",
]);

// Keep Server Action uploads below Vercel's 4.5 MB request-body ceiling,
// including multipart form overhead. Larger media needs a direct-to-storage flow.
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const MAX_CHAT_FILE_BYTES = 4 * 1024 * 1024;

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
  const allowed = kind === "chat" ? CHAT_MIME_TYPES : IMAGE_MIME_TYPES;
  const limit = kind === "chat" ? MAX_CHAT_FILE_BYTES : MAX_IMAGE_BYTES;
  if (!file.name || file.size <= 0)
    return { ok: false, message: "Die Datei ist leer." };
  if (!allowed.has(file.type))
    return { ok: false, message: "Dieser Dateityp ist nicht erlaubt." };
  if (file.size > limit)
    return {
      ok: false,
      message: `Die Datei darf höchstens ${Math.round(limit / 1024 / 1024)} MB groß sein.`,
    };
  return { ok: true };
}

function startsWith(bytes: Uint8Array, signature: number[], offset = 0) {
  return signature.every((value, index) => bytes[offset + index] === value);
}

export async function validateUploadContents(
  file: File,
  kind: "image" | "chat" = "image",
): Promise<{ ok: true } | { ok: false; message: string }> {
  const metadata = validateUpload(file, kind);
  if (!metadata.ok) return metadata;

  const bytes = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  const ascii = new TextDecoder("ascii").decode(bytes);
  const valid =
    (file.type === "image/jpeg" && startsWith(bytes, [0xff, 0xd8, 0xff])) ||
    (file.type === "image/png" &&
      startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ||
    (file.type === "image/webp" &&
      ascii.startsWith("RIFF") &&
      ascii.slice(8, 12) === "WEBP") ||
    (["image/heic", "image/heif"].includes(file.type) &&
      ascii.slice(4, 8) === "ftyp") ||
    (["video/mp4", "video/quicktime"].includes(file.type) &&
      ascii.slice(4, 8) === "ftyp") ||
    (file.type === "video/webm" &&
      startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) ||
    (file.type === "application/pdf" && ascii.startsWith("%PDF-"));

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
