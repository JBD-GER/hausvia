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

const { escapeHausviaEmailHtml, renderHausviaEmail } = await import("./hausviaEmail.ts");

test("escaped sämtliche dynamischen HTML-Inhalte und verwirft unsichere CTA-URLs", () => {
  assert.equal(
    escapeHausviaEmailHtml(`<script data-value="x">Tom & Jerry's</script>`),
    "&lt;script data-value=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/script&gt;",
  );

  const { html } = renderHausviaEmail({
    preheader: `Vorschau <b>jetzt</b>`,
    eyebrow: `Dokument & Service`,
    headline: `<script>alert("headline")</script>`,
    intro: `Hallo <img src=x onerror=alert(1)> & willkommen`,
    note: `Hinweis: "sicher"`,
    summary: {
      title: `Preis <script>`,
      rows: [{ label: `Fläche <b>`, value: `100 m² & mehr` }],
    },
    attachment: {
      filename: `rechnung"><img src=x>.pdf`,
      portalUrl: "javascript:alert(1)",
    },
    action: {
      label: `Nicht <b>öffnen</b>`,
      href: "javascript:alert(1)",
    },
  });

  assert.doesNotMatch(html, /<script>alert/);
  assert.doesNotMatch(html, /<img src=x/);
  assert.doesNotMatch(html, /javascript:/);
  assert.doesNotMatch(html, /Preis <script>/);
  assert.match(html, /Preis &lt;script&gt;/);
  assert.match(html, /100 m² &amp; mehr/);
  assert.match(html, /&lt;script&gt;alert\(&quot;headline&quot;\)&lt;\/script&gt;/);
  assert.match(html, /rechnung&quot;&gt;&lt;img src=x&gt;\.pdf/);
  assert.doesNotMatch(html, /Nicht &lt;b&gt;öffnen/);
});

test("liefert ein vollständiges responsives Hausvia E-Mail-Design", () => {
  const { html } = renderHausviaEmail({
    preheader: "Ihr Angebot ist da",
    eyebrow: "Ihr Hausvia Dokument",
    headline: "Ihr Angebot ist bereit",
    intro: "Wir haben das Dokument für Sie vorbereitet.",
    note: "Bitte prüfen Sie den Leistungsumfang.",
    attachment: {
      filename: "ANG-2026-001-angebot-hausvia.pdf",
      portalUrl: "https://www.hausvia.de/portal/offers",
    },
    action: {
      label: "Angebot im Portal öffnen",
      href: "https://www.hausvia.de/portal/offers",
    },
  });

  assert.match(html, /^<!doctype html>/);
  assert.match(html, /<html lang="de">/);
  assert.match(html, /name="viewport"/);
  assert.match(html, /@media only screen and \(max-width: 680px\)/);
  assert.match(html, /role="presentation"/);
  assert.match(html, /display:none;max-height:0/);
  assert.match(html, /background:#082b61/);
  assert.match(html, /background:#f5c542/);
  assert.match(html, /Dokument im Anhang/);
  assert.match(html, /Im Hausvia Portal verfügbar/);
  assert.match(html, /Angebot im Portal öffnen/);
  assert.match(html, /Flaaq Holding GmbH/);
  assert.match(html, /Amtsgericht Hannover HRB 230241/);
  assert.match(html, /Impressum/);
  assert.match(html, /Datenschutz/);
});

test("erzeugt einen eigenständigen gut lesbaren Plaintext-Fallback", () => {
  const { text } = renderHausviaEmail({
    headline: "Ihre Hausvia Rechnung",
    intro: "Ihre regelmäßige Rechnung wurde erstellt.",
    note: "Bitte beachten Sie das Fälligkeitsdatum.",
    summary: {
      title: "Rechnungsübersicht",
      rows: [{ label: "Status", value: "Zur Zahlung fällig" }],
    },
    attachment: {
      filename: "RE-2026-007-rechnung-hausvia.pdf",
      portalUrl: "https://www.hausvia.de/portal/invoices",
    },
    action: {
      label: "Rechnung öffnen",
      href: "https://www.hausvia.de/portal/invoices",
    },
  });

  assert.match(text, /^HAUSVIA\nHausmeisterservice/);
  assert.match(text, /DOKUMENT\nRE-2026-007-rechnung-hausvia\.pdf/);
  assert.match(text, /Portal: https:\/\/www\.hausvia\.de\/portal\/invoices/);
  assert.match(text, /Rechnung öffnen: https:\/\/www\.hausvia\.de\/portal\/invoices/);
  assert.match(text, /Rechnungsübersicht\nStatus: Zur Zahlung fällig/);
  assert.match(text, /05761 8429666 · info@hausvia\.de/);
  assert.match(text, /Impressum: https:\/\/www\.hausvia\.de\/impressum/);
  assert.doesNotMatch(text, /<!doctype|<html|<table|&amp;/i);
  assert.ok(text.endsWith("\n"));
});
