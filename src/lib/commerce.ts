export type CommerceLineItem = {
  title: string;
  description?: string;
  quantity: number;
  unit: string;
  unitNet: number;
  totalNet: number;
  sortOrder?: number;
};

export type DocumentTotals = {
  netTotal: number;
  taxRate: number;
  taxTotal: number;
  grossTotal: number;
};

export const taxRateDefault = 19;

export const billingModeLabels: Record<string, string> = {
  one_time: "einmalig",
  monthly: "monatlich",
  quarterly: "quartalsweise",
  yearly: "jährlich",
  custom: "nach Vereinbarung",
};

export function parseDecimal(value: unknown) {
  const parsed =
    typeof value === "number"
      ? value
      : Number(String(value ?? "0").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateTotals(items: CommerceLineItem[], taxRate = taxRateDefault): DocumentTotals {
  const netTotal = roundMoney(items.reduce((sum, item) => sum + item.totalNet, 0));
  const taxTotal = roundMoney(netTotal * (taxRate / 100));
  return {
    netTotal,
    taxRate,
    taxTotal,
    grossTotal: roundMoney(netTotal + taxTotal),
  };
}

export function normalizeLineItems(items: Array<Partial<CommerceLineItem>>) {
  return items
    .map((item, index) => {
      const quantity = item.quantity && item.quantity > 0 ? item.quantity : 1;
      const unitNet = item.unitNet && item.unitNet > 0 ? item.unitNet : 0;
      return {
        title: String(item.title ?? "").trim(),
        description: String(item.description ?? "").trim(),
        quantity,
        unit: String(item.unit ?? "Pauschale").trim() || "Pauschale",
        unitNet: roundMoney(unitNet),
        totalNet: roundMoney(quantity * unitNet),
        sortOrder: item.sortOrder ?? index,
      };
    })
    .filter((item) => item.title && item.unitNet > 0);
}

export function createDocumentNumber(prefix: "ANG" | "RE", seed?: string) {
  const date = new Date();
  const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(
    date.getDate(),
  ).padStart(2, "0")}`;
  const suffix = (seed ?? crypto.randomUUID()).replace(/-/g, "").slice(0, 6).toUpperCase();
  return `HV-${prefix}-${stamp}-${suffix}`;
}

export function isRecurringBillingMode(mode: string | null | undefined) {
  return Boolean(mode && mode !== "one_time");
}

export function nextServiceMonth(from = new Date()) {
  const start = new Date(from.getFullYear(), from.getMonth() + 1, 1);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

export function dueDateBeforeCurrentMonthEnd(daysBeforeMonthEnd = 15, from = new Date()) {
  const currentMonthEnd = new Date(from.getFullYear(), from.getMonth() + 1, 0);
  currentMonthEnd.setDate(currentMonthEnd.getDate() - daysBeforeMonthEnd);
  return currentMonthEnd.toISOString().slice(0, 10);
}

export function monthPeriodFromStart(periodStart: string) {
  const start = new Date(`${periodStart}T00:00:00`);
  if (Number.isNaN(start.getTime())) return nextServiceMonth();
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

export function nextMonthAfter(periodStart: string) {
  const start = new Date(`${periodStart}T00:00:00`);
  if (Number.isNaN(start.getTime())) return nextServiceMonth().start;
  const next = new Date(start.getFullYear(), start.getMonth() + 1, 1);
  return next.toISOString().slice(0, 10);
}

export function dueDateBeforePeriodStart(periodStart: string, daysBeforeMonthEnd = 15) {
  const start = new Date(`${periodStart}T00:00:00`);
  if (Number.isNaN(start.getTime())) return dueDateBeforeCurrentMonthEnd(daysBeforeMonthEnd);
  const previousMonthEnd = new Date(start.getFullYear(), start.getMonth(), 0);
  previousMonthEnd.setDate(previousMonthEnd.getDate() - daysBeforeMonthEnd);
  return previousMonthEnd.toISOString().slice(0, 10);
}

export function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(value);
}
