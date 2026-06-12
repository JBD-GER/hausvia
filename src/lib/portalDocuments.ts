import type { SupabaseClient } from "@supabase/supabase-js";
import { createBusinessDocumentPdf } from "@/lib/businessDocumentPdf";
import { createDocumentNumber, type CommerceLineItem, type DocumentTotals } from "@/lib/commerce";

type CustomerRow = {
  company_name: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  billing_address: string | null;
};

type ProjectRow = {
  name: string | null;
  object_address: string | null;
  object_type: string | null;
};

type ItemRow = {
  title: string;
  description: string | null;
  quantity: number;
  unit: string;
  unit_net: number;
  total_net: number;
  sort_order?: number | null;
};

type OfferRow = {
  id: string;
  offer_number: string | null;
  title: string;
  intro: string | null;
  closing_text: string | null;
  created_at: string;
  net_total: number;
  tax_rate: number;
  tax_total: number;
  gross_total: number;
  billing_mode: string | null;
  billing_in_advance: boolean | null;
  payment_due_days_before_month_end: number | null;
  customers: CustomerRow | CustomerRow[] | null;
  projects: ProjectRow | ProjectRow[] | null;
  offer_items: ItemRow[] | null;
};

type InvoiceRow = {
  id: string;
  invoice_number: string | null;
  title: string;
  created_at: string;
  due_date: string | null;
  net_total: number;
  tax_rate: number;
  tax_total: number;
  gross_total: number;
  service_period_start: string | null;
  service_period_end: string | null;
  billing_note: string | null;
  customers: CustomerRow | CustomerRow[] | null;
  projects: ProjectRow | ProjectRow[] | null;
  invoice_items: ItemRow[] | null;
};

function first<T>(value: T | T[] | null | undefined) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function mapItems(items: ItemRow[] | null | undefined): CommerceLineItem[] {
  return (items ?? [])
    .slice()
    .sort((a, b) => numberValue(a.sort_order) - numberValue(b.sort_order))
    .map((item) => ({
      title: item.title,
      description: item.description ?? "",
      quantity: numberValue(item.quantity) || 1,
      unit: item.unit || "Pauschale",
      unitNet: numberValue(item.unit_net),
      totalNet: numberValue(item.total_net),
    }));
}

function totalsFromRow(row: {
  net_total: number;
  tax_rate: number;
  tax_total: number;
  gross_total: number;
}): DocumentTotals {
  return {
    netTotal: numberValue(row.net_total),
    taxRate: numberValue(row.tax_rate) || 19,
    taxTotal: numberValue(row.tax_total),
    grossTotal: numberValue(row.gross_total),
  };
}

function safeFileName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
}

export async function getOfferDocument(client: SupabaseClient, offerId: string) {
  const { data, error } = await client
    .from("offers")
    .select(
      "id,offer_number,title,intro,closing_text,created_at,net_total,tax_rate,tax_total,gross_total,billing_mode,billing_in_advance,payment_due_days_before_month_end,customers(company_name,contact_name,email,phone,billing_address),projects(name,object_address,object_type),offer_items(title,description,quantity,unit,unit_net,total_net,sort_order)",
    )
    .eq("id", offerId)
    .single();

  if (error || !data) throw error ?? new Error("Offer not found");

  const offer = data as OfferRow;
  const customer = first(offer.customers);
  const project = first(offer.projects);
  const number = offer.offer_number || createDocumentNumber("ANG", offer.id);
  const items = mapItems(offer.offer_items);
  const pdf = createBusinessDocumentPdf({
    kind: "offer",
    number,
    title: offer.title,
    intro: offer.intro,
    closingText: offer.closing_text,
    customer: {
      companyName: customer?.company_name,
      contactName: customer?.contact_name,
      email: customer?.email,
      phone: customer?.phone,
      address: customer?.billing_address ?? project?.object_address,
    },
    project: project
      ? {
          name: project.name,
          objectAddress: project.object_address,
          objectType: project.object_type,
        }
      : null,
    items,
    totals: totalsFromRow(offer),
    createdAt: offer.created_at,
    billingNote:
      offer.billing_mode && offer.billing_mode !== "one_time"
        ? `Dieses Angebot ist als regelmäßige Abrechnung vorgesehen. ${
            offer.billing_in_advance
              ? `Die Rechnung kann ${offer.payment_due_days_before_month_end ?? 15} Tage vor Monatsende für den kommenden Leistungsmonat erstellt werden.`
              : "Der genaue Abrechnungsturnus wird separat abgestimmt."
          }`
        : null,
  });

  return {
    number,
    pdf,
    filename: `${safeFileName(number)}-angebot-hausvia.pdf`,
    customerEmail: customer?.email ?? "",
    customerName: customer?.contact_name || customer?.company_name || customer?.email || "Kunde",
  };
}

export async function getInvoiceDocument(client: SupabaseClient, invoiceId: string) {
  const { data, error } = await client
    .from("invoices")
    .select(
      "id,invoice_number,title,created_at,due_date,net_total,tax_rate,tax_total,gross_total,service_period_start,service_period_end,billing_note,customers(company_name,contact_name,email,phone,billing_address),projects(name,object_address,object_type),invoice_items(title,description,quantity,unit,unit_net,total_net,sort_order)",
    )
    .eq("id", invoiceId)
    .single();

  if (error || !data) throw error ?? new Error("Invoice not found");

  const invoice = data as InvoiceRow;
  const customer = first(invoice.customers);
  const project = first(invoice.projects);
  const number = invoice.invoice_number || createDocumentNumber("RE", invoice.id);
  const pdf = createBusinessDocumentPdf({
    kind: "invoice",
    number,
    title: invoice.title,
    customer: {
      companyName: customer?.company_name,
      contactName: customer?.contact_name,
      email: customer?.email,
      phone: customer?.phone,
      address: customer?.billing_address ?? project?.object_address,
    },
    project: project
      ? {
          name: project.name,
          objectAddress: project.object_address,
          objectType: project.object_type,
        }
      : null,
    items: mapItems(invoice.invoice_items),
    totals: totalsFromRow(invoice),
    createdAt: invoice.created_at,
    dueDate: invoice.due_date,
    servicePeriodStart: invoice.service_period_start,
    servicePeriodEnd: invoice.service_period_end,
    billingNote: invoice.billing_note,
  });

  return {
    number,
    pdf,
    filename: `${safeFileName(number)}-rechnung-hausvia.pdf`,
    customerEmail: customer?.email ?? "",
    customerName: customer?.contact_name || customer?.company_name || customer?.email || "Kunde",
  };
}
