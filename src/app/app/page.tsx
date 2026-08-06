import Link from "next/link";
import {
  ArrowRight,
  Building2,
  CalendarCheck2,
  ListChecks,
  MapPin,
  Navigation,
  PlayCircle,
  TimerReset,
} from "lucide-react";
import {
  EmptyState,
  MetricCard,
  PageHeader,
  Panel,
  StatusPill,
} from "@/components/portal/PortalUI";
import {
  VISIT_STATUS_LABELS,
  berlinIsoDate,
  formatGermanDate,
  parseBerlinDateTimeLocal,
} from "@/lib/portal/core";
import { requireEmployeeContext } from "@/lib/portal/access";

function relation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

function reportQueryError(
  area: string,
  error: { message?: string } | null,
) {
  if (error) {
    console.error(`[Hausvia Mitarbeiter-Dashboard] ${area}:`, error.message ?? error);
  }
}

function displayName(
  employee: { first_name?: string | null; full_name?: string | null },
  fallback: string,
) {
  return (
    employee.first_name?.trim() ||
    employee.full_name?.trim().split(/\s+/)[0] ||
    fallback.trim().split(/\s+/)[0] ||
    "Willkommen"
  );
}

export default async function EmployeeDashboardPage() {
  const { profile, employee, supabase } = await requireEmployeeContext();
  const today = berlinIsoDate();
  const monthStart = `${today.slice(0, 7)}-01`;
  const monthStartUtc = parseBerlinDateTimeLocal(`${monthStart}T00:00`);

  const [
    upcomingVisitsResult,
    todayCountResult,
    activeVisitResult,
    propertyCountResult,
    openTaskCountResult,
    completedMonthResult,
  ] = await Promise.all([
    supabase
      .from("visits")
      .select(
        "id,scheduled_date,planned_start_time,window_start,window_end,status,started_at,properties(id,name),visit_buildings(buildings(id,label,formatted_address))",
      )
      .gte("scheduled_date", today)
      .in("status", ["scheduled", "started"])
      .order("scheduled_date", { ascending: true })
      .order("planned_start_time", { ascending: true })
      .limit(5),
    supabase
      .from("visits")
      .select("id", { count: "exact", head: true })
      .eq("scheduled_date", today)
      .neq("status", "canceled"),
    supabase
      .from("visits")
      .select("id,started_at,properties(id,name)")
      .eq("started_by", profile.id)
      .eq("status", "started")
      .maybeSingle(),
    supabase
      .from("property_employee_assignments")
      .select("property_id", { count: "exact", head: true })
      .eq("employee_id", employee.id)
      .eq("active", true)
      .lte("starts_on", today)
      .or(`ends_on.is.null,ends_on.gte.${today}`),
    supabase
      .from("visit_tasks")
      .select("id", { count: "exact", head: true })
      .in("status", ["open", "in_progress", "blocked"]),
    supabase
      .from("visits")
      .select("id", { count: "exact", head: true })
      .eq("completed_by", profile.id)
      .eq("status", "completed")
      .gte("completed_at", monthStartUtc ?? `${monthStart}T00:00:00.000Z`),
  ]);

  reportQueryError("Nächste Einsätze", upcomingVisitsResult.error);
  reportQueryError("Heutige Einsätze", todayCountResult.error);
  reportQueryError("Laufender Einsatz", activeVisitResult.error);
  reportQueryError("Zugewiesene Immobilien", propertyCountResult.error);
  reportQueryError("Offene Aufgaben", openTaskCountResult.error);
  reportQueryError("Abgeschlossene Einsätze", completedMonthResult.error);

  const upcomingVisits = upcomingVisitsResult.error
    ? []
    : (upcomingVisitsResult.data ?? []);
  const activeVisit = activeVisitResult.error ? null : activeVisitResult.data;
  const formattedToday = formatGermanDate(`${today}T12:00:00Z`, {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });

  return (
    <>
      <PageHeader
        eyebrow="Mein Arbeitstag"
        title={`${displayName(employee, profile.full_name)}, das steht heute an.`}
        text={`${formattedToday} · der nächste sinnvolle Schritt steht oben.`}
        icon={<CalendarCheck2 aria-hidden="true" size={20} />}
        compact
      />

      {activeVisit ? (
        <Link
          href={`/app/visits/${activeVisit.id}`}
          className="group mb-5 flex items-center gap-4 overflow-hidden rounded-2xl border border-emerald-300 bg-emerald-50 p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg sm:p-5"
        >
          <span className="relative grid h-13 w-13 shrink-0 place-items-center rounded-2xl bg-emerald-600 text-white">
            <PlayCircle size={25} aria-hidden="true" />
            <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-emerald-400 ring-4 ring-emerald-100" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-black uppercase tracking-[0.14em] text-emerald-700">
              Einsatz läuft
            </span>
            <span className="mt-1 block truncate text-lg font-black text-emerald-950">
              {relation(activeVisit.properties)?.name ?? "Aktueller Einsatz"}
            </span>
            <span className="mt-1 block text-xs font-bold text-emerald-800/70">
              Gestartet {activeVisit.started_at ? formatGermanDate(activeVisit.started_at, { hour: "2-digit", minute: "2-digit" }) : ""}
            </span>
          </span>
          <span className="hidden min-h-11 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-black text-white sm:inline-flex">
            Fortsetzen <ArrowRight size={17} aria-hidden="true" />
          </span>
          <ArrowRight className="text-emerald-700 sm:hidden" size={20} aria-hidden="true" />
        </Link>
      ) : null}

      <section
        aria-label="Mein Tagesstatus"
        className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4"
      >
        <MetricCard
          label="Einsätze heute"
          value={todayCountResult.error ? "–" : (todayCountResult.count ?? 0)}
          tone="accent"
        />
        <MetricCard
          label="Meine Immobilien"
          value={propertyCountResult.error ? "–" : (propertyCountResult.count ?? 0)}
        />
        <MetricCard
          label="Offene Aufgaben"
          value={openTaskCountResult.error ? "–" : (openTaskCountResult.count ?? 0)}
        />
        <MetricCard
          label="Diesen Monat erledigt"
          value={completedMonthResult.error ? "–" : (completedMonthResult.count ?? 0)}
        />
      </section>

      <section className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Link
          href="/app/today"
          className="group rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition hover:border-brand hover:shadow-lg sm:p-4"
        >
          <CalendarCheck2 className="text-brand" size={22} aria-hidden="true" />
          <span className="mt-3 block font-black text-slate-950 group-hover:text-brand">
            Kalender
          </span>
          <span className="mt-1 block text-xs leading-5 text-slate-500">
            Alle Termine ansehen
          </span>
        </Link>
        <Link
          href="/app/properties"
          className="group rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition hover:border-brand hover:shadow-lg sm:p-4"
        >
          <Building2 className="text-brand" size={22} aria-hidden="true" />
          <span className="mt-3 block font-black text-slate-950 group-hover:text-brand">
            Immobilien
          </span>
          <span className="mt-1 block text-xs leading-5 text-slate-500">
            Briefings und Adressen
          </span>
        </Link>
        <Link
          href="/app/time"
          className="group rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition hover:border-brand hover:shadow-lg sm:p-4"
        >
          <TimerReset className="text-brand" size={22} aria-hidden="true" />
          <span className="mt-3 block font-black text-slate-950 group-hover:text-brand">
            Arbeitszeit
          </span>
          <span className="mt-1 block text-xs leading-5 text-slate-500">
            Zeiten kontrollieren
          </span>
        </Link>
        <Link
          href="/app/orders"
          className="group rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition hover:border-brand hover:shadow-lg sm:p-4"
        >
          <ListChecks className="text-brand" size={22} aria-hidden="true" />
          <span className="mt-3 block font-black text-slate-950 group-hover:text-brand">
            Meldung
          </span>
          <span className="mt-1 block text-xs leading-5 text-slate-500">
            Material und Defekte
          </span>
        </Link>
      </section>

      <div className="mt-5">
        <Panel title="Nächste Einsätze">
          {upcomingVisits.length ? (
            <div className="grid gap-3">
              {upcomingVisits.map((visit) => {
                const property = relation(visit.properties);
                const buildings = (visit.visit_buildings ?? [])
                  .map((entry: { buildings: unknown }) =>
                    relation(entry.buildings) as {
                      id: string;
                      label: string | null;
                      formatted_address: string;
                    } | null,
                  )
                  .filter(
                    (building): building is {
                      id: string;
                      label: string | null;
                      formatted_address: string;
                    } => Boolean(building),
                  );
                const address =
                  buildings[0]?.formatted_address ?? "Adresse im Einsatzdetail";
                const isToday = visit.scheduled_date === today;
                const time =
                  visit.planned_start_time?.slice(0, 5) ||
                  visit.window_start?.slice(0, 5) ||
                  "Flexibel";
                return (
                  <article
                    key={visit.id}
                    className={`overflow-hidden rounded-2xl border bg-white ${isToday ? "border-amber-300 ring-2 ring-amber-100" : "border-slate-200"}`}
                  >
                    <div className="flex">
                      <span
                        className={`w-1.5 shrink-0 ${visit.status === "started" ? "bg-emerald-500" : isToday ? "bg-amber-400" : "bg-brand"}`}
                      />
                      <div className="min-w-0 flex-1 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-xs font-black uppercase tracking-wide text-slate-500">
                              {isToday
                                ? `Heute · ${time} Uhr`
                                : `${formatGermanDate(`${visit.scheduled_date}T12:00:00Z`, { weekday: "short", day: "2-digit", month: "2-digit" })} · ${time} Uhr`}
                            </p>
                            <h2 className="mt-1 truncate text-lg font-black text-slate-950">
                              {property?.name ?? "Immobilie"}
                            </h2>
                          </div>
                          <StatusPill>
                            {VISIT_STATUS_LABELS[visit.status] ?? visit.status}
                          </StatusPill>
                        </div>
                        <p className="mt-3 flex items-start gap-2 text-sm text-slate-600">
                          <MapPin
                            className="mt-0.5 shrink-0 text-brand"
                            size={16}
                            aria-hidden="true"
                          />
                          {address}
                        </p>
                        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                          <Link
                            href={`/app/visits/${visit.id}`}
                            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-brand px-4 text-sm font-black text-white transition hover:bg-brand-dark"
                          >
                            <PlayCircle size={17} aria-hidden="true" /> Einsatz öffnen
                          </Link>
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 text-sm font-black text-slate-700 transition hover:border-brand hover:text-brand"
                          >
                            <Navigation size={16} aria-hidden="true" /> Route
                          </a>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
              <Link
                href="/app/today"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 text-sm font-black text-slate-700 transition hover:border-brand hover:text-brand"
              >
                Vollständige Agenda <ArrowRight size={17} aria-hidden="true" />
              </Link>
            </div>
          ) : (
            <EmptyState
              title="Keine anstehenden Einsätze"
              text="Neue zugewiesene Termine erscheinen automatisch auf Ihrer Startseite."
            />
          )}
        </Panel>

      </div>
    </>
  );
}
