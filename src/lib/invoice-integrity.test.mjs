import assert from "node:assert/strict";
import test from "node:test";
import {
  canCancelInvoice,
  canMarkInvoicePaid,
  canRoleDownloadInvoice,
  hasPartialStoredInvoiceOriginal,
  hasStoredInvoiceOriginal,
  invoiceErrorDescription,
  invoicePdfSha256,
  invoiceRecipientEmail,
  isInvoiceContentImmutable,
  normalizeInvoiceCancellationReason,
  safeInvoicePdfFilename,
  verifyInvoicePdfSha256,
} from "./invoiceIntegrity.ts";

test("nur ein manueller Rechnungsentwurf ohne Original bleibt bearbeitbar", () => {
  assert.equal(
    isInvoiceContentImmutable({
      status: "draft",
      invoice_kind: "manual",
      billing_month: null,
      immutable_at: null,
      original_pdf_bucket: null,
      original_pdf_path: null,
    }),
    false,
  );
  assert.equal(
    isInvoiceContentImmutable({ status: "draft", invoice_kind: "regular" }),
    true,
  );
  assert.equal(
    isInvoiceContentImmutable({
      status: "released",
      invoice_kind: "manual",
      invoice_cycle_id: "legacy-cycle-id",
    }),
    true,
  );
  assert.equal(
    isInvoiceContentImmutable({ status: "open", billing_month: "2026-07-01" }),
    true,
  );
  assert.equal(
    isInvoiceContentImmutable({ status: "draft", immutable_at: "2026-08-05T08:00:00Z" }),
    true,
  );
  assert.equal(
    isInvoiceContentImmutable({
      status: "draft",
      invoice_kind: "manual",
      original_pdf_bucket: "invoice-pdfs",
      original_pdf_path: null,
    }),
    true,
  );
});

test("Originalverweis muss vollständig sein", () => {
  assert.equal(
    hasStoredInvoiceOriginal({
      original_pdf_bucket: "invoice-pdfs",
      original_pdf_path: "property/invoice.pdf",
    }),
    true,
  );
  assert.equal(
    hasPartialStoredInvoiceOriginal({
      original_pdf_bucket: "invoice-pdfs",
      original_pdf_path: null,
    }),
    true,
  );
});

test("Original-PDF wird nur mit vorhandener passender SHA-256-Prüfsumme akzeptiert", () => {
  const pdf = Buffer.from("%PDF-1.7 immutable test", "utf8");
  const checksum = invoicePdfSha256(pdf);
  assert.equal(verifyInvoicePdfSha256(pdf, checksum), true);
  assert.equal(verifyInvoicePdfSha256(Buffer.from("changed"), checksum), false);
  assert.equal(verifyInvoicePdfSha256(pdf, null), false);
});

test("Versandadresse stammt ausschließlich aus dem Empfänger-Snapshot", () => {
  assert.equal(
    invoiceRecipientEmail({ email: " rechnung@example.com " }),
    "rechnung@example.com",
  );
  assert.equal(invoiceRecipientEmail({ billing_email: "other@example.com" }), null);
  assert.equal(invoiceRecipientEmail({ email: "invalid" }), null);
  assert.equal(safeInvoicePdfFilename("HV/2026 0042"), "hv-2026-0042-rechnung-hausvia.pdf");
});

test("manuelle Rechnungsstatus folgen einer engen Übergangsmatrix", () => {
  assert.equal(canMarkInvoicePaid("released"), true);
  assert.equal(canMarkInvoicePaid("open"), true);
  assert.equal(canMarkInvoicePaid("overdue"), true);
  assert.equal(canMarkInvoicePaid("draft"), false);
  assert.equal(canMarkInvoicePaid("paid"), false);
  assert.equal(canMarkInvoicePaid("canceled"), false);

  assert.equal(canCancelInvoice("draft"), true);
  assert.equal(canCancelInvoice("open"), true);
  assert.equal(canCancelInvoice("paid"), true);
  assert.equal(canCancelInvoice("canceled"), false);
  assert.equal(canCancelInvoice("unknown"), false);
});

test("Mitarbeiter können die Rechnungs-API nicht verwenden", () => {
  assert.equal(canRoleDownloadInvoice("admin"), true);
  assert.equal(canRoleDownloadInvoice("customer"), true);
  assert.equal(canRoleDownloadInvoice("employee"), false);
  assert.equal(canRoleDownloadInvoice(undefined), false);
});

test("Stornogrund ist verpflichtend und begrenzt", () => {
  assert.equal(normalizeInvoiceCancellationReason(" Kunde widerspricht "), "Kunde widerspricht");
  assert.equal(normalizeInvoiceCancellationReason("nein"), null);
  assert.equal(normalizeInvoiceCancellationReason("x".repeat(1_001)), null);
});

test("gespeicherte Abrechnungsfehler erhalten verständliche Admin-Hinweise", () => {
  assert.match(invoiceErrorDescription("required_data"), /Pflichtangaben/);
  assert.match(invoiceErrorDescription("invoice_pdf_integrity"), /Prüfsumme/);
  assert.match(invoiceErrorDescription("processing:123"), /aktuell verarbeitet/);
  assert.match(invoiceErrorDescription("future_code"), /internen Fehlercode/);
});
