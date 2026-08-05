import Link from "next/link";
import {
  CalendarDays,
  Clock3,
  MapPin,
  Navigation,
  PackageCheck,
  PlayCircle,
} from "lucide-react";
import {
  EmptyState,
  PageHeader,
  StatusPill,
} from "@/components/portal/PortalUI";
import {
  VISIT_STATUS_LABELS,
  berlinIsoDate,
  formatGermanDate,
} from "@/lib/portal/core";
import {
  ensureDatabaseResult,
  requireEmployeeContext,
} from "@/lib/portal/access";

function relation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

const views = [
  { key: "day", label: "Heute" },
  { key: "week", label: "Woche" },
  { key: "month", label: "Monat" },
  { key: "agenda", label: "Agenda" },
] as const;

export default async function EmployeeTodayPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { profile, supabase } = await requireEmployeeContext();
  const requestedView = (await searchParams).view;
  const view = views.some((item) => item.key === requestedView)
    ? requestedView!
    : "agenda";
  const today = berlinIsoDate();
  const horizon = new Date(`${today}T12:00:00Z`);
  horizon.setUTCDate(
    horizon.getUTCDate() +
      (view === "day" ? 0 : view === "week" ? 7 : view === "month" ? 31 : 90),
  );

  const [visitsResult, activeVisitResult] = await Promise.all([
    supabase
      .from("visits")
      .select(
        "id,scheduled_date,planned_start_time,window_start,window_end,status,started_at,property_id,properties(id,name),visit_buildings(buildings(id,label,formatted_address)),visit_equipment(equipment_id,required_quantity,rental,provision_note,equipment(id,name,unit,category,condition))",
      )
      .gte("scheduled_date", today)
      .lte("scheduled_date", horizon.toISOString().slice(0, 10))
      .neq("status", "canceled")
      .order("scheduled_date")
      .order("planned_start_time")
      .limit(180),
    supabase
      .from("visits")
      .select("id,started_at,properties(name)")
      .eq("started_by", profile.id)
      .eq("status", "started")
      .maybeSingle(),
  ]);
  ensureDatabaseResult(
    visitsResult.error,
    "Die zugewiesenen Einsätze konnten nicht geladen werden.",
  );
  ensureDatabaseResult(
    activeVisitResult.error,
    "Der laufende Einsatz konnte nicht geladen werden.",
  );
  const visits = visitsResult.data ?? [];
  const activeVisit = activeVisitResult.data;
  const visibleVisits =
    view === "day"
      ? visits.filter((visit) => visit.scheduled_date === today)
      : visits;
  const todayCount = visits.filter(
    (visit) => visit.scheduled_date === today,
  ).length;

  return (
    <>
      <PageHeader
        eyebrow="Mitarbeiterportal"
        title="Kalender & Heute"
        text="Alle zugewiesenen Einsätze mit Gebäudegruppe, Adresse und benötigtem Equipment."
      />
      {activeVisit ? (
        <Link
          href={`/app/visits/${activeVisit.id}`}
          className="mb-5 flex items-center justify-between gap-3 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 shadow-sm"
        >
          <span>
            <span className="block text-xs font-black uppercase tracking-wide text-emerald-700">
              Laufender Einsatz
            </span>
            <span className="mt-1 block font-black text-emerald-950">
              {relation(activeVisit.properties)?.name}
            </span>
          </span>
          <span className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white">
            Fortsetzen
          </span>
        </Link>
      ) : null}
      <div className="mb-5 grid grid-cols-4 gap-1 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm sm:max-w-xl sm:gap-2">
        {views.map((item) => (
          <Link
            key={item.key}
            href={`/app/today?view=${item.key}`}
            className={`rounded-xl px-2 py-2.5 text-center text-xs font-black sm:px-3 sm:text-sm ${view === item.key ? "bg-brand text-white" : "text-slate-600 hover:bg-slate-50"}`}
          >
            {item.key === "day" ? `${item.label} (${todayCount})` : item.label}
          </Link>
        ))}
      </div>
      {visibleVisits.length ? (
        <div className="grid gap-4">
          {visibleVisits.map((visit) => {
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
            const equipment = (visit.visit_equipment ?? [])
              .map((assignment) => ({
                assignment,
                item: relation(assignment.equipment) as {
                  id: string;
                  name: string;
                  unit: string;
                } | null,
              }))
              .filter((entry) => Boolean(entry.item));
            const mainAddress =
              buildings[0]?.formatted_address ?? "Adresse im Einsatzdetail";
            const buildingGroup = buildings
              .map((building) => building.label || building.formatted_address)
              .join(", ");
            const isToday = visit.scheduled_date === today;
            return (
              <article
                key={visit.id}
                className={`overflow-hidden rounded-2xl border bg-white shadow-sm ${isToday ? "border-amber-300 ring-2 ring-amber-100" : "border-slate-200"}`}
              >
                <div className="flex items-stretch">
                  <div
                    className={`w-2 shrink-0 ${visit.status === "started" ? "bg-emerald-500" : isToday ? "bg-amber-400" : "bg-brand"}`}
                  />
                  <div className="min-w-0 flex-1 p-4 sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-500">
                          <CalendarDays size={15} />
                          {formatGermanDate(
                            `${visit.scheduled_date}T12:00:00Z`,
                            {
                              weekday: "long",
                              day: "2-digit",
                              month: "long",
                            },
                          )}
                        </p>
                        <h2 className="mt-2 text-xl font-black text-slate-950">
                          {property?.name ?? "Immobilie"}
                        </h2>
                        <p className="mt-1 text-sm font-semibold text-slate-600">
                          {buildingGroup || "Alle Gebäude der Immobilie"}
                        </p>
                      </div>
                      <StatusPill>
                        {VISIT_STATUS_LABELS[visit.status] ?? visit.status}
                      </StatusPill>
                    </div>
                    <div className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                      <p className="flex items-start gap-2">
                        <Clock3 className="mt-0.5 shrink-0 text-brand" size={17} />
                        {visit.planned_start_time?.slice(0, 5) ||
                          `${visit.window_start?.slice(0, 5) ?? "flexibel"}–${visit.window_end?.slice(0, 5) ?? ""}`}
                      </p>
                      <p className="flex items-start gap-2">
                        <MapPin className="mt-0.5 shrink-0 text-brand" size={17} />
                        {mainAddress}
                      </p>
                    </div>
                    {buildings.length > 1 ? (
                      <ul className="mt-3 grid gap-1 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                        {buildings.map((building) => (
                          <li key={building.id}>
                            <strong>{building.label || "Gebäude"}:</strong>{" "}
                            {building.formatted_address}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {equipment.length ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {equipment.map(({ assignment, item }) => (
                          <span
                            key={assignment.equipment_id}
                            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold ${assignment.rental ? "border-amber-300 bg-amber-50 text-amber-900" : "border-slate-200 bg-slate-50 text-slate-700"}`}
                            title={assignment.provision_note ?? undefined}
                          >
                            <PackageCheck size={14} />
                            {item?.name} · {assignment.required_quantity}{" "}
                            {item?.unit || "Stück"}
                            {assignment.rental ? " · Mietequipment" : ""}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Link
                        href={`/app/visits/${visit.id}`}
                        className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-brand px-4 text-sm font-black text-white sm:flex-none"
                      >
                        <PlayCircle size={18} /> Einsatz öffnen
                      </Link>
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mainAddress)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 text-sm font-black text-slate-700"
                      >
                        <Navigation size={17} /> Karten
                      </a>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState
          title="Keine anstehenden Einsätze"
          text="Sobald Sie einem Besuchsplan zugewiesen sind, erscheinen die nächsten Termine automatisch hier."
        />
      )}
    </>
  );
}
