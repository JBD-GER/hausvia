export type VisitPlanFrequency =
  | "weekly"
  | "monthly"
  | "quarterly"
  | "individual";

export type EditableVisitPlanFrequency = Exclude<
  VisitPlanFrequency,
  "quarterly"
>;

export type VisitRecurrencePreset =
  | "once"
  | "weekly"
  | "biweekly"
  | "monthly"
  | "quarterly"
  | "semiannual"
  | "yearly"
  | "custom";

export type VisitRecurrence = {
  frequency: EditableVisitPlanFrequency;
  repeatEvery: number;
};

export const VISIT_WEEKDAYS = [
  [1, "Montag"],
  [2, "Dienstag"],
  [3, "Mittwoch"],
  [4, "Donnerstag"],
  [5, "Freitag"],
  [6, "Samstag"],
  [7, "Sonntag"],
] as const;

const WEEKDAY_LABELS = new Map<number, string>(VISIT_WEEKDAYS);

function positiveInteger(value: number | null | undefined) {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.trunc(value ?? 1));
}

/**
 * Converts legacy quarterly plans into the editable month-based model.
 * A legacy `quarterly + 2` plan therefore means every six months.
 */
export function normalizeVisitRecurrence(
  frequency: VisitPlanFrequency | string,
  repeatEvery: number | null | undefined = 1,
): VisitRecurrence {
  const interval = positiveInteger(repeatEvery);

  if (frequency === "individual") {
    return { frequency: "individual", repeatEvery: 1 };
  }

  if (frequency === "quarterly") {
    return { frequency: "monthly", repeatEvery: interval * 3 };
  }

  if (frequency === "monthly") {
    return { frequency: "monthly", repeatEvery: interval };
  }

  return { frequency: "weekly", repeatEvery: interval };
}

export function getVisitRecurrencePreset(
  frequency: VisitPlanFrequency | string,
  repeatEvery: number | null | undefined = 1,
): VisitRecurrencePreset {
  const normalized = normalizeVisitRecurrence(frequency, repeatEvery);

  if (normalized.frequency === "individual") return "once";
  if (normalized.frequency === "weekly" && normalized.repeatEvery === 1) {
    return "weekly";
  }
  if (normalized.frequency === "weekly" && normalized.repeatEvery === 2) {
    return "biweekly";
  }
  if (normalized.frequency === "monthly" && normalized.repeatEvery === 1) {
    return "monthly";
  }
  if (normalized.frequency === "monthly" && normalized.repeatEvery === 3) {
    return "quarterly";
  }
  if (normalized.frequency === "monthly" && normalized.repeatEvery === 6) {
    return "semiannual";
  }
  if (normalized.frequency === "monthly" && normalized.repeatEvery === 12) {
    return "yearly";
  }
  return "custom";
}

export function getVisitRecurrenceLabel(
  frequency: VisitPlanFrequency | string,
  repeatEvery: number | null | undefined = 1,
) {
  const normalized = normalizeVisitRecurrence(frequency, repeatEvery);

  if (normalized.frequency === "individual") return "Einmalig";

  if (normalized.frequency === "weekly") {
    if (normalized.repeatEvery === 1) return "Wöchentlich";
    if (normalized.repeatEvery === 2) return "Alle 2 Wochen";
    return `Alle ${normalized.repeatEvery} Wochen`;
  }

  if (normalized.repeatEvery === 1) return "Monatlich";
  if (normalized.repeatEvery === 3) return "Quartalsweise";
  if (normalized.repeatEvery === 6) return "Halbjährlich";
  if (normalized.repeatEvery === 12) return "Jährlich";
  return `Alle ${normalized.repeatEvery} Monate`;
}

function parseIsoDate(value: string | null | undefined) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day, 12));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

export function formatVisitPlanDate(value: string | null | undefined) {
  const date = parseIsoDate(value);
  if (!date) return "Datum noch auswählen";

  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function joinGerman(values: string[]) {
  if (values.length <= 1) return values[0] ?? "";
  return `${values.slice(0, -1).join(", ")} und ${values.at(-1)}`;
}

function weekdayFromDate(value: string | null | undefined) {
  const date = parseIsoDate(value);
  if (!date) return null;
  return ((date.getUTCDay() + 6) % 7) + 1;
}

function monthDayFromDate(value: string | null | undefined) {
  return parseIsoDate(value)?.getUTCDate() ?? null;
}

export type VisitScheduleSummaryOptions = {
  frequency: VisitPlanFrequency | string;
  repeatEvery?: number | null;
  weekdays?: readonly number[];
  monthDays?: readonly number[];
  startDate?: string | null;
  endDate?: string | null;
  desiredTime?: string | null;
  windowStart?: string | null;
  windowEnd?: string | null;
};

export function getVisitScheduleSummary({
  frequency,
  repeatEvery = 1,
  weekdays = [],
  monthDays = [],
  startDate,
  endDate,
  desiredTime,
  windowStart,
  windowEnd,
}: VisitScheduleSummaryOptions) {
  const recurrence = normalizeVisitRecurrence(frequency, repeatEvery);
  const recurrenceLabel = getVisitRecurrenceLabel(
    recurrence.frequency,
    recurrence.repeatEvery,
  );
  const parts: string[] = [];

  if (recurrence.frequency === "individual") {
    parts.push(`${recurrenceLabel} am ${formatVisitPlanDate(startDate)}`);
  } else {
    parts.push(recurrenceLabel);

    if (recurrence.frequency === "weekly") {
      const normalizedDays = Array.from(
        new Set(weekdays.filter((day) => day >= 1 && day <= 7)),
      ).sort((left, right) => left - right);
      const fallbackDay = weekdayFromDate(startDate);
      const dayLabels = (normalizedDays.length
        ? normalizedDays
        : fallbackDay
          ? [fallbackDay]
          : []
      )
        .map((day) => WEEKDAY_LABELS.get(day))
        .filter((label): label is string => Boolean(label));

      parts.push(
        dayLabels.length
          ? `jeweils ${joinGerman(dayLabels)}`
          : "am Wochentag des Startdatums",
      );
    } else {
      const normalizedDays = Array.from(
        new Set(monthDays.filter((day) => day >= 1 && day <= 31)),
      ).sort((left, right) => left - right);
      const fallbackDay = monthDayFromDate(startDate);
      const days = normalizedDays.length
        ? normalizedDays
        : fallbackDay
          ? [fallbackDay]
          : [];

      parts.push(
        days.length
          ? `am ${joinGerman(days.map((day) => `${day}.`))} des Monats`
          : "am Kalendertag des Startdatums",
      );
    }

    parts.push(`ab ${formatVisitPlanDate(startDate)}`);
    if (endDate) parts.push(`bis ${formatVisitPlanDate(endDate)}`);
  }

  if (desiredTime) {
    parts.push(`${desiredTime.slice(0, 5)} Uhr`);
  } else if (windowStart && windowEnd) {
    parts.push(`${windowStart.slice(0, 5)}–${windowEnd.slice(0, 5)} Uhr`);
  }

  return parts.join(" · ");
}
