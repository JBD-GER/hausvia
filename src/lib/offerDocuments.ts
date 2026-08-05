import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createBusinessDocumentPdf,
  type BusinessDocumentBillingBucket,
  type BusinessDocumentDiscount,
  type BusinessDocumentLineItem,
  type InvoiceIssuerSnapshot,
} from "./businessDocumentPdf.ts";
import {
  BILLING_BUCKETS,
  billingBucketLabels,
  billingBucketSuffixes,
  inclusiveSeasonMonthCount,
  type BillingBucket,
} from "./offerPricing.ts";

type JsonRecord = Record<string, unknown>;

export type OfferVersionItemDocumentRow = {
  id: string;
  client_key: string;
  item_kind: string;
  title: string;
  description: string | null;
  area_sqm: number | string | null;
  quantity: number | string;
  unit: string;
  frequency: string;
  frequency_occurrences: number | null;
  billing_type: string;
  calculation_type: string;
  unit_price_cents: number | string;
  minimum_price_cents: number | string;
  automatic_total_cents: number | string;
  total_net_cents: number | string;
  tax_rate_bps: number;
  manual_price: boolean;
  permanent: boolean;
  seasonal: boolean;
  season_start_month: number | null;
  season_end_month: number | null;
  visible_note: string | null;
  winter_surface_type: string | null;
  winter_model: string | null;
  included_visits: number;
  additional_visit_price_cents: number | string;
  monthly_base_fee_cents: number | string;
  seasonal_flat_rate_cents: number | string;
  surcharge_cents: number | string;
  price_components: unknown;
  pricing_snapshot: unknown;
  sort_order: number;
};

export type OfferDiscountDocumentRow = {
  id: string;
  offer_item_id: string | null;
  scope: string;
  discount_type: string;
  percentage_bps: number | null;
  amount_cents: number | string | null;
  applied_amount_cents: number | string;
  reason: string;
  sort_order: number;
};

export type OfferVersionDocumentRow = {
  id: string;
  offer_id: string;
  customer_id: string;
  version_number: number;
  lifecycle_status: string;
  offer_number: string;
  title: string;
  contact_name: string | null;
  recipient_snapshot: unknown;
  object_label: string | null;
  object_address: string | null;
  offer_date: string;
  valid_until: string;
  planned_start_date: string | null;
  intro: string | null;
  visible_note: string | null;
  payment_terms: string | null;
  contract_terms: string | null;
  issuer_snapshot: unknown;
  subtotal_cents: number | string;
  discount_total_cents: number | string;
  net_total_cents: number | string;
  tax_total_cents: number | string;
  gross_total_cents: number | string;
  billing_totals: unknown;
  calculation_snapshot: unknown;
  frozen_at: string | null;
  sent_at: string | null;
  original_pdf_bucket: string | null;
  original_pdf_path: string | null;
  original_pdf_sha256: string | null;
  document_content_sha256: string | null;
  created_at: string;
  offer_version_items: OfferVersionItemDocumentRow[] | null;
  offer_discounts: OfferDiscountDocumentRow[] | null;
};

export type OfferAcceptanceDocumentRow = {
  id: string;
  offer_version_id: string;
  accepted_name: string;
  accepted_at: string;
  confirmed_gross_total_cents: number | string;
  confirmed_totals: unknown;
  confirmed_content_sha256: string;
  comment: string | null;
  confirmation_pdf_bucket: string | null;
  confirmation_pdf_path: string | null;
  confirmation_pdf_sha256: string | null;
};

export type OfferAcceptanceConfirmationPdfInput = {
  offerNumber: string;
  versionNumber: number;
  acceptedName: string;
  acceptedAt: string;
  confirmedGrossTotalCents: number;
  comment?: string | null;
  issuerSnapshot: unknown;
  recipientSnapshot: unknown;
  contentSha256: string;
};

export const OFFER_VERSION_DOCUMENT_SELECT = [
  "id",
  "offer_id",
  "customer_id",
  "version_number",
  "lifecycle_status",
  "offer_number",
  "title",
  "contact_name",
  "recipient_snapshot",
  "object_label",
  "object_address",
  "offer_date",
  "valid_until",
  "planned_start_date",
  "intro",
  "visible_note",
  "payment_terms",
  "contract_terms",
  "issuer_snapshot",
  "subtotal_cents",
  "discount_total_cents",
  "net_total_cents",
  "tax_total_cents",
  "gross_total_cents",
  "billing_totals",
  "calculation_snapshot",
  "frozen_at",
  "sent_at",
  "original_pdf_bucket",
  "original_pdf_path",
  "original_pdf_sha256",
  "document_content_sha256",
  "created_at",
  "offer_version_items(id,client_key,item_kind,title,description,area_sqm,quantity,unit,frequency,frequency_occurrences,billing_type,calculation_type,unit_price_cents,minimum_price_cents,automatic_total_cents,total_net_cents,tax_rate_bps,manual_price,permanent,seasonal,season_start_month,season_end_month,visible_note,winter_surface_type,winter_model,included_visits,additional_visit_price_cents,monthly_base_fee_cents,seasonal_flat_rate_cents,surcharge_cents,price_components,pricing_snapshot,sort_order)",
  "offer_discounts(id,offer_item_id,scope,discount_type,percentage_bps,amount_cents,applied_amount_cents,reason,sort_order)",
].join(",");

const unitLabels: Record<string, string> = {
  square_meter: "m²",
  piece: "Stück",
  hour: "Stunde",
  visit: "Einsatz",
  month: "Monat",
  flat: "Pauschale",
};

const frequencyLabels: Record<string, string> = {
  once: "einmalig",
  weekly: "wöchentlich",
  multiple_weekly: "mehrmals wöchentlich",
  monthly: "monatlich",
  quarterly: "vierteljährlich",
  yearly: "jährlich",
  on_demand: "nach Bedarf",
};

const winterModelLabels: Record<string, string> = {
  seasonal_flat: "Saisonpauschale",
  monthly_plus_visit: "monatliche Grundgebühr plus Einsatz",
  per_visit: "je Einsatz",
  custom_flat: "individuelle Pauschale",
};

const winterSurfaceLabels: Record<string, string> = {
  sidewalk: "Gehweg",
  entrance: "Eingang",
  driveway: "Zufahrt",
  parking: "Parkplatz",
  courtyard: "Hof",
  stairs: "Treppen",
  other: "sonstige Fläche",
};

const monthLabels = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function textValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function integerValue(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(number) ? number : 0;
}

function decimalValue(value: unknown, fallback = 0) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function firstValue(record: JsonRecord, ...keys: string[]) {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key];
  }
  return undefined;
}

export function validateOfferIssuerSnapshot(value: unknown) {
  const snapshot = asRecord(value);
  const requiredFields: Array<[string, string[]]> = [
    ["rechtlicher Firmenname", ["legal_name", "legalName"]],
    ["Markenname", ["brand_name", "brandName"]],
    ["Straße", ["street"]],
    ["Hausnummer", ["house_number", "houseNumber"]],
    ["Postleitzahl", ["postal_code", "postalCode"]],
    ["Ort", ["city"]],
    ["Land", ["country"]],
    ["Handelsregister", ["commercial_register", "commercialRegister"]],
    ["Geschäftsführung", ["management", "managing_director", "managingDirector"]],
    ["E-Mail", ["email"]],
    ["Telefon", ["phone"]],
    ["Bankname", ["bank_name", "bankName"]],
    ["IBAN", ["iban"]],
    ["BIC", ["bic"]],
  ];
  const missing = requiredFields
    .filter(([, keys]) => !textValue(firstValue(snapshot, ...keys)))
    .map(([label]) => label);

  if (!textValue(firstValue(snapshot, "tax_number", "taxNumber", "vat_id", "vatId"))) {
    missing.push("Steuernummer oder Umsatzsteuer-ID");
  }
  const email = textValue(snapshot.email);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) missing.push("gültige E-Mail");

  return { valid: missing.length === 0, missing };
}

function formattedCents(cents: number) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

function addressFromSnapshot(snapshot: JsonRecord) {
  const direct = textValue(firstValue(snapshot, "address", "billing_address"));
  const street = [
    textValue(firstValue(snapshot, "street", "billing_street")),
    textValue(firstValue(snapshot, "house_number", "billing_house_number")),
  ]
    .filter(Boolean)
    .join(" ");
  const city = [
    textValue(firstValue(snapshot, "postal_code", "billing_postal_code")),
    textValue(firstValue(snapshot, "city", "billing_city")),
  ]
    .filter(Boolean)
    .join(" ");
  return [direct || street, city, textValue(firstValue(snapshot, "country", "billing_country"))]
    .filter(Boolean)
    .join(", ");
}

function issuerFromSnapshot(value: unknown): InvoiceIssuerSnapshot | null {
  const snapshot = asRecord(value);
  const legalName = textValue(firstValue(snapshot, "legal_name", "legalName"));
  if (!legalName) return null;
  const street = [
    textValue(firstValue(snapshot, "street")),
    textValue(firstValue(snapshot, "house_number", "houseNumber")),
  ]
    .filter(Boolean)
    .join(" ");
  const city = [
    textValue(firstValue(snapshot, "postal_code", "postalCode")),
    textValue(firstValue(snapshot, "city")),
  ]
    .filter(Boolean)
    .join(" ");

  return {
    legalName,
    brandName: textValue(firstValue(snapshot, "brand_name", "brandName")),
    address: [street, city, textValue(snapshot.country)].filter(Boolean).join(", ") || "-",
    taxNumber: textValue(firstValue(snapshot, "tax_number", "taxNumber")),
    vatId: textValue(firstValue(snapshot, "vat_id", "vatId")),
    commercialRegister: textValue(firstValue(snapshot, "commercial_register", "commercialRegister")),
    managingDirector: textValue(firstValue(snapshot, "management", "managing_director", "managingDirector")),
    email: textValue(snapshot.email) || "-",
    phone: textValue(snapshot.phone),
    bankName: textValue(firstValue(snapshot, "bank_name", "bankName")) || "-",
    iban: textValue(snapshot.iban) || "-",
    bic: textValue(snapshot.bic) || "-",
  };
}

function bucketFromBillingType(item: OfferVersionItemDocumentRow): BillingBucket {
  if (item.billing_type === "monthly") return "monthly";
  if (item.billing_type === "per_visit") return "per_visit";
  if (item.seasonal || item.winter_model === "seasonal_flat") return "seasonal";
  return "one_time";
}

function componentBucketAmounts(item: OfferVersionItemDocumentRow) {
  const amounts: Record<BillingBucket, number> = {
    one_time: 0,
    monthly: 0,
    seasonal: 0,
    per_visit: 0,
  };
  let found = false;

  for (const value of asArray(item.price_components)) {
    const component = asRecord(value);
    const bucket = textValue(firstValue(component, "billing_bucket", "billingBucket", "bucket"));
    const cents = integerValue(firstValue(component, "amount_cents", "amountCents", "net_cents", "netCents"));
    if (bucket && BILLING_BUCKETS.includes(bucket as BillingBucket) && cents !== 0) {
      amounts[bucket as BillingBucket] += cents;
      found = true;
    }
  }

  if (!found) amounts[bucketFromBillingType(item)] = integerValue(item.total_net_cents);
  return amounts;
}

function netBucketAmounts(item: OfferVersionItemDocumentRow) {
  const snapshot = asRecord(item.pricing_snapshot);
  const snapshotBuckets = asRecord(firstValue(snapshot, "billing_buckets", "billingBuckets"));
  const amounts: Record<BillingBucket, number> = {
    one_time: 0,
    monthly: 0,
    seasonal: 0,
    per_visit: 0,
  };
  let hasSnapshotBuckets = false;

  for (const bucket of BILLING_BUCKETS) {
    const entry = asRecord(snapshotBuckets[bucket]);
    if (Object.prototype.hasOwnProperty.call(entry, "net_cents") || Object.prototype.hasOwnProperty.call(entry, "netCents")) {
      amounts[bucket] = integerValue(firstValue(entry, "net_cents", "netCents"));
      hasSnapshotBuckets = true;
    }
  }

  return hasSnapshotBuckets
    ? { amounts, includesDiscounts: true }
    : { amounts: componentBucketAmounts(item), includesDiscounts: false };
}

function billingLabelForItem(item: OfferVersionItemDocumentRow) {
  const { amounts } = netBucketAmounts(item);
  const parts = BILLING_BUCKETS.flatMap((bucket) => {
    const cents = amounts[bucket];
    if (!cents) return [];
    if (bucket === "per_visit") {
      const quantity = decimalValue(item.quantity, 1);
      const billableVisits = item.item_kind === "winter" && ["seasonal_flat", "monthly_plus_visit"].includes(item.winter_model || "")
        ? Math.max(0, quantity - integerValue(item.included_visits))
        : quantity;
      const effectiveRate = billableVisits > 0 ? Math.round(cents / billableVisits) : integerValue(item.additional_visit_price_cents || item.unit_price_cents);
      return billableVisits > 0
        ? [`${formattedCents(effectiveRate)} / Einsatz × ${billableVisits.toLocaleString("de-DE")} = ${formattedCents(cents)}`]
        : [`${formattedCents(effectiveRate)} / Einsatz`];
    }
    return [`${formattedCents(cents)}${billingBucketSuffixes[bucket]}`];
  });
  return parts.length ? parts.join(" + ") : "0,00 € (kostenfrei)";
}

function itemDetails(item: OfferVersionItemDocumentRow) {
  const details: string[] = [];
  const area = decimalValue(item.area_sqm);
  if (area > 0) details.push(`Fläche: ${area.toLocaleString("de-DE")} m²`);
  const frequency = frequencyLabels[item.frequency] || item.frequency;
  if (frequency) {
    const occurrence = item.frequency === "multiple_weekly" && item.frequency_occurrences
      ? ` (${item.frequency_occurrences}×)`
      : "";
    details.push(`Ausführung: ${frequency}${occurrence}`);
  }
  if (item.seasonal && item.season_start_month && item.season_end_month) {
    details.push(
      `Saison: ${monthLabels[item.season_start_month - 1]} bis ${monthLabels[item.season_end_month - 1]}`,
    );
  }
  if (item.item_kind === "winter") {
    const surface = item.winter_surface_type
      ? winterSurfaceLabels[item.winter_surface_type] || item.winter_surface_type
      : null;
    const model = item.winter_model
      ? winterModelLabels[item.winter_model] || item.winter_model
      : null;
    if (surface || model) details.push([surface, model].filter(Boolean).join(" · "));
    details.push(`Geplante Einsätze: ${decimalValue(item.quantity, 1).toLocaleString("de-DE")}`);
    if (["seasonal_flat", "monthly_plus_visit"].includes(item.winter_model || "") || item.included_visits > 0) {
      details.push(`${item.included_visits} Einsätze inklusive`);
    }
    const seasonMonths = item.season_start_month && item.season_end_month
      ? inclusiveSeasonMonthCount(item.season_start_month, item.season_end_month)
      : 1;
    const { amounts: bucketAmounts, includesDiscounts } = netBucketAmounts(item);
    const amountQualifier = includesDiscounts ? "netto nach Rabatten" : "netto vor separaten Rabatten";
    if (item.winter_model === "seasonal_flat") {
      const seasonalTotal = bucketAmounts.seasonal || integerValue(item.seasonal_flat_rate_cents);
      details.push(`Preis pro Saisonmonat: ${formattedCents(Math.round(seasonalTotal / Math.max(1, seasonMonths)))} ${amountQualifier}`);
      details.push(`Gesamtpreis für ${seasonMonths} Saisonmonate: ${formattedCents(seasonalTotal)} ${amountQualifier}`);
    } else if (item.winter_model === "monthly_plus_visit") {
      const monthlyBase = bucketAmounts.monthly || integerValue(item.monthly_base_fee_cents);
      details.push(`Monatliche Grundgebühr: ${formattedCents(monthlyBase)} ${amountQualifier}`);
      details.push(`Grundbetrag für ${seasonMonths} Saisonmonate: ${formattedCents(monthlyBase * seasonMonths)} ${amountQualifier}`);
    } else if (integerValue(item.seasonal_flat_rate_cents) > 0) {
      details.push(`Saisonpauschale: ${formattedCents(integerValue(item.seasonal_flat_rate_cents))}`);
    }
    const quantity = decimalValue(item.quantity, 1);
    const billableVisits = ["seasonal_flat", "monthly_plus_visit"].includes(item.winter_model || "")
      ? Math.max(0, quantity - integerValue(item.included_visits))
      : item.winter_model === "per_visit"
        ? quantity
        : 0;
    if (billableVisits > 0) {
      const effectiveVisitCents = Math.round(bucketAmounts.per_visit / billableVisits);
      const label = item.winter_model === "per_visit" ? "Effektiv je geplantem Einsatz" : "Effektiv je geplantem zusätzlichen Einsatz";
      details.push(`${label}: ${formattedCents(effectiveVisitCents)} ${amountQualifier}`);
    } else if (integerValue(item.additional_visit_price_cents) > 0) {
      details.push(`Basispreis je zusätzlichem Einsatz: ${formattedCents(integerValue(item.additional_visit_price_cents))} vor Faktoren und Rabatten`);
    }
  }
  if (item.manual_price) details.push("Individuell kalkulierter Preis");
  if (item.visible_note) details.push(item.visible_note);
  return details;
}

export function offerVersionItemsForPdf(row: OfferVersionDocumentRow): BusinessDocumentLineItem[] {
  return (row.offer_version_items ?? [])
    .slice()
    .sort((left, right) => left.sort_order - right.sort_order)
    .map((item) => ({
      title: item.title,
      description: item.description || "",
      quantity: decimalValue(item.quantity, 1),
      unit: unitLabels[item.unit] || item.unit,
      unitNet: integerValue(item.unit_price_cents) / 100,
      totalNet: integerValue(item.total_net_cents) / 100,
      details: itemDetails(item),
      billingLabel: billingLabelForItem(item),
    }));
}

function bucketObject(value: unknown) {
  const root = asRecord(value);
  return asRecord(firstValue(root, "bucketTotals", "bucket_totals") ?? root);
}

export function offerBillingBuckets(value: unknown): BusinessDocumentBillingBucket[] {
  const buckets = bucketObject(value);
  return BILLING_BUCKETS.flatMap((bucket) => {
    const data = asRecord(buckets[bucket]);
    const subtotalCents = integerValue(firstValue(data, "subtotal_cents", "subtotalCents"));
    const discountCents = integerValue(firstValue(data, "discount_cents", "discountCents"));
    const netCents = integerValue(firstValue(data, "net_cents", "netCents"));
    const taxCents = integerValue(firstValue(data, "tax_cents", "taxCents"));
    const grossCents = integerValue(firstValue(data, "gross_cents", "grossCents"));
    if (!subtotalCents && !discountCents && !netCents && !taxCents && !grossCents) return [];
    return [{
      key: bucket,
      label: billingBucketLabels[bucket],
      suffix: billingBucketSuffixes[bucket] || "einmalig",
      subtotalCents,
      discountCents,
      netCents,
      taxCents,
      grossCents,
    }];
  });
}

function discountDetail(discount: OfferDiscountDocumentRow) {
  if (discount.discount_type === "percent" && discount.percentage_bps !== null) {
    return `${(discount.percentage_bps / 100).toLocaleString("de-DE")} %`;
  }
  if (discount.amount_cents !== null) {
    return `Festbetrag ${formattedCents(integerValue(discount.amount_cents))}`;
  }
  return null;
}

export function offerDiscountsForPdf(row: OfferVersionDocumentRow): BusinessDocumentDiscount[] {
  const itemNames = new Map((row.offer_version_items ?? []).map((item) => [item.id, item.title]));
  return (row.offer_discounts ?? [])
    .slice()
    .sort((left, right) => left.sort_order - right.sort_order)
    .map((discount) => ({
      label: discount.scope === "item" && discount.offer_item_id
        ? `${discount.reason} · ${itemNames.get(discount.offer_item_id) || "Position"}`
        : discount.reason,
      detail: discountDetail(discount),
      amountCents: integerValue(discount.applied_amount_cents),
    }));
}

function recipientSnapshotForPdf(value: unknown, explicitContactName?: string | null) {
  const recipient = asRecord(value);
  const recipientName = textValue(firstValue(recipient, "recipient_name", "recipientName"));
  const companyName = textValue(firstValue(recipient, "company_name", "companyName"));
  const contactName = explicitContactName || textValue(firstValue(recipient, "contact_name", "contactName"));
  const personName = [
    textValue(firstValue(recipient, "first_name", "firstName")),
    textValue(firstValue(recipient, "last_name", "lastName")),
  ]
    .filter(Boolean)
    .join(" ");

  return {
    companyName: companyName || recipientName || personName || contactName,
    contactName,
    addition: companyName ? personName || null : null,
    email: textValue(recipient.email),
    phone: textValue(recipient.phone),
    address: addressFromSnapshot(recipient) || null,
  };
}

function recipientForPdf(row: OfferVersionDocumentRow) {
  return recipientSnapshotForPdf(row.recipient_snapshot, row.contact_name);
}

function aggregateTaxRate(row: OfferVersionDocumentRow) {
  const net = integerValue(row.net_total_cents);
  const tax = integerValue(row.tax_total_cents);
  return net > 0 ? Math.round((tax * 10_000) / net) / 100 : 0;
}

export function createOfferVersionPdf(row: OfferVersionDocumentRow) {
  return createBusinessDocumentPdf({
    kind: "offer",
    number: row.offer_number,
    versionLabel: `Version ${row.version_number}`,
    title: row.title,
    intro: row.intro,
    customer: recipientForPdf(row),
    project: row.object_label || row.object_address
      ? { name: row.object_label, objectAddress: row.object_address }
      : null,
    items: offerVersionItemsForPdf(row),
    totals: {
      netTotal: integerValue(row.net_total_cents) / 100,
      taxRate: aggregateTaxRate(row),
      taxTotal: integerValue(row.tax_total_cents) / 100,
      grossTotal: integerValue(row.gross_total_cents) / 100,
    },
    billingBuckets: offerBillingBuckets(row.billing_totals),
    discounts: offerDiscountsForPdf(row),
    createdAt: row.offer_date,
    validUntil: row.valid_until,
    billingNote: "Die ausgewiesenen Abrechnungsarten gelten unabhängig voneinander; wiederkehrende und einsatzbezogene Beträge werden nicht zu einer irreführenden Gesamtrate zusammengezogen.",
    visibleNote: row.visible_note,
    paymentTerms: row.payment_terms,
    contractTerms: row.contract_terms,
    acceptance: {
      statement: "Ich nehme das vorliegende Angebot verbindlich an.",
    },
    issuer: issuerFromSnapshot(row.issuer_snapshot),
  });
}

export function createOfferAcceptanceConfirmationPdf(
  input:
    | { version: OfferVersionDocumentRow; acceptance: OfferAcceptanceDocumentRow }
    | OfferAcceptanceConfirmationPdfInput,
) {
  if (!("version" in input)) {
    return createBusinessDocumentPdf({
      kind: "offer_acceptance",
      number: input.offerNumber,
      versionLabel: `Version ${input.versionNumber}`,
      title: `Annahmebestätigung · ${input.offerNumber}`,
      intro: "Diese Bestätigung dokumentiert die verbindliche Annahme der unveränderlich gespeicherten Angebotsversion.",
      customer: recipientSnapshotForPdf(input.recipientSnapshot),
      project: null,
      items: [],
      totals: { netTotal: 0, taxRate: 0, taxTotal: 0, grossTotal: input.confirmedGrossTotalCents / 100 },
      hidePricingSummary: true,
      createdAt: input.acceptedAt,
      acceptance: {
        statement: "Ich nehme das vorliegende Angebot verbindlich an.",
        completed: true,
        acceptedName: input.acceptedName,
        acceptedAt: input.acceptedAt,
        comment: input.comment,
        versionLabel: `${input.offerNumber} · Version ${input.versionNumber}`,
        confirmedGrossTotalCents: input.confirmedGrossTotalCents,
        confirmedContentSha256: input.contentSha256,
      },
      issuer: issuerFromSnapshot(input.issuerSnapshot),
    });
  }

  const { version, acceptance } = input;
  return createBusinessDocumentPdf({
    kind: "offer_acceptance",
    number: version.offer_number,
    versionLabel: `Version ${version.version_number}`,
    title: `Annahmebestätigung · ${version.title}`,
    intro: "Diese Bestätigung dokumentiert die verbindliche Annahme der unveränderlich gespeicherten Angebotsversion.",
    customer: recipientForPdf(version),
    project: version.object_label || version.object_address
      ? { name: version.object_label, objectAddress: version.object_address }
      : null,
    items: offerVersionItemsForPdf(version),
    totals: {
      netTotal: integerValue(version.net_total_cents) / 100,
      taxRate: aggregateTaxRate(version),
      taxTotal: integerValue(version.tax_total_cents) / 100,
      grossTotal: integerValue(acceptance.confirmed_gross_total_cents) / 100,
    },
    billingBuckets: offerBillingBuckets(acceptance.confirmed_totals),
    discounts: offerDiscountsForPdf(version),
    createdAt: acceptance.accepted_at,
    validUntil: version.valid_until,
    paymentTerms: version.payment_terms,
    contractTerms: version.contract_terms,
    acceptance: {
      statement: "Ich nehme das vorliegende Angebot verbindlich an.",
      completed: true,
      acceptedName: acceptance.accepted_name,
      acceptedAt: acceptance.accepted_at,
      comment: acceptance.comment,
      versionLabel: `${version.offer_number} · Version ${version.version_number}`,
      confirmedGrossTotalCents: integerValue(acceptance.confirmed_gross_total_cents),
      confirmedContentSha256: acceptance.confirmed_content_sha256,
    },
    issuer: issuerFromSnapshot(version.issuer_snapshot),
  });
}

export async function loadOfferVersionDocumentData(client: SupabaseClient, offerVersionId: string) {
  const { data, error } = await client
    .from("offer_versions")
    .select(OFFER_VERSION_DOCUMENT_SELECT)
    .eq("id", offerVersionId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Angebotsversion nicht gefunden");
  return data as unknown as OfferVersionDocumentRow;
}

export async function getOfferVersionDocument(client: SupabaseClient, offerVersionId: string) {
  const version = await loadOfferVersionDocumentData(client, offerVersionId);
  const pdf = createOfferVersionPdf(version);
  const recipient = recipientForPdf(version);
  const pdfSha256 = sha256Hex(pdf);
  return {
    version,
    pdf,
    sha256: pdfSha256,
    pdfSha256,
    filename: offerDocumentFileName(version.offer_number, version.version_number),
    number: version.offer_number,
    versionNumber: version.version_number,
    offerId: version.offer_id,
    customerEmail: recipient.email || "",
    customerName: recipient.contactName || recipient.companyName || recipient.email || "Kunde",
    validUntil: version.valid_until,
    title: version.title,
    issuerSnapshot: version.issuer_snapshot,
    recipientSnapshot: version.recipient_snapshot,
  };
}

export async function loadOfferAcceptanceDocumentData(client: SupabaseClient, acceptanceId: string) {
  const { data, error } = await client
    .from("offer_acceptances")
    .select("id,offer_version_id,accepted_name,accepted_at,confirmed_gross_total_cents,confirmed_totals,confirmed_content_sha256,comment,confirmation_pdf_bucket,confirmation_pdf_path,confirmation_pdf_sha256")
    .eq("id", acceptanceId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Annahmebestätigung nicht gefunden");
  return data as unknown as OfferAcceptanceDocumentRow;
}

export async function getOfferAcceptanceConfirmationDocument(client: SupabaseClient, acceptanceId: string) {
  const acceptance = await loadOfferAcceptanceDocumentData(client, acceptanceId);
  const version = await loadOfferVersionDocumentData(client, acceptance.offer_version_id);
  const pdf = createOfferAcceptanceConfirmationPdf({ version, acceptance });
  return {
    acceptance,
    version,
    pdf,
    sha256: sha256Hex(pdf),
    filename: offerAcceptanceFileName(version.offer_number, version.version_number),
  };
}

export function sha256Hex(value: Uint8Array | Buffer | string) {
  return createHash("sha256").update(value).digest("hex");
}

export function safeOfferFileToken(value: string) {
  const token = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
  return token || "angebot";
}

export function offerDocumentFileName(offerNumber: string, versionNumber: number) {
  return `${safeOfferFileToken(offerNumber)}-v${Math.max(1, Math.trunc(versionNumber))}-angebot-hausvia.pdf`;
}

export function offerAcceptanceFileName(offerNumber: string, versionNumber: number) {
  return `${safeOfferFileToken(offerNumber)}-v${Math.max(1, Math.trunc(versionNumber))}-annahmebestaetigung-hausvia.pdf`;
}

export function offerOriginalStoragePath(version: Pick<OfferVersionDocumentRow, "id" | "offer_id" | "offer_number" | "version_number">) {
  return `offers/${version.offer_id}/versions/${version.id}/${offerDocumentFileName(version.offer_number, version.version_number)}`;
}

export function offerAcceptanceStoragePath(
  version: Pick<OfferVersionDocumentRow, "id" | "offer_id" | "offer_number" | "version_number">,
  acceptanceId: string,
) {
  return `offers/${version.offer_id}/versions/${version.id}/acceptances/${safeOfferFileToken(acceptanceId)}/${offerAcceptanceFileName(version.offer_number, version.version_number)}`;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as JsonRecord)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, canonicalize(nested)]),
  );
}

export function offerVersionContentSha256(row: OfferVersionDocumentRow) {
  const content = {
    offer_id: row.offer_id,
    customer_id: row.customer_id,
    version_number: row.version_number,
    offer_number: row.offer_number,
    title: row.title,
    contact_name: row.contact_name,
    recipient_snapshot: row.recipient_snapshot,
    object_label: row.object_label,
    object_address: row.object_address,
    offer_date: row.offer_date,
    valid_until: row.valid_until,
    planned_start_date: row.planned_start_date,
    intro: row.intro,
    visible_note: row.visible_note,
    payment_terms: row.payment_terms,
    contract_terms: row.contract_terms,
    issuer_snapshot: row.issuer_snapshot,
    subtotal_cents: integerValue(row.subtotal_cents),
    discount_total_cents: integerValue(row.discount_total_cents),
    net_total_cents: integerValue(row.net_total_cents),
    tax_total_cents: integerValue(row.tax_total_cents),
    gross_total_cents: integerValue(row.gross_total_cents),
    billing_totals: row.billing_totals,
    calculation_snapshot: row.calculation_snapshot,
    items: (row.offer_version_items ?? []).slice().sort((left, right) => left.sort_order - right.sort_order),
    discounts: (row.offer_discounts ?? []).slice().sort((left, right) => left.sort_order - right.sort_order),
  };
  return sha256Hex(JSON.stringify(canonicalize(content)));
}
