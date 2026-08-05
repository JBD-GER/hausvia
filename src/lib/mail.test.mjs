import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const sourcePath = path.resolve("src", `${specifier.slice(2)}.ts`);
      return nextResolve(pathToFileURL(sourcePath).href, context);
    }
    return nextResolve(specifier, context);
  },
});

process.env.RESEND_API_KEY = "re_test_hausvia";
const { sendPortalDocumentEmail } = await import("./mail.ts");

test("versendet Portal-Dokumente im zentralen Hausvia-Design mit Plaintext", async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, init) => {
    request = { url, init };
    return new Response(null, { status: 200 });
  };

  try {
    await sendPortalDocumentEmail({
      to: "kunde@example.com",
      subject: "Ihre Rechnung",
      headline: `Rechnung für <Muster & Co.>`,
      intro: "Ihr Dokument ist bereit.",
      note: "Bitte prüfen Sie die Fälligkeit.",
      attachment: {
        filename: "rechnung.pdf",
        content: "UERG",
      },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(request?.url, "https://api.resend.com/emails");
  const body = JSON.parse(String(request?.init?.body));
  assert.equal(body.to, "kunde@example.com");
  assert.match(body.html, /^<!doctype html>/);
  assert.match(body.html, /https:\/\/www\.hausvia\.de\/hausvia-logo-email-2026\.png/);
  assert.match(body.html, /background:#082b61/);
  assert.match(body.html, /Rechnung für &lt;Muster &amp; Co\.&gt;/);
  assert.match(body.html, /Im Hausvia Portal öffnen/);
  assert.match(body.text, /Rechnung für <Muster & Co\.>/);
  assert.doesNotMatch(body.text, /<!doctype|<table/i);
  assert.deepEqual(body.attachments, [{ filename: "rechnung.pdf", content: "UERG" }]);
});
