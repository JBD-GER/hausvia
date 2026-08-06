import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  ClipboardCheck,
  Info,
  ListChecks,
  MapPin,
  Navigation,
  PackageCheck,
  PlayCircle,
  Wrench,
} from "lucide-react";
import {
  completeVisitAction,
  createEmployeeDamageAction,
  createOperationalReportAction,
  startVisitAction,
  updateVisitTaskAction,
} from "@/app/actions/portalEmployee";
import { PortalDialog } from "@/components/portal/PortalDialog";
import { PortalTabs } from "@/components/portal/PortalTabs";
import {
  CompactSection,
  EmptyState,
  Field,
  PageHeader,
  Panel,
  StatusPill,
  buttonClass,
  inputClass,
} from "@/components/portal/PortalUI";
import { VisitTimer } from "@/components/portal/VisitTimer";
import {
  formatGermanDate,
  TASK_STATUS_LABELS,
  VISIT_STATUS_LABELS,
} from "@/lib/portal/core";
import {
  ensureDatabaseResult,
  requireEmployeeContext,
} from "@/lib/portal/access";
import { createPrivateAttachmentUrls } from "@/lib/portal/files";
import {
  areVisitTasksResolved,
  parseVisitChecklistSnapshot,
} from "@/lib/visitTaskSnapshot";

const equipmentCategoryLabels: Record<string, string> = {
  device: "Gerät",
  tool: "Werkzeug",
  consumable: "Verbrauchsmaterial",
  cleaning_product: "Reinigungsmittel",
  rental: "Mietequipment",
  protective_clothing: "Schutzkleidung",
  other: "Sonstiges",
};

const equipmentConditionLabels: Record<string, string> = {
  available: "Verfügbar",
  in_use: "Im Einsatz",
  empty: "Leer",
  defective: "Defekt",
  in_repair: "In Reparatur",
  lost: "Verloren",
  archived: "Archiviert",
};

const operationalCategoryLabels: Record<string, string> = {
  equipment_broken: "Equipment defekt",
  cleaning_supply_empty: "Reinigungsmittel leer",
  consumable_low: "Verbrauchsmaterial fast leer",
  tool_missing: "Werkzeug fehlt",
  access_impossible: "Zugang nicht möglich",
  key_problem: "Schlüsselproblem",
  other: "Sonstiger Hinweis",
};

const operationalStatusLabels: Record<string, string> = {
  new: "Neu",
  reviewing: "In Prüfung",
  organized: "Organisiert",
  resolved: "Erledigt",
};

const operationalUrgencyLabels: Record<string, string> = {
  low: "Niedrig",
  normal: "Normal",
  high: "Hoch",
  urgent: "Dringend",
};

const VISIT_VIEWS = new Set(["work", "info", "reports"]);

function relation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

export default async function EmployeeVisitPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string; error?: string; view?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const { profile, employee, supabase } = await requireEmployeeContext();
  const { data: visit, error: visitError } = await supabase
    .from("visits")
    .select(
      "id,property_id,scheduled_date,planned_start_time,window_start,window_end,status,started_at,completed_at,duration_minutes,primary_employee_id,properties(id,name),visit_buildings(buildings(id,label,formatted_address)),visit_tasks(id,building_id,title,description,category,checklist_snapshot,status,blocked_reason,photo_required,buildings(label,formatted_address),visit_task_instructions(internal_instruction))",
    )
    .eq("id", id)
    .maybeSingle();
  ensureDatabaseResult(visitError, "Einsatzdetails konnten nicht geladen werden.");
  if (!visit) notFound();
  const property = relation(visit.properties);
  const buildings = (visit.visit_buildings ?? [])
    .map(
      (entry: { buildings: unknown }) =>
        relation(entry.buildings) as {
          id: string;
          label: string | null;
          formatted_address: string;
        } | null,
    )
    .filter(
      (
        item,
      ): item is {
        id: string;
        label: string | null;
        formatted_address: string;
      } => Boolean(item),
    );
  const [
    briefingResult,
    equipmentResult,
    accessNotesResult,
    operationalReportsResult,
  ] = await Promise.all([
    supabase
      .from("property_briefings")
      .select("internal_briefing")
      .eq("property_id", visit.property_id)
      .maybeSingle(),
    supabase
      .from("visit_equipment")
      .select(
        "equipment_id,required_quantity,rental,provision_note,equipment(id,name,category,condition,unit)",
      )
      .eq("visit_id", visit.id)
      .order("created_at", { ascending: true }),
    buildings.length
      ? supabase
          .from("building_access_notes")
          .select("building_id,access_notes")
          .in(
            "building_id",
            buildings.map((building) => building.id),
          )
      : Promise.resolve({
          data: [] as {
            building_id: string;
            access_notes: string | null;
          }[],
          error: null,
        }),
    supabase
      .from("operational_reports")
      .select(
        "id,building_id,category,urgency,title,description,status,created_at,operational_report_attachments(id,bucket,path,filename,mime_type)",
      )
      .eq("visit_id", visit.id)
      .eq("created_by", profile.id)
      .eq("employee_id", employee.id)
      .order("created_at", { ascending: false }),
  ]);
  ensureDatabaseResult(
    briefingResult.error,
    "Das interne Briefing konnte nicht geladen werden.",
  );
  ensureDatabaseResult(
    equipmentResult.error,
    "Das Einsatz-Equipment konnte nicht geladen werden.",
  );
  ensureDatabaseResult(
    accessNotesResult.error,
    "Die Zugangshinweise konnten nicht geladen werden.",
  );
  ensureDatabaseResult(
    operationalReportsResult.error,
    "Ihre betrieblichen Meldungen konnten nicht geladen werden.",
  );
  const briefing = briefingResult.data;
  const equipment = equipmentResult.data;
  const accessNotesByBuildingId = new Map(
    (accessNotesResult.data ?? []).map((note) => [
      note.building_id,
      note.access_notes?.trim() || null,
    ]),
  );
  const operationalReports = operationalReportsResult.data ?? [];
  const operationalReportAttachmentUrls = await createPrivateAttachmentUrls(
    supabase,
    operationalReports.flatMap(
      (report) => report.operational_report_attachments ?? [],
    ),
  );
  const tasks = visit.visit_tasks ?? [];
  const buildingById = new Map(
    buildings.map((building) => [building.id, building]),
  );
  type VisitTask = (typeof tasks)[number];
  type TaskBuildingGroup = {
    key: string;
    label: string;
    address: string | null;
    order: number;
    categories: Map<string, VisitTask[]>;
  };
  const taskGroupsByBuilding = new Map<string, TaskBuildingGroup>();
  const buildingOrderById = new Map(
    buildings.map((building, index) => [building.id, index]),
  );
  for (const task of tasks) {
    const key = task.building_id ?? "property";
    const relatedTaskBuilding = relation(task.buildings) as {
      label: string | null;
      formatted_address: string;
    } | null;
    const taskBuilding = task.building_id
      ? (buildingById.get(task.building_id) ?? relatedTaskBuilding)
      : null;
    let buildingGroup = taskGroupsByBuilding.get(key);
    if (!buildingGroup) {
      buildingGroup = {
        key,
        label:
          taskBuilding?.label ||
          (task.building_id ? "Gebäude" : "Gesamte Immobilie"),
        address: taskBuilding?.formatted_address ?? null,
        order: task.building_id
          ? (buildingOrderById.get(task.building_id) ?? buildings.length + 1)
          : -1,
        categories: new Map<string, VisitTask[]>(),
      };
      taskGroupsByBuilding.set(key, buildingGroup);
    }
    const category = task.category?.trim() || "Allgemein";
    const categoryTasks = buildingGroup.categories.get(category) ?? [];
    categoryTasks.push(task);
    buildingGroup.categories.set(category, categoryTasks);
  }
  const taskGroups = Array.from(taskGroupsByBuilding.values())
    .sort((left, right) => left.order - right.order)
    .map((group) => ({
      ...group,
      categories: Array.from(group.categories, ([label, categoryTasks]) => ({
        label,
        tasks: categoryTasks,
      })),
    }));
  const allResolved = areVisitTasksResolved(tasks);
  const address = buildings[0]?.formatted_address;
  const reportStatus = Boolean(
    query.status?.includes("Schaden") || query.status?.includes("Meldung"),
  );
  const view = query.view && VISIT_VIEWS.has(query.view)
    ? query.view
    : reportStatus
      ? "reports"
    : visit.status === "completed"
      ? "info"
      : "work";
  const unresolvedTaskCount = tasks.filter(
    (task) => !["done", "blocked"].includes(task.status),
  ).length;

  return (
    <>
      <PageHeader
        eyebrow={formatGermanDate(`${visit.scheduled_date}T12:00:00Z`, {
          weekday: "long",
          day: "2-digit",
          month: "long",
          year: "numeric",
        })}
        title={property?.name ?? "Einsatz"}
        text={address}
        icon={<ClipboardCheck aria-hidden="true" size={20} />}
        compact
        actions={
          <Link href="/app/today" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-black text-slate-700 transition hover:border-brand hover:text-brand">
            <ArrowLeft aria-hidden="true" size={17} /> Kalender
          </Link>
        }
      />
      {query.error ? (
        <p
          role="alert"
          className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800"
        >
          {query.error}
        </p>
      ) : null}
      {query.status === "completed" ? (
        <p className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-900">
          Einsatz wurde abgeschlossen und als Leistungsnachweis gespeichert.
        </p>
      ) : null}
      {query.status && query.status !== "completed" && query.status !== "started" ? (
        <p role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-900">
          {query.status}
        </p>
      ) : null}
      {visit.status === "started" && visit.started_at ? (
        <VisitTimer startedAt={visit.started_at} />
      ) : null}

      <div className="mt-4">
        <PortalTabs
          activeId={view}
          label="Einsatzbereiche"
          items={[
            {
              id: "work",
              label: visit.status === "scheduled" ? "Start" : "Aufgaben",
              href: `/app/visits/${visit.id}?view=work`,
              icon: <ListChecks aria-hidden="true" size={17} />,
              badge: unresolvedTaskCount ? <span className="rounded-full bg-current/10 px-1.5 py-0.5 text-[0.65rem]">{unresolvedTaskCount}</span> : undefined,
            },
            {
              id: "info",
              label: "Infos",
              href: `/app/visits/${visit.id}?view=info`,
              icon: <Info aria-hidden="true" size={17} />,
            },
            {
              id: "reports",
              label: "Meldungen",
              href: `/app/visits/${visit.id}?view=reports`,
              icon: <CircleAlert aria-hidden="true" size={17} />,
              badge: operationalReports.length ? <span className="rounded-full bg-current/10 px-1.5 py-0.5 text-[0.65rem]">{operationalReports.length}</span> : undefined,
            },
          ]}
        />
      </div>
      <div className="grid gap-4">
        {view !== "reports" ? (
        <div className="grid content-start gap-5">
          {view === "info" ? (
          <Panel title="Einsatzübersicht">
            <div className="grid gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <StatusPill>
                  {VISIT_STATUS_LABELS[visit.status] ?? visit.status}
                </StatusPill>
                <span className="text-sm font-bold text-slate-600">
                  {visit.planned_start_time?.slice(0, 5) ||
                    `${visit.window_start?.slice(0, 5) ?? ""}–${visit.window_end?.slice(0, 5) ?? ""}`}
                </span>
              </div>
              {buildings.map((building) => (
                <div key={building.id} className="rounded-xl bg-slate-50 p-4">
                  <p className="font-black text-slate-950">
                    {building.label || "Gebäude"}
                  </p>
                  <p className="mt-1 flex items-start gap-2 text-sm text-slate-600">
                    <MapPin size={16} className="mt-0.5" />
                    {building.formatted_address}
                  </p>
                  {accessNotesByBuildingId.get(building.id) ? (
                    <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3">
                      <p className="text-xs font-black uppercase tracking-wide text-brand">
                        Zugangshinweise
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-800">
                        {accessNotesByBuildingId.get(building.id)}
                      </p>
                    </div>
                  ) : null}
                </div>
              ))}
              {address ? (
                <a
                  target="_blank"
                  rel="noreferrer"
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-brand px-4 text-sm font-black text-brand"
                >
                  <Navigation size={17} /> In Karten öffnen
                </a>
              ) : null}
            </div>
          </Panel>
          ) : null}
          {view === "work" && visit.status === "scheduled" ? (
            <form
              action={startVisitAction}
              className="rounded-2xl border border-amber-300 bg-amber-50 p-5"
            >
              <input type="hidden" name="visitId" value={visit.id} />
              <p className="text-sm leading-6 text-amber-950">
                Starten Sie den Einsatz erst bei Ihrer Ankunft. Die Startzeit
                wird sicher auf dem Server gespeichert; die vorgeplante
                Checkliste wird dabei verbindlich für diesen Einsatz geöffnet.
              </p>
              <button className="mt-4 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-brand px-5 font-black text-white">
                <PlayCircle size={22} /> Ankunft starten
              </button>
            </form>
          ) : null}
          {view === "work" ? (
          <Panel title="Aufgaben" description={`${tasks.length} Aufgaben · ${unresolvedTaskCount} offen`}>
            <div className="grid gap-4">
              {taskGroups.length ? (
                <div className="grid gap-5">
                  {taskGroups.map((buildingGroup, buildingIndex) => (
                    <details
                      key={buildingGroup.key}
                      open={buildingIndex === 0}
                      className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50"
                    >
                      <summary className="cursor-pointer list-none bg-slate-100 px-4 py-3 marker:hidden [&::-webkit-details-marker]:hidden">
                        <span className="block font-black text-slate-950">
                          {buildingGroup.label}
                        </span>
                        {buildingGroup.address ? (
                          <p className="mt-1 flex items-start gap-2 text-xs font-semibold text-slate-600">
                            <MapPin size={14} className="mt-0.5 shrink-0" />
                            {buildingGroup.address}
                          </p>
                        ) : null}
                      </summary>
                      <div className="grid gap-5 p-3 sm:p-4">
                        {buildingGroup.categories.map((categoryGroup) => (
                          <section key={categoryGroup.label}>
                            <h4 className="mb-2 text-xs font-black uppercase tracking-wide text-brand">
                              {categoryGroup.label}
                            </h4>
                            <div className="grid gap-3">
                              {categoryGroup.tasks.map((task) => {
                                const instruction = relation(
                                  task.visit_task_instructions,
                                ) as {
                                  internal_instruction: string | null;
                                } | null;
                                const internalInstruction =
                                  instruction?.internal_instruction?.trim();
                                const checklist =
                                  parseVisitChecklistSnapshot(
                                    task.checklist_snapshot,
                                  );
                                return (
                                  <details
                                    key={task.id}
                                    open={!["done", "blocked"].includes(task.status)}
                                    className={`overflow-hidden rounded-2xl border ${
                                      task.status === "done"
                                        ? "border-emerald-200 bg-emerald-50"
                                        : task.status === "blocked"
                                          ? "border-amber-200 bg-amber-50"
                                          : "border-slate-200 bg-white"
                                    }`}
                                  >
                                    <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 p-4 marker:hidden [&::-webkit-details-marker]:hidden">
                                      <span className="min-w-0">
                                        <span className="block font-black text-slate-950">
                                          {task.title}
                                        </span>
                                      </span>
                                      <StatusPill>
                                        {TASK_STATUS_LABELS[task.status] ??
                                          task.status}
                                      </StatusPill>
                                    </summary>
                                    <div className="border-t border-current/10 px-4 pb-4">
                                    {task.description ? (
                                      <p className="mt-3 text-sm leading-6 text-slate-600">
                                        {task.description}
                                      </p>
                                    ) : null}
                                    {internalInstruction ? (
                                      <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 p-3">
                                        <p className="text-xs font-black uppercase tracking-wide text-brand">
                                          Interne Arbeitsanweisung
                                        </p>
                                        <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-800">
                                          {internalInstruction}
                                        </p>
                                      </div>
                                    ) : null}
                                    {checklist.length ? (
                                      <details className="group mt-3 rounded-xl border border-slate-200 bg-slate-50">
                                        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 text-sm font-black text-slate-900 marker:hidden [&::-webkit-details-marker]:hidden">
                                          <span className="flex items-center gap-2">
                                          <ListChecks
                                            aria-hidden="true"
                                            size={17}
                                            className="text-brand"
                                          />
                                          Checkliste · {checklist.length} Punkte
                                          </span>
                                          <span aria-hidden="true" className="text-brand transition group-open:rotate-45">+</span>
                                        </summary>
                                        <ol className="grid gap-2 border-t border-slate-200 p-3">
                                          {checklist.map((item, index) => (
                                            <li
                                              key={`${task.id}-${item.id ?? "item"}-${index}`}
                                              className="flex items-start gap-2 rounded-lg bg-white px-3 py-2 text-sm text-slate-800"
                                            >
                                              <span
                                                aria-hidden="true"
                                                className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand-soft text-[11px] font-black text-brand"
                                              >
                                                {index + 1}
                                              </span>
                                              <span className="min-w-0 flex-1">
                                                {item.label}
                                              </span>
                                              {item.required ? (
                                                <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-black text-amber-900">
                                                  Pflichtpunkt
                                                </span>
                                              ) : null}
                                            </li>
                                          ))}
                                        </ol>
                                        <p className="px-3 pb-3 text-xs leading-5 text-slate-500">
                                          Die beim Einsatzstart gespeicherte
                                          Checkliste dient als Arbeitsvorgabe.
                                          Bewertet wird die Aufgabe insgesamt.
                                        </p>
                                      </details>
                                    ) : null}
                                    {visit.status === "started" &&
                                    !["done", "blocked"].includes(
                                      task.status,
                                    ) ? (
                                      <details className="group mt-4 rounded-xl border border-brand/20 bg-brand-soft/50">
                                        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-3 text-sm font-black text-brand marker:hidden [&::-webkit-details-marker]:hidden">
                                          Aufgabe bearbeiten
                                          <span aria-hidden="true" className="transition group-open:rotate-45">+</span>
                                        </summary>
                                      <form
                                        action={updateVisitTaskAction}
                                        className="grid gap-3 border-t border-brand/10 bg-white p-3"
                                      >
                                        <input
                                          type="hidden"
                                          name="visitId"
                                          value={visit.id}
                                        />
                                        <input
                                          type="hidden"
                                          name="taskId"
                                          value={task.id}
                                        />
                                        <label className="text-sm font-bold text-slate-700">
                                          Status
                                          <select
                                            name="status"
                                            className={inputClass}
                                            defaultValue="done"
                                          >
                                            <option value="done">
                                              Erledigt
                                            </option>
                                            <option value="in_progress">
                                              In Bearbeitung
                                            </option>
                                            <option value="blocked">
                                              Nicht ausführbar
                                            </option>
                                          </select>
                                        </label>
                                        <label className="text-sm font-bold text-slate-700">
                                          Begründung, falls nicht ausführbar
                                          <textarea
                                            name="blockedReason"
                                            rows={2}
                                            className={inputClass}
                                          />
                                        </label>
                                        <label className="text-sm font-bold text-slate-700">
                                          Foto{" "}
                                          {task.photo_required
                                            ? "(Pflicht)"
                                            : "(optional)"}
                                          <input
                                            name="photo"
                                            type="file"
                                            accept="image/*"
                                            capture="environment"
                                            className={inputClass}
                                          />
                                        </label>
                                        <button className={buttonClass}>
                                          Aufgabe speichern
                                        </button>
                                      </form>
                                      </details>
                                    ) : task.blocked_reason ? (
                                      <p className="mt-3 rounded-xl bg-white/70 p-3 text-sm text-slate-700">
                                        <strong>Begründung:</strong>{" "}
                                        {task.blocked_reason}
                                      </p>
                                    ) : null}
                                    </div>
                                  </details>
                                );
                              })}
                            </div>
                          </section>
                        ))}
                      </div>
                    </details>
                  ))}
                </div>
              ) : visit.status === "scheduled" ? (
                <EmptyState
                  title="Für diesen Termin ist nichts fällig"
                  text="Saisonale Leistungen und offene Schadensmeldungen werden automatisch eingeplant, sobald sie für diesen Einsatz gelten."
                />
              ) : (
                <EmptyState
                  title="Keine Aufgaben"
                  text="Für diesen Einsatz wurden keine fälligen Aufgaben ermittelt."
                />
              )}
            </div>
          </Panel>
          ) : null}
          {view === "work" && visit.status === "started" ? (
            <form
              action={completeVisitAction}
              className={`rounded-2xl border p-5 ${allResolved ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}
            >
              <input type="hidden" name="visitId" value={visit.id} />
              <p className="flex items-start gap-2 text-sm font-bold text-slate-800">
                {allResolved ? (
                  <CheckCircle2
                    className="shrink-0 text-emerald-600"
                    size={20}
                  />
                ) : (
                  <ClipboardCheck
                    className="shrink-0 text-slate-500"
                    size={20}
                  />
                )}
                {allResolved
                  ? tasks.length
                    ? "Alle Aufgaben sind bewertet. Der Leistungsbericht kann erzeugt werden."
                    : "Für diesen Einsatz sind keine Aufgaben fällig. Der Leistungsbericht kann erzeugt werden."
                  : "Vor dem Abschluss muss jede Aufgabe erledigt oder begründet nicht ausführbar sein."}
              </p>
              <button
                disabled={!allResolved}
                className="mt-4 min-h-14 w-full rounded-xl bg-brand px-5 font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                Einsatz abschließen
              </button>
            </form>
          ) : null}
        </div>
        ) : null}
        <aside className="grid content-start gap-5">
          {view === "info" ? (
          <>
          <CompactSection title="Internes Briefing" description="Objekthinweise vor Beginn" defaultOpen>
            <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">
              {briefing?.internal_briefing ||
                "Für diese Immobilie ist kein internes Briefing hinterlegt."}
            </p>
          </CompactSection>
          <CompactSection
            title="Benötigtes Equipment"
            description="Mengen, Zustand und Bereitstellung"
            badge={<StatusPill>{equipment?.length ?? 0}</StatusPill>}
          >
            <div className="grid gap-3">
              {equipment?.length ? (
                equipment.map((assignment) => {
                  const item = relation(assignment.equipment) as {
                    id: string;
                    name: string;
                    category: string;
                    condition: string;
                    unit: string;
                  } | null;
                  return (
                    <div
                      key={assignment.equipment_id}
                      className={`rounded-xl border p-3 ${assignment.rental ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-slate-50"}`}
                    >
                      <p className="flex items-center gap-2 font-black text-slate-950">
                        <PackageCheck size={17} /> {item?.name}
                      </p>
                      <p className="mt-1 text-xs font-bold text-slate-500">
                        {assignment.required_quantity} {item?.unit || "Stück"}
                        {item?.category
                          ? ` · ${equipmentCategoryLabels[item.category] ?? item.category}`
                          : ""}
                        {item?.condition
                          ? ` · ${equipmentConditionLabels[item.condition] ?? item.condition}`
                          : ""}
                        {assignment.rental ? " · Mietequipment" : ""}
                      </p>
                      {assignment.provision_note ? (
                        <p className="mt-2 text-sm text-slate-700">
                          {assignment.provision_note}
                        </p>
                      ) : null}
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-slate-600">
                  Für diesen Einsatz ist kein besonderes Equipment vorgemerkt.
                </p>
              )}
            </div>
          </CompactSection>
          </>
          ) : null}
          {view === "reports" ? (
          <>
          <div className="grid gap-3 sm:grid-cols-2">
          <PortalDialog
            triggerLabel="Schaden melden"
            triggerIcon={<AlertTriangle aria-hidden="true" size={18} />}
            title="Schaden dokumentieren"
            description="Die Meldung wird dem Gebäude und diesem Einsatz zugeordnet."
            size="md"
            triggerClassName="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border border-amber-300 bg-amber-50 px-4 font-black text-amber-950 transition hover:bg-amber-100"
          >
            <form
              action={createEmployeeDamageAction}
              className="grid gap-3"
            >
              <input type="hidden" name="visitId" value={visit.id} />
              <label className="text-sm font-bold">
                Gebäude
                <select name="buildingId" required className={inputClass}>
                  {buildings.map((building) => (
                    <option key={building.id} value={building.id}>
                      {building.label || building.formatted_address}
                    </option>
                  ))}
                </select>
              </label>
              <Field label="Titel">
                <input name="title" required className={inputClass} />
              </Field>
              <Field label="Beschreibung">
                <textarea
                  name="description"
                  required
                  rows={4}
                  className={inputClass}
                />
              </Field>
              <label className="text-sm font-bold">
                Priorität
                <select name="priority" className={inputClass}>
                  <option value="normal">Normal</option>
                  <option value="high">Hoch</option>
                  <option value="urgent">Dringend</option>
                </select>
              </label>
              <Field label="Bild (optional)">
                <input
                  name="image"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                  capture="environment"
                  className={inputClass}
                />
              </Field>
              <button className={buttonClass}>Schaden übermitteln</button>
            </form>
          </PortalDialog>
          <PortalDialog
            triggerLabel="Betriebliche Meldung"
            triggerIcon={<Wrench aria-hidden="true" size={18} />}
            title="Betriebliche Meldung erstellen"
            description="Material, Equipment oder Zugangsprobleme direkt intern melden."
            size="md"
            triggerClassName="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border border-brand/20 bg-brand-soft px-4 font-black text-brand transition hover:bg-white"
          >
            <form
              action={createOperationalReportAction}
              className="grid gap-3"
            >
              <input
                type="hidden"
                name="propertyId"
                value={visit.property_id}
              />
              <input type="hidden" name="visitId" value={visit.id} />
              <label className="text-sm font-bold">
                Gebäude (optional)
                <select
                  name="buildingId"
                  defaultValue=""
                  className={inputClass}
                >
                  <option value="">Gesamte Immobilie</option>
                  {buildings.map((building) => (
                    <option key={building.id} value={building.id}>
                      {building.label || building.formatted_address}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-bold">
                Kategorie
                <select name="category" className={inputClass}>
                  <option value="equipment_broken">Equipment defekt</option>
                  <option value="cleaning_supply_empty">
                    Reinigungsmittel leer
                  </option>
                  <option value="consumable_low">
                    Verbrauchsmaterial fast leer
                  </option>
                  <option value="tool_missing">Werkzeug fehlt</option>
                  <option value="access_impossible">
                    Zugang nicht möglich
                  </option>
                  <option value="key_problem">Schlüsselproblem</option>
                  <option value="other">Sonstiger Hinweis</option>
                </select>
              </label>
              <label className="text-sm font-bold">
                Equipment (optional)
                <select
                  name="equipmentId"
                  defaultValue=""
                  className={inputClass}
                >
                  <option value="">Kein bestimmtes Equipment</option>
                  {equipment?.map((assignment) => {
                    const item = relation(assignment.equipment) as {
                      id: string;
                      name: string;
                    } | null;
                    return item ? (
                      <option
                        key={assignment.equipment_id}
                        value={assignment.equipment_id}
                      >
                        {item.name}
                      </option>
                    ) : null;
                  })}
                </select>
              </label>
              <Field label="Titel">
                <input name="title" required className={inputClass} />
              </Field>
              <Field label="Beschreibung">
                <textarea
                  name="description"
                  required
                  rows={4}
                  className={inputClass}
                />
              </Field>
              <label className="text-sm font-bold">
                Dringlichkeit
                <select name="urgency" className={inputClass}>
                  <option value="normal">Normal</option>
                  <option value="high">Hoch</option>
                  <option value="urgent">Dringend</option>
                </select>
              </label>
              <Field label="Foto (optional)">
                <input
                  name="photo"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className={inputClass}
                />
              </Field>
              <button className={buttonClass}>Intern an Admin melden</button>
            </form>
          </PortalDialog>
          </div>
          <CompactSection
            title="Meine betrieblichen Meldungen"
            description="Status und Rückblick zu diesem Einsatz"
            badge={<StatusPill>{operationalReports.length}</StatusPill>}
            defaultOpen={operationalReports.length > 0}
          >
            {operationalReports.length ? (
              <div className="grid gap-3">
                {operationalReports.map((report) => {
                  const reportBuilding = report.building_id
                    ? buildingById.get(report.building_id)
                    : null;
                  return (
                    <article
                      key={report.id}
                      className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-black text-slate-950">
                            {report.title}
                          </p>
                          <p className="mt-1 text-xs font-bold text-slate-500">
                            {operationalCategoryLabels[report.category] ??
                              report.category}
                            {" · "}
                            {formatGermanDate(report.created_at)}
                          </p>
                        </div>
                        <StatusPill>
                          {operationalStatusLabels[report.status] ??
                            report.status}
                        </StatusPill>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs font-extrabold">
                        <span
                          className={`rounded-full px-2.5 py-1 ${
                            report.urgency === "urgent"
                              ? "bg-red-100 text-red-800"
                              : report.urgency === "high"
                                ? "bg-amber-100 text-amber-900"
                                : "bg-slate-200 text-slate-700"
                          }`}
                        >
                          Dringlichkeit:{" "}
                          {operationalUrgencyLabels[report.urgency] ??
                            report.urgency}
                        </span>
                        <span className="rounded-full bg-white px-2.5 py-1 text-slate-700">
                          {report.building_id
                            ? reportBuilding?.label ||
                              reportBuilding?.formatted_address ||
                              "Gebäude"
                            : "Gesamte Immobilie"}
                        </span>
                      </div>
                      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                        {report.description}
                      </p>
                      {report.operational_report_attachments?.length ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {report.operational_report_attachments.map(
                            (attachment) =>
                              operationalReportAttachmentUrls[attachment.id] ? (
                                <a
                                  key={attachment.id}
                                  href={
                                    operationalReportAttachmentUrls[
                                      attachment.id
                                    ]
                                  }
                                  target="_blank"
                                  rel="noreferrer"
                                  className="rounded-lg border border-brand/20 bg-white px-3 py-2 text-xs font-black text-brand underline"
                                >
                                  Foto: {attachment.filename}
                                </a>
                              ) : null,
                          )}
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm leading-6 text-slate-600">
                Sie haben zu diesem Einsatz noch keine betriebliche Meldung
                eingereicht.
              </p>
            )}
          </CompactSection>
          </>
          ) : null}
        </aside>
      </div>
    </>
  );
}
