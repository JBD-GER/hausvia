import assert from "node:assert/strict";
import test from "node:test";

const {
  CHAT_ATTACHMENT_ACCEPT,
  CHAT_MIME_TYPES,
  MAX_CHAT_FILE_BYTES,
  MAX_CHAT_IMAGE_SOURCE_BYTES,
  matchesUploadSignature,
  validateChatAttachmentSelection,
  validateUploadMetadata,
} = await import("./portal/uploadPolicy.ts");

function metadata(overrides = {}) {
  return {
    name: "hausvia-foto.jpg",
    size: 1024,
    type: "image/jpeg",
    ...overrides,
  };
}

test("Chat-Upload-Policy teilt Client und Server dieselben Dateitypen", () => {
  assert.equal(CHAT_ATTACHMENT_ACCEPT, CHAT_MIME_TYPES.join(","));
  assert.equal(CHAT_MIME_TYPES.includes("image/jpeg"), true);
  assert.equal(CHAT_MIME_TYPES.includes("application/pdf"), true);
  assert.equal(CHAT_MIME_TYPES.includes("image/svg+xml"), false);
});

test("Servergrenze akzeptiert exakt 4 MiB und weist jedes weitere Byte ab", () => {
  assert.deepEqual(
    validateUploadMetadata(metadata({ size: MAX_CHAT_FILE_BYTES }), "chat"),
    { ok: true },
  );
  assert.deepEqual(
    validateUploadMetadata(
      metadata({ size: MAX_CHAT_FILE_BYTES + 1 }),
      "chat",
    ),
    { ok: false, message: "Die Datei darf höchstens 4 MB groß sein." },
  );
});

test("große Fotos werden zur Optimierung zugelassen, andere große Dateien nicht", () => {
  assert.deepEqual(
    validateChatAttachmentSelection(
      metadata({ size: MAX_CHAT_FILE_BYTES + 1 }),
    ),
    { ok: true, optimizeImage: true },
  );
  assert.deepEqual(
    validateChatAttachmentSelection(
      metadata({
        name: "bericht.pdf",
        type: "application/pdf",
        size: MAX_CHAT_FILE_BYTES + 1,
      }),
    ),
    {
      ok: false,
      message: "Videos und PDF-Dateien dürfen höchstens 4 MB groß sein.",
    },
  );
  assert.equal(
    validateChatAttachmentSelection(
      metadata({ size: MAX_CHAT_IMAGE_SOURCE_BYTES + 1 }),
    ).ok,
    false,
  );
});

test("leere und nicht erlaubte Dateien werden vor dem Request gestoppt", () => {
  assert.equal(validateChatAttachmentSelection(metadata({ size: 0 })).ok, false);
  assert.deepEqual(
    validateChatAttachmentSelection(
      metadata({ name: "grafik.svg", type: "image/svg+xml" }),
    ),
    { ok: false, message: "Dieser Dateityp ist nicht erlaubt." },
  );
});

test("Dateisignaturen erkennen echte Inhalte und MIME-Spoofing", () => {
  assert.equal(
    matchesUploadSignature(
      new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
      "image/jpeg",
    ),
    true,
  );
  assert.equal(
    matchesUploadSignature(
      new TextEncoder().encode("kein echtes jpeg"),
      "image/jpeg",
    ),
    false,
  );
  assert.equal(
    matchesUploadSignature(
      new TextEncoder().encode("%PDF-1.7 Hausvia"),
      "application/pdf",
    ),
    true,
  );
});
