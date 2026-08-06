import Link from "next/link";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ListChecks,
  UserRound,
} from "lucide-react";
import { VISIT_STATUS_LABELS } from "@/lib/portal/core";
import {
  VISIT_CALENDAR_WEEKDAYS,
  buildVisitCalendarHref,
  calendarDatesBetween,
  calendarDayNumber,
  calendarWeekdayLabel,
  formatVisitCalendarFullDate,
  formatVisitCalendarTitle,
  getVisitCalendarRange,
  getWeekCalendarRange,
  isCalendarDate,
  isCalendarDateInRange,
  isSameCalendarMonth,
  normalizeCalendarDate,
  normalizeVisitCalendarView,
  shiftVisitCalendarDate,
  type VisitCalendarView,
} from "@/lib/portal/visitCalendar";

export type VisitCalendarEvent = {
  id: string;
  date: string;
  time: string | null;
  status: string;
  planLabel: string;
  employeeName: string;
  taskCount: number;
};

export type VisitCalendarProps = {
  events: readonly VisitCalendarEvent[];
  view: VisitCalendarView;
  calendarDate: string;
  today: string;
  selectedVisitId?: string | null;
  baseHref: string;
  className?: string;
};

type NormalizedCalendarEvent = VisitCalendarEvent & {
  timeLabel: string;
  statusLabel: string;
};

const statusPresentation: Record<
  string,
  { chip: string; badge: string; dot: string }
> = {
  scheduled: {
    chip: "border-[#082B61]/15 bg-[#E8F0FB]/90 text-[#061F47] hover:border-[#082B61]/30 hover:bg-[#DDE9F8]",
    badge: "border-[#082B61]/15 bg-white/75 text-[#082B61]",
    dot: "bg-[#082B61]",
  },
  started: {
    chip: "border-[#E6B52F]/45 bg-[#FFF7D6] text-[#644C00] hover:border-[#D5A51F]/60 hover:bg-[#FFF1B8]",
    badge: "border-[#D5A51F]/35 bg-white/70 text-[#765900]",
    dot: "bg-[#D29B00]",
  },
  completed: {
    chip: "border-emerald-200 bg-emerald-50 text-emerald-900 hover:border-emerald-300 hover:bg-emerald-100",
    badge: "border-emerald-200 bg-white/75 text-emerald-700",
    dot: "bg-emerald-600",
  },
  canceled: {
    chip: "border-slate-200 bg-slate-100 text-slate-600 hover:border-slate-300 hover:bg-slate-200",
    badge: "border-slate-200 bg-white/75 text-slate-600",
    dot: "bg-slate-500",
  },
  default: {
    chip: "border-[#08AEB4]/25 bg-[#E7F8F9] text-[#064A4E] hover:border-[#08AEB4]/40 hover:bg-[#D8F3F4]",
    badge: "border-[#08AEB4]/20 bg-white/75 text-[#05777C]",
    dot: "bg-[#08AEB4]",
  },
};

function eventPresentation(status: string) {
  return statusPresentation[status] ?? statusPresentation.default;
}

function timeLabel(value: string | null) {
  const match = /^(?:[01]\d|2[0-3]):[0-5]\d/.exec(value?.trim() ?? "");
  return match?.[0] ?? "Zeit offen";
}

function tasksLabel(count: number) {
  return count === 1 ? "1 Aufgabe" : `${count} Aufgaben`;
}

function normalizeEvents(events: readonly VisitCalendarEvent[]) {
  return events
    .filter(
      (event): event is VisitCalendarEvent =>
        Boolean(event.id?.trim()) && isCalendarDate(event.date),
    )
    .map<NormalizedCalendarEvent>((event) => ({
      ...event,
      id: event.id.trim(),
      date: event.date.trim(),
      status: event.status.trim(),
      planLabel: event.planLabel.trim() || "Einsatz",
      employeeName: event.employeeName.trim() || "Noch nicht zugewiesen",
      taskCount: Number.isFinite(event.taskCount)
        ? Math.max(0, Math.trunc(event.taskCount))
        : 0,
      timeLabel: timeLabel(event.time),
      statusLabel:
        VISIT_STATUS_LABELS[event.status.trim()] ??
        (event.status.trim() || "Termin"),
    }))
    .sort((left, right) => {
      const dateComparison = left.date.localeCompare(right.date);
      if (dateComparison !== 0) return dateComparison;
      const timeComparison = left.timeLabel.localeCompare(right.timeLabel);
      if (timeComparison !== 0) return timeComparison;
      return left.planLabel.localeCompare(right.planLabel, "de");
    });
}

function calendarLinkClass(active = false) {
  return `inline-flex min-h-11 items-center justify-center rounded-xl border px-3 text-sm font-extrabold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#08AEB4]/20 focus-visible:ring-offset-2 ${
    active
      ? "border-brand bg-brand text-white shadow-[0_8px_22px_rgba(8,43,97,0.2)]"
      : "border-slate-200 bg-white text-slate-700 shadow-sm hover:border-brand/25 hover:bg-brand-soft/60 hover:text-brand"
  }`;
}

function CalendarEventLink({
  event,
  view,
  baseHref,
  selected,
  variant,
}: {
  event: NormalizedCalendarEvent;
  view: VisitCalendarView;
  baseHref: string;
  selected: boolean;
  variant: "month" | "week" | "mobile";
}) {
  const presentation = eventPresentation(event.status);
  const href = buildVisitCalendarHref({
    baseHref,
    view,
    calendarDate: event.date,
    visitId: event.id,
  });
  const accessibleLabel = `${formatVisitCalendarFullDate(event.date)}, ${event.timeLabel}, ${event.planLabel}, ${event.employeeName}, ${tasksLabel(event.taskCount)}, ${event.statusLabel}`;

  if (variant === "month") {
    return (
      <Link
        href={href}
        prefetch={false}
        scroll={false}
        aria-label={accessibleLabel}
        aria-current={selected ? "true" : undefined}
        className={`group block min-w-0 rounded-lg border px-2 py-1.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#08AEB4] focus-visible:ring-offset-1 ${presentation.chip} ${
          selected ? "ring-2 ring-[#08AEB4] ring-offset-1" : ""
        }`}
      >
        <span className="flex min-w-0 items-center gap-1.5 text-[0.72rem] font-black leading-4">
          <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${presentation.dot}`} />
          <span className="shrink-0 tabular-nums">{event.timeLabel}</span>
          <span className="truncate">{event.planLabel}</span>
        </span>
        <span className="mt-0.5 block truncate pl-3 text-[0.65rem] font-bold leading-4 opacity-75">
          {event.employeeName} · {tasksLabel(event.taskCount)}
        </span>
      </Link>
    );
  }

  return (
    <Link
      href={href}
      prefetch={false}
      scroll={false}
      aria-label={accessibleLabel}
      aria-current={selected ? "true" : undefined}
      className={`group block min-w-0 rounded-xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#08AEB4] focus-visible:ring-offset-2 ${presentation.chip} ${
        selected ? "ring-2 ring-[#08AEB4] ring-offset-2" : ""
      } ${variant === "mobile" ? "min-h-[5.5rem]" : ""}`}
    >
      <span className="flex items-start justify-between gap-2">
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-xs font-black uppercase tracking-[0.06em] opacity-80">
            <Clock3 aria-hidden="true" size={13} />
            {event.timeLabel}
          </span>
          <span className="mt-1 block truncate text-sm font-black text-slate-950">
            {event.planLabel}
          </span>
        </span>
        <span
          className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[0.62rem] font-black uppercase tracking-[0.05em] ${presentation.badge}`}
        >
          <span aria-hidden="true" className={`size-1.5 rounded-full ${presentation.dot}`} />
          {event.statusLabel}
        </span>
      </span>
      <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs font-bold opacity-75">
        <span className="inline-flex min-w-0 items-center gap-1">
          <UserRound aria-hidden="true" size={13} className="shrink-0" />
          <span className="truncate">{event.employeeName}</span>
        </span>
        <span className="inline-flex items-center gap-1">
          <ListChecks aria-hidden="true" size={13} />
          {tasksLabel(event.taskCount)}
        </span>
      </span>
    </Link>
  );
}

function DesktopCalendar({
  dates,
  eventsByDate,
  view,
  calendarDate,
  today,
  selectedVisitId,
  baseHref,
}: {
  dates: string[];
  eventsByDate: Map<string, NormalizedCalendarEvent[]>;
  view: VisitCalendarView;
  calendarDate: string;
  today: string;
  selectedVisitId: string | null;
  baseHref: string;
}) {
  const weeks = Array.from({ length: dates.length / 7 }, (_, index) =>
    dates.slice(index * 7, index * 7 + 7),
  );

  return (
    <div className="hidden md:block">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
        <table className="w-full table-fixed border-collapse" aria-label={`${view === "month" ? "Monats" : "Wochen"}kalender`}>
          <caption className="sr-only">
            {formatVisitCalendarTitle(calendarDate, view)} mit geplanten Einsätzen
          </caption>
          <thead>
            <tr className="bg-slate-50/90">
              {VISIT_CALENDAR_WEEKDAYS.map((weekday, index) => (
                <th
                  key={weekday.short}
                  scope="col"
                  className={`border-b border-r border-slate-200 px-2 py-3 text-center text-[0.68rem] font-black uppercase tracking-[0.12em] text-slate-500 last:border-r-0 ${
                    index >= 5 ? "bg-[#E7F8F9]/35 text-[#05777C]" : ""
                  }`}
                >
                  <span className="lg:hidden">{weekday.short}</span>
                  <span className="hidden lg:inline">{weekday.long}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((week) => (
              <tr key={week[0]}>
                {week.map((date, weekdayIndex) => {
                  const events = eventsByDate.get(date) ?? [];
                  const isToday = date === today;
                  const isSelectedDate = date === calendarDate;
                  const isOutsideMonth =
                    view === "month" && !isSameCalendarMonth(date, calendarDate);
                  const visibleEvents = view === "month" ? events.slice(0, 3) : events;
                  const hiddenEventCount = events.length - visibleEvents.length;

                  return (
                    <td
                      key={date}
                      className={`border-b border-r border-slate-200 p-0 align-top last:border-r-0 ${
                        weekdayIndex >= 5 ? "bg-[#E7F8F9]/18" : "bg-white"
                      } ${isSelectedDate ? "bg-[#E7F8F9]/45" : ""}`}
                    >
                      <div className={`flex flex-col p-2 ${view === "month" ? "min-h-32 xl:min-h-36" : "min-h-[27rem]"}`}>
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <Link
                            href={buildVisitCalendarHref({
                              baseHref,
                              view,
                              calendarDate: date,
                            })}
                            prefetch={false}
                            scroll={false}
                            aria-current={isSelectedDate ? "date" : undefined}
                            aria-label={`${formatVisitCalendarFullDate(date)}${isToday ? ", heute" : ""} auswählen${events.length ? `, ${events.length} ${events.length === 1 ? "Termin" : "Termine"}` : ""}`}
                            className={`grid size-8 shrink-0 place-items-center rounded-full text-xs font-black tabular-nums transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#08AEB4] focus-visible:ring-offset-1 ${
                              isToday
                                ? "bg-brand text-white shadow-[0_6px_16px_rgba(8,43,97,0.24)]"
                                : isSelectedDate
                                  ? "bg-[#08AEB4] text-white"
                                  : isOutsideMonth
                                    ? "text-slate-400 hover:bg-slate-100"
                                    : "text-slate-700 hover:bg-brand-soft hover:text-brand"
                            }`}
                          >
                            {calendarDayNumber(date)}
                          </Link>
                          {events.length ? (
                            <span className="text-[0.62rem] font-black text-slate-400">
                              {events.length} {events.length === 1 ? "Termin" : "Termine"}
                            </span>
                          ) : null}
                        </div>

                        <div className={`grid gap-1.5 ${view === "week" ? "max-h-[23rem] overflow-y-auto pr-0.5" : ""}`}>
                          {visibleEvents.map((event) => (
                            <CalendarEventLink
                              key={event.id}
                              event={event}
                              view={view}
                              baseHref={baseHref}
                              selected={event.id === selectedVisitId}
                              variant={view === "month" ? "month" : "week"}
                            />
                          ))}
                          {hiddenEventCount > 0 ? (
                            <Link
                              href={buildVisitCalendarHref({
                                baseHref,
                                view: "week",
                                calendarDate: date,
                              })}
                              prefetch={false}
                              scroll={false}
                              className="inline-flex min-h-8 items-center rounded-lg px-2 text-[0.7rem] font-black text-brand transition hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#08AEB4]"
                              aria-label={`${hiddenEventCount} weitere Termine am ${formatVisitCalendarFullDate(date)} in der Wochenansicht anzeigen`}
                            >
                              +{hiddenEventCount} weitere
                            </Link>
                          ) : null}
                        </div>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MobileDatePicker({
  dates,
  view,
  calendarDate,
  today,
  eventsByDate,
  baseHref,
}: {
  dates: string[];
  view: VisitCalendarView;
  calendarDate: string;
  today: string;
  eventsByDate: Map<string, NormalizedCalendarEvent[]>;
  baseHref: string;
}) {
  if (view === "week") {
    return (
      <div className="grid grid-cols-7 gap-1.5" aria-label="Tag auswählen">
        {dates.map((date) => {
          const eventCount = eventsByDate.get(date)?.length ?? 0;
          const selected = date === calendarDate;
          const isToday = date === today;
          return (
            <Link
              key={date}
              href={buildVisitCalendarHref({
                baseHref,
                view,
                calendarDate: date,
              })}
              prefetch={false}
              scroll={false}
              aria-current={selected ? "date" : undefined}
              aria-label={`${formatVisitCalendarFullDate(date)}${isToday ? ", heute" : ""} auswählen, ${eventCount} ${eventCount === 1 ? "Termin" : "Termine"}`}
              className={`flex min-h-16 min-w-0 flex-col items-center justify-center rounded-xl border px-1 py-2 text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#08AEB4] focus-visible:ring-offset-2 ${
                selected
                  ? "border-brand bg-brand text-white shadow-[0_8px_20px_rgba(8,43,97,0.2)]"
                  : isToday
                    ? "border-[#08AEB4]/35 bg-[#E7F8F9] text-[#05777C]"
                    : "border-slate-200 bg-white text-slate-650"
              }`}
            >
              <span className="text-[0.62rem] font-black uppercase tracking-[0.08em] opacity-75">
                {calendarWeekdayLabel(date)}
              </span>
              <span className="mt-0.5 text-sm font-black tabular-nums">
                {calendarDayNumber(date)}
              </span>
              <span
                aria-hidden="true"
                className={`mt-1 h-1.5 rounded-full ${
                  eventCount ? "w-4 bg-[#08AEB4]" : "w-1.5 bg-current opacity-15"
                }`}
              />
            </Link>
          );
        })}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-1 grid grid-cols-7 gap-1 text-center">
        {VISIT_CALENDAR_WEEKDAYS.map((weekday) => (
          <span
            key={weekday.short}
            className="py-1 text-[0.58rem] font-black uppercase tracking-[0.08em] text-slate-400"
          >
            {weekday.short}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1" aria-label="Tag auswählen">
        {dates.map((date) => {
          const eventCount = eventsByDate.get(date)?.length ?? 0;
          const selected = date === calendarDate;
          const isToday = date === today;
          const outsideMonth = !isSameCalendarMonth(date, calendarDate);
          return (
            <Link
              key={date}
              href={buildVisitCalendarHref({
                baseHref,
                view,
                calendarDate: date,
              })}
              prefetch={false}
              scroll={false}
              aria-current={selected ? "date" : undefined}
              aria-label={`${formatVisitCalendarFullDate(date)}${isToday ? ", heute" : ""} auswählen, ${eventCount} ${eventCount === 1 ? "Termin" : "Termine"}`}
              className={`flex min-h-11 min-w-0 flex-col items-center justify-center rounded-lg border text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#08AEB4] focus-visible:ring-offset-1 ${
                selected
                  ? "border-brand bg-brand text-white shadow-[0_5px_14px_rgba(8,43,97,0.2)]"
                  : isToday
                    ? "border-[#08AEB4]/35 bg-[#E7F8F9] text-[#05777C]"
                    : outsideMonth
                      ? "border-transparent text-slate-300 hover:bg-slate-100"
                      : "border-transparent text-slate-650 hover:bg-brand-soft"
              }`}
            >
              <span className="text-xs font-black tabular-nums">
                {calendarDayNumber(date)}
              </span>
              <span
                aria-hidden="true"
                className={`mt-1 h-1 rounded-full ${
                  eventCount ? "w-3 bg-[#08AEB4]" : "w-1 bg-current opacity-10"
                }`}
              />
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function MobileCalendar({
  dates,
  eventsByDate,
  view,
  calendarDate,
  today,
  selectedVisitId,
  baseHref,
}: {
  dates: string[];
  eventsByDate: Map<string, NormalizedCalendarEvent[]>;
  view: VisitCalendarView;
  calendarDate: string;
  today: string;
  selectedVisitId: string | null;
  baseHref: string;
}) {
  const selectedDateEvents = eventsByDate.get(calendarDate) ?? [];
  const pickerDates =
    view === "week"
      ? calendarDatesBetween(
          getWeekCalendarRange(calendarDate).start,
          getWeekCalendarRange(calendarDate).end,
        )
      : dates;

  return (
    <div className="md:hidden">
      <MobileDatePicker
        dates={pickerDates}
        view={view}
        calendarDate={calendarDate}
        today={today}
        eventsByDate={eventsByDate}
        baseHref={baseHref}
      />

      <div className="mt-5 border-t border-slate-100 pt-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[0.65rem] font-black uppercase tracking-[0.12em] text-[#05777C]">
              Tagesübersicht
            </p>
            <h4 className="mt-1 text-base font-black tracking-[-0.02em] text-slate-950">
              {formatVisitCalendarFullDate(calendarDate)}
            </h4>
          </div>
          <span className="inline-flex min-h-8 shrink-0 items-center rounded-full border border-[#08AEB4]/20 bg-[#E7F8F9] px-2.5 text-xs font-black text-[#05777C]">
            {selectedDateEvents.length} {selectedDateEvents.length === 1 ? "Termin" : "Termine"}
          </span>
        </div>

        {selectedDateEvents.length ? (
          <div className="mt-3 grid gap-2.5">
            {selectedDateEvents.map((event) => (
              <CalendarEventLink
                key={event.id}
                event={event}
                view={view}
                baseHref={baseHref}
                selected={event.id === selectedVisitId}
                variant="mobile"
              />
            ))}
          </div>
        ) : (
          <div className="mt-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-7 text-center">
            <CalendarDays aria-hidden="true" className="mx-auto text-slate-300" size={25} />
            <p className="mt-2 text-sm font-black text-slate-700">Kein Einsatz an diesem Tag</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Wählen Sie einen anderen Kalendertag oder legen Sie einen neuen Termin an.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export function VisitCalendar({
  events,
  view: requestedView,
  calendarDate: requestedCalendarDate,
  today: requestedToday,
  selectedVisitId = null,
  baseHref,
  className = "",
}: VisitCalendarProps) {
  const today = normalizeCalendarDate(requestedToday, requestedToday);
  const calendarDate = normalizeCalendarDate(requestedCalendarDate, today);
  const view = normalizeVisitCalendarView(requestedView);
  const range = getVisitCalendarRange(view, calendarDate);
  const dates = calendarDatesBetween(range.start, range.end);
  const visibleEvents = normalizeEvents(events).filter((event) =>
    isCalendarDateInRange(event.date, range),
  );
  const eventsByDate = new Map<string, NormalizedCalendarEvent[]>();
  for (const event of visibleEvents) {
    const groupedEvents = eventsByDate.get(event.date) ?? [];
    groupedEvents.push(event);
    eventsByDate.set(event.date, groupedEvents);
  }

  const previousDate = shiftVisitCalendarDate(calendarDate, view, -1);
  const nextDate = shiftVisitCalendarDate(calendarDate, view, 1);
  const navigationUnit = view === "month" ? "Monat" : "Woche";

  return (
    <section
      aria-label="Einsatzkalender"
      className={`overflow-hidden rounded-2xl border border-slate-200/85 bg-white shadow-[0_14px_44px_rgba(8,43,97,0.075)] ${className}`}
    >
      <div className="h-1 bg-gradient-to-r from-brand via-[#08AEB4] to-[#08AEB4]/20" />
      <header className="border-b border-slate-100 bg-gradient-to-br from-white via-white to-[#E7F8F9]/35 p-4 sm:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl border border-[#08AEB4]/20 bg-[#E7F8F9] text-[#05777C] shadow-[0_8px_22px_rgba(8,43,97,0.08)]">
              <CalendarDays aria-hidden="true" size={21} />
            </span>
            <div className="min-w-0">
              <h3 className="truncate text-xl font-black tracking-[-0.025em] text-slate-950 sm:text-2xl">
                {formatVisitCalendarTitle(calendarDate, view)}
              </h3>
              <p className="mt-0.5 text-xs font-bold text-slate-500 sm:text-sm">
                {visibleEvents.length} {visibleEvents.length === 1 ? "Einsatz" : "Einsätze"} im sichtbaren Zeitraum
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center xl:justify-end">
            <nav className="grid grid-cols-[2.75rem_minmax(5rem,1fr)_2.75rem] gap-1.5 sm:flex" aria-label="Kalenderzeitraum">
              <Link
                href={buildVisitCalendarHref({
                  baseHref,
                  view,
                  calendarDate: previousDate,
                })}
                prefetch={false}
                scroll={false}
                aria-label={`Vorheriger ${navigationUnit}`}
                title={`Vorheriger ${navigationUnit}`}
                className={`${calendarLinkClass()} px-0 sm:w-11`}
              >
                <ChevronLeft aria-hidden="true" size={19} />
              </Link>
              <Link
                href={buildVisitCalendarHref({
                  baseHref,
                  view,
                  calendarDate: today,
                })}
                prefetch={false}
                scroll={false}
                className={calendarLinkClass(calendarDate === today)}
              >
                Heute
              </Link>
              <Link
                href={buildVisitCalendarHref({
                  baseHref,
                  view,
                  calendarDate: nextDate,
                })}
                prefetch={false}
                scroll={false}
                aria-label={`Nächster ${navigationUnit}`}
                title={`Nächster ${navigationUnit}`}
                className={`${calendarLinkClass()} px-0 sm:w-11`}
              >
                <ChevronRight aria-hidden="true" size={19} />
              </Link>
            </nav>

            <nav
              className="grid grid-cols-2 rounded-xl border border-slate-200 bg-slate-100/80 p-1"
              aria-label="Kalenderansicht"
            >
              {(["month", "week"] as const).map((calendarView) => {
                const active = view === calendarView;
                return (
                  <Link
                    key={calendarView}
                    href={buildVisitCalendarHref({
                      baseHref,
                      view: calendarView,
                      calendarDate,
                      visitId: selectedVisitId,
                    })}
                    prefetch={false}
                    scroll={false}
                    aria-current={active ? "page" : undefined}
                    className={`inline-flex min-h-10 items-center justify-center rounded-lg px-4 text-xs font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#08AEB4] focus-visible:ring-offset-1 ${
                      active
                        ? "bg-white text-brand shadow-sm"
                        : "text-slate-500 hover:text-brand"
                    }`}
                  >
                    {calendarView === "month" ? "Monat" : "Woche"}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      </header>

      <div className="p-3 sm:p-4 lg:p-5">
        <DesktopCalendar
          dates={dates}
          eventsByDate={eventsByDate}
          view={view}
          calendarDate={calendarDate}
          today={today}
          selectedVisitId={selectedVisitId}
          baseHref={baseHref}
        />
        <MobileCalendar
          dates={dates}
          eventsByDate={eventsByDate}
          view={view}
          calendarDate={calendarDate}
          today={today}
          selectedVisitId={selectedVisitId}
          baseHref={baseHref}
        />
      </div>

      <footer className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-100 bg-slate-50/70 px-4 py-3 text-[0.68rem] font-bold text-slate-500 sm:px-5">
        {[
          ["scheduled", "Geplant"],
          ["started", "Gestartet"],
          ["completed", "Abgeschlossen"],
        ].map(([status, label]) => (
          <span key={status} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className={`size-2 rounded-full ${eventPresentation(status).dot}`}
            />
            {label}
          </span>
        ))}
        <span className="ml-auto hidden text-right sm:block">
          Termin auswählen, um die Einsatzübersicht zu öffnen
        </span>
      </footer>
    </section>
  );
}
