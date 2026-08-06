export const VISIT_CALENDAR_VIEWS = ["month", "week"] as const;

export type VisitCalendarView = (typeof VISIT_CALENDAR_VIEWS)[number];

export type VisitCalendarRange = {
  start: string;
  end: string;
};

export const VISIT_CALENDAR_WEEKDAYS = [
  { short: "Mo", long: "Montag" },
  { short: "Di", long: "Dienstag" },
  { short: "Mi", long: "Mittwoch" },
  { short: "Do", long: "Donnerstag" },
  { short: "Fr", long: "Freitag" },
  { short: "Sa", long: "Samstag" },
  { short: "So", long: "Sonntag" },
] as const;

const GERMAN_MONTHS = [
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
] as const;

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_IN_MILLISECONDS = 86_400_000;
const MAX_ENUMERATED_DAYS = 4_000;

type CalendarDateParts = {
  year: number;
  month: number;
  day: number;
};

function utcDate({ year, month, day }: CalendarDateParts) {
  const date = new Date(0);
  date.setUTCHours(12, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return date;
}

function dateParts(value: unknown): CalendarDateParts | null {
  if (typeof value !== "string") return null;
  const match = ISO_DATE_PATTERN.exec(value.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || year > 9_999) return null;

  const date = utcDate({ year, month, day });
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

function requiredDateParts(value: unknown): CalendarDateParts {
  const parts = dateParts(value);
  if (!parts) {
    throw new RangeError(`Ungültiges Kalenderdatum: ${String(value ?? "")}`);
  }
  return parts;
}

function isoDateFromParts({ year, month, day }: CalendarDateParts) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function isoDateFromDate(date: Date) {
  return isoDateFromParts({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  });
}

function integerStep(value: number, label: string) {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} muss eine ganze Zahl sein.`);
  }
  return value;
}

function daysInMonth(year: number, month: number) {
  const firstOfFollowingMonth = utcDate({
    year: month === 12 ? year + 1 : year,
    month: month === 12 ? 1 : month + 1,
    day: 1,
  });
  firstOfFollowingMonth.setUTCDate(0);
  return firstOfFollowingMonth.getUTCDate();
}

export function isCalendarDate(value: unknown): value is string {
  return dateParts(value) !== null;
}

export function normalizeCalendarDate(value: unknown, fallback: string) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (isCalendarDate(normalized)) return normalized;

  const normalizedFallback = fallback.trim();
  if (!isCalendarDate(normalizedFallback)) {
    throw new RangeError(`Ungültiges Ersatzdatum: ${fallback}`);
  }
  return normalizedFallback;
}

export function normalizeVisitCalendarView(
  value: unknown,
): VisitCalendarView {
  return value === "week" ? "week" : "month";
}

export function addCalendarDays(value: string, amount: number) {
  const date = utcDate(requiredDateParts(value));
  date.setUTCDate(date.getUTCDate() + integerStep(amount, "Die Tagesanzahl"));
  return isoDateFromDate(date);
}

export function addCalendarMonths(value: string, amount: number) {
  const { year, month, day } = requiredDateParts(value);
  const monthOffset = year * 12 + (month - 1) + integerStep(amount, "Die Monatsanzahl");
  const targetYear = Math.floor(monthOffset / 12);
  const targetMonthIndex = ((monthOffset % 12) + 12) % 12;
  const targetMonth = targetMonthIndex + 1;

  if (targetYear < 1 || targetYear > 9_999) {
    throw new RangeError("Das verschobene Kalenderdatum liegt außerhalb des unterstützten Bereichs.");
  }

  return isoDateFromParts({
    year: targetYear,
    month: targetMonth,
    day: Math.min(day, daysInMonth(targetYear, targetMonth)),
  });
}

/** Returns the weekday index with Monday = 0 and Sunday = 6. */
export function calendarWeekdayIndex(value: string) {
  const day = utcDate(requiredDateParts(value)).getUTCDay();
  return (day + 6) % 7;
}

export function startOfCalendarWeek(value: string) {
  return addCalendarDays(value, -calendarWeekdayIndex(value));
}

export function endOfCalendarWeek(value: string) {
  return addCalendarDays(startOfCalendarWeek(value), 6);
}

export function getMonthCalendarRange(value: string): VisitCalendarRange {
  const { year, month } = requiredDateParts(value);
  const firstOfMonth = isoDateFromParts({ year, month, day: 1 });
  const start = startOfCalendarWeek(firstOfMonth);

  return {
    start,
    // A stable six-week grid prevents the calendar from jumping in height.
    end: addCalendarDays(start, 41),
  };
}

export function getWeekCalendarRange(value: string): VisitCalendarRange {
  const start = startOfCalendarWeek(value);
  return { start, end: addCalendarDays(start, 6) };
}

export function getVisitCalendarRange(
  view: VisitCalendarView,
  value: string,
): VisitCalendarRange {
  return view === "week"
    ? getWeekCalendarRange(value)
    : getMonthCalendarRange(value);
}

export function calendarDatesBetween(start: string, end: string) {
  const startDate = utcDate(requiredDateParts(start));
  const endDate = utcDate(requiredDateParts(end));
  const distance = Math.round(
    (endDate.getTime() - startDate.getTime()) / DAY_IN_MILLISECONDS,
  );

  if (distance < 0) {
    throw new RangeError("Das Enddatum liegt vor dem Startdatum.");
  }
  if (distance + 1 > MAX_ENUMERATED_DAYS) {
    throw new RangeError("Der angeforderte Kalenderzeitraum ist zu groß.");
  }

  return Array.from({ length: distance + 1 }, (_, index) =>
    addCalendarDays(start, index),
  );
}

export function isCalendarDateInRange(
  value: string,
  range: VisitCalendarRange,
) {
  requiredDateParts(value);
  requiredDateParts(range.start);
  requiredDateParts(range.end);
  return value >= range.start && value <= range.end;
}

export function isSameCalendarMonth(left: string, right: string) {
  const leftParts = requiredDateParts(left);
  const rightParts = requiredDateParts(right);
  return (
    leftParts.year === rightParts.year && leftParts.month === rightParts.month
  );
}

export function shiftVisitCalendarDate(
  value: string,
  view: VisitCalendarView,
  amount: number,
) {
  const step = integerStep(amount, "Die Navigationsanzahl");
  return view === "week"
    ? addCalendarDays(value, step * 7)
    : addCalendarMonths(value, step);
}

export function formatVisitCalendarTitle(
  value: string,
  view: VisitCalendarView,
) {
  const parts = requiredDateParts(value);
  if (view === "month") {
    return `${GERMAN_MONTHS[parts.month - 1]} ${parts.year}`;
  }

  const range = getWeekCalendarRange(value);
  const start = requiredDateParts(range.start);
  const end = requiredDateParts(range.end);

  if (start.year === end.year && start.month === end.month) {
    return `${start.day}.–${end.day}. ${GERMAN_MONTHS[start.month - 1]} ${start.year}`;
  }
  if (start.year === end.year) {
    return `${start.day}. ${GERMAN_MONTHS[start.month - 1]} – ${end.day}. ${GERMAN_MONTHS[end.month - 1]} ${start.year}`;
  }
  return `${start.day}. ${GERMAN_MONTHS[start.month - 1]} ${start.year} – ${end.day}. ${GERMAN_MONTHS[end.month - 1]} ${end.year}`;
}

export function formatVisitCalendarFullDate(value: string) {
  const parts = requiredDateParts(value);
  const weekday = VISIT_CALENDAR_WEEKDAYS[calendarWeekdayIndex(value)].long;
  return `${weekday}, ${parts.day}. ${GERMAN_MONTHS[parts.month - 1]} ${parts.year}`;
}

export function calendarDayNumber(value: string) {
  return requiredDateParts(value).day;
}

export function calendarMonthNumber(value: string) {
  return requiredDateParts(value).month;
}

export function calendarWeekdayLabel(
  value: string,
  variant: "short" | "long" = "short",
) {
  return VISIT_CALENDAR_WEEKDAYS[calendarWeekdayIndex(value)][variant];
}

export function calendarDayVisitId(
  events: readonly { id: string }[],
): string | null {
  if (events.length !== 1) return null;
  return events[0]?.id.trim() || null;
}

export function buildVisitCalendarHref({
  baseHref,
  view,
  calendarDate,
  visitId,
}: {
  baseHref: string;
  view: VisitCalendarView;
  calendarDate: string;
  visitId?: string | null;
}) {
  if (!baseHref.trim()) throw new TypeError("Der Kalender benötigt einen Zielpfad.");
  requiredDateParts(calendarDate);

  const hashIndex = baseHref.indexOf("#");
  const hash = hashIndex >= 0 ? baseHref.slice(hashIndex) : "";
  const withoutHash = hashIndex >= 0 ? baseHref.slice(0, hashIndex) : baseHref;
  const queryIndex = withoutHash.indexOf("?");
  const pathname = queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;
  const existingQuery = queryIndex >= 0 ? withoutHash.slice(queryIndex + 1) : "";
  const query = new URLSearchParams(existingQuery);

  // Flash messages belong to the previous mutation and should not persist while navigating.
  query.delete("status");
  query.delete("error");
  query.set("view", "einsaetze");
  query.set("calendarView", normalizeVisitCalendarView(view));
  query.set("calendarDate", calendarDate);

  const normalizedVisitId = visitId?.trim();
  if (normalizedVisitId) query.set("visit", normalizedVisitId);
  else query.delete("visit");

  return `${pathname}?${query.toString()}${hash}`;
}
