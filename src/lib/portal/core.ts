export const BERLIN_TIME_ZONE = "Europe/Berlin";
export const PORTAL_CURRENCY = "EUR";

export const CUSTOMER_CATEGORY_LABELS = {
  private: "Privat",
  commercial: "Gewerblich",
  property_management: "Hausverwaltung",
  investor: "Investor",
} as const;

export const EMPLOYEE_CATEGORY_LABELS = {
  minijob: "Minijobber",
  part_time: "Teilzeit",
  full_time: "Vollzeit",
  freelancer: "Freelancer",
} as const;

export const PROPERTY_TYPE_LABELS = {
  single_family: "Einfamilienhaus",
  multi_family: "Mehrfamilienhaus",
  residential_complex: "Wohnanlage",
  weg: "WEG",
  commercial: "Gewerbeobjekt",
  office_practice: "Büro oder Praxis",
  mixed: "Gemischtes Objekt",
  other: "Sonstiges",
} as const;

export const EXECUTION_RULE_LABELS = {
  every_visit: "Bei jedem Besuch",
  once_weekly: "Einmal pro Woche",
  multiple_weekly: "Mehrmals pro Woche",
  once_monthly: "Einmal pro Monat",
  multiple_monthly: "Mehrmals pro Monat",
  once_quarterly: "Einmal pro Quartal",
  once_yearly: "Einmal pro Jahr",
  once_season: "Einmal pro Saison",
  on_demand: "Nach Bedarf",
  manual: "Manuell terminieren",
} as const;

export const VISIT_STATUS_LABELS: Record<string, string> = {
  scheduled: "Geplant",
  started: "Gestartet",
  completed: "Abgeschlossen",
  canceled: "Abgesagt",
};

export const TASK_STATUS_LABELS: Record<string, string> = {
  open: "Offen",
  in_progress: "In Bearbeitung",
  done: "Erledigt",
  blocked: "Nicht ausführbar",
};

export type AddressInput = {
  street?: string | null;
  houseNumber?: string | null;
  postalCode?: string | null;
  city?: string | null;
  country?: string | null;
};

export function formatAddress(address: AddressInput) {
  const street = [address.street?.trim(), address.houseNumber?.trim()].filter(Boolean).join(" ");
  const city = [address.postalCode?.trim(), address.city?.trim()].filter(Boolean).join(" ");
  return [street, city, address.country?.trim() || "Deutschland"].filter(Boolean).join(", ");
}

export function parseEuroToCentsStrict(value: unknown): number | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    const cents = Math.round(value * 100);
    return Number.isSafeInteger(cents) ? cents : null;
  }

  const raw = String(value ?? "").trim().replace(/\s/g, "").replace(/€/g, "");
  if (!raw) return 0;

  let normalized: string;
  if (raw.includes(",")) {
    if (!/^-?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?$/.test(raw)) return null;
    normalized = raw.replace(/\./g, "").replace(",", ".");
  } else {
    if (!/^-?\d+(?:\.\d{1,2})?$/.test(raw)) return null;
    normalized = raw;
  }

  const amount = Number(normalized);
  const cents = Math.round(amount * 100);
  return Number.isSafeInteger(cents) ? cents : null;
}

export function parseEuroToCents(value: unknown) {
  return parseEuroToCentsStrict(value) ?? 0;
}

export function formatCents(cents: number) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: PORTAL_CURRENCY,
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

export function calculateTaxCents(netCents: number, taxRateBps: number) {
  return Math.round((netCents * taxRateBps) / 10_000);
}

export function calculateGrossCents(netCents: number, taxRateBps: number) {
  return netCents + calculateTaxCents(netCents, taxRateBps);
}

export function calculateTimedChargeCents(durationMinutes: number, hourlyRateCents: number) {
  if (!Number.isInteger(durationMinutes) || durationMinutes < 0) return 0;
  if (!Number.isInteger(hourlyRateCents) || hourlyRateCents < 0) return 0;
  return Math.round((durationMinutes * hourlyRateCents) / 60);
}

export function isMonthInSeason(month: number, startMonth: number, endMonth: number) {
  if (![month, startMonth, endMonth].every((value) => Number.isInteger(value) && value >= 1 && value <= 12)) {
    return false;
  }
  if (startMonth <= endMonth) return month >= startMonth && month <= endMonth;
  return month >= startMonth || month <= endMonth;
}

export function isDateInSeason(
  value: Date | string,
  startMonth: number | null | undefined,
  endMonth: number | null | undefined,
) {
  if (!startMonth || !endMonth) return true;
  const date = typeof value === "string" ? new Date(`${value}T12:00:00Z`) : value;
  if (Number.isNaN(date.getTime())) return false;
  return isMonthInSeason(date.getUTCMonth() + 1, startMonth, endMonth);
}

export function berlinDateParts(value = new Date()) {
  const parts = new Intl.DateTimeFormat("de-DE", {
    timeZone: BERLIN_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return { year: Number(part("year")), month: Number(part("month")), day: Number(part("day")) };
}

export function berlinIsoDate(value = new Date()) {
  const { year, month, day } = berlinDateParts(value);
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day
    .toString()
    .padStart(2, "0")}`;
}

export function previousBerlinMonth(value = new Date()) {
  const { year, month } = berlinDateParts(value);
  const start = new Date(Date.UTC(year, month - 2, 1, 12));
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0, 12));
  return {
    billingMonth: `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}-01`,
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

export function formatGermanDate(value: string | Date, options?: Intl.DateTimeFormatOptions) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "–";
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: BERLIN_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...options,
  }).format(date);
}

function berlinDateTimeParts(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BERLIN_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return {
    year: Number(part("year")),
    month: Number(part("month")),
    day: Number(part("day")),
    hour: Number(part("hour")),
    minute: Number(part("minute")),
    second: Number(part("second")),
  };
}

export function formatBerlinDateTimeLocal(value: unknown) {
  const date = value instanceof Date ? value : new Date(String(value ?? ""));
  if (Number.isNaN(date.getTime())) return "";
  const parts = berlinDateTimeParts(date);
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(
    parts.day,
  ).padStart(2, "0")}T${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(
    2,
    "0",
  )}`;
}

export function parseBerlinDateTimeLocal(value: unknown) {
  const match = String(value ?? "")
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second = "00"] = match;
  const requestedUtcWallTime = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );
  if (!Number.isFinite(requestedUtcWallTime)) return null;

  let candidate = new Date(requestedUtcWallTime);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const rendered = berlinDateTimeParts(candidate);
    const renderedUtcWallTime = Date.UTC(
      rendered.year,
      rendered.month - 1,
      rendered.day,
      rendered.hour,
      rendered.minute,
      rendered.second,
    );
    candidate = new Date(candidate.getTime() + requestedUtcWallTime - renderedUtcWallTime);
  }

  const normalizedInput = `${year}-${month}-${day}T${hour}:${minute}`;
  if (formatBerlinDateTimeLocal(candidate) !== normalizedInput) return null;
  return candidate.toISOString();
}

export function minutesBetweenServerTimes(start: string | Date, end: string | Date) {
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return 0;
  return Math.max(0, Math.round((endMs - startMs) / 60_000));
}
