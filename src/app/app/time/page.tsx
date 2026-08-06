import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CalendarCheck2,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  MapPin,
  TimerReset,
} from "lucide-react";
import { startVisitAction } from "@/app/actions/portalEmployee";
import {
  EmptyState,
  PageHeader,
  Panel,
  StatusPill,
  inputClass,
} from "@/components/portal/PortalUI";
import { VisitStartSubmitButton } from "@/components/portal/VisitStartSubmitButton";
import {
  berlinDateParts,
  berlinIsoDate,
  formatGermanDate,
  parseBerlinDateTimeLocal,
} from "@/lib/portal/core";
import { requireEmployeeContext } from "@/lib/portal/access";

const FIRST_TIME_MONTH = "2000-01";

type MonthSelection = {
  value: string;
  label: string;
  startIso: string;
  endIso: string;
  previousValue: string;
  nextValue: string;
};

function relation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

function monthValue(year: number, monthIndex: number) {
  const date = new Date(Date.UTC(year, monthIndex, 1, 12));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function parseMonthSelection(
  value: string | undefined,
  currentMonth: string,
): MonthSelection | null {
  if (!value) return null;
  const match = value.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
  if (!match || value < FIRST_TIME_MONTH || value > currentMonth) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const nextValue = monthValue(year, month);
  const startIso = parseBerlinDateTimeLocal(`${value}-01T00:00`);
  const endIso = parseBerlinDateTimeLocal(`${nextValue}-01T00:00`);
  if (!startIso || !endIso) return null;

  return {
    value,
    label: new Intl.DateTimeFormat("de-DE", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(year, month - 1, 1, 12))),
    startIso,
    endIso,
    previousValue: monthValue(year, month - 2),
    nextValue,
  };
}

function formatClock(value: string | null | undefined) {
  if (!value) return "–";
  return formatGermanDate(value, {
    day: undefined,
    month: undefined,
    year: undefined,
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(value: number | null | undefined) {
  const minutes = Math.max(0, Number(value ?? 0));
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (!hours) return `${remainingMinutes} Min.`;
  if (!remainingMinutes) return `${hours} Std.`;
  return `${hours} Std. ${remainingMinutes} Min.`;
}

function formatScheduledTime(visit: {
  planned_start_time: string | null;
  window_start: string | null;
  window_end: string | null;
}) {
  if (visit.planned_start_time) {
    return `${visit.planned_start_time.slice(0, 5)} Uhr`;
  }
  if (visit.window_start && visit.window_end) {
    return `${visit.window_start.slice(0, 5)}–${visit.window_end.slice(0, 5)} Uhr`;
  }
  if (visit.window_start) return `ab ${visit.window_start.slice(0, 5)} Uhr`;
  return "Flexible Startzeit";
}

function visitAddress(
  visitBuildings:
    | { buildings: unknown }[]
    | null
    | undefined,
) {
  const building = relation(visitBuildings?.[0]?.buildings) as {
    formatted_address: string;
  } | null;
  return building?.formatted_address ?? "Adresse im Einsatzdetail";
}

function QueryErrorNotice({ text }: { text: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-900"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-rose-600 shadow-sm">
        <AlertTriangle aria-hidden="true" size={20} />
      </span>
      <div className="min-w-0">
        <p className="font-extrabold">Daten konnten nicht geladen werden</p>
        <p className="mt-1 text-sm leading-6 text-rose-800">{text}</p>
      </div>
    </div>
  );
}

function reportQueryError(
  context: string,
  error: { message?: string } | null,
) {
  if (error) {
    console.error(
      `[Hausvia Mitarbeiterzeiten] ${context}`,
      error.message ?? error,
    );
  }
}

export default async function EmployeeTimePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string | string[] }>;
}) {
  const { month: monthParam } = await searchParams;
  const now = berlinDateParts();
  const currentMonth = `${now.year}-${String(now.month).padStart(2, "0")}`;
  const requestedMonth =
    typeof monthParam === "string" ? monthParam : undefined;
  const selectedMonth =
    parseMonthSelection(requestedMonth, currentMonth) ??
    parseMonthSelection(currentMonth, currentMonth)!;
  const invalidMonth =
    monthParam !== undefined &&
    (typeof monthParam !== "string" || requestedMonth !== selectedMonth.value);
  const today = berlinIsoDate();
  const { profile, supabase } = await requireEmployeeContext();

  const [activeVisitResult, startableVisitsResult, completedVisitsResult] =
    await Promise.all([
      supabase
        .from("visits")
        .select(
          "id,scheduled_date,planned_start_time,window_start,window_end,status,started_at,properties(id,name),visit_buildings(buildings(id,label,formatted_address))",
        )
        .eq("started_by", profile.id)
        .eq("status", "started")
        .maybeSingle(),
      supabase
        .from("visits")
        .select(
          "id,scheduled_date,planned_start_time,window_start,window_end,status,properties(id,name),visit_buildings(buildings(id,label,formatted_address))",
        )
        .eq("status", "scheduled")
        .lte("scheduled_date", today)
        .order("scheduled_date", { ascending: false })
        .order("planned_start_time", { ascending: true })
        .limit(4),
      supabase
        .from("visits")
        .select(
          "id,scheduled_date,started_at,completed_at,duration_minutes,status,properties(id,name),visit_buildings(buildings(id,label,formatted_address))",
        )
        .eq("started_by", profile.id)
        .eq("status", "completed")
        .gte("completed_at", selectedMonth.startIso)
        .lt("completed_at", selectedMonth.endIso)
        .order("completed_at", { ascending: false }),
    ]);

  reportQueryError("Laufender Einsatz", activeVisitResult.error);
  reportQueryError("Startbare Einsätze", startableVisitsResult.error);
  reportQueryError("Abgeschlossene Zeiten", completedVisitsResult.error);

  const activeVisit = activeVisitResult.error
    ? null
    : activeVisitResult.data;
  const startableVisits = startableVisitsResult.error
    ? []
    : (startableVisitsResult.data ?? []);
  const completedVisits = completedVisitsResult.error
    ? []
    : (completedVisitsResult.data ?? []);
  const completedMinutes = completedVisits.reduce(
    (sum, visit) => sum + Number(visit.duration_minutes ?? 0),
    0,
  );
  const startsBlocked = Boolean(activeVisitResult.error || activeVisit);
  const disabledStartLabel = activeVisitResult.error
    ? "Startstatus derzeit nicht verfügbar"
    : "Laufenden Einsatz zuerst abschließen";
  const canGoPrevious = selectedMonth.previousValue >= FIRST_TIME_MONTH;
  const canGoNext = selectedMonth.nextValue <= currentMonth;

  return (
    <>
      <PageHeader
        eyebrow="Arbeitszeit"
        title="Dein Arbeitstag im Blick"
        text="Einsätze starten, laufende Arbeit fortsetzen und abgeschlossene Zeiten transparent nachvollziehen."
        icon={<Clock3 aria-hidden="true" size={20} />}
      />

      {invalidMonth ? (
        <div
          role="status"
          className="mb-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950"
        >
          <AlertTriangle
            aria-hidden="true"
            className="mt-0.5 shrink-0 text-amber-600"
            size={19}
          />
          <p className="text-sm leading-6">
            Der angefragte Monat ist ungültig oder liegt in der Zukunft. Es wird
            stattdessen der aktuelle Monat angezeigt.
          </p>
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <section aria-label="Aktueller Einsatz">
          {activeVisitResult.error ? (
            <QueryErrorNotice text="Der Status eines laufenden Einsatzes ist unbekannt. Neue Starts bleiben vorsorglich gesperrt." />
          ) : activeVisit ? (
            <div className="relative isolate h-full min-h-64 overflow-hidden rounded-[1.75rem] bg-[linear-gradient(135deg,#082b61_0%,#0b3d78_55%,#087f83_100%)] p-5 text-white shadow-[0_24px_60px_rgba(8,43,97,0.24)] sm:p-7">
              <span
                aria-hidden="true"
                className="absolute -right-16 -top-20 -z-10 size-64 rounded-full bg-[#08AEB4]/35 blur-3xl"
              />
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-cyan-100">
                    <span className="relative flex size-2.5">
                      <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-300 opacity-75" />
                      <span className="relative inline-flex size-2.5 rounded-full bg-emerald-300" />
                    </span>
                    Einsatz läuft
                  </p>
                  <h2
                    id="active-visit-title"
                    className="mt-4 text-2xl font-black tracking-[-0.035em] sm:text-3xl"
                  >
                    {(relation(activeVisit.properties) as { name: string } | null)
                      ?.name ?? "Laufender Einsatz"}
                  </h2>
                </div>
                <StatusPill
                  tone="success"
                  className="border-white/25 bg-white/15 text-white"
                >
                  Aktiv
                </StatusPill>
              </div>

              <div className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
                <p className="flex items-start gap-2 rounded-xl bg-white/10 p-3 font-semibold text-white/90 ring-1 ring-white/10">
                  <TimerReset
                    aria-hidden="true"
                    className="mt-0.5 shrink-0 text-cyan-200"
                    size={18}
                  />
                  Gestartet um {formatClock(activeVisit.started_at)} Uhr
                </p>
                <p className="flex items-start gap-2 rounded-xl bg-white/10 p-3 font-semibold text-white/90 ring-1 ring-white/10">
                  <MapPin
                    aria-hidden="true"
                    className="mt-0.5 shrink-0 text-cyan-200"
                    size={18}
                  />
                  {visitAddress(activeVisit.visit_buildings)}
                </p>
              </div>

              <Link
                href={`/app/visits/${activeVisit.id}`}
                className="mt-6 inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-black text-brand shadow-[0_12px_30px_rgba(3,18,43,0.25)] transition hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/35 sm:w-auto"
              >
                Einsatz fortsetzen <ArrowRight aria-hidden="true" size={18} />
              </Link>
            </div>
          ) : (
            <div className="relative isolate h-full min-h-64 overflow-hidden rounded-[1.75rem] border border-[#08AEB4]/25 bg-gradient-to-br from-[#E7F8F9] via-white to-white p-5 shadow-[0_20px_50px_rgba(8,43,97,0.08)] sm:p-7">
              <span
                aria-hidden="true"
                className="absolute -right-16 -top-16 -z-10 size-56 rounded-full bg-[#08AEB4]/15 blur-3xl"
              />
              <span className="grid size-12 place-items-center rounded-2xl bg-white text-[#05777C] shadow-[0_10px_28px_rgba(8,43,97,0.11)] ring-1 ring-[#08AEB4]/20">
                <CheckCircle2 aria-hidden="true" size={24} />
              </span>
              <p className="mt-5 text-xs font-black uppercase tracking-[0.16em] text-[#05777C]">
                Bereit für den nächsten Einsatz
              </p>
              <h2
                id="active-visit-title"
                className="mt-2 text-2xl font-black tracking-[-0.035em] text-slate-950 sm:text-3xl"
              >
                Aktuell läuft keine Zeit
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">
                Starte unten bei deiner Ankunft. Beginn und Ende werden sicher
                auf dem Server gespeichert.
              </p>
            </div>
          )}
        </section>

        <div className="rounded-[1.75rem] border border-slate-200/80 bg-white p-5 shadow-[0_20px_50px_rgba(8,43,97,0.07)] sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.15em] text-slate-500">
                Abgeschlossen
              </p>
              <h2 className="mt-2 text-xl font-black tracking-[-0.025em] text-slate-950">
                {selectedMonth.label}
              </h2>
            </div>
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-brand-soft text-brand">
              <CalendarCheck2 aria-hidden="true" size={22} />
            </span>
          </div>
          <p className="mt-6 text-4xl font-black tracking-[-0.045em] text-brand sm:text-5xl">
            {completedVisitsResult.error
              ? "–"
              : formatDuration(completedMinutes)}
          </p>
          <p className="mt-2 text-sm font-semibold text-slate-500">
            {completedVisitsResult.error
              ? "Die Monatssumme ist derzeit nicht verfügbar."
              : `${completedVisits.length} abgeschlossene${
                  completedVisits.length === 1 ? "r Einsatz" : " Einsätze"
                } · laufende Zeit nicht enthalten`}
          </p>
          <div className="mt-6 rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
            <strong className="text-slate-900">Verlässlich erfasst:</strong>{" "}
            Die Summe basiert ausschließlich auf serverseitig abgeschlossenen
            Einsätzen.
          </div>
        </div>
      </div>

      <div className="mt-5">
        <Panel
          title="Jetzt startbar"
          description="Heutige und noch offene, überfällige Einsätze – direkt für deine Ankunft bereit."
          action={
            startableVisitsResult.error ? undefined : (
              <StatusPill tone={startableVisits.length ? "accent" : "muted"}>
                {startableVisits.length} bereit
              </StatusPill>
            )
          }
        >
          {startableVisitsResult.error ? (
            <QueryErrorNotice text="Die startbaren Einsätze konnten nicht geladen werden. Bitte versuche es erneut." />
          ) : startableVisits.length ? (
            <div className="grid gap-3">
              {startableVisits.map((visit) => {
                const property = relation(visit.properties) as {
                  name: string;
                } | null;
                const isToday = visit.scheduled_date === today;
                return (
                  <article
                    key={visit.id}
                    className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 transition hover:border-brand/20 hover:bg-white hover:shadow-md sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusPill tone={isToday ? "accent" : "warning"}>
                          {isToday ? "Heute" : "Überfällig"}
                        </StatusPill>
                        <span className="text-xs font-bold text-slate-500">
                          {formatGermanDate(
                            `${visit.scheduled_date}T12:00:00Z`,
                            { weekday: "short", day: "2-digit", month: "2-digit" },
                          )}
                        </span>
                      </div>
                      <h3 className="mt-3 truncate text-lg font-black tracking-[-0.02em] text-slate-950">
                        {property?.name ?? "Immobilie"}
                      </h3>
                      <div className="mt-2 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                        <p className="flex items-start gap-2">
                          <CalendarClock
                            aria-hidden="true"
                            className="mt-0.5 shrink-0 text-brand"
                            size={17}
                          />
                          {formatScheduledTime(visit)}
                        </p>
                        <p className="flex items-start gap-2">
                          <MapPin
                            aria-hidden="true"
                            className="mt-0.5 shrink-0 text-brand"
                            size={17}
                          />
                          <span className="line-clamp-2">
                            {visitAddress(visit.visit_buildings)}
                          </span>
                        </p>
                      </div>
                    </div>
                    <form action={startVisitAction} className="sm:text-right">
                      <input type="hidden" name="visitId" value={visit.id} />
                      <VisitStartSubmitButton
                        disabled={startsBlocked}
                        disabledLabel={disabledStartLabel}
                      />
                      <Link
                        href={`/app/visits/${visit.id}`}
                        className="mt-2 inline-flex min-h-9 w-full items-center justify-center gap-1 text-xs font-extrabold text-brand underline-offset-4 hover:underline sm:w-auto"
                      >
                        Details ansehen
                        <ArrowRight aria-hidden="true" size={14} />
                      </Link>
                    </form>
                  </article>
                );
              })}
            </div>
          ) : (
            <EmptyState
              compact
              icon={<CalendarClock aria-hidden="true" size={27} />}
              title="Kein Einsatz wartet auf den Start"
              text="Sobald für heute oder einen offenen Termin ein Einsatz bereitsteht, kannst du ihn hier direkt beginnen."
            />
          )}
        </Panel>
      </div>

      <section
        id="month-times"
        aria-labelledby="month-times-title"
        className="mt-5 scroll-mt-24 rounded-[1.75rem] border border-slate-200/80 bg-white p-4 shadow-[0_20px_50px_rgba(8,43,97,0.07)] sm:p-6"
      >
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.15em] text-[#05777C]">
              Monatsarchiv
            </p>
            <h2
              id="month-times-title"
              className="mt-2 text-2xl font-black tracking-[-0.035em] text-slate-950"
            >
              Zeiten für {selectedMonth.label}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Wähle einen vergangenen Monat und prüfe jeden abgeschlossenen
              Einsatz im Detail.
            </p>
          </div>

          <form className="grid gap-3 min-[420px]:grid-cols-[minmax(0,1fr)_auto] min-[420px]:items-end">
            <label
              htmlFor="employee-time-month"
              className="text-sm font-extrabold text-slate-800"
            >
              Monat
              <input
                id="employee-time-month"
                name="month"
                type="month"
                min={FIRST_TIME_MONTH}
                max={currentMonth}
                defaultValue={selectedMonth.value}
                className={`${inputClass} min-[420px]:min-w-52`}
              />
            </label>
            <button className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-brand px-5 text-sm font-black text-white shadow-[0_8px_20px_rgba(8,43,97,0.18)] transition hover:bg-brand-dark focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/20 min-[420px]:w-auto">
              Anzeigen
            </button>
          </form>
        </div>

        <nav
          aria-label="Monat wechseln"
          className="mt-5 grid grid-cols-2 gap-2 border-t border-slate-100 pt-4 sm:flex sm:items-center sm:justify-end"
        >
          {canGoPrevious ? (
            <Link
              href={`/app/time?month=${selectedMonth.previousValue}#month-times`}
              className="inline-flex min-h-11 items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-sm font-extrabold text-slate-700 transition hover:border-brand/25 hover:text-brand"
            >
              <ChevronLeft aria-hidden="true" size={17} /> Vorheriger
            </Link>
          ) : (
            <span
              aria-disabled="true"
              className="inline-flex min-h-11 items-center justify-center gap-1 rounded-xl border border-slate-100 bg-slate-50 px-3 text-sm font-extrabold text-slate-400"
            >
              <ChevronLeft aria-hidden="true" size={17} /> Vorheriger
            </span>
          )}
          {canGoNext ? (
            <Link
              href={`/app/time?month=${selectedMonth.nextValue}#month-times`}
              className="inline-flex min-h-11 items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-sm font-extrabold text-slate-700 transition hover:border-brand/25 hover:text-brand"
            >
              Nächster <ChevronRight aria-hidden="true" size={17} />
            </Link>
          ) : (
            <span
              aria-disabled="true"
              className="inline-flex min-h-11 items-center justify-center gap-1 rounded-xl border border-slate-100 bg-slate-50 px-3 text-sm font-extrabold text-slate-400"
            >
              Nächster <ChevronRight aria-hidden="true" size={17} />
            </span>
          )}
        </nav>
      </section>

      <div className="mt-5">
        <Panel
          title="Abgeschlossene Einsätze"
          description={`${selectedMonth.label} · ausschließlich serverseitig abgeschlossene Zeiten`}
          action={
            completedVisitsResult.error ? undefined : (
              <StatusPill tone="success">
                {formatDuration(completedMinutes)}
              </StatusPill>
            )
          }
        >
          {completedVisitsResult.error ? (
            <QueryErrorNotice text="Die abgeschlossenen Einsatzzeiten konnten nicht geladen werden. Bitte versuche es erneut." />
          ) : completedVisits.length ? (
            <>
              <div className="grid gap-3 lg:hidden">
                {completedVisits.map((visit) => {
                  const property = relation(visit.properties) as {
                    name: string;
                  } | null;
                  return (
                    <article
                      key={visit.id}
                      className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50/80 p-4 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">
                            {formatGermanDate(visit.completed_at!, {
                              weekday: "short",
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                            })}
                          </p>
                          <h3 className="mt-2 truncate text-lg font-black text-slate-950">
                            {property?.name ?? "Immobilie"}
                          </h3>
                        </div>
                        <StatusPill tone="success">Erledigt</StatusPill>
                      </div>
                      <p className="mt-2 flex items-start gap-2 text-sm text-slate-600">
                        <MapPin
                          aria-hidden="true"
                          className="mt-0.5 shrink-0 text-brand"
                          size={16}
                        />
                        {visitAddress(visit.visit_buildings)}
                      </p>
                      <div className="mt-4 grid grid-cols-2 gap-2">
                        <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200/80">
                          <p className="text-[0.65rem] font-black uppercase tracking-wide text-slate-500">
                            Start
                          </p>
                          <p className="mt-1 font-black text-slate-900">
                            {formatClock(visit.started_at)} Uhr
                          </p>
                        </div>
                        <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200/80">
                          <p className="text-[0.65rem] font-black uppercase tracking-wide text-slate-500">
                            Ende
                          </p>
                          <p className="mt-1 font-black text-slate-900">
                            {formatClock(visit.completed_at)} Uhr
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
                        <p className="flex items-center gap-2 font-black text-brand">
                          <Clock3 aria-hidden="true" size={17} />
                          {formatDuration(visit.duration_minutes)}
                        </p>
                        <Link
                          href={`/app/visits/${visit.id}`}
                          className="inline-flex min-h-10 items-center gap-1 rounded-lg px-2 text-sm font-extrabold text-brand hover:bg-brand-soft"
                        >
                          Details <ArrowRight aria-hidden="true" size={15} />
                        </Link>
                      </div>
                    </article>
                  );
                })}
              </div>

              <div className="hidden overflow-hidden rounded-2xl border border-slate-200 lg:block">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-[0.1em] text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-black">Abschluss</th>
                      <th className="px-4 py-3 font-black">Immobilie</th>
                      <th className="px-4 py-3 font-black">Start</th>
                      <th className="px-4 py-3 font-black">Ende</th>
                      <th className="px-4 py-3 text-right font-black">Dauer</th>
                      <th className="w-12 px-3 py-3">
                        <span className="sr-only">Details</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {completedVisits.map((visit) => {
                      const property = relation(visit.properties) as {
                        name: string;
                      } | null;
                      return (
                        <tr
                          key={visit.id}
                          className="bg-white transition hover:bg-brand-soft/35"
                        >
                          <td className="whitespace-nowrap px-4 py-4 font-bold text-slate-800">
                            {formatGermanDate(visit.completed_at!, {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                            })}
                          </td>
                          <td className="max-w-sm px-4 py-4">
                            <p className="truncate font-black text-slate-950">
                              {property?.name ?? "Immobilie"}
                            </p>
                            <p className="mt-1 truncate text-xs text-slate-500">
                              {visitAddress(visit.visit_buildings)}
                            </p>
                          </td>
                          <td className="whitespace-nowrap px-4 py-4 text-slate-700">
                            {formatClock(visit.started_at)} Uhr
                          </td>
                          <td className="whitespace-nowrap px-4 py-4 text-slate-700">
                            {formatClock(visit.completed_at)} Uhr
                          </td>
                          <td className="whitespace-nowrap px-4 py-4 text-right font-black text-brand">
                            {formatDuration(visit.duration_minutes)}
                          </td>
                          <td className="px-3 py-4">
                            <Link
                              href={`/app/visits/${visit.id}`}
                              aria-label={`Einsatz bei ${property?.name ?? "Immobilie"} öffnen`}
                              className="grid size-10 place-items-center rounded-xl text-brand transition hover:bg-white hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                            >
                              <ArrowRight aria-hidden="true" size={17} />
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <EmptyState
              icon={<Building2 aria-hidden="true" size={27} />}
              title="Noch keine abgeschlossenen Zeiten"
              text={`Für ${selectedMonth.label} wurden noch keine Einsätze abgeschlossen.`}
            />
          )}
        </Panel>
      </div>
    </>
  );
}
