import Link from "next/link";
import {
  CalendarDays,
  Clock3,
  MapPin,
  Navigation,
  PackageCheck,
  PlayCircle,
} from "lucide-react";
import { startVisitAction } from "@/app/actions/portalEmployee";
import {
  SelectedVisitOverviewDialog,
  type SelectedVisitOverview,
} from "@/components/portal/SelectedVisitOverviewDialog";
import { VisitCalendar } from "@/components/portal/VisitCalendar";
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
import {
  buildVisitCalendarHref,
  getVisitCalendarRange,
  normalizeCalendarDate,
  normalizeVisitCalendarView,
} from "@/lib/portal/visitCalendar";
import { parseVisitReportSnapshot } from "@/lib/visitReportSnapshot";
import { parseVisitChecklistSnapshot } from "@/lib/visitTaskSnapshot";

type SearchParams = Promise<
  Record<string, string | string[] | undefined>
>;

type BuildingRow = {
  id: string;
  label: string | null;
  formatted_address: string;
};

type EquipmentRow = {
  id: string;
  name: string;
  unit: string;
};

type LiveVisitTask = {
  id: string;
  building_id: string | null;
  damage_report_id: string | null;
  source_type: string;
  title: string;
  description: string | null;
  category: string | null;
  checklist_snapshot: unknown;
  status: string;
  blocked_reason: string | null;
  completed_at: string | null;
  carried_from_task_id: string | null;
  follow_up_required: boolean;
  buildings: BuildingRow | BuildingRow[] | null;
  damage_reports:
    | { priority: string }
    | { priority: string }[]
    | null;
};

type CalendarVisit = {
  id: string;
  visit_plan_id: string | null;
  property_id: string;
  primary_employee_id: string | null;
  scheduled_date: string;
  planned_start_time: string | null;
  window_start: string | null;
  window_end: string | null;
  status: string;
  started_at: string | null;
  started_by: string | null;
  completed_at: string | null;
  duration_minutes: number | null;
  manually_adjusted: boolean;
  report_snapshot: unknown;
  properties:
    | { id: string; name: string }
    | { id: string; name: string }[]
    | null;
  visit_plans:
    | { id: string; label: string }
    | { id: string; label: string }[]
    | null;
  visit_buildings:
    | Array<{
        building_id: string;
        buildings: BuildingRow | BuildingRow[] | null;
      }>
    | null;
  visit_tasks: LiveVisitTask[] | null;
  visit_equipment:
    | Array<{
        equipment_id: string;
        required_quantity: number;
        rental: boolean;
        provision_note: string | null;
        equipment: EquipmentRow | EquipmentRow[] | null;
      }>
    | null;
};

const VISIT_CALENDAR_SELECT =
  "id,visit_plan_id,property_id,primary_employee_id,scheduled_date,planned_start_time,window_start,window_end,status,started_at,started_by,completed_at,duration_minutes,manually_adjusted,report_snapshot,properties(id,name),visit_plans(id,label),visit_buildings(building_id,buildings(id,label,formatted_address)),visit_tasks(id,building_id,damage_report_id,source_type,title,description,category,checklist_snapshot,status,blocked_reason,completed_at,carried_from_task_id,follow_up_required,buildings(id,label,formatted_address),damage_reports!visit_tasks_damage_report_id_fkey(priority)),visit_equipment(equipment_id,required_quantity,rental,provision_note,equipment(id,name,unit))";

const damagePriorityLabels: Record<string, string> = {
  low: "Niedrige Priorität",
  normal: "Normale Priorität",
  high: "Hohe Priorität",
  urgent: "Dringend",
};

function relation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

function queryValue(
  query: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = query[key];
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function visitPlanLabel(visit: CalendarVisit) {
  return (
    relation(visit.visit_plans)?.label ||
    (visit.manually_adjusted ? "Manueller Einsatz" : "Einsatz")
  );
}

function visitTimeLabel(visit: CalendarVisit) {
  if (visit.planned_start_time) {
    return `${visit.planned_start_time.slice(0, 5)} Uhr`;
  }
  if (visit.window_start && visit.window_end) {
    return `${visit.window_start.slice(0, 5)}–${visit.window_end.slice(0, 5)} Uhr`;
  }
  if (visit.window_start) return `ab ${visit.window_start.slice(0, 5)} Uhr`;
  return "Flexible Startzeit";
}

function visitScheduleLabel(visit: CalendarVisit) {
  return `${formatGermanDate(`${visit.scheduled_date}T12:00:00Z`, {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  })} · ${visitTimeLabel(visit)}`;
}

function liveVisitBuildings(visit: CalendarVisit) {
  const buildings = new Map<string, BuildingRow>();
  for (const link of visit.visit_buildings ?? []) {
    const building = relation(link.buildings);
    if (building) buildings.set(building.id, building);
  }
  for (const task of visit.visit_tasks ?? []) {
    const building = relation(task.buildings);
    if (building) buildings.set(building.id, building);
  }
  return Array.from(buildings.values());
}

function selectedVisitOverview(
  visit: CalendarVisit,
  employeeName: string,
): SelectedVisitOverview {
  const property = relation(visit.properties);
  const report =
    visit.status === "completed"
      ? parseVisitReportSnapshot(visit.report_snapshot)
      : null;
  const liveTasks = visit.visit_tasks ?? [];
  const liveTaskById = new Map(liveTasks.map((task) => [task.id, task]));
  const liveBuildings = liveVisitBuildings(visit);
  const buildings = report?.buildings.length
    ? report.buildings.map((building) => ({
        id: building.id,
        label: building.label || "Gebäude",
        address: building.address,
      }))
    : liveBuildings.map((building) => ({
        id: building.id,
        label: building.label || "Gebäude",
        address: building.formatted_address,
      }));
  const buildingLabelById = new Map(
    buildings.map((building) => [building.id, building.label]),
  );

  const tasks = report
      ? report.tasks.map((task) => {
        const liveTask = liveTaskById.get(task.id);
        const damagePriority = relation(liveTask?.damage_reports)?.priority;
        return {
          id: task.id,
          title: task.title,
          description: task.description,
          category: task.category,
          status: task.status,
          buildingLabel: task.buildingId
            ? (buildingLabelById.get(task.buildingId) ?? null)
            : null,
          blockedReason: task.blockedReason,
          completedAtLabel: task.completedAt
            ? formatGermanDate(task.completedAt, {
                hour: "2-digit",
                minute: "2-digit",
              })
            : null,
          checklist: task.checklist,
          isDamage:
            Boolean(liveTask?.damage_report_id) ||
            liveTask?.source_type === "damage",
          damagePriorityLabel: damagePriority
            ? (damagePriorityLabels[damagePriority] ?? damagePriority)
            : null,
          isCarried: Boolean(liveTask?.carried_from_task_id),
          followUpRequired: liveTask?.follow_up_required === true,
        };
      })
    : liveTasks.map((task) => {
        const damagePriority = relation(task.damage_reports)?.priority;
        return {
          id: task.id,
          title: task.title,
          description: task.description,
          category: task.category,
          status: task.status,
          buildingLabel: task.building_id
            ? (buildingLabelById.get(task.building_id) ??
              relation(task.buildings)?.label ??
              null)
            : null,
          blockedReason: task.blocked_reason,
          completedAtLabel: task.completed_at
            ? formatGermanDate(task.completed_at, {
                hour: "2-digit",
                minute: "2-digit",
              })
            : null,
          checklist: parseVisitChecklistSnapshot(task.checklist_snapshot),
          isDamage:
            Boolean(task.damage_report_id) || task.source_type === "damage",
          damagePriorityLabel: damagePriority
            ? (damagePriorityLabels[damagePriority] ?? damagePriority)
            : null,
          isCarried: Boolean(task.carried_from_task_id),
          followUpRequired: task.follow_up_required === true,
        };
      });

  return {
    id: visit.id,
    propertyName: report?.propertyName || property?.name || "Immobilie",
    scheduleLabel: visitScheduleLabel(visit),
    planLabel: visitPlanLabel(visit),
    status: visit.status,
    employeeName: report?.employeeName || employeeName,
    completedLabel:
      report?.completedAt || visit.completed_at
        ? formatGermanDate(report?.completedAt || visit.completed_at!, {
            hour: "2-digit",
            minute: "2-digit",
          })
        : null,
    durationLabel:
      report?.durationMinutes != null
        ? `${report.durationMinutes} Min.`
        : visit.duration_minutes != null
          ? `${visit.duration_minutes} Min.`
          : null,
    buildings,
    tasks,
  };
}

export default async function EmployeeTodayPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const query = await searchParams;
  const { profile, employee, supabase } = await requireEmployeeContext();
  const today = berlinIsoDate();
  const calendarView = normalizeVisitCalendarView(
    queryValue(query, "calendarView"),
  );
  const calendarDate = normalizeCalendarDate(
    queryValue(query, "calendarDate"),
    today,
  );
  const calendarRange = getVisitCalendarRange(calendarView, calendarDate);
  const requestedVisitId = queryValue(query, "visit");
  const requestedVisitIsValid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      requestedVisitId,
    );

  const [visitsResult, activeVisitResult] = await Promise.all([
    supabase
      .from("visits")
      .select(VISIT_CALENDAR_SELECT)
      .neq("status", "canceled")
      .gte("scheduled_date", calendarRange.start)
      .lte("scheduled_date", calendarRange.end)
      .order("scheduled_date")
      .order("planned_start_time")
      .limit(500),
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

  const visits = (visitsResult.data ?? []) as unknown as CalendarVisit[];
  const activeVisit = activeVisitResult.data;
  let selectedVisit = requestedVisitIsValid
    ? (visits.find((visit) => visit.id === requestedVisitId) ?? null)
    : null;

  if (requestedVisitIsValid && !selectedVisit) {
    const selectedVisitResult = await supabase
      .from("visits")
      .select(VISIT_CALENDAR_SELECT)
      .eq("id", requestedVisitId)
      .neq("status", "canceled")
      .maybeSingle();
    ensureDatabaseResult(
      selectedVisitResult.error,
      "Der ausgewählte Einsatz konnte nicht geladen werden.",
    );
    selectedVisit = selectedVisitResult.data
      ? (selectedVisitResult.data as unknown as CalendarVisit)
      : null;
  }

  const employeeName = employee.full_name || profile.full_name || "Mitarbeiter";
  const calendarEvents = visits.map((visit) => {
    const report =
      visit.status === "completed"
        ? parseVisitReportSnapshot(visit.report_snapshot)
        : null;
    return {
      id: visit.id,
      date: visit.scheduled_date,
      time:
        visit.planned_start_time?.slice(0, 5) ??
        visit.window_start?.slice(0, 5) ??
        null,
      status: visit.status,
      planLabel: visitPlanLabel(visit),
      employeeName: report?.employeeName || employeeName,
      taskCount: report?.tasks.length ?? visit.visit_tasks?.length ?? 0,
      propertyName:
        report?.propertyName || relation(visit.properties)?.name || "Immobilie",
    };
  });
  const popupCloseHref = buildVisitCalendarHref({
    baseHref: "/app/today",
    view: calendarView,
    calendarDate,
    sectionView: null,
  });
  const overview = selectedVisit
    ? selectedVisitOverview(selectedVisit, employeeName)
    : null;
  const selectedStartDisabled = Boolean(
    selectedVisit?.status === "scheduled" &&
      (selectedVisit.scheduled_date > today ||
        (activeVisit && activeVisit.id !== selectedVisit.id)),
  );
  const selectedStartDisabledLabel =
    selectedVisit?.status === "scheduled" && selectedVisit.scheduled_date > today
      ? "Am Einsatztag startbar"
      : activeVisit && activeVisit.id !== selectedVisit?.id
        ? "Laufenden Einsatz zuerst abschließen"
        : undefined;
  const selectedDetailsLabel =
    selectedVisit?.status === "completed"
      ? "Leistungsbericht ansehen"
      : selectedVisit?.status === "started"
        ? selectedVisit.started_by === profile.id
          ? "Einsatz fortsetzen"
          : "Laufenden Einsatz ansehen"
        : "Einsatzdetails öffnen";

  return (
    <>
      <PageHeader
        eyebrow="Mitarbeiterportal"
        title="Mein Einsatzkalender"
        text="Alle zugewiesenen Termine im Monats- oder Wochenblick. Ein Klick öffnet Aufgaben, Gebäude und den sicheren Einsatzstart."
        icon={<CalendarDays aria-hidden="true" size={20} />}
        compact
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
              {relation(activeVisit.properties)?.name ?? "Aktueller Einsatz"}
            </span>
          </span>
          <span className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-black text-white">
            <PlayCircle aria-hidden="true" size={17} /> Fortsetzen
          </span>
        </Link>
      ) : null}

      <VisitCalendar
        events={calendarEvents}
        view={calendarView}
        calendarDate={calendarDate}
        today={today}
        selectedVisitId={selectedVisit?.id ?? null}
        baseHref="/app/today"
        sectionView={null}
      />

      {overview && selectedVisit ? (
        <SelectedVisitOverviewDialog
          visit={overview}
          closeHref={popupCloseHref}
          detailsHref={`/app/visits/${selectedVisit.id}`}
          detailsLabel={selectedDetailsLabel}
          startVisitAction={startVisitAction}
          startDisabled={selectedStartDisabled}
          startDisabledLabel={selectedStartDisabledLabel}
        />
      ) : null}

      <details className="group mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 font-black text-slate-900 marker:hidden [&::-webkit-details-marker]:hidden sm:px-5">
          <span>Termine im sichtbaren Zeitraum als Liste</span>
          <span className="inline-flex min-h-8 items-center rounded-full bg-brand-soft px-3 text-xs text-brand">
            {visits.length}
          </span>
        </summary>
        <div className="border-t border-slate-200 p-3 sm:p-4">
          {visits.length ? (
            <div className="grid gap-3">
              {visits.map((visit) => {
                const property = relation(visit.properties);
                const buildings = liveVisitBuildings(visit);
                const mainAddress =
                  buildings[0]?.formatted_address ??
                  "Adresse im Einsatzdetail";
                const equipment = (visit.visit_equipment ?? []).flatMap(
                  (assignment) => {
                    const item = relation(assignment.equipment);
                    return item ? [{ assignment, item }] : [];
                  },
                );
                return (
                  <article
                    key={visit.id}
                    className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-500">
                          <CalendarDays aria-hidden="true" size={15} />
                          {formatGermanDate(
                            `${visit.scheduled_date}T12:00:00Z`,
                            {
                              weekday: "short",
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                            },
                          )}
                        </p>
                        <h2 className="mt-1 truncate text-lg font-black text-slate-950">
                          {property?.name ?? "Immobilie"}
                        </h2>
                        <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-slate-600">
                          <Clock3 aria-hidden="true" size={15} />
                          {visitTimeLabel(visit)} · {visitPlanLabel(visit)}
                        </p>
                        <p className="mt-1 flex items-start gap-2 text-sm text-slate-600">
                          <MapPin
                            aria-hidden="true"
                            className="mt-0.5 shrink-0"
                            size={15}
                          />
                          {mainAddress}
                        </p>
                        {equipment.length ? (
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {equipment.map(({ assignment, item }) => (
                              <span
                                key={assignment.equipment_id}
                                title={assignment.provision_note ?? undefined}
                                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold ${
                                  assignment.rental
                                    ? "border-amber-300 bg-amber-50 text-amber-900"
                                    : "border-slate-200 bg-white text-slate-700"
                                }`}
                              >
                                <PackageCheck aria-hidden="true" size={14} />
                                {item.name} · {assignment.required_quantity}{" "}
                                {item.unit || "Stück"}
                                {assignment.rental ? " · Mietequipment" : ""}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <StatusPill>
                        {VISIT_STATUS_LABELS[visit.status] ?? visit.status}
                      </StatusPill>
                    </div>
                    <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                      <Link
                        href={buildVisitCalendarHref({
                          baseHref: "/app/today",
                          view: calendarView,
                          calendarDate: visit.scheduled_date,
                          visitId: visit.id,
                          sectionView: null,
                        })}
                        scroll={false}
                        className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-brand px-4 text-sm font-black text-white sm:flex-none"
                      >
                        <PlayCircle aria-hidden="true" size={17} /> Übersicht
                        öffnen
                      </Link>
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mainAddress)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-black text-slate-700"
                      >
                        <Navigation aria-hidden="true" size={17} /> Route
                      </a>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <EmptyState
              title="Keine Einsätze in diesem Zeitraum"
              text="Wechseln Sie im Kalender in eine andere Woche oder einen anderen Monat."
            />
          )}
        </div>
      </details>
    </>
  );
}
