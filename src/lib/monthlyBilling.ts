export const BILLING_TIME_ZONE = "Europe/Berlin";

export type BillingLineCents = {
  netCents: number;
  taxRateBps: number;
};

export type BillingTotalsCents = {
  netCents: number;
  taxCents: number;
  grossCents: number;
};

export type BillingPeriod = {
  billingMonth: string;
  start: string;
  end: string;
};

export type ValidationResult = {
  valid: boolean;
  missing: string[];
};

export type PropertyCarePeriod = {
  status: string;
  care_start_date?: string | null;
  care_end_date?: string | null;
  archived_at?: string | null;
};

export type CompensationRatePeriod = {
  property_id: string;
  net_amount_cents: number;
  tax_rate_bps: number;
  valid_from: string;
  valid_until?: string | null;
};

export function canCancelExtraCharge(
  billingStatus: string,
  invoiceItemId?: string | null,
) {
  return billingStatus === "open" && !invoiceItemId;
}

type UnknownRecord = Record<string, unknown>;

function integer(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

function nonBlank(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function firstNonBlank(record: UnknownRecord, keys: string[]) {
  return keys.find((key) => nonBlank(record[key]));
}

function safeAdd(left: number, right: number) {
  const result = left + right;
  if (!Number.isSafeInteger(result)) throw new RangeError("Billing total exceeds safe integer range");
  return result;
}

export function calculateLineTaxCents(netCents: number, taxRateBps: number) {
  if (!Number.isSafeInteger(netCents) || netCents < 0) {
    throw new RangeError("Net amount must be a non-negative integer number of cents");
  }
  if (!Number.isSafeInteger(taxRateBps) || taxRateBps < 0 || taxRateBps > 10_000) {
    throw new RangeError("Tax rate must be integer basis points between 0 and 10000");
  }
  return Math.round((netCents * taxRateBps) / 10_000);
}

export function calculateBillingTotals(lines: BillingLineCents[]): BillingTotalsCents {
  let netCents = 0;
  let taxCents = 0;

  for (const line of lines) {
    netCents = safeAdd(netCents, line.netCents);
    taxCents = safeAdd(taxCents, calculateLineTaxCents(line.netCents, line.taxRateBps));
  }

  return {
    netCents,
    taxCents,
    grossCents: safeAdd(netCents, taxCents),
  };
}

export function calculateTaxBreakdown(lines: BillingLineCents[]) {
  const grouped = new Map<number, number>();
  for (const line of lines) {
    grouped.set(
      line.taxRateBps,
      safeAdd(grouped.get(line.taxRateBps) ?? 0, calculateLineTaxCents(line.netCents, line.taxRateBps)),
    );
  }
  return Array.from(grouped, ([taxRateBps, taxCents]) => ({ taxRateBps, taxCents })).sort(
    (left, right) => left.taxRateBps - right.taxRateBps,
  );
}

export function centsToLegacyAmount(cents: number) {
  if (!Number.isSafeInteger(cents)) throw new RangeError("Amount must be integer cents");
  return cents / 100;
}

export function berlinDateParts(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BILLING_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");
  return { year: read("year"), month: read("month"), day: read("day") };
}

export function isBerlinFirstOfMonth(value = new Date()) {
  return berlinDateParts(value).day === 1;
}

export function berlinIsoDate(value = new Date()) {
  const { year, month, day } = berlinDateParts(value);
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function previousBerlinBillingPeriod(value = new Date()): BillingPeriod {
  const { year, month } = berlinDateParts(value);
  const start = new Date(Date.UTC(year, month - 2, 1));
  const end = new Date(Date.UTC(year, month - 1, 0));
  const iso = (date: Date) => date.toISOString().slice(0, 10);
  return { billingMonth: iso(start), start: iso(start), end: iso(end) };
}

export function carePeriodOverlapsBillingPeriod(
  property: PropertyCarePeriod,
  period: BillingPeriod,
) {
  if (property.status === "planning") return false;
  const startsOn = property.care_start_date || period.start;
  const endsOn =
    property.care_end_date ||
    (property.status === "archived" ? property.archived_at?.slice(0, 10) : null);
  if (startsOn > period.end) return false;
  if (endsOn && endsOn < period.start) return false;
  if (property.status === "paused" && !endsOn) return false;
  return true;
}

export function selectCompensationRateForPeriod(
  rates: CompensationRatePeriod[],
  period: BillingPeriod,
  careStartDate?: string | null,
) {
  const effectiveDate =
    careStartDate && careStartDate > period.start ? careStartDate : period.start;
  const activeAtStart = rates
    .filter(
      (rate) =>
        rate.valid_from <= effectiveDate &&
        (!rate.valid_until || rate.valid_until >= effectiveDate),
    )
    .sort((left, right) => right.valid_from.localeCompare(left.valid_from));
  if (activeAtStart[0]) return activeAtStart[0];

  return rates
    .filter(
      (rate) =>
        rate.valid_from <= period.end &&
        (!rate.valid_until || rate.valid_until >= period.start),
    )
    .sort((left, right) => left.valid_from.localeCompare(right.valid_from))[0] ?? null;
}

export function addCalendarDays(isoDate: string, days: number) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate) || !Number.isSafeInteger(days) || days < 0) {
    throw new RangeError("Invalid date or payment term");
  }
  const date = new Date(`${isoDate}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) throw new RangeError("Invalid date");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function validateCompanySettings(settings: UnknownRecord | null | undefined): ValidationResult {
  if (!settings) return { valid: false, missing: ["Unternehmenseinstellungen"] };

  const fields: Array<[string, string[]]> = [
    ["Rechtlicher Firmenname", ["legal_name"]],
    ["Straße", ["address_street", "street"]],
    ["Hausnummer", ["address_house_number", "house_number"]],
    ["Postleitzahl", ["address_postal_code", "postal_code"]],
    ["Ort", ["address_city", "city"]],
    ["Land", ["address_country", "country"]],
    ["Handelsregister", ["commercial_register"]],
    ["Geschäftsführung", ["management"]],
    ["E-Mail", ["email"]],
    ["Bankname", ["bank_name"]],
    ["IBAN", ["iban"]],
    ["BIC", ["bic"]],
    ["Rechnungspräfix", ["invoice_prefix"]],
  ];
  const missing = fields
    .filter(([, keys]) => !firstNonBlank(settings, keys))
    .map(([label]) => label);

  if (!firstNonBlank(settings, ["tax_number", "vat_id", "vat_identification_number"])) {
    missing.push("Steuernummer oder Umsatzsteuer-ID");
  }
  if (nonBlank(settings.email) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(settings.email))) {
    missing.push("gültige E-Mail");
  }

  const dueDays = integer(settings.payment_due_days);
  if (dueDays === null || dueDays < 0 || dueDays > 365) missing.push("Zahlungsziel");

  const taxRateBps = integer(settings.default_tax_rate_bps);
  if (taxRateBps === null || taxRateBps < 0 || taxRateBps > 10_000) {
    missing.push("Standard-Umsatzsteuersatz");
  }

  return { valid: missing.length === 0, missing };
}

export function validatePropertyBillingProfile(profile: UnknownRecord | null | undefined): ValidationResult {
  if (!profile) return { valid: false, missing: ["Rechnungsempfänger"] };
  const fields: Array<[string, string[]]> = [
    ["Empfängername", ["recipient_name", "billing_name"]],
    ["Straße", ["street", "billing_street"]],
    ["Hausnummer", ["house_number", "billing_house_number"]],
    ["Postleitzahl", ["postal_code", "billing_postal_code"]],
    ["Ort", ["city", "billing_city"]],
    ["Land", ["country", "billing_country"]],
    ["Rechnungs-E-Mail", ["billing_email", "email"]],
  ];
  const missing = fields
    .filter(([, keys]) => !firstNonBlank(profile, keys))
    .map(([label]) => label);
  const email = profile.billing_email ?? profile.email;
  if (nonBlank(email) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) {
    missing.push("gültige Rechnungs-E-Mail");
  }
  return { valid: missing.length === 0, missing };
}
