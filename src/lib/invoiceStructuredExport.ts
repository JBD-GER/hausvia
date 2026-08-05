export const HAUSVIA_INVOICE_EXPORT_SCHEMA = "hausvia.invoice.v1";

type UnknownRecord = Record<string, unknown>;

export type StructuredInvoiceRow = {
  id: string;
  invoice_number: string | null;
  invoice_kind: string | null;
  status: string;
  title: string;
  invoice_date: string | null;
  due_date: string | null;
  billing_month: string | null;
  service_period_start: string | null;
  service_period_end: string | null;
  billing_note: string | null;
  net_total_cents: number | null;
  tax_total_cents: number | null;
  gross_total_cents: number | null;
  issuer_snapshot: UnknownRecord | null;
  recipient_snapshot: UnknownRecord | null;
  bank_snapshot: UnknownRecord | null;
  immutable_at: string | null;
  document_content_sha256: string | null;
  original_pdf_sha256: string | null;
};

export type StructuredInvoiceItemRow = {
  id: string;
  title: string;
  description: string | null;
  quantity: number;
  unit: string;
  unit_net_cents: number | null;
  total_net_cents: number | null;
  tax_rate_bps: number | null;
  service_date: string | null;
  structured_data: UnknownRecord | null;
};

function cents(value: number | null, label: string) {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${label} ist keine gültige Cent-Angabe.`);
  }
  return Number(value);
}

export function buildStructuredInvoiceExport(
  invoice: StructuredInvoiceRow,
  items: StructuredInvoiceItemRow[],
) {
  const lines = items.map((item) => ({
    id: item.id,
    title: item.title,
    description: item.description,
    quantity: Number(item.quantity),
    unit: item.unit,
    unit_net_cents: cents(item.unit_net_cents, "Einzelpreis"),
    total_net_cents: cents(item.total_net_cents, "Positionssumme"),
    tax_rate_bps: cents(item.tax_rate_bps, "Umsatzsteuersatz"),
    service_date: item.service_date,
    source: item.structured_data ?? {},
  }));
  const taxByRate = new Map<number, { net_cents: number; tax_cents: number }>();
  for (const line of lines) {
    const current = taxByRate.get(line.tax_rate_bps) ?? {
      net_cents: 0,
      tax_cents: 0,
    };
    current.net_cents += line.total_net_cents;
    current.tax_cents += Math.round(
      (line.total_net_cents * line.tax_rate_bps) / 10_000,
    );
    taxByRate.set(line.tax_rate_bps, current);
  }

  return {
    schema: HAUSVIA_INVOICE_EXPORT_SCHEMA,
    currency: "EUR",
    amount_unit: "cent",
    invoice: {
      id: invoice.id,
      number: invoice.invoice_number,
      kind: invoice.invoice_kind,
      status: invoice.status,
      title: invoice.title,
      invoice_date: invoice.invoice_date,
      due_date: invoice.due_date,
      billing_month: invoice.billing_month,
      service_period: {
        start: invoice.service_period_start,
        end: invoice.service_period_end,
      },
      note: invoice.billing_note,
      immutable_at: invoice.immutable_at,
    },
    parties: {
      issuer: invoice.issuer_snapshot ?? {},
      recipient: invoice.recipient_snapshot ?? {},
      payment: invoice.bank_snapshot ?? {},
    },
    lines,
    tax_breakdown: Array.from(taxByRate, ([tax_rate_bps, values]) => ({
      tax_rate_bps,
      ...values,
    })).sort((left, right) => left.tax_rate_bps - right.tax_rate_bps),
    totals: {
      net_cents: cents(invoice.net_total_cents, "Nettosumme"),
      tax_cents: cents(invoice.tax_total_cents, "Umsatzsteuer"),
      gross_cents: cents(invoice.gross_total_cents, "Bruttosumme"),
    },
    integrity: {
      structured_data_sha256: invoice.document_content_sha256,
      original_pdf_sha256: invoice.original_pdf_sha256,
    },
  } as const;
}
