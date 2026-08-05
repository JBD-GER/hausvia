import assert from "node:assert/strict";
import test from "node:test";
import {
  HAUSVIA_INVOICE_EXPORT_SCHEMA,
  buildStructuredInvoiceExport,
} from "./invoiceStructuredExport.ts";

test("erzeugt eine versionierte, centgenaue Rechnungs-Exportschnittstelle", () => {
  const result = buildStructuredInvoiceExport({
    id: "invoice-1",
    invoice_number: "HV-2026-000001",
    invoice_kind: "regular",
    status: "open",
    title: "Monatsrechnung",
    invoice_date: "2026-08-01",
    due_date: "2026-08-15",
    billing_month: "2026-07-01",
    service_period_start: "2026-07-01",
    service_period_end: "2026-07-31",
    billing_note: null,
    net_total_cents: 12_000,
    tax_total_cents: 2_280,
    gross_total_cents: 14_280,
    issuer_snapshot: { legal_name: "Flaaq Holding GmbH" },
    recipient_snapshot: { recipient_name: "Musterverwaltung" },
    bank_snapshot: { iban: "snapshot" },
    immutable_at: "2026-08-01T05:15:00Z",
    document_content_sha256: "a".repeat(64),
    original_pdf_sha256: "b".repeat(64),
  }, [{
    id: "item-1",
    title: "Grundvergütung",
    description: null,
    quantity: 1,
    unit: "Monat",
    unit_net_cents: 12_000,
    total_net_cents: 12_000,
    tax_rate_bps: 1_900,
    service_date: null,
    structured_data: { kind: "monthly_fee" },
  }]);

  assert.equal(result.schema, HAUSVIA_INVOICE_EXPORT_SCHEMA);
  assert.equal(result.currency, "EUR");
  assert.equal(result.totals.gross_cents, 14_280);
  assert.deepEqual(result.tax_breakdown, [{
    tax_rate_bps: 1_900,
    net_cents: 12_000,
    tax_cents: 2_280,
  }]);
  assert.equal(result.lines[0].source.kind, "monthly_fee");
});

test("weist unvollständige Geldwerte zurück", () => {
  assert.throws(() => buildStructuredInvoiceExport({
    id: "invoice-2",
    invoice_number: null,
    invoice_kind: "draft",
    status: "draft",
    title: "Entwurf",
    invoice_date: null,
    due_date: null,
    billing_month: null,
    service_period_start: null,
    service_period_end: null,
    billing_note: null,
    net_total_cents: null,
    tax_total_cents: 0,
    gross_total_cents: 0,
    issuer_snapshot: null,
    recipient_snapshot: null,
    bank_snapshot: null,
    immutable_at: null,
    document_content_sha256: null,
    original_pdf_sha256: null,
  }, []), /Nettosumme/);
});
