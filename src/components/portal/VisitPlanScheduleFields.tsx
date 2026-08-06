"use client";

import { CalendarDays, Clock3, Plus, Repeat2, X } from "lucide-react";
import { useId, useState } from "react";
import { inputClass } from "@/components/portal/PortalUI";
import {
  getVisitRecurrencePreset,
  getVisitScheduleSummary,
  normalizeVisitRecurrence,
  VISIT_WEEKDAYS,
  type EditableVisitPlanFrequency,
  type VisitPlanFrequency,
  type VisitRecurrencePreset,
} from "@/lib/portal/visitRecurrence";

const recurrenceOptions: Array<{
  value: VisitRecurrencePreset;
  label: string;
}> = [
  { value: "once", label: "Einmalig" },
  { value: "weekly", label: "Jede Woche" },
  { value: "biweekly", label: "Alle 2 Wochen" },
  { value: "monthly", label: "Jeden Monat" },
  { value: "quarterly", label: "Quartalsweise (alle 3 Monate)" },
  { value: "semiannual", label: "Halbjährlich (alle 6 Monate)" },
  { value: "yearly", label: "Jährlich (alle 12 Monate)" },
  { value: "custom", label: "Eigenes Intervall" },
];

const presetValues: Partial<
  Record<
    VisitRecurrencePreset,
    { frequency: EditableVisitPlanFrequency; repeatEvery: number }
  >
> = {
  once: { frequency: "individual", repeatEvery: 1 },
  weekly: { frequency: "weekly", repeatEvery: 1 },
  biweekly: { frequency: "weekly", repeatEvery: 2 },
  monthly: { frequency: "monthly", repeatEvery: 1 },
  quarterly: { frequency: "monthly", repeatEvery: 3 },
  semiannual: { frequency: "monthly", repeatEvery: 6 },
  yearly: { frequency: "monthly", repeatEvery: 12 },
};

const monthDays = Array.from({ length: 31 }, (_, index) => index + 1);

const labelClass = "block text-sm font-extrabold text-slate-900";
const helperClass = "mt-2 text-xs font-medium leading-5 text-slate-500";
const choiceBaseClass =
  "inline-flex min-h-11 items-center justify-center rounded-xl border px-3 py-2 text-sm font-extrabold transition focus-within:outline-none focus-within:ring-4 focus-within:ring-brand/15";

function normalizeSelectedDays(
  values: readonly number[] | null | undefined,
  minimum: number,
  maximum: number,
) {
  return Array.from(
    new Set(
      (values ?? []).filter(
        (value) => Number.isInteger(value) && value >= minimum && value <= maximum,
      ),
    ),
  ).sort((left, right) => left - right);
}

function timeValue(value: string | null | undefined, fallback = "") {
  return value ? value.slice(0, 5) : fallback;
}

function startDateDay(value: string | null | undefined) {
  const day = Number((value ?? "").slice(8, 10));
  return Number.isInteger(day) && day >= 1 && day <= 31 ? day : 1;
}

export type VisitPlanScheduleFieldsProps = {
  initialFrequency?: VisitPlanFrequency | string | null;
  initialRepeatEvery?: number | null;
  initialWeekdays?: readonly number[] | null;
  initialMonthDays?: readonly number[] | null;
  initialDesiredTime?: string | null;
  initialWindowStart?: string | null;
  initialWindowEnd?: string | null;
  initialStartDate?: string | null;
  initialEndDate?: string | null;
  className?: string;
};

export function VisitPlanScheduleFields({
  initialFrequency = "weekly",
  initialRepeatEvery = 1,
  initialWeekdays = [],
  initialMonthDays = [],
  initialDesiredTime = "09:00",
  initialWindowStart = null,
  initialWindowEnd = null,
  initialStartDate = "",
  initialEndDate = "",
  className = "",
}: VisitPlanScheduleFieldsProps) {
  const controlId = useId().replaceAll(":", "");
  const initialRecurrence = normalizeVisitRecurrence(
    initialFrequency ?? "weekly",
    initialRepeatEvery,
  );
  const [preset, setPreset] = useState<VisitRecurrencePreset>(() =>
    getVisitRecurrencePreset(initialFrequency ?? "weekly", initialRepeatEvery),
  );
  const [frequency, setFrequency] = useState<EditableVisitPlanFrequency>(
    initialRecurrence.frequency,
  );
  const [repeatEvery, setRepeatEvery] = useState(
    Math.min(initialRecurrence.repeatEvery, 60),
  );
  const [selectedWeekdays, setSelectedWeekdays] = useState(() =>
    normalizeSelectedDays(initialWeekdays, 1, 7),
  );
  const [selectedMonthDays, setSelectedMonthDays] = useState(() =>
    normalizeSelectedDays(initialMonthDays, 1, 31),
  );
  const [monthDayCandidate, setMonthDayCandidate] = useState(() => {
    const selected = new Set(normalizeSelectedDays(initialMonthDays, 1, 31));
    const preferred = startDateDay(initialStartDate);
    return selected.has(preferred)
      ? (monthDays.find((day) => !selected.has(day)) ?? preferred)
      : preferred;
  });
  const [timeMode, setTimeMode] = useState<"fixed" | "window">(() =>
    !initialDesiredTime && initialWindowStart && initialWindowEnd
      ? "window"
      : "fixed",
  );
  const [desiredTime, setDesiredTime] = useState(() =>
    timeValue(initialDesiredTime, "09:00"),
  );
  const [windowStart, setWindowStart] = useState(() =>
    timeValue(initialWindowStart, "09:00"),
  );
  const [windowEnd, setWindowEnd] = useState(() =>
    timeValue(initialWindowEnd, "12:00"),
  );
  const [startDate, setStartDate] = useState(initialStartDate ?? "");
  const [endDate, setEndDate] = useState(initialEndDate ?? "");

  function applyPreset(nextPreset: VisitRecurrencePreset) {
    setPreset(nextPreset);
    if (nextPreset === "custom") {
      if (frequency === "individual") {
        setFrequency("weekly");
        setRepeatEvery(1);
      }
      return;
    }

    const value = presetValues[nextPreset];
    if (!value) return;
    setFrequency(value.frequency);
    setRepeatEvery(value.repeatEvery);
  }

  function toggleWeekday(day: number) {
    setSelectedWeekdays((current) =>
      current.includes(day)
        ? current.filter((value) => value !== day)
        : [...current, day].sort((left, right) => left - right),
    );
  }

  function addMonthDay() {
    if (selectedMonthDays.includes(monthDayCandidate)) return;
    const next = [...selectedMonthDays, monthDayCandidate].sort(
      (left, right) => left - right,
    );
    const selected = new Set(next);
    setSelectedMonthDays(next);
    setMonthDayCandidate(
      monthDays.find((day) => !selected.has(day)) ?? monthDayCandidate,
    );
  }

  const summary = getVisitScheduleSummary({
    frequency,
    repeatEvery,
    weekdays: selectedWeekdays,
    monthDays: selectedMonthDays,
    startDate,
    endDate: frequency === "individual" ? "" : endDate,
    desiredTime: timeMode === "fixed" ? desiredTime : "",
    windowStart: timeMode === "window" ? windowStart : "",
    windowEnd: timeMode === "window" ? windowEnd : "",
  });

  return (
    <section
      className={`col-span-full grid gap-4 ${className}`}
      data-visit-plan-schedule
    >
      <input type="hidden" name="frequency" value={frequency} />
      <input type="hidden" name="repeatEvery" value={repeatEvery} />

      <div className="grid gap-4 rounded-2xl border border-slate-200/90 bg-slate-50/70 p-4 sm:p-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
        <div>
          <label className={labelClass} htmlFor={`${controlId}-recurrence`}>
            Wie oft soll der Besuch stattfinden?
          </label>
          <select
            id={`${controlId}-recurrence`}
            value={preset}
            onChange={(event) =>
              applyPreset(event.target.value as VisitRecurrencePreset)
            }
            className={inputClass}
          >
            {recurrenceOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <p className={helperClass}>
            Das Intervall legt den Abstand fest. Den genauen Ausführungstag
            wählen Sie direkt darunter.
          </p>
        </div>

        {preset === "custom" ? (
          <div className="rounded-xl border border-[#08AEB4]/25 bg-white p-3.5">
            <p className={labelClass}>Eigenes Intervall</p>
            <div className="mt-2 grid grid-cols-[minmax(88px,0.55fr)_minmax(130px,1fr)] gap-2">
              <label>
                <span className="sr-only">Wiederholung alle</span>
                <input
                  type="number"
                  min="1"
                  max="60"
                  required
                  value={repeatEvery}
                  onChange={(event) => {
                    const value = event.currentTarget.valueAsNumber;
                    setRepeatEvery(
                      Number.isFinite(value)
                        ? Math.max(1, Math.min(60, Math.trunc(value)))
                        : 1,
                    );
                  }}
                  className={`${inputClass} mt-0`}
                />
              </label>
              <label>
                <span className="sr-only">Intervall-Einheit</span>
                <select
                  value={frequency}
                  onChange={(event) =>
                    setFrequency(
                      event.target.value as Exclude<
                        EditableVisitPlanFrequency,
                        "individual"
                      >,
                    )
                  }
                  className={`${inputClass} mt-0`}
                >
                  <option value="weekly">Wochen</option>
                  <option value="monthly">Monate</option>
                </select>
              </label>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3 rounded-xl border border-[#08AEB4]/20 bg-[#E7F8F9] p-3.5 text-[#064A4E]">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/75">
              <Repeat2 aria-hidden="true" size={20} />
            </span>
            <div>
              <p className="text-sm font-black">Einfaches Wiederholungsmuster</p>
              <p className="mt-1 text-xs font-semibold leading-5 text-[#08777B]">
                Kein Rechnen mit „Besuchen je Zeitraum“ mehr: Der Abstand wird
                direkt als Woche oder Monat gespeichert.
              </p>
            </div>
          </div>
        )}
      </div>

      {frequency === "weekly" ? (
        <fieldset className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <legend className="px-1 text-sm font-extrabold text-slate-900">
            An welchen Wochentagen?
          </legend>
          <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {VISIT_WEEKDAYS.map(([value, label]) => {
              const selected = selectedWeekdays.includes(value);
              return (
                <label
                  key={value}
                  className={`${choiceBaseClass} cursor-pointer ${
                    selected
                      ? "border-brand bg-brand text-white shadow-[0_8px_20px_rgba(8,43,97,0.18)]"
                      : "border-slate-200 bg-slate-50 text-slate-700 hover:border-brand/30 hover:bg-brand-soft/50"
                  }`}
                >
                  <input
                    type="checkbox"
                    name="weekday"
                    value={value}
                    checked={selected}
                    onChange={() => toggleWeekday(value)}
                    className="sr-only"
                  />
                  {label}
                </label>
              );
            })}
          </div>
          <p className={helperClass}>
            Ohne Auswahl verwenden wir automatisch den Wochentag des
            Startdatums.
          </p>
        </fieldset>
      ) : null}

      {frequency === "monthly" ? (
        <fieldset className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <legend className="px-1 text-sm font-extrabold text-slate-900">
            An welchen Tagen im Monat?
          </legend>
          <div className="mt-1 grid gap-3 sm:grid-cols-[minmax(0,220px)_auto] sm:items-end">
            <label>
              <span className="text-xs font-bold text-slate-600">
                Kalendertag auswählen
              </span>
              <select
                value={monthDayCandidate}
                onChange={(event) =>
                  setMonthDayCandidate(Number(event.target.value))
                }
                disabled={selectedMonthDays.length === 31}
                className={inputClass}
              >
                {monthDays.map((day) => (
                  <option
                    key={day}
                    value={day}
                    disabled={selectedMonthDays.includes(day)}
                  >
                    {day}. des Monats
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={addMonthDay}
              disabled={
                selectedMonthDays.length === 31 ||
                selectedMonthDays.includes(monthDayCandidate)
              }
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-brand/20 bg-brand-soft px-4 text-sm font-extrabold text-brand transition hover:border-brand/35 hover:bg-[#d9f3f4] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/15 disabled:pointer-events-none disabled:opacity-50 sm:w-auto"
            >
              <Plus aria-hidden="true" size={17} />
              Tag hinzufügen
            </button>
          </div>

          {selectedMonthDays.map((day) => (
            <input key={day} type="hidden" name="monthDay" value={day} />
          ))}

          {selectedMonthDays.length ? (
            <div className="mt-3 flex flex-wrap gap-2" aria-label="Ausgewählte Monatstage">
              {selectedMonthDays.map((day) => (
                <span
                  key={day}
                  className="inline-flex min-h-9 items-center gap-1 rounded-full border border-[#08AEB4]/25 bg-[#E7F8F9] py-1 pl-3 pr-1.5 text-xs font-extrabold text-[#056C71]"
                >
                  {day}. Tag
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedMonthDays((current) =>
                        current.filter((value) => value !== day),
                      )
                    }
                    aria-label={`${day}. Monatstag entfernen`}
                    className="grid size-7 place-items-center rounded-full transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#08AEB4]/35"
                  >
                    <X aria-hidden="true" size={14} />
                  </button>
                </span>
              ))}
            </div>
          ) : null}

          <p className={helperClass}>
            Ohne Auswahl verwenden wir den Kalendertag des Startdatums. Ein
            29., 30. oder 31. wird in kürzeren Monaten ausgelassen.
          </p>
        </fieldset>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <fieldset className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <legend className="flex items-center gap-2 px-1 text-sm font-extrabold text-slate-900">
            <Clock3 aria-hidden="true" size={18} className="text-[#087F83]" />
            Uhrzeit
          </legend>
          <div
            className="mt-1 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1"
            role="group"
            aria-label="Art der Uhrzeit"
          >
            <button
              type="button"
              aria-pressed={timeMode === "fixed"}
              onClick={() => setTimeMode("fixed")}
              className={`min-h-10 rounded-lg px-3 text-sm font-extrabold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25 ${
                timeMode === "fixed"
                  ? "bg-white text-brand shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Feste Uhrzeit
            </button>
            <button
              type="button"
              aria-pressed={timeMode === "window"}
              onClick={() => setTimeMode("window")}
              className={`min-h-10 rounded-lg px-3 text-sm font-extrabold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25 ${
                timeMode === "window"
                  ? "bg-white text-brand shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Zeitfenster
            </button>
          </div>

          {timeMode === "fixed" ? (
            <label className="mt-4 block">
              <span className={labelClass}>Gewünschte Uhrzeit</span>
              <input
                name="desiredTime"
                type="time"
                required
                value={desiredTime}
                onChange={(event) => setDesiredTime(event.target.value)}
                className={inputClass}
              />
            </label>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-3">
              <label>
                <span className={labelClass}>Von</span>
                <input
                  name="windowStart"
                  type="time"
                  required
                  value={windowStart}
                  onChange={(event) => setWindowStart(event.target.value)}
                  className={inputClass}
                />
              </label>
              <label>
                <span className={labelClass}>Bis</span>
                <input
                  name="windowEnd"
                  type="time"
                  required
                  min={windowStart || undefined}
                  value={windowEnd}
                  onChange={(event) => setWindowEnd(event.target.value)}
                  className={inputClass}
                />
              </label>
            </div>
          )}
        </fieldset>

        <fieldset className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <legend className="flex items-center gap-2 px-1 text-sm font-extrabold text-slate-900">
            <CalendarDays
              aria-hidden="true"
              size={18}
              className="text-[#087F83]"
            />
            Zeitraum
          </legend>
          <div
            className={`mt-1 grid gap-3 ${
              frequency === "individual" ? "" : "sm:grid-cols-2"
            }`}
          >
            <label>
              <span className={labelClass}>
                {frequency === "individual" ? "Termin am" : "Startdatum"}
              </span>
              <input
                name="startDate"
                type="date"
                required
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                className={inputClass}
              />
            </label>
            {frequency !== "individual" ? (
              <label>
                <span className={labelClass}>Enddatum optional</span>
                <input
                  name="endDate"
                  type="date"
                  min={startDate || undefined}
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                  className={inputClass}
                />
              </label>
            ) : null}
          </div>
          <p className={helperClass}>
            {frequency === "individual"
              ? "Der Termin wird genau einmal am gewählten Datum eingeplant."
              : "Ohne Enddatum läuft der Besuchsplan weiter, bis er pausiert oder archiviert wird."}
          </p>
        </fieldset>
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-[#08AEB4]/25 bg-gradient-to-br from-[#E7F8F9] to-white p-4 sm:p-5">
        <span
          aria-hidden="true"
          className="absolute -right-8 -top-8 size-28 rounded-full bg-[#08AEB4]/10 blur-2xl"
        />
        <p className="relative text-[0.68rem] font-black uppercase tracking-[0.16em] text-[#087F83]">
          So wird geplant
        </p>
        <p
          className="relative mt-2 text-sm font-extrabold leading-6 text-[#071C3E] sm:text-base"
          aria-live="polite"
        >
          {summary}
        </p>
      </div>
    </section>
  );
}
