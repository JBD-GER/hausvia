export const IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

export const CHAT_MIME_TYPES = [
  ...IMAGE_MIME_TYPES,
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "application/pdf",
] as const;

export const CHAT_ATTACHMENT_ACCEPT = CHAT_MIME_TYPES.join(",");
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const MAX_CHAT_FILE_BYTES = 4 * 1024 * 1024;
export const MAX_CHAT_IMAGE_SOURCE_BYTES = 30 * 1024 * 1024;
export const CHAT_IMAGE_TARGET_BYTES = Math.floor(3.5 * 1024 * 1024);

type UploadKind = "image" | "chat";

type UploadMetadata = {
  name: string;
  size: number;
  type: string;
};

type UploadValidation =
  | { ok: true }
  | { ok: false; message: string };

type ChatSelectionValidation =
  | { ok: true; optimizeImage: boolean }
  | { ok: false; message: string };

const imageMimeTypes = new Set<string>(IMAGE_MIME_TYPES);
const chatMimeTypes = new Set<string>(CHAT_MIME_TYPES);

export function isChatImageMimeType(type: string) {
  return imageMimeTypes.has(type);
}

export function validateUploadMetadata(
  file: UploadMetadata,
  kind: UploadKind = "image",
): UploadValidation {
  const allowed = kind === "chat" ? chatMimeTypes : imageMimeTypes;
  const limit = kind === "chat" ? MAX_CHAT_FILE_BYTES : MAX_IMAGE_BYTES;
  if (!file.name || file.size <= 0) {
    return { ok: false, message: "Die Datei ist leer." };
  }
  if (!allowed.has(file.type)) {
    return { ok: false, message: "Dieser Dateityp ist nicht erlaubt." };
  }
  if (file.size > limit) {
    return {
      ok: false,
      message: `Die Datei darf höchstens ${Math.round(limit / 1024 / 1024)} MB groß sein.`,
    };
  }
  return { ok: true };
}

export function validateChatAttachmentSelection(
  file: UploadMetadata,
): ChatSelectionValidation {
  if (!file.name || file.size <= 0) {
    return { ok: false, message: "Die Datei ist leer." };
  }
  if (!chatMimeTypes.has(file.type)) {
    return { ok: false, message: "Dieser Dateityp ist nicht erlaubt." };
  }
  if (file.size <= MAX_CHAT_FILE_BYTES) {
    return { ok: true, optimizeImage: false };
  }
  if (!isChatImageMimeType(file.type)) {
    return {
      ok: false,
      message: "Videos und PDF-Dateien dürfen höchstens 4 MB groß sein.",
    };
  }
  if (file.size > MAX_CHAT_IMAGE_SOURCE_BYTES) {
    return {
      ok: false,
      message: "Das Foto darf vor der automatischen Optimierung höchstens 30 MB groß sein.",
    };
  }
  return { ok: true, optimizeImage: true };
}

function startsWith(bytes: Uint8Array, signature: number[], offset = 0) {
  return signature.every((value, index) => bytes[offset + index] === value);
}

export function matchesUploadSignature(bytes: Uint8Array, mimeType: string) {
  const ascii = new TextDecoder("ascii").decode(bytes);
  return (
    (mimeType === "image/jpeg" && startsWith(bytes, [0xff, 0xd8, 0xff])) ||
    (mimeType === "image/png" &&
      startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ||
    (mimeType === "image/webp" &&
      ascii.startsWith("RIFF") &&
      ascii.slice(8, 12) === "WEBP") ||
    (["image/heic", "image/heif"].includes(mimeType) &&
      ascii.slice(4, 8) === "ftyp") ||
    (["video/mp4", "video/quicktime"].includes(mimeType) &&
      ascii.slice(4, 8) === "ftyp") ||
    (mimeType === "video/webm" &&
      startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) ||
    (mimeType === "application/pdf" && ascii.startsWith("%PDF-"))
  );
}
