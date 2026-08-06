import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { linkOfferToPropertyAction } from "@/app/actions/offers";
import {
  addBuildingAction,
  assignPropertyEmployeeAction,
  assignPropertyEquipmentAction,
  cancelExtraChargeAction,
  cancelVisitAction,
  correctVisitTimeAction,
  createAdminDamageAction,
  createExtraChargeAction,
  createManualVisitAction,
  createPropertyServiceAction,
  createVisitPlanAction,
  rescheduleVisitAction,
  rotateBuildingQrTokenAction,
  sendAdminPropertyMessageAction,
  togglePropertyServiceAction,
  updateComplaintStatusAction,
  updateDamageStatusAction,
  updateOperationalReportStatusAction,
  updatePropertyAdminSettingsAction,
  updatePropertyBillingProfileAction,
  updatePropertyServiceSortOrderAction,
  deleteVisitPlanAction,
  updateVisitPlanAction,
  updateVisitPlanStatusAction,
} from "@/app/actions/portalAdmin";
import {
  updateBuildingStatusAction,
  updatePropertyStatusAction,
} from "@/app/actions/portalLifecycleAdmin";
import {
  deactivatePropertyEquipmentAssignmentAction,
  endPropertyEmployeeAssignmentAction,
  updateBuildingDetailsAction,
  updatePropertyCoreAction,
  updatePropertyEquipmentAssignmentAction,
  updatePropertyServiceAction,
} from "@/app/actions/portalPropertyManagement";
import {
  addServiceChecklistItemAction,
  assignServiceEquipmentAction,
  removeServiceChecklistItemAction,
  removeServiceEquipmentAction,
} from "@/app/actions/portalServiceAdmin";
import { PropertyChat } from "@/components/portal/PropertyChat";
import { PropertyRealtimeRefresh } from "@/components/portal/PropertyRealtimeRefresh";
import { ConfirmSubmitButton } from "@/components/portal/ConfirmSubmitButton";
import { ServiceCatalogSelect } from "@/components/portal/ServiceCatalogSelect";
import {
  SelectedVisitOverviewDialog,
  type SelectedVisitOverview,
} from "@/components/portal/SelectedVisitOverviewDialog";
import { VisitCalendar } from "@/components/portal/VisitCalendar";
import { VisitPlanScheduleFields } from "@/components/portal/VisitPlanScheduleFields";
import {
  VisitPlanServiceFields,
  type VisitPlanServiceOption,
} from "@/components/portal/VisitPlanServiceFields";
import { PortalTabs } from "@/components/portal/PortalTabs";
import {
  EmptyState,
  Field,
  MetricCard,
  PageHeader,
  Panel,
  StatusPill,
  buttonClass,
  inputClass,
} from "@/components/portal/PortalUI";
import {
  EXECUTION_RULE_LABELS,
  PROPERTY_TYPE_LABELS,
  VISIT_STATUS_LABELS,
  berlinIsoDate,
  formatBerlinDateTimeLocal,
  formatCents,
  formatGermanDate,
} from "@/lib/portal/core";
import { attachChatSenderRoles } from "@/lib/portal/chatSenderRoles";
import { createPrivateAttachmentUrls } from "@/lib/portal/files";
import { requireAdminContext } from "@/lib/portal/access";
import { getVisitScheduleSummary } from "@/lib/portal/visitRecurrence";
import {
  buildVisitCalendarHref,
  getVisitCalendarRange,
  isCalendarDate,
  normalizeCalendarDate,
  normalizeVisitCalendarView,
} from "@/lib/portal/visitCalendar";
import {
  parseVisitReportSnapshot,
  parseVisitOperationalReportsSnapshot,
  visitReportPhotos,
} from "@/lib/visitReportSnapshot";
import { parseVisitChecklistSnapshot } from "@/lib/visitTaskSnapshot";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type DisplayAttachment = { id: string; filename: string };

const months = [
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
];
const damageStatusLabels: Record<string, string> = {
  new: "Neu",
  reviewed: "Geprüft",
  scheduled: "Für Einsatz eingeplant",
  in_progress: "In Bearbeitung",
  resolved: "Erledigt",
  rejected: "Abgelehnt",
};
const operationalStatusLabels: Record<string, string> = {
  new: "Neu",
  reviewing: "In Prüfung",
  organized: "Bestellt oder organisiert",
  resolved: "Erledigt",
};
const complaintStatusLabels: Record<string, string> = {
  new: "Neu",
  in_review: "In Prüfung",
  answered: "Beantwortet",
  resolved: "Erledigt",
};
const invoiceStatusLabels: Record<string, string> = {
  draft: "Entwurf",
  created: "Erstellt",
  released: "Erstellt",
  sent: "Versendet",
  open: "Offen",
  paid: "Bezahlt",
  overdue: "Überfällig",
  canceled: "Storniert",
  error: "Fehler",
};
const extraChargeStatusLabels: Record<string, string> = {
  open: "Offen",
  queued: "Für Rechnung vorgemerkt",
  billed: "Abgerechnet",
  canceled: "Storniert",
};
const visitPlanStatusLabels: Record<string, string> = {
  active: "Aktiv",
  paused: "Pausiert",
  archived: "Archiviert",
};
const damagePriorityLabels: Record<string, string> = {
  low: "Priorität niedrig",
  normal: "Priorität normal",
  high: "Priorität hoch",
  urgent: "Priorität dringend",
};
const propertyStatusLabels: Record<string, string> = {
  planning: "In Planung",
  active: "Aktiv",
  paused: "Pausiert",
  archived: "Archiviert",
};
const availablePropertyViews = new Set([
  "uebersicht",
  "gebaeude",
  "leistungen",
  "einsaetze",
  "schaeden",
  "team",
  "chat",
  "abrechnung",
]);

function queryValue(params: Awaited<SearchParams>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function relation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

function customerLabel(customer: Record<string, unknown> | null) {
  if (!customer) return "Unbekannter Kunde";
  const person = [customer.first_name, customer.last_name]
    .filter(Boolean)
    .join(" ");
  return String(
    customer.company_name ||
      person ||
      customer.contact_name ||
      customer.email ||
      "Unbekannter Kunde",
  );
}

function visitScheduleLabel(visit: {
  scheduled_date?: string | null;
  planned_start_time?: string | null;
}) {
  if (!visit.scheduled_date) return "Termin ohne Datum";
  const date = formatGermanDate(`${visit.scheduled_date}T12:00:00Z`);
  return visit.planned_start_time
    ? `${date} · ${visit.planned_start_time.slice(0, 5)} Uhr`
    : date;
}

function visitOverviewTaskStatus(statuses: string[]) {
  if (statuses.length && statuses.every((status) => status === "done")) {
    return "done";
  }
  if (
    statuses.length &&
    statuses.every((status) => status === "done" || status === "blocked")
  ) {
    return "blocked";
  }
  if (statuses.some((status) => status === "in_progress")) {
    return "in_progress";
  }
  return "open";
}

function liveBuildingAddress(building: {
  formatted_address?: string | null;
  street?: string | null;
  house_number?: string | null;
  postal_code?: string | null;
  city?: string | null;
}) {
  if (building.formatted_address?.trim()) {
    return building.formatted_address.trim();
  }
  const street = [building.street, building.house_number]
    .filter(Boolean)
    .join(" ");
  const city = [building.postal_code, building.city].filter(Boolean).join(" ");
  return [street, city].filter(Boolean).join(", ") || "Adresse nicht hinterlegt";
}

export default async function AdminPropertyDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const query = await searchParams;
  const today = berlinIsoDate();
  const requestedView = queryValue(query, "view");
  const activeView = availablePropertyViews.has(requestedView)
    ? requestedView
    : "uebersicht";
  const isVisitsView = activeView === "einsaetze";
  const requestedCalendarDate = queryValue(query, "calendarDate");
  const hasExplicitCalendarDate = isCalendarDate(requestedCalendarDate);
  const calendarView = normalizeVisitCalendarView(
    queryValue(query, "calendarView"),
  );
  const calendarDate = normalizeCalendarDate(
    requestedCalendarDate,
    today,
  );
  const calendarRange = getVisitCalendarRange(calendarView, calendarDate);
  const { profile, admin: supabase } = await requireAdminContext();
  const { data: property, error: propertyError } = await supabase
    .from("properties")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (propertyError || !property) notFound();

  const [
    { data: customer },
    { data: buildings },
    { data: buildingAccessNotes },
    { data: services },
    { data: serviceBuildings },
    { data: serviceInstructions },
    { data: serviceCatalog },
    { data: adminSettings },
    { data: compensationRates },
    { data: briefing },
    { data: billingProfile },
    { data: companySettings },
    { data: visitPlans },
    { data: calendarVisits },
    { data: upcomingVisits },
    { data: recentCompletedVisits },
    { data: damages },
    { data: operationalReports },
    { data: complaints },
    { data: assignments },
    { data: employees },
    { data: equipment },
    { data: propertyEquipment },
    { data: messages },
    { data: extraCharges },
    { data: invoices },
    { data: linkedOffers },
    { data: acceptedOffers },
  ] = await Promise.all([
    supabase
      .from("customers")
      .select("*")
      .eq("id", property.customer_id)
      .maybeSingle(),
    supabase
      .from("buildings")
      .select(
        "id,property_id,label,street,house_number,postal_code,city,country,formatted_address,status,created_at,updated_at",
      )
      .eq("property_id", id)
      .order("created_at"),
    supabase.from("building_access_notes").select("building_id,access_notes"),
    supabase
      .from("property_services")
      .select("*")
      .eq("property_id", id)
      .order("sort_order"),
    supabase
      .from("property_service_buildings")
      .select("property_service_id,building_id,property_services!inner(property_id)")
      .eq("property_services.property_id", id),
    supabase
      .from("property_service_instructions")
      .select(
        "property_service_id,internal_instruction,updated_at,property_services!inner(property_id)",
      )
      .eq("property_services.property_id", id),
    supabase
      .from("service_catalog")
      .select("*")
      .eq("status", "active")
      .order("sort_order"),
    supabase
      .from("property_admin_settings")
      .select("*")
      .eq("property_id", id)
      .maybeSingle(),
    supabase
      .from("property_compensation_rates")
      .select("id,net_amount_cents,tax_rate_bps,valid_from,valid_until,internal_note")
      .eq("property_id", id)
      .order("valid_from", { ascending: false }),
    supabase
      .from("property_briefings")
      .select("internal_briefing")
      .eq("property_id", id)
      .maybeSingle(),
    supabase
      .from("property_billing_profiles")
      .select("*")
      .eq("property_id", id)
      .maybeSingle(),
    supabase
      .from("company_settings")
      .select("default_hourly_rate_cents")
      .eq("id", true)
      .maybeSingle(),
    supabase
      .from("visit_plans")
      .select(
        "*,visit_plan_buildings(building_id),visit_plan_employees(employee_id),visit_plan_services(property_service_id,execution_mode)",
      )
      .eq("property_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("visits")
      .select("*,visit_buildings(building_id)")
      .eq("property_id", id)
      .neq("status", "canceled")
      .gte("scheduled_date", calendarRange.start)
      .lte("scheduled_date", calendarRange.end)
      .order("scheduled_date")
      .order("planned_start_time")
      .limit(isVisitsView ? 500 : 0),
    supabase
      .from("visits")
      .select("*")
      .eq("property_id", id)
      .eq("status", "scheduled")
      .gte("scheduled_date", today)
      .order("scheduled_date")
      .order("planned_start_time")
      .limit(120),
    supabase
      .from("visits")
      .select("*")
      .eq("property_id", id)
      .eq("status", "completed")
      .order("scheduled_date", { ascending: false })
      .order("planned_start_time", { ascending: false })
      .limit(24),
    supabase
      .from("damage_reports")
      .select("*,damage_attachments(id,bucket,path,filename,mime_type)")
      .eq("property_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("operational_reports")
      .select(
        "*,operational_report_attachments(id,bucket,path,filename,mime_type)",
      )
      .eq("property_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("complaints")
      .select(
        "*,complaint_admin_notes(internal_note),complaint_attachments(id,bucket,path,filename,mime_type)",
      )
      .eq("property_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("property_employee_assignments")
      .select("*")
      .eq("property_id", id)
      .eq("active", true),
    supabase
      .from("employee_profiles")
      .select("*")
      .neq("status", "disabled")
      .order("full_name"),
    supabase.from("equipment").select("*").eq("status", "active").order("name"),
    supabase
      .from("property_equipment")
      .select("*")
      .eq("property_id", id)
      .eq("active", true),
    supabase
      .from("property_messages")
      .select(
        "id,body,message_type,created_at,sender_id,sender_display_name,message_attachments(id,bucket,path,filename,mime_type),message_reactions(emoji,user_id),message_reads(user_id,read_at)",
      )
      .eq("property_id", id)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("extra_charges")
      .select("*")
      .eq("property_id", id)
      .order("service_date", { ascending: false }),
    supabase
      .from("invoices")
      .select("*")
      .eq("property_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("offer_property_links")
      .select(
        "id,offer_id,offer_version_id,linked_at,import_completed_at,offer_versions(offer_number,title,accepted_at,billing_totals,original_pdf_path),offer_property_item_links(id,scope,agreed_price_snapshot,property_service_id,offer_version_items(title))",
      )
      .eq("property_id", id)
      .order("linked_at", { ascending: false }),
    supabase
      .from("offer_versions")
      .select("id,offer_id,offer_number,title,accepted_at,offer_property_links(id)")
      .eq("customer_id", property.customer_id)
      .eq("lifecycle_status", "accepted")
      .order("accepted_at", { ascending: false }),
  ]);

  const requestedVisitId = queryValue(query, "visit");
  const requestedVisitIsValid =
    isVisitsView && /^[0-9a-f-]{36}$/i.test(requestedVisitId);
  let selectedVisit = requestedVisitIsValid
    ? (calendarVisits ?? []).find((visit) => visit.id === requestedVisitId) ??
      null
    : null;
  if (requestedVisitIsValid && !selectedVisit) {
    const { data } = await supabase
      .from("visits")
      .select("*,visit_buildings(building_id)")
      .eq("id", requestedVisitId)
      .eq("property_id", id)
      .neq("status", "canceled")
      .maybeSingle();
    selectedVisit = data ?? null;
  }
  if (!selectedVisit) {
    selectedVisit =
      (calendarVisits ?? []).find(
        (visit) => visit.scheduled_date === calendarDate,
      ) ??
      (!hasExplicitCalendarDate
        ? (calendarVisits ?? []).find(
            (visit) =>
              visit.status === "scheduled" && visit.scheduled_date >= today,
          ) ?? (calendarVisits ?? [])[0]
        : null) ??
      null;
  }
  const operationalVisitById = new Map(
    [
      ...(calendarVisits ?? []),
      ...(recentCompletedVisits ?? []),
      ...(selectedVisit ? [selectedVisit] : []),
    ].map((visit) => [visit.id, visit]),
  );
  const operationalVisits = Array.from(operationalVisitById.values());

  const currentMonth = today.slice(0, 7);
  const requestedMetricsMonth = queryValue(query, "metricsMonth");
  const selectedMetricsMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(
    requestedMetricsMonth,
  )
    ? requestedMetricsMonth
    : currentMonth;
  const [metricsYear, metricsMonthNumber] = selectedMetricsMonth
    .split("-")
    .map(Number);
  const metricsMonthEnd = new Date(
    Date.UTC(metricsYear, metricsMonthNumber, 0, 12),
  )
    .toISOString()
    .slice(0, 10);
  const { data: monthlyMetricVisits, error: monthlyMetricError } = await supabase
    .from("visits")
    .select(
      "id,scheduled_date,started_at,completed_at,duration_minutes,visit_admin_metrics(max_visit_minutes,overtime_minutes)",
    )
    .eq("property_id", id)
    .eq("status", "completed")
    .gte("scheduled_date", `${selectedMetricsMonth}-01`)
    .lte("scheduled_date", metricsMonthEnd)
    .order("scheduled_date", { ascending: false });
  if (monthlyMetricError) {
    throw new Error("Die monatliche Einsatzzeitauswertung konnte nicht geladen werden.");
  }

  const serviceIds = (services ?? []).map((service) => service.id);
  const [checklistResult, serviceEquipmentResult] = serviceIds.length
    ? await Promise.all([
        supabase
          .from("service_checklist_items")
          .select("id,property_service_id,label,required,sort_order")
          .in("property_service_id", serviceIds)
          .order("sort_order"),
        supabase
          .from("service_equipment")
          .select(
            "property_service_id,equipment_id,required_quantity,equipment(id,name,unit,status)",
          )
          .in("property_service_id", serviceIds),
      ])
    : [{ data: [] }, { data: [] }];
  const serviceChecklistItems = checklistResult.data ?? [];
  const serviceEquipment = serviceEquipmentResult.data ?? [];

  const visitIds = operationalVisits.map((visit) => visit.id);
  const taskVisitIds = isVisitsView ? visitIds : [];
  const metricVisitIds =
    isVisitsView || activeView === "uebersicht" ? visitIds : [];
  const [{ data: visitTasks }, { data: visitAdminMetrics }] = await Promise.all([
    taskVisitIds.length
      ? supabase
          .from("visit_tasks")
          .select("*")
          .in("visit_id", taskVisitIds)
          .order("created_at")
      : Promise.resolve({ data: [] }),
    metricVisitIds.length
      ? supabase
          .from("visit_admin_metrics")
          .select(
            "visit_id,max_visit_minutes,overtime_minutes,operational_reports_snapshot",
          )
          .in("visit_id", metricVisitIds)
      : Promise.resolve({ data: [] }),
  ]);
  const reportByVisitId = new Map(
    operationalVisits.map((visit) => [
      visit.id,
      parseVisitReportSnapshot(visit.report_snapshot),
    ]),
  );
  const operationalSnapshotByVisitId = new Map(
    (visitAdminMetrics ?? []).map((metric) => [
      metric.visit_id,
      parseVisitOperationalReportsSnapshot(
        metric.operational_reports_snapshot,
      ),
    ]),
  );
  const chatMessages = await attachChatSenderRoles(
    (messages ?? []).slice().reverse(),
  );
  const signedAttachmentUrls = await createPrivateAttachmentUrls(
    supabase,
    chatMessages.flatMap((message) => message.message_attachments ?? []),
  );
  const recordAttachmentUrls = await createPrivateAttachmentUrls(
    supabase,
    [
      ...(damages ?? []).flatMap(
        (damage) => damage.damage_attachments ?? [],
      ),
      ...(operationalReports ?? []).flatMap(
        (report) => report.operational_report_attachments ?? [],
      ),
      ...(complaints ?? []).flatMap(
        (complaint) => complaint.complaint_attachments ?? [],
      ),
      ...(isVisitsView
        ? operationalVisits.flatMap((visit) =>
            visitReportPhotos(reportByVisitId.get(visit.id) ?? null),
          )
        : []),
      ...(isVisitsView
        ? operationalVisits.flatMap((visit) =>
            (operationalSnapshotByVisitId.get(visit.id) ?? []).flatMap(
              (operationalReport) => operationalReport.photos,
            ),
          )
        : []),
    ],
  );

  const buildingById = new Map(
    (buildings ?? []).map((building) => [building.id, building]),
  );
  const accessNotesByBuildingId = new Map(
    (buildingAccessNotes ?? []).map((note) => [note.building_id, note.access_notes]),
  );
  const serviceInstructionById = new Map(
    (serviceInstructions ?? []).map((instruction) => [
      instruction.property_service_id,
      instruction.internal_instruction,
    ]),
  );
  const serviceInstructionVersionById = new Map(
    (serviceInstructions ?? []).map((instruction) => [
      instruction.property_service_id,
      instruction.updated_at,
    ]),
  );
  const employeeById = new Map(
    (employees ?? []).map((employee) => [employee.id, employee]),
  );
  const visitPlanById = new Map(
    (visitPlans ?? []).map((plan) => [plan.id, plan]),
  );
  const serviceById = new Map(
    (services ?? []).map((service) => [service.id, service]),
  );
  const damageById = new Map(
    (damages ?? []).map((damage) => [damage.id, damage]),
  );
  const explicitlySelectedVisit =
    requestedVisitIsValid && selectedVisit?.id === requestedVisitId
      ? selectedVisit
      : null;
  const explicitlySelectedReport = explicitlySelectedVisit
    ? (reportByVisitId.get(explicitlySelectedVisit.id) ?? null)
    : null;
  const explicitlySelectedTasks = explicitlySelectedVisit
    ? (visitTasks ?? []).filter(
        (task) => task.visit_id === explicitlySelectedVisit.id,
      )
    : [];

  const liveVisitBuildingIds = explicitlySelectedVisit
    ? (explicitlySelectedVisit.visit_buildings ?? []).map(
        (link: { building_id: string }) => link.building_id,
      )
    : [];
  const taskBuildingIds = explicitlySelectedTasks.flatMap((task) =>
    task.building_id ? [task.building_id] : [],
  );
  const uniqueVisitBuildingIds = Array.from(
    new Set([...liveVisitBuildingIds, ...taskBuildingIds]),
  );
  const overviewBuildings = explicitlySelectedReport?.buildings.length
    ? explicitlySelectedReport.buildings.map((building) => ({
        id: building.id,
        label: building.label || "Gebäude",
        address: building.address,
      }))
    : uniqueVisitBuildingIds.flatMap((buildingId) => {
        const building = buildingById.get(buildingId);
        return building
          ? [
              {
                id: building.id,
                label: building.label || "Gebäude",
                address: liveBuildingAddress(building),
              },
            ]
          : [];
      });
  const overviewBuildingById = new Map(
    overviewBuildings.map((building) => [building.id, building]),
  );

  type ServiceOverviewAccumulator = {
    id: string;
    name: string;
    category: string | null;
    statuses: string[];
    buildingLabels: Set<string>;
  };
  const serviceOverviewById = new Map<string, ServiceOverviewAccumulator>();
  for (const task of explicitlySelectedTasks) {
    if (!task.property_service_id) continue;
    const service = serviceById.get(task.property_service_id);
    const current: ServiceOverviewAccumulator =
      serviceOverviewById.get(task.property_service_id) ?? {
        id: task.property_service_id,
        name: service?.name || task.title,
        category: service?.category || task.category || null,
        statuses: [],
        buildingLabels: new Set<string>(),
      };
    current.statuses.push(task.status);
    const buildingLabel = task.building_id
      ? overviewBuildingById.get(task.building_id)?.label ||
        buildingById.get(task.building_id)?.label
      : null;
    if (buildingLabel) current.buildingLabels.add(buildingLabel);
    serviceOverviewById.set(task.property_service_id, current);
  }

  const popupCloseHref = buildVisitCalendarHref({
    baseHref: `/admin/properties/${id}`,
    view: calendarView,
    calendarDate,
  });
  const explicitlySelectedCompletedAt =
    explicitlySelectedReport?.completedAt ||
    explicitlySelectedVisit?.completed_at ||
    null;
  const selectedVisitOverview: SelectedVisitOverview | null =
    explicitlySelectedVisit
      ? {
          id: explicitlySelectedVisit.id,
          propertyName:
            explicitlySelectedReport?.propertyName || property.name,
          scheduleLabel: visitScheduleLabel(explicitlySelectedVisit),
          planLabel:
            visitPlanById.get(explicitlySelectedVisit.visit_plan_id)?.label ??
            (explicitlySelectedVisit.manually_adjusted
              ? "Manueller Einsatz"
              : "Einsatz"),
          status: explicitlySelectedVisit.status,
          employeeName:
            explicitlySelectedReport?.employeeName ||
            employeeById.get(explicitlySelectedVisit.primary_employee_id)
              ?.full_name ||
            "Noch nicht zugewiesen",
          completedLabel: explicitlySelectedCompletedAt
            ? formatGermanDate(explicitlySelectedCompletedAt, {
                hour: "2-digit",
                minute: "2-digit",
              })
            : null,
          durationLabel:
            explicitlySelectedReport?.durationMinutes != null
              ? `${explicitlySelectedReport.durationMinutes} Min.`
              : explicitlySelectedVisit.duration_minutes != null
                ? `${explicitlySelectedVisit.duration_minutes} Min.`
                : null,
          buildings: overviewBuildings,
          services: Array.from(serviceOverviewById.values()).map(
            (service) => ({
              id: service.id,
              name: service.name,
              category: service.category,
              status: visitOverviewTaskStatus(service.statuses),
              buildingLabels: Array.from(service.buildingLabels).sort((a, b) =>
                a.localeCompare(b, "de"),
              ),
            }),
          ),
          tasks: explicitlySelectedTasks.map((task) => {
            const damage = task.damage_report_id
              ? damageById.get(task.damage_report_id)
              : null;
            return {
              id: task.id,
              title: task.title,
              description: task.description || null,
              category: task.category || null,
              status: task.status,
              buildingLabel: task.building_id
                ? overviewBuildingById.get(task.building_id)?.label ||
                  buildingById.get(task.building_id)?.label ||
                  null
                : null,
              blockedReason: task.blocked_reason || null,
              completedAtLabel: task.completed_at
                ? formatGermanDate(task.completed_at, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : null,
              checklist: parseVisitChecklistSnapshot(task.checklist_snapshot),
              isDamage:
                Boolean(task.damage_report_id) || task.source_type === "damage",
              damagePriorityLabel: damage?.priority
                ? damagePriorityLabels[damage.priority] ||
                  `Priorität ${damage.priority}`
                : null,
              isCarried: Boolean(task.carried_from_task_id),
              followUpRequired: task.follow_up_required === true,
            };
          }),
        }
      : null;
  const taskCountByVisitId = new Map<string, number>();
  for (const task of visitTasks ?? []) {
    taskCountByVisitId.set(
      task.visit_id,
      (taskCountByVisitId.get(task.visit_id) ?? 0) + 1,
    );
  }
  const calendarEvents = (calendarVisits ?? []).map((visit) => ({
    id: visit.id,
    date: visit.scheduled_date,
    time:
      visit.planned_start_time?.slice(0, 5) ??
      visit.window_start?.slice(0, 5) ??
      null,
    status: visit.status,
    planLabel:
      visitPlanById.get(visit.visit_plan_id)?.label ??
      (visit.manually_adjusted ? "Manueller Einsatz" : "Einsatz"),
    employeeName:
      employeeById.get(visit.primary_employee_id)?.full_name ??
      "Noch nicht zugewiesen",
    taskCount: taskCountByVisitId.get(visit.id) ?? 0,
  }));
  const equipmentById = new Map(
    (equipment ?? []).map((item) => [item.id, item]),
  );
  const assignedEmployeeIds = new Set(
    (assignments ?? []).map((assignment) => assignment.employee_id),
  );
  const availablePropertyEmployees = (employees ?? []).filter(
    (employee) =>
      employee.status === "active" && !assignedEmployeeIds.has(employee.id),
  );
  const schedulableEmployees = (employees ?? []).filter(
    (employee) =>
      employee.status === "active" && assignedEmployeeIds.has(employee.id),
  );
  const activeBuildings = (buildings ?? []).filter(
    (building) => building.status === "active",
  );
  const propertyReadOnly = property.status === "archived";
  const manualServices = (services ?? []).filter(
    (service) =>
      service.status === "active" &&
      ["on_demand", "manual"].includes(service.execution_rule),
  );
  const recurringServices = (services ?? []).filter(
    (service) =>
      service.status === "active" &&
      !["on_demand", "manual"].includes(service.execution_rule),
  );
  const recurringServiceById = new Map(
    recurringServices.map((service) => [service.id, service]),
  );
  const visitPlanServiceOptions: VisitPlanServiceOption[] =
    recurringServices.map((service) => ({
      id: service.id,
      name: service.name,
      category: service.category,
      estimatedMinutes: service.estimated_minutes
        ? Number(service.estimated_minutes)
        : null,
      seasonLabel:
        service.seasonal &&
        service.season_start_month &&
        service.season_end_month
          ? `${months[service.season_start_month - 1]} bis ${months[service.season_end_month - 1]}`
          : null,
    }));
  const openDamages = (damages ?? []).filter(
    (damage) => !["resolved", "rejected"].includes(damage.status),
  );
  const scheduledVisits = (upcomingVisits ?? [])
    .filter(
      (visit) =>
        visit.status === "scheduled" && visit.scheduled_date >= berlinIsoDate(),
    )
    .sort((left, right) =>
      `${left.scheduled_date}${left.planned_start_time || ""}`.localeCompare(
        `${right.scheduled_date}${right.planned_start_time || ""}`,
      ),
    );
  const completedVisits = recentCompletedVisits ?? [];
  const latestCompletedVisit = completedVisits[0] ?? null;
  const averageDurationMinutes = completedVisits.length
    ? Math.round(
        completedVisits.reduce(
          (total, visit) => total + Number(visit.duration_minutes ?? 0),
          0,
        ) / completedVisits.length,
      )
    : 0;
  const overtimeVisits = (visitAdminMetrics ?? []).filter(
    (metric) => Number(metric.overtime_minutes ?? 0) > 0,
  );
  const overtimeMinutes = overtimeVisits.reduce(
    (total, metric) => total + Number(metric.overtime_minutes ?? 0),
    0,
  );
  const assignedTeamNames = (assignments ?? [])
    .map((assignment) => employeeById.get(assignment.employee_id)?.full_name)
    .filter(Boolean);
  const rentalEquipmentCount = (propertyEquipment ?? []).filter(
    (assignment) => assignment.rental,
  ).length;
  const unreadChatMessages = (messages ?? []).filter(
    (message) =>
      message.sender_id !== profile.id &&
      !(message.message_reads ?? []).some(
        (read: { user_id: string }) => read.user_id === profile.id,
      ),
  ).length;
  const latestInvoice = invoices?.[0] ?? null;
  const openExtraCharges = (extraCharges ?? []).filter(
    (charge) => ["open", "queued"].includes(charge.billing_status),
  );
  const monthlyMetrics = (monthlyMetricVisits ?? []).map((visit) => ({
    visit,
    metric: relation(visit.visit_admin_metrics) as {
      max_visit_minutes: number | null;
      overtime_minutes: number;
    } | null,
  }));
  const monthlyDurationMinutes = monthlyMetrics.reduce(
    (total, item) => total + Number(item.visit.duration_minutes ?? 0),
    0,
  );
  const monthlyOvertimeMinutes = monthlyMetrics.reduce(
    (total, item) => total + Number(item.metric?.overtime_minutes ?? 0),
    0,
  );
  const type = property.property_type as keyof typeof PROPERTY_TYPE_LABELS;
  const monthlyFeeNetCents = Number(adminSettings?.monthly_fee_net_cents || 0);
  const currentCompensationRate = compensationRates?.[0] ?? null;
  const maxVisitMinutes = Number(adminSettings?.max_visit_minutes || 120);
  const defaultHourlyRateCents = Number(
    companySettings?.default_hourly_rate_cents ?? 6000,
  );
  const billingRecipientName =
    billingProfile?.recipient_name || customerLabel(customer);
  const billingStreet =
    billingProfile?.street || String(customer?.billing_street || "");
  const billingHouseNumber =
    billingProfile?.house_number ||
    String(customer?.billing_house_number || "");
  const billingPostalCode =
    billingProfile?.postal_code ||
    String(customer?.billing_postal_code || "");
  const billingCity =
    billingProfile?.city || String(customer?.billing_city || "");
  const billingCountry =
    billingProfile?.country ||
    String(customer?.billing_country || "Deutschland");
  const billingEmail = billingProfile?.email || String(customer?.email || "");
  const taxRateBps = Number(adminSettings?.tax_rate_bps || 1900);

  return (
    <>
      <PropertyRealtimeRefresh propertyId={property.id} />
      <PageHeader
        eyebrow="Immobilie"
        title={property.name}
        text={`${customerLabel(customer)} · ${PROPERTY_TYPE_LABELS[type] ?? property.property_type} · ${property.object_key || "ohne internen Objektschlüssel"}`}
      />
      {queryValue(query, "status") ? (
        <p
          className="mb-5 rounded-lg border border-green-200 bg-green-50 p-4 text-sm font-bold text-green-900"
          role="status"
        >
          {queryValue(query, "status")}
        </p>
      ) : null}
      {queryValue(query, "error") ? (
        <p
          className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-900"
          role="alert"
        >
          {queryValue(query, "error")}
        </p>
      ) : null}

      <PortalTabs
        activeId={activeView}
        label="Bereiche der Immobilie"
        items={[
          ["uebersicht", "Übersicht"],
          ["gebaeude", "Gebäude"],
          ["leistungen", "Leistungen"],
          ["einsaetze", "Einsätze"],
          ["schaeden", "Meldungen"],
          ["team", "Team & Equipment"],
          ["chat", "Chat"],
          ["abrechnung", "Abrechnung"],
        ].map(([view, label]) => ({
          id: view,
          label,
          href: `/admin/properties/${id}?view=${view}`,
        }))}
      />

      <div className="grid gap-5">
        {activeView === "uebersicht" ? (
        <section id="uebersicht" className="scroll-mt-24">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              label="Gebäude"
              value={(buildings ?? []).length}
              tone="accent"
            />
            <MetricCard
              label="Aktive Leistungen"
              value={
                (services ?? []).filter(
                  (service) => service.status === "active",
                ).length
              }
            />
            <MetricCard label="Offene Schäden" value={openDamages.length} />
            <MetricCard
              label="Nächster Einsatz"
              value={
                scheduledVisits[0]
                  ? visitScheduleLabel(scheduledVisits[0])
                  : "–"
              }
            />
            <MetricCard
              label="Letzter Einsatz"
              value={
                latestCompletedVisit
                  ? visitScheduleLabel(latestCompletedVisit)
                  : "–"
              }
            />
            <MetricCard
              label="Ø Einsatzdauer"
              value={completedVisits.length ? `${averageDurationMinutes} Min.` : "–"}
            />
            <MetricCard
              label="Überschreitungen"
              value={
                overtimeVisits.length
                  ? `${overtimeVisits.length} · +${overtimeMinutes} Min.`
                  : "Keine"
              }
            />
            <MetricCard
              label="Letzte Rechnung"
              value={
                latestInvoice
                  ? invoiceStatusLabels[latestInvoice.status] ?? latestInvoice.status
                  : "–"
              }
            />
          </div>
          <div className="mt-5">
            <Panel title="Operativer Überblick">
              <dl className="grid gap-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
                <div>
                  <dt className="font-bold text-slate-500">Gebäude &amp; Adressen</dt>
                  <dd className="mt-1 grid gap-1 font-semibold text-slate-950">
                    {activeBuildings.length
                      ? activeBuildings.map((building) => (
                          <span key={building.id}>
                            {building.label ? `${building.label}: ` : ""}
                            {building.formatted_address}
                          </span>
                        ))
                      : "–"}
                  </dd>
                </div>
                <div>
                  <dt className="font-bold text-slate-500">Aktuelles Team</dt>
                  <dd className="mt-1 font-semibold text-slate-950">
                    {assignedTeamNames.join(", ") || "Noch niemand zugewiesen"}
                  </dd>
                </div>
                <div>
                  <dt className="font-bold text-slate-500">Equipment</dt>
                  <dd className="mt-1 font-semibold text-slate-950">
                    {(propertyEquipment ?? []).length} Zuordnung(en)
                    {rentalEquipmentCount
                      ? ` · ${rentalEquipmentCount} Mietequipment`
                      : ""}
                  </dd>
                </div>
                <div>
                  <dt className="font-bold text-slate-500">Chat-Aktivität</dt>
                  <dd className="mt-1 font-semibold text-slate-950">
                    {(messages ?? []).length} Nachricht(en) · {unreadChatMessages} ungelesen
                  </dd>
                </div>
                <div>
                  <dt className="font-bold text-slate-500">Offene Zusatzkosten</dt>
                  <dd className="mt-1 font-semibold text-slate-950">
                    {openExtraCharges.length} Position(en) ·{" "}
                    {formatCents(
                      openExtraCharges.reduce(
                        (total, charge) =>
                          total + Number(charge.net_amount_cents ?? 0),
                        0,
                      ),
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="font-bold text-slate-500">Letzte Rechnung</dt>
                  <dd className="mt-1 font-semibold text-slate-950">
                    {latestInvoice
                      ? `${latestInvoice.invoice_number || "Entwurf"} · ${formatCents(Number(latestInvoice.gross_total_cents ?? 0))}`
                      : "Noch keine Rechnung"}
                  </dd>
                </div>
              </dl>
            </Panel>
          </div>
          <div className="mt-5">
            <Panel title="Vertragsgrundlage aus Angeboten">
              {linkedOffers?.length ? (
                <div className="grid gap-3">
                  {linkedOffers.map((link) => {
                    const version = Array.isArray(link.offer_versions)
                      ? link.offer_versions[0]
                      : link.offer_versions;
                    return (
                      <article key={link.id} className="rounded-xl border border-green-200 bg-green-50 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-extrabold text-green-950">
                              {version?.offer_number || "Angebot"} · {version?.title || "Vertragsangebot"}
                            </p>
                            <p className="mt-1 text-sm text-green-900">
                              Angenommen {version?.accepted_at ? formatGermanDate(version.accepted_at) : "–"} · {(link.offer_property_item_links ?? []).length} vereinbarte Leistung(en)
                            </p>
                            <p className="mt-1 text-xs text-green-800">
                              Das Originalangebot und seine Preisstände bleiben unveränderlich gespeichert.
                            </p>
                            {(link.offer_property_item_links ?? []).length ? (
                              <dl className="mt-3 grid gap-2">
                                {(link.offer_property_item_links ?? []).map((itemLink) => {
                                  const item = Array.isArray(itemLink.offer_version_items)
                                    ? itemLink.offer_version_items[0]
                                    : itemLink.offer_version_items;
                                  const snapshot = itemLink.agreed_price_snapshot && typeof itemLink.agreed_price_snapshot === "object" && !Array.isArray(itemLink.agreed_price_snapshot)
                                    ? itemLink.agreed_price_snapshot as Record<string, unknown>
                                    : {};
                                  const billingType = String(snapshot.billing_type || "one_time");
                                  const subtotalCents = Number(snapshot.subtotal_before_discount_cents ?? snapshot.subtotal_cents ?? 0);
                                  const discountCents = Number(snapshot.discount_cents ?? 0);
                                  const netCents = Number(snapshot.net_cents ?? subtotalCents);
                                  const bucketSnapshot = snapshot.billing_buckets && typeof snapshot.billing_buckets === "object" && !Array.isArray(snapshot.billing_buckets)
                                    ? snapshot.billing_buckets as Record<string, unknown>
                                    : {};
                                  const bucketLabels: Record<string, { label: string; suffix: string }> = {
                                    one_time: { label: "Einmalig", suffix: "" },
                                    monthly: { label: "Monatlich", suffix: "/ Monat" },
                                    seasonal: { label: "Saisonal", suffix: "/ Saison" },
                                    per_visit: { label: "Einsatzbezogen", suffix: "für geplante Einsätze" },
                                  };
                                  const bucketRows = Object.entries(bucketLabels).flatMap(([key, labels]) => {
                                    const value = bucketSnapshot[key];
                                    const row = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
                                    const rowNetCents = Number(row.net_cents ?? row.netCents ?? 0);
                                    const rowDiscountCents = Number(row.discount_cents ?? row.discountCents ?? 0);
                                    const rowSubtotalCents = Number(row.subtotal_cents ?? row.subtotalCents ?? rowNetCents + rowDiscountCents);
                                    return rowNetCents > 0 || rowDiscountCents > 0
                                      ? [{ key, ...labels, netCents: rowNetCents, discountCents: rowDiscountCents, subtotalCents: rowSubtotalCents }]
                                      : [];
                                  });
                                  const billingLabel = billingType === "monthly"
                                    ? "monatlich"
                                    : billingType === "per_visit"
                                      ? "je Einsatz"
                                      : billingType === "per_hour"
                                        ? "je Stunde"
                                        : billingType === "per_sqm"
                                          ? "je m²"
                                          : billingType === "custom_flat"
                                            ? "pauschal"
                                            : "einmalig";
                                  return (
                                    <div key={itemLink.id} className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-green-200 bg-white/75 px-3 py-2 text-sm">
                                      <dt className="font-bold text-green-950">{item?.title || "Vereinbarte Leistung"}</dt>
                                      <dd className="text-right font-extrabold text-green-950">
                                        {bucketRows.length ? (
                                          <span className="grid gap-2">
                                            {bucketRows.map((bucket) => (
                                              <span key={bucket.key} className="block">
                                                <span>{formatCents(bucket.netCents)} <span className="font-semibold text-green-800">{bucket.label}{bucket.suffix ? ` ${bucket.suffix}` : ""}</span></span>
                                                {bucket.discountCents > 0 ? <span className="block text-xs font-semibold text-green-800">vor Rabatt {formatCents(bucket.subtotalCents)} · Nachlass {formatCents(bucket.discountCents)}</span> : null}
                                              </span>
                                            ))}
                                          </span>
                                        ) : (
                                          <>
                                            {formatCents(netCents)} <span className="font-semibold text-green-800">{billingLabel}</span>
                                            {discountCents > 0 ? <span className="block text-xs font-semibold text-green-800">vor Rabatt {formatCents(subtotalCents)} · Nachlass {formatCents(discountCents)}</span> : null}
                                          </>
                                        )}
                                      </dd>
                                    </div>
                                  );
                                })}
                              </dl>
                            ) : null}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Link href={`/admin/offers/${link.offer_id}`} className={buttonClass}>Angebot öffnen</Link>
                            <Link href={`/api/documents/offers/${link.offer_version_id}`} className="inline-flex min-h-11 items-center justify-center rounded-md border border-green-300 bg-white px-4 py-2 text-sm font-extrabold text-green-900">Original-PDF</Link>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <EmptyState title="Noch kein Angebot verknüpft" text="Ein angenommenes Angebot dieses Kunden kann hier als unveränderliche Vertragsgrundlage übernommen werden." />
              )}

              {(acceptedOffers ?? []).filter((offer) => !offer.offer_property_links?.length).length ? (
                <div className="mt-4 grid gap-3">
                  <p className="text-sm font-extrabold text-slate-900">Unverknüpfte angenommene Angebote</p>
                  {(acceptedOffers ?? [])
                    .filter((offer) => !offer.offer_property_links?.length)
                    .map((offer) => (
                      <form key={offer.id} action={linkOfferToPropertyAction} className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between">
                        <input type="hidden" name="offerId" value={offer.offer_id} />
                        <input type="hidden" name="versionId" value={offer.id} />
                        <input type="hidden" name="propertyId" value={id} />
                        <input type="hidden" name="assignments" value="[]" />
                        <div>
                          <p className="font-bold text-slate-950">{offer.offer_number} · {offer.title}</p>
                          <p className="text-xs text-slate-600">Alle Positionen gelten zunächst für die gesamte Immobilie; Gebäude können in der Angebotsdetailseite einzeln zugeordnet werden.</p>
                        </div>
                        <button className={buttonClass}>Angebot vollständig übernehmen</button>
                      </form>
                    ))}
                </div>
              ) : null}
            </Panel>
          </div>
          <div className="mt-5">
            <Panel title="Monatliche Einsatzzeitauswertung">
              <form className="mb-4 flex max-w-sm items-end gap-3">
                <Field label="Auswertungsmonat">
                  <input
                    name="metricsMonth"
                    type="month"
                    defaultValue={selectedMetricsMonth}
                    className={inputClass}
                  />
                </Field>
                <button className={buttonClass}>Anzeigen</button>
              </form>
              <div className="mb-4 grid gap-3 sm:grid-cols-3">
                <MetricCard label="Abgeschlossene Einsätze" value={monthlyMetrics.length} />
                <MetricCard label="Erfasste Zeit" value={`${monthlyDurationMinutes} Min.`} />
                <MetricCard
                  label="Überschreitung gesamt"
                  value={`${monthlyOvertimeMinutes} Min.`}
                />
              </div>
              {monthlyMetrics.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead className="text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="p-2">Datum</th>
                        <th className="p-2">Ist-Dauer</th>
                        <th className="p-2">Interne Grenze</th>
                        <th className="p-2">Differenz</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthlyMetrics.map(({ visit, metric }) => (
                        <tr key={visit.id} className="border-t border-slate-200">
                          <td className="p-2 font-semibold">
                            {formatGermanDate(`${visit.scheduled_date}T12:00:00Z`)}
                          </td>
                          <td className="p-2">{visit.duration_minutes ?? 0} Min.</td>
                          <td className="p-2">
                            {metric?.max_visit_minutes
                              ? `${metric.max_visit_minutes} Min.`
                              : "–"}
                          </td>
                          <td
                            className={`p-2 font-extrabold ${Number(metric?.overtime_minutes ?? 0) > 0 ? "text-red-700" : "text-emerald-700"}`}
                          >
                            {Number(metric?.overtime_minutes ?? 0) > 0
                              ? `+${metric?.overtime_minutes} Min.`
                              : "Im Rahmen"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState
                  title="Keine abgeschlossenen Einsätze"
                  text="Für den gewählten Monat liegen keine Einsatzzeiten vor."
                />
              )}
            </Panel>
          </div>
          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <Panel title="Objektdaten">
              <dl className="grid gap-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="font-bold text-slate-500">Kunde</dt>
                  <dd className="mt-1 font-semibold text-slate-950">
                    {customerLabel(customer)}
                  </dd>
                </div>
                <div>
                  <dt className="font-bold text-slate-500">Status</dt>
                  <dd className="mt-1">
                    <StatusPill>
                      {propertyStatusLabels[property.status] ?? property.status}
                    </StatusPill>
                  </dd>
                </div>
                <div>
                  <dt className="font-bold text-slate-500">Betreuungsbeginn</dt>
                  <dd className="mt-1 font-semibold text-slate-950">
                    {formatGermanDate(property.care_start_date)}
                  </dd>
                </div>
                <div>
                  <dt className="font-bold text-slate-500">WEG / Eigentümer</dt>
                  <dd className="mt-1 font-semibold text-slate-950">
                    {property.ownership_name || "–"}
                  </dd>
                </div>
                <div>
                  <dt className="font-bold text-slate-500">
                    Monatliche Grundvergütung netto
                  </dt>
                  <dd className="mt-1 font-extrabold text-slate-950">
                    {formatCents(monthlyFeeNetCents)}
                  </dd>
                </div>
                <div>
                  <dt className="font-bold text-slate-500">
                    Maximale Einsatzdauer
                  </dt>
                  <dd className="mt-1 font-extrabold text-slate-950">
                    {maxVisitMinutes} Minuten
                  </dd>
                </div>
              </dl>
              {property.status !== "archived" ? (
                <details className="mt-5 border-t border-slate-200 pt-4">
                  <summary className="cursor-pointer text-sm font-extrabold text-brand">
                    Immobilien-Stammdaten bearbeiten
                  </summary>
                  <form
                    action={updatePropertyCoreAction}
                    className="mt-4 grid gap-3 sm:grid-cols-2"
                  >
                    <input type="hidden" name="propertyId" value={id} />
                    <input
                      type="hidden"
                      name="updatedAt"
                      value={property.updated_at}
                    />
                    <Field label="Immobilienname">
                      <input
                        name="name"
                        required
                        maxLength={180}
                        defaultValue={property.name}
                        className={inputClass}
                      />
                    </Field>
                    <Field label="Interner Objektschlüssel">
                      <input
                        name="objectKey"
                        maxLength={80}
                        defaultValue={property.object_key || ""}
                        className={inputClass}
                      />
                    </Field>
                    <Field label="Objektart">
                      <select
                        name="propertyType"
                        required
                        defaultValue={property.property_type}
                        className={inputClass}
                      >
                        {Object.entries(PROPERTY_TYPE_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="WEG-/Eigentümerbezeichnung">
                      <input
                        name="ownershipName"
                        maxLength={180}
                        defaultValue={property.ownership_name || ""}
                        className={inputClass}
                      />
                    </Field>
                    <Field label="Betreuungsbeginn">
                      <input
                        name="careStartDate"
                        type="date"
                        required
                        defaultValue={property.care_start_date}
                        className={inputClass}
                      />
                    </Field>
                    <p className="self-end text-xs leading-5 text-slate-500">
                      Der zugeordnete Kunde bleibt unverändert, damit historische Verträge und
                      Rechnungen eindeutig bleiben.
                    </p>
                    <button className={`${buttonClass} sm:col-span-2`}>
                      Stammdaten speichern
                    </button>
                  </form>
                </details>
              ) : null}
              {property.status === "archived" ? (
                <p className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-700">
                  Diese Immobilie ist revisionssicher archiviert. Historische Einsätze,
                  Berichte und Rechnungen bleiben erhalten.
                </p>
              ) : (
                <form
                  action={updatePropertyStatusAction}
                  className="mt-5 grid gap-3 border-t border-slate-200 pt-4 sm:grid-cols-[1fr_auto] sm:items-end"
                >
                  <input type="hidden" name="propertyId" value={id} />
                  <Field label="Immobilienstatus">
                    <select
                      name="status"
                      defaultValue={property.status}
                      className={inputClass}
                    >
                      {Object.entries(propertyStatusLabels)
                        .filter(([status]) => status !== "archived")
                        .map(([status, label]) => (
                          <option key={status} value={status}>
                            {label}
                          </option>
                        ))}
                      <option value="archived">Archivieren (dauerhaft)</option>
                    </select>
                  </Field>
                  <button className={buttonClass}>Status speichern</button>
                </form>
              )}
            </Panel>
            <Panel title="Internes Briefing">
              <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">
                {briefing?.internal_briefing ||
                  "Noch kein internes Briefing hinterlegt."}
              </p>
            </Panel>
          </div>
          <div className="mt-5">
            <Panel title="Interne Vertrags- und Einsatzvorgaben bearbeiten">
              <form
                action={updatePropertyAdminSettingsAction}
                className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"
              >
                <input type="hidden" name="propertyId" value={id} />
                <Field label="Monatliche Grundvergütung netto">
                  <input
                    name="monthlyFee"
                    required
                    inputMode="decimal"
                    defaultValue={(monthlyFeeNetCents / 100)
                      .toFixed(2)
                      .replace(".", ",")}
                    className={inputClass}
                  />
                </Field>
                <Field label="Umsatzsteuersatz in %">
                  <input
                    name="taxRate"
                    required
                    inputMode="decimal"
                    defaultValue={Number(adminSettings?.tax_rate_bps ?? 1900) / 100}
                    className={inputClass}
                  />
                </Field>
                <Field label="Gültig ab">
                  <input
                    name="validFrom"
                    type="date"
                    required
                    defaultValue={
                      currentCompensationRate?.valid_from ||
                      property.care_start_date ||
                      berlinIsoDate()
                    }
                    className={inputClass}
                  />
                </Field>
                <Field label="Gültig bis (optional)">
                  <input
                    name="validUntil"
                    type="date"
                    defaultValue={currentCompensationRate?.valid_until || ""}
                    className={inputClass}
                  />
                </Field>
                <Field label="Maximale Einsatzdauer in Minuten">
                  <input
                    name="maxVisitMinutes"
                    type="number"
                    min="1"
                    max="1440"
                    required
                    defaultValue={maxVisitMinutes}
                    className={inputClass}
                  />
                </Field>
                <label className="block md:col-span-2">
                  <span className="text-sm font-bold text-slate-800">
                    Interne Abrechnungsnotiz
                  </span>
                  <textarea
                    name="internalNotes"
                    rows={4}
                    defaultValue={adminSettings?.internal_notes || ""}
                    className={inputClass}
                  />
                </label>
                <label className="block md:col-span-2">
                  <span className="text-sm font-bold text-slate-800">
                    Internes Objektbriefing
                  </span>
                  <textarea
                    name="internalBriefing"
                    rows={4}
                    defaultValue={briefing?.internal_briefing || ""}
                    className={inputClass}
                  />
                </label>
                <button className={`${buttonClass} md:col-span-2 xl:col-span-4`}>
                  Interne Angaben speichern
                </button>
              </form>
              {compensationRates?.length ? (
                <div className="mt-5 overflow-x-auto">
                  <table className="w-full min-w-[560px] text-left text-sm">
                    <thead className="text-slate-500">
                      <tr>
                        <th className="pb-2">Gültigkeit</th>
                        <th className="pb-2">Netto</th>
                        <th className="pb-2">USt.</th>
                        <th className="pb-2">Interne Notiz</th>
                      </tr>
                    </thead>
                    <tbody>
                      {compensationRates.map((rate) => (
                        <tr key={rate.id} className="border-t border-slate-200">
                          <td className="py-2">
                            {formatGermanDate(`${rate.valid_from}T12:00:00Z`)} bis{" "}
                            {rate.valid_until
                              ? formatGermanDate(`${rate.valid_until}T12:00:00Z`)
                              : "offen"}
                          </td>
                          <td className="py-2 font-semibold">
                            {formatCents(Number(rate.net_amount_cents))}
                          </td>
                          <td className="py-2">
                            {(Number(rate.tax_rate_bps) / 100).toLocaleString("de-DE")} %
                          </td>
                          <td className="py-2">{rate.internal_note || "–"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </Panel>
          </div>
        </section>
        ) : null}

        {activeView === "gebaeude" ? (
        <section id="gebaeude" className="scroll-mt-24">
          <Panel title="Gebäude und öffentliche QR-Codes">
            {(buildings ?? []).length ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {(buildings ?? []).map((building) => (
                  <article
                    key={building.id}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                  >
                    <div className="flex flex-col gap-4 sm:flex-row">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="font-extrabold text-slate-950">
                            {building.label || "Gebäude"}
                          </h3>
                          <StatusPill>
                            {building.status === "active" ? "Aktiv" : "Archiviert"}
                          </StatusPill>
                        </div>
                        <p className="mt-1 text-sm text-slate-650">
                          {building.formatted_address}
                        </p>
                        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                          {accessNotesByBuildingId.get(building.id) ||
                            "Keine internen Zugangshinweise."}
                        </p>
                        {building.status === "active" && !propertyReadOnly ? (
                          <details className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
                            <summary className="cursor-pointer text-sm font-extrabold text-brand">
                              Gebäudedaten bearbeiten
                            </summary>
                            <form
                              action={updateBuildingDetailsAction}
                              className="mt-4 grid gap-3 sm:grid-cols-2"
                            >
                              <input type="hidden" name="propertyId" value={id} />
                              <input type="hidden" name="buildingId" value={building.id} />
                              <input
                                type="hidden"
                                name="updatedAt"
                                value={building.updated_at}
                              />
                              <Field label="Gebäudebezeichnung">
                                <input
                                  name="label"
                                  maxLength={120}
                                  defaultValue={building.label || ""}
                                  className={inputClass}
                                />
                              </Field>
                              <Field label="Straße">
                                <input
                                  name="street"
                                  required
                                  maxLength={160}
                                  defaultValue={building.street}
                                  className={inputClass}
                                />
                              </Field>
                              <Field label="Hausnummer">
                                <input
                                  name="houseNumber"
                                  required
                                  maxLength={30}
                                  defaultValue={building.house_number}
                                  className={inputClass}
                                />
                              </Field>
                              <Field label="Postleitzahl">
                                <input
                                  name="postalCode"
                                  required
                                  inputMode="numeric"
                                  pattern="[0-9]{5}"
                                  defaultValue={building.postal_code}
                                  className={inputClass}
                                />
                              </Field>
                              <Field label="Ort">
                                <input
                                  name="city"
                                  required
                                  maxLength={120}
                                  defaultValue={building.city}
                                  className={inputClass}
                                />
                              </Field>
                              <Field label="Land">
                                <input
                                  name="country"
                                  required
                                  maxLength={80}
                                  defaultValue={building.country}
                                  className={inputClass}
                                />
                              </Field>
                              <label className="block sm:col-span-2">
                                <span className="text-sm font-bold text-slate-800">
                                  Interne Zugangs- oder Objekthinweise
                                </span>
                                <textarea
                                  name="accessNotes"
                                  rows={3}
                                  maxLength={4_000}
                                  defaultValue={
                                    accessNotesByBuildingId.get(building.id) || ""
                                  }
                                  className={inputClass}
                                />
                              </label>
                              <button className={`${buttonClass} sm:col-span-2`}>
                                Gebäudedaten speichern
                              </button>
                            </form>
                          </details>
                        ) : null}
                        {!propertyReadOnly ? (
                        <div className="mt-4 flex flex-wrap gap-2">
                          {building.status === "active" && property.status === "active" ? (
                            <>
                              <a
                                href={`/api/buildings/${building.id}/qr?download=1`}
                                className={buttonClass}
                              >
                                PNG herunterladen
                              </a>
                              <Link
                                href={`/admin/buildings/${building.id}/qr`}
                                className="inline-flex min-h-11 items-center justify-center rounded-md border border-brand/20 bg-white px-4 py-2 text-sm font-extrabold text-brand hover:bg-brand-soft"
                              >
                                Druckansicht
                              </Link>
                              <form action={rotateBuildingQrTokenAction}>
                                <input
                                  type="hidden"
                                  name="buildingId"
                                  value={building.id}
                                />
                                <input type="hidden" name="propertyId" value={id} />
                                <button className="inline-flex min-h-11 items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-extrabold text-slate-800 hover:border-brand hover:text-brand">
                                  Token widerrufen und erneuern
                                </button>
                              </form>
                            </>
                          ) : null}
                          {building.status === "active" && property.status !== "active" ? (
                            <p className="flex min-h-11 items-center rounded-xl border border-amber-200 bg-amber-50 px-3 text-xs font-bold leading-5 text-amber-900">
                              QR-Code erst verfügbar, wenn die Immobilie aktiv ist.
                            </p>
                          ) : null}
                          <form action={updateBuildingStatusAction}>
                            <input type="hidden" name="propertyId" value={id} />
                            <input type="hidden" name="buildingId" value={building.id} />
                            <input
                              type="hidden"
                              name="expectedStatus"
                              value={building.status}
                            />
                            <input
                              type="hidden"
                              name="status"
                              value={building.status === "active" ? "archived" : "active"}
                            />
                            <button className="inline-flex min-h-11 items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-extrabold text-slate-800 hover:border-brand hover:text-brand">
                              {building.status === "active" ? "Gebäude archivieren" : "Gebäude reaktivieren"}
                            </button>
                          </form>
                        </div>
                        ) : null}
                      </div>
                      {building.status === "active" && property.status === "active" ? (
                        <Image
                          src={`/api/buildings/${building.id}/qr`}
                          alt={`QR-Code für ${building.label || building.formatted_address}`}
                          width={144}
                          height={144}
                          unoptimized
                          className="h-36 w-36 self-center rounded-lg border border-slate-200 bg-white p-2"
                        />
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState
                title="Keine Gebäude"
                text="Fügen Sie das erste Gebäude hinzu."
              />
            )}

            {!propertyReadOnly ? (
            <details className="mt-5 rounded-xl border border-slate-200 bg-white p-4">
              <summary className="cursor-pointer font-extrabold text-brand">
                Weiteres Gebäude hinzufügen
              </summary>
              <form
                action={addBuildingAction}
                className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
              >
                <input type="hidden" name="propertyId" value={id} />
                <Field label="Gebäudebezeichnung">
                  <input
                    name="label"
                    placeholder="z. B. Haus B"
                    className={inputClass}
                  />
                </Field>
                {(acceptedOffers ?? []).some((offer) => !offer.offer_property_links?.length) ? (
                  <Field label="Angenommenes Angebot verknüpfen">
                    <select name="acceptedOfferVersionId" defaultValue="" className={inputClass}>
                      <option value="">Optional: Angebot auswählen</option>
                      {(acceptedOffers ?? [])
                        .filter((offer) => !offer.offer_property_links?.length)
                        .map((offer) => (
                          <option key={offer.id} value={offer.id}>{offer.offer_number} · {offer.title}</option>
                        ))}
                    </select>
                    <p className="mt-2 text-xs leading-5 text-slate-500">Bei Auswahl werden Gebäude, Angebot und sämtliche vereinbarten Leistungen atomar angelegt und diesem Gebäude zugeordnet.</p>
                  </Field>
                ) : null}
                <Field label="Straße">
                  <input name="street" required className={inputClass} />
                </Field>
                <Field label="Hausnummer">
                  <input name="houseNumber" required className={inputClass} />
                </Field>
                <Field label="Postleitzahl">
                  <input
                    name="postalCode"
                    required
                    inputMode="numeric"
                    pattern="[0-9]{5}"
                    className={inputClass}
                  />
                </Field>
                <Field label="Ort">
                  <input name="city" required className={inputClass} />
                </Field>
                <Field label="Land">
                  <input
                    name="country"
                    required
                    defaultValue="Deutschland"
                    className={inputClass}
                  />
                </Field>
                <label className="block sm:col-span-2 lg:col-span-3">
                  <span className="text-sm font-bold text-slate-800">
                    Interne Zugangs- oder Objekthinweise
                  </span>
                  <textarea
                    name="accessNotes"
                    rows={3}
                    className={inputClass}
                  />
                </label>
                <button
                  className={`${buttonClass} sm:col-span-2 lg:col-span-3`}
                >
                  Gebäude hinzufügen
                </button>
              </form>
            </details>
            ) : (
              <p className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                Gebäude und QR-Codes bleiben im Archiv sichtbar, können aber nicht mehr verändert werden.
              </p>
            )}

          </Panel>
        </section>
        ) : null}

        {activeView === "leistungen" ? (
        <section id="leistungen" className="scroll-mt-24">
          <Panel title="Leistungen">
            {propertyReadOnly ? (
              <p className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                Die Leistungskonfiguration ist für diese archivierte Immobilie schreibgeschützt.
              </p>
            ) : null}
            <fieldset
              disabled={propertyReadOnly}
              aria-label="Leistungskonfiguration"
              className="contents disabled:cursor-not-allowed"
            >
            <div className="grid gap-3 lg:grid-cols-2">
              {(services ?? []).map((service) => {
                const linkedBuildingIds = (serviceBuildings ?? [])
                  .filter((link) => link.property_service_id === service.id)
                  .map((link) => link.building_id);
                const checklist = serviceChecklistItems.filter(
                  (item) => item.property_service_id === service.id,
                );
                const assignedServiceEquipment = serviceEquipment.filter(
                  (item) => item.property_service_id === service.id,
                );
                const nextChecklistSortOrder =
                  checklist.reduce(
                    (highest, item) => Math.max(highest, Number(item.sort_order)),
                    0,
                  ) + 10;
                return (
                  <article
                    key={service.id}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-extrabold text-slate-950">
                          {service.name}
                        </h3>
                        <p className="mt-1 text-sm text-slate-650">
                          {EXECUTION_RULE_LABELS[
                            service.execution_rule as keyof typeof EXECUTION_RULE_LABELS
                          ] ?? service.execution_rule}
                          {service.seasonal
                            ? ` · ${months[service.season_start_month - 1]} bis ${months[service.season_end_month - 1]}`
                            : " · dauerhaft"}
                        </p>
                      </div>
                      <StatusPill>
                        {service.status === "active" ? "Aktiv" : "Inaktiv"}
                      </StatusPill>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-700">
                      {service.customer_description ||
                        "Keine Kundenbeschreibung."}
                    </p>
                    <p className="mt-2 text-xs font-bold text-slate-500">
                      Gebäude:{" "}
                      {linkedBuildingIds.length
                        ? linkedBuildingIds
                            .map(
                              (buildingId) =>
                                buildingById.get(buildingId)?.label ||
                                buildingById.get(buildingId)?.formatted_address,
                            )
                            .filter(Boolean)
                            .join(", ")
                        : "gesamte Immobilie"}
                    </p>
                    <form
                      action={updatePropertyServiceSortOrderAction}
                      className="mt-3 flex items-end gap-2"
                    >
                      <input type="hidden" name="propertyId" value={id} />
                      <input type="hidden" name="serviceId" value={service.id} />
                      <input type="hidden" name="updatedAt" value={service.updated_at} />
                      <label className="max-w-32 text-xs font-bold text-slate-600">
                        Sortierung
                        <input
                          name="sortOrder"
                          type="number"
                          min="0"
                          max="100000"
                          required
                          defaultValue={service.sort_order}
                          className={inputClass}
                        />
                      </label>
                      <button className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-xs font-extrabold text-brand">
                        Speichern
                      </button>
                    </form>
                    <form action={togglePropertyServiceAction} className="mt-3">
                      <input type="hidden" name="propertyId" value={id} />
                      <input
                        type="hidden"
                        name="serviceId"
                        value={service.id}
                      />
                      <input
                        type="hidden"
                        name="status"
                        value={service.status}
                      />
                      <button className="text-sm font-extrabold text-brand underline">
                        {service.status === "active"
                          ? "Leistung deaktivieren"
                          : "Leistung aktivieren"}
                      </button>
                    </form>
                    <details className="mt-4 border-t border-slate-200 pt-3">
                      <summary className="cursor-pointer text-sm font-extrabold text-brand">
                        Leistungsdaten bearbeiten
                      </summary>
                      <form
                        action={updatePropertyServiceAction}
                        className="mt-4 grid gap-3 sm:grid-cols-2"
                      >
                        <input type="hidden" name="propertyId" value={id} />
                        <input type="hidden" name="serviceId" value={service.id} />
                        <input
                          type="hidden"
                          name="updatedAt"
                          value={service.updated_at}
                        />
                        <input
                          type="hidden"
                          name="instructionUpdatedAt"
                          value={serviceInstructionVersionById.get(service.id) || ""}
                        />
                        <Field label="Leistungsname">
                          <input
                            name="name"
                            required
                            maxLength={180}
                            defaultValue={service.name}
                            className={inputClass}
                          />
                        </Field>
                        <Field label="Kategorie">
                          <input
                            name="category"
                            required
                            maxLength={120}
                            defaultValue={service.category}
                            className={inputClass}
                          />
                        </Field>
                        <Field label="Ausführungsregel">
                          <select
                            name="executionRule"
                            required
                            defaultValue={service.execution_rule}
                            className={inputClass}
                          >
                            {Object.entries(EXECUTION_RULE_LABELS).map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Ausführungen je Zeitraum">
                          <input
                            name="occurrencesPerPeriod"
                            type="number"
                            min="1"
                            max="31"
                            required
                            defaultValue={service.occurrences_per_period}
                            className={inputClass}
                          />
                        </Field>
                        <Field label="Startdatum">
                          <input
                            name="startDate"
                            type="date"
                            required
                            defaultValue={service.start_date}
                            className={inputClass}
                          />
                        </Field>
                        <Field label="Enddatum optional">
                          <input
                            name="endDate"
                            type="date"
                            defaultValue={service.end_date || ""}
                            className={inputClass}
                          />
                        </Field>
                        <Field label="Geschätzte Dauer in Minuten">
                          <input
                            name="estimatedMinutes"
                            type="number"
                            min="1"
                            max="1440"
                            defaultValue={service.estimated_minutes || ""}
                            className={inputClass}
                          />
                        </Field>
                        <Field label="Sortierposition">
                          <input
                            name="sortOrder"
                            type="number"
                            min="0"
                            max="100000"
                            required
                            defaultValue={service.sort_order}
                            className={inputClass}
                          />
                        </Field>
                        <Field label="Saison von">
                          <select
                            name="seasonStartMonth"
                            defaultValue={service.season_start_month || ""}
                            className={inputClass}
                          >
                            <option value="">Monat wählen</option>
                            {months.map((month, index) => (
                              <option key={month} value={index + 1}>
                                {month}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Saison bis">
                          <select
                            name="seasonEndMonth"
                            defaultValue={service.season_end_month || ""}
                            className={inputClass}
                          >
                            <option value="">Monat wählen</option>
                            {months.map((month, index) => (
                              <option key={month} value={index + 1}>
                                {month}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <label className="block sm:col-span-2">
                          <span className="text-sm font-bold text-slate-800">
                            Kundenfreundliche Beschreibung
                          </span>
                          <textarea
                            name="customerDescription"
                            rows={3}
                            maxLength={4_000}
                            defaultValue={service.customer_description || ""}
                            className={inputClass}
                          />
                        </label>
                        <label className="block sm:col-span-2">
                          <span className="text-sm font-bold text-slate-800">
                            Interne Arbeitsanweisung
                          </span>
                          <textarea
                            name="internalInstruction"
                            rows={3}
                            maxLength={8_000}
                            defaultValue={serviceInstructionById.get(service.id) || ""}
                            className={inputClass}
                          />
                        </label>
                        <fieldset className="rounded-lg border border-slate-200 p-3 sm:col-span-2">
                          <legend className="px-1 text-sm font-bold text-slate-800">
                            Gebäudebezug
                          </legend>
                          <div className="grid gap-2 sm:grid-cols-2">
                            {activeBuildings.map((building) => (
                              <label
                                key={building.id}
                                className="flex items-center gap-2 text-sm font-semibold text-slate-700"
                              >
                                <input
                                  type="checkbox"
                                  name="buildingId"
                                  value={building.id}
                                  defaultChecked={linkedBuildingIds.includes(building.id)}
                                />
                                {building.label || building.formatted_address}
                              </label>
                            ))}
                          </div>
                          <p className="mt-2 text-xs text-slate-500">
                            Ohne Auswahl gilt die Leistung für die gesamte Immobilie.
                          </p>
                        </fieldset>
                        <fieldset className="rounded-lg border border-slate-200 p-3 sm:col-span-2">
                          <legend className="px-1 text-sm font-bold text-slate-800">
                            Optionen
                          </legend>
                          <div className="grid gap-2 sm:grid-cols-3">
                            <label className="flex items-center gap-2 text-sm font-semibold">
                              <input
                                type="checkbox"
                                name="seasonal"
                                defaultChecked={service.seasonal}
                              />
                              saisonal
                            </label>
                            <label className="flex items-center gap-2 text-sm font-semibold">
                              <input
                                type="checkbox"
                                name="customerVisible"
                                defaultChecked={service.customer_visible}
                              />
                              für Kunden sichtbar
                            </label>
                            <label className="flex items-center gap-2 text-sm font-semibold">
                              <input
                                type="checkbox"
                                name="photoRequired"
                                defaultChecked={service.photo_required}
                              />
                              Foto erforderlich
                            </label>
                          </div>
                        </fieldset>
                        <button className={`${buttonClass} sm:col-span-2`}>
                          Leistung aktualisieren
                        </button>
                      </form>
                    </details>
                    <details className="mt-4 border-t border-slate-200 pt-3">
                      <summary className="cursor-pointer text-sm font-extrabold text-slate-800">
                        Checkliste &amp; Equipment verwalten
                      </summary>
                      <div className="mt-4 grid gap-5">
                        <div>
                          <h4 className="text-sm font-extrabold text-slate-900">
                            Checklistenpunkte
                          </h4>
                          {checklist.length ? (
                            <ul className="mt-2 grid gap-2">
                              {checklist.map((item) => (
                                <li
                                  key={item.id}
                                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-2 text-sm"
                                >
                                  <span>
                                    {item.label}
                                    {item.required ? " · Pflicht" : " · optional"}
                                  </span>
                                  <form action={removeServiceChecklistItemAction}>
                                    <input type="hidden" name="propertyId" value={id} />
                                    <input type="hidden" name="serviceId" value={service.id} />
                                    <input type="hidden" name="itemId" value={item.id} />
                                    <button className="font-extrabold text-red-700 underline">
                                      Entfernen
                                    </button>
                                  </form>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="mt-2 text-sm text-slate-600">
                              Noch keine Checklistenpunkte hinterlegt.
                            </p>
                          )}
                          <form
                            action={addServiceChecklistItemAction}
                            className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]"
                          >
                            <input type="hidden" name="propertyId" value={id} />
                            <input type="hidden" name="serviceId" value={service.id} />
                            <input
                              type="hidden"
                              name="sortOrder"
                              value={nextChecklistSortOrder}
                            />
                            <input
                              name="label"
                              required
                              maxLength={300}
                              placeholder="Neuer Checklistenpunkt"
                              className={inputClass}
                            />
                            <button className={buttonClass}>Hinzufügen</button>
                            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 sm:col-span-2">
                              <input type="checkbox" name="required" defaultChecked />
                              Pflichtpunkt
                            </label>
                          </form>
                        </div>

                        <div>
                          <h4 className="text-sm font-extrabold text-slate-900">
                            Benötigtes Equipment
                          </h4>
                          {assignedServiceEquipment.length ? (
                            <ul className="mt-2 grid gap-2">
                              {assignedServiceEquipment.map((assignment) => {
                                const assignedEquipment = relation(assignment.equipment);
                                return (
                                  <li
                                    key={assignment.equipment_id}
                                    className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-2 text-sm"
                                  >
                                    <span>
                                      {assignedEquipment?.name || "Nicht verfügbares Equipment"} ·{" "}
                                      {Number(assignment.required_quantity).toLocaleString("de-DE")}{" "}
                                      {assignedEquipment?.unit || "Stück"}
                                    </span>
                                    <form action={removeServiceEquipmentAction}>
                                      <input type="hidden" name="propertyId" value={id} />
                                      <input type="hidden" name="serviceId" value={service.id} />
                                      <input
                                        type="hidden"
                                        name="equipmentId"
                                        value={assignment.equipment_id}
                                      />
                                      <button className="font-extrabold text-red-700 underline">
                                        Entfernen
                                      </button>
                                    </form>
                                  </li>
                                );
                              })}
                            </ul>
                          ) : (
                            <p className="mt-2 text-sm text-slate-600">
                              Für diese Leistung ist noch kein Equipment hinterlegt.
                            </p>
                          )}
                          <form
                            action={assignServiceEquipmentAction}
                            className="mt-3 grid gap-2 sm:grid-cols-[1fr_7rem_auto]"
                          >
                            <input type="hidden" name="propertyId" value={id} />
                            <input type="hidden" name="serviceId" value={service.id} />
                            <select name="equipmentId" required defaultValue="" className={inputClass}>
                              <option value="">Equipment wählen</option>
                              {(equipment ?? []).map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.name}
                                </option>
                              ))}
                            </select>
                            <input
                              name="requiredQuantity"
                              type="number"
                              min="0.001"
                              step="0.001"
                              required
                              defaultValue="1"
                              aria-label="Benötigte Menge"
                              className={inputClass}
                            />
                            <button className={buttonClass}>Zuordnen</button>
                          </form>
                        </div>
                      </div>
                    </details>
                  </article>
                );
              })}
            </div>
            {!(services ?? []).length ? (
              <EmptyState
                title="Keine Leistungen"
                text="Weisen Sie eine Vorlage oder individuelle Leistung zu."
              />
            ) : null}

            <details className="mt-5 rounded-xl border border-slate-200 bg-white p-4">
              <summary className="cursor-pointer font-extrabold text-brand">
                Leistung zuweisen
              </summary>
              <form
                action={createPropertyServiceAction}
                className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4"
              >
                <input type="hidden" name="propertyId" value={id} />
                <Field label="Katalogvorlage optional">
                  <ServiceCatalogSelect options={serviceCatalog ?? []} />
                </Field>
                <Field label="Leistungsname">
                  <input name="name" required className={inputClass} />
                </Field>
                <Field label="Kategorie">
                  <input
                    name="category"
                    required
                    defaultValue="Objektbetreuung"
                    className={inputClass}
                  />
                </Field>
                <Field label="Ausführungsregel">
                  <select
                    name="executionRule"
                    required
                    defaultValue="every_visit"
                    className={inputClass}
                  >
                    {Object.entries(EXECUTION_RULE_LABELS).map(
                      ([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ),
                    )}
                  </select>
                </Field>
                <Field label="Ausführungen je Zeitraum">
                  <input
                    name="occurrencesPerPeriod"
                    type="number"
                    min="1"
                    max="31"
                    defaultValue="1"
                    required
                    className={inputClass}
                  />
                </Field>
                <Field label="Startdatum">
                  <input
                    name="startDate"
                    type="date"
                    required
                    defaultValue={property.care_start_date || berlinIsoDate()}
                    className={inputClass}
                  />
                </Field>
                <Field label="Enddatum optional">
                  <input name="endDate" type="date" className={inputClass} />
                </Field>
                <Field label="Geschätzte Dauer in Minuten">
                  <input
                    name="estimatedMinutes"
                    type="number"
                    min="1"
                    max="1440"
                    className={inputClass}
                  />
                </Field>
                <Field label="Sortierposition">
                  <input
                    name="sortOrder"
                    type="number"
                    min="0"
                    max="100000"
                    defaultValue="0"
                    required
                    className={inputClass}
                  />
                </Field>
                <Field label="Saison von">
                  <select
                    name="seasonStartMonth"
                    defaultValue=""
                    className={inputClass}
                  >
                    <option value="">Monat wählen</option>
                    {months.map((month, index) => (
                      <option key={month} value={index + 1}>
                        {month}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Saison bis">
                  <select
                    name="seasonEndMonth"
                    defaultValue=""
                    className={inputClass}
                  >
                    <option value="">Monat wählen</option>
                    {months.map((month, index) => (
                      <option key={month} value={index + 1}>
                        {month}
                      </option>
                    ))}
                  </select>
                </Field>
                <label className="block md:col-span-2">
                  <span className="text-sm font-bold text-slate-800">
                    Kundenfreundliche Beschreibung
                  </span>
                  <textarea
                    name="customerDescription"
                    rows={3}
                    className={inputClass}
                  />
                </label>
                <label className="block md:col-span-2">
                  <span className="text-sm font-bold text-slate-800">
                    Interne Arbeitsanweisung
                  </span>
                  <textarea
                    name="internalInstruction"
                    rows={3}
                    className={inputClass}
                  />
                </label>
                <fieldset className="rounded-lg border border-slate-200 p-3 md:col-span-2">
                  <legend className="px-1 text-sm font-bold text-slate-800">
                    Gebäudebezug
                  </legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {activeBuildings.map((building) => (
                      <label
                        key={building.id}
                        className="flex items-center gap-2 text-sm font-semibold text-slate-700"
                      >
                        <input
                          type="checkbox"
                          name="buildingId"
                          value={building.id}
                        />
                        {building.label || building.formatted_address}
                      </label>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    Ohne Auswahl gilt die Leistung für die gesamte Immobilie.
                  </p>
                </fieldset>
                <fieldset className="rounded-lg border border-slate-200 p-3 md:col-span-2">
                  <legend className="px-1 text-sm font-bold text-slate-800">
                    Optionen
                  </legend>
                  <div className="grid gap-2">
                    <label className="flex items-center gap-2 text-sm font-semibold">
                      <input type="checkbox" name="seasonal" /> saisonal
                    </label>
                    <label className="flex items-center gap-2 text-sm font-semibold">
                      <input
                        type="checkbox"
                        name="customerVisible"
                        defaultChecked
                      />{" "}
                      für Kunden sichtbar
                    </label>
                    <label className="flex items-center gap-2 text-sm font-semibold">
                      <input type="checkbox" name="photoRequired" /> Foto
                      erforderlich
                    </label>
                  </div>
                </fieldset>
                <button
                  className={`${buttonClass} md:col-span-2 xl:col-span-4`}
                >
                  Leistung speichern
                </button>
              </form>
            </details>
            </fieldset>
          </Panel>
        </section>
        ) : null}

        {activeView === "einsaetze" ? (
        <section id="einsaetze" className="scroll-mt-24">
          <Panel title="Besuchspläne und Einsätze">
            {propertyReadOnly ? (
              <p className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                Neue Pläne und Einsätze sind im Archiv gesperrt. Historische Einsätze und revisionspflichtige Zeitkorrekturen bleiben sichtbar.
              </p>
            ) : null}
            <VisitCalendar
              events={calendarEvents}
              view={calendarView}
              calendarDate={calendarDate}
              today={today}
              selectedVisitId={selectedVisit?.id ?? null}
              baseHref={`/admin/properties/${id}`}
            />
            {selectedVisitOverview ? (
              <SelectedVisitOverviewDialog
                visit={selectedVisitOverview}
                closeHref={popupCloseHref}
                detailsHref={`${popupCloseHref}#selected-visit-detail`}
              />
            ) : null}
            <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,0.72fr)]">
              <fieldset
                disabled={propertyReadOnly}
                aria-label="Besuchspläne verwalten"
                className="contents disabled:cursor-not-allowed"
              >
              <details className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 font-extrabold text-slate-950 marker:hidden [&::-webkit-details-marker]:hidden">
                  <span>Besuchspläne verwalten</span>
                  <StatusPill>{(visitPlans ?? []).length}</StatusPill>
                </summary>
                <div className="mt-4 grid gap-3 border-t border-slate-200 pt-4">
                  {(visitPlans ?? []).map((plan) => {
                    const planBuildingIds = new Set(
                      (plan.visit_plan_buildings ?? []).map(
                        (link: { building_id: string }) => link.building_id,
                      ),
                    );
                    const planEmployeeIds = new Set(
                      (plan.visit_plan_employees ?? []).map(
                        (link: { employee_id: string }) => link.employee_id,
                      ),
                    );
                    const planServiceIds = new Set<string>(
                      (plan.visit_plan_services ?? []).map(
                        (link: { property_service_id: string }) =>
                          link.property_service_id,
                      ),
                    );
                    const planServiceList = Array.from(planServiceIds)
                      .map((serviceId) => recurringServiceById.get(serviceId))
                      .filter(Boolean);
                    const planEstimatedMinutes = planServiceList.reduce(
                      (total, service) =>
                        total + Number(service?.estimated_minutes ?? 0),
                      0,
                    );
                    return (
                      <article
                        key={plan.id}
                        className="rounded-lg border border-slate-200 bg-slate-50 p-3"
                      >
                        <div className="flex justify-between gap-3">
                          <p className="font-extrabold text-slate-950">
                            {plan.label}
                          </p>
                          <StatusPill>
                            {visitPlanStatusLabels[plan.status] ?? plan.status}
                          </StatusPill>
                        </div>
                        <p className="mt-1 text-sm font-semibold leading-6 text-slate-650">
                          {getVisitScheduleSummary({
                            frequency: plan.frequency,
                            repeatEvery: plan.repeat_every ?? 1,
                            weekdays: plan.weekdays ?? [],
                            monthDays: plan.month_days ?? [],
                            startDate: plan.start_date,
                            endDate: plan.end_date,
                            desiredTime: plan.desired_time,
                            windowStart: plan.window_start,
                            windowEnd: plan.window_end,
                          })}
                        </p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">
                          {plan.max_visit_minutes} Minuten eingeplant
                          {planEstimatedMinutes
                            ? ` · Leistungsrichtwert ca. ${planEstimatedMinutes} Minuten`
                            : ""}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {planServiceList.map((service) => (
                            <span
                              key={service?.id}
                              className="rounded-full border border-[#08AEB4]/25 bg-[#E7F8F9] px-2.5 py-1 text-[0.68rem] font-extrabold text-[#056C71]"
                            >
                              {service?.name}
                            </span>
                          ))}
                          {!planServiceList.length ? (
                            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[0.68rem] font-extrabold text-amber-800">
                              Keine aktive Leistung zugeordnet
                            </span>
                          ) : null}
                          {plan.accepts_unplanned_tasks === false ? (
                            <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[0.68rem] font-extrabold text-slate-600">
                              Nur feste Planleistungen
                            </span>
                          ) : null}
                        </div>
                        <form
                          action={updateVisitPlanStatusAction}
                          className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]"
                        >
                          <input type="hidden" name="propertyId" value={id} />
                          <input
                            type="hidden"
                            name="visitPlanId"
                            value={plan.id}
                          />
                          <input
                            type="hidden"
                            name="expectedStatus"
                            value={plan.status}
                          />
                          <select
                            name="status"
                            defaultValue={plan.status}
                            aria-label={`Status für Besuchsplan ${plan.label}`}
                            className={inputClass}
                          >
                            {Object.entries(visitPlanStatusLabels).map(
                              ([value, label]) => (
                                <option key={value} value={value}>
                                  {label}
                                </option>
                              ),
                            )}
                          </select>
                          <button className={`${buttonClass} self-end`}>
                            Planstatus speichern
                          </button>
                        </form>
                        <details className="mt-3 border-t border-slate-200 pt-3">
                          <summary className="cursor-pointer text-sm font-extrabold text-brand">
                            Plan bearbeiten
                          </summary>
                          <form
                            action={updateVisitPlanAction}
                            className="mt-4 grid gap-4"
                          >
                            <input type="hidden" name="propertyId" value={id} />
                            <input type="hidden" name="visitPlanId" value={plan.id} />
                            <input type="hidden" name="updatedAt" value={plan.updated_at} />
                            <div className="grid gap-3 sm:grid-cols-2">
                              <Field label="Bezeichnung">
                                <input
                                  name="label"
                                  required
                                  defaultValue={plan.label}
                                  className={inputClass}
                                />
                              </Field>
                              <Field label="Primärer Mitarbeiter">
                                <select
                                  name="primaryEmployeeId"
                                  required
                                  defaultValue={plan.primary_employee_id ?? ""}
                                  className={inputClass}
                                >
                                  <option value="">Mitarbeiter auswählen</option>
                                  {schedulableEmployees.map((employee) => (
                                    <option key={employee.id} value={employee.id}>
                                      {employee.full_name}
                                    </option>
                                  ))}
                                </select>
                              </Field>
                            </div>

                            <VisitPlanServiceFields
                              services={visitPlanServiceOptions}
                              initialServiceIds={Array.from(planServiceIds).filter(
                                (serviceId) => recurringServiceById.has(serviceId),
                              )}
                              initialMaxVisitMinutes={plan.max_visit_minutes}
                              initialAcceptsUnplannedTasks={
                                plan.accepts_unplanned_tasks !== false
                              }
                            />

                            <VisitPlanScheduleFields
                              initialFrequency={plan.frequency}
                              initialRepeatEvery={plan.repeat_every ?? 1}
                              initialWeekdays={plan.weekdays ?? []}
                              initialMonthDays={plan.month_days ?? []}
                              initialDesiredTime={plan.desired_time}
                              initialWindowStart={plan.window_start}
                              initialWindowEnd={plan.window_end}
                              initialStartDate={plan.start_date}
                              initialEndDate={plan.end_date}
                            />

                            <details className="rounded-2xl border border-slate-200 bg-white p-4">
                              <summary className="cursor-pointer text-sm font-extrabold text-brand">
                                Weitere Einstellungen: Gebäude und zusätzliches Team
                              </summary>
                              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                                <fieldset className="rounded-xl border border-slate-200 p-3">
                                  <legend className="px-1 text-sm font-bold">Gebäude</legend>
                                  <div className="grid gap-2">
                                    {(buildings ?? [])
                                      .filter((building) => building.status === "active")
                                      .map((building) => (
                                        <label key={building.id} className="flex items-center gap-2 text-sm font-semibold">
                                          <input
                                            type="checkbox"
                                            name="buildingId"
                                            value={building.id}
                                            defaultChecked={planBuildingIds.has(building.id)}
                                          />
                                          {building.label || building.formatted_address}
                                        </label>
                                      ))}
                                  </div>
                                  <p className="mt-2 text-xs text-slate-500">
                                    Ohne Auswahl umfasst der Plan alle aktiven Gebäude.
                                  </p>
                                </fieldset>
                                <fieldset className="rounded-xl border border-slate-200 p-3">
                                  <legend className="px-1 text-sm font-bold">Weitere Mitarbeiter</legend>
                                  <div className="grid gap-2">
                                    {schedulableEmployees.map((employee) => (
                                      <label key={employee.id} className="flex items-center gap-2 text-sm font-semibold">
                                        <input
                                          type="checkbox"
                                          name="additionalEmployeeId"
                                          value={employee.id}
                                          defaultChecked={planEmployeeIds.has(employee.id)}
                                        />
                                        {employee.full_name}
                                      </label>
                                    ))}
                                  </div>
                                </fieldset>
                              </div>
                            </details>
                            <p className="text-xs leading-5 text-slate-500">
                              Änderungen bilden nur zukünftige, noch nicht gestartete und nicht manuell angepasste Termine neu. Mitarbeiter müssen zuvor im Bereich Team aktiv zugeordnet sein.
                            </p>
                            <button
                              disabled={
                                !schedulableEmployees.length ||
                                !recurringServices.length
                              }
                              className={`${buttonClass} disabled:cursor-not-allowed disabled:opacity-50`}
                            >
                              Besuchsplan aktualisieren
                            </button>
                          </form>
                        </details>
                        <form
                          action={deleteVisitPlanAction}
                          className="mt-3 border-t border-red-200 pt-3"
                        >
                          <input type="hidden" name="propertyId" value={id} />
                          <input type="hidden" name="visitPlanId" value={plan.id} />
                          <input type="hidden" name="updatedAt" value={plan.updated_at} />
                          <ConfirmSubmitButton
                            confirmation={`Besuchsplan „${plan.label}“ wirklich entfernen? Alle noch nicht gestarteten Termine dieses Plans werden automatisch gelöscht. Abgeschlossene Einsätze bleiben aus Nachweisgründen erhalten.`}
                            className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-red-200 bg-red-50 px-4 text-sm font-extrabold text-red-800 transition hover:border-red-300 hover:bg-red-100 disabled:cursor-wait disabled:opacity-60"
                          >
                            Plan und offene Termine löschen
                          </ConfirmSubmitButton>
                        </form>
                      </article>
                    );
                  })}
                  {!(visitPlans ?? []).length ? (
                    <EmptyState
                      title="Kein Besuchsplan"
                      text="Legen Sie den ersten regelmäßigen oder individuellen Plan an."
                    />
                  ) : null}
                </div>
              </details>
              </fieldset>
              <div id="selected-visit-detail" className="scroll-mt-24">
                <h3 className="font-extrabold text-slate-950">
                  Ausgewählter Einsatz
                </h3>
                <div className="mt-3 grid gap-3">
                  {(selectedVisit ? [selectedVisit] : []).map((visit) => {
                    const report = reportByVisitId.get(visit.id) ?? null;
                    const tasksForVisit = (visitTasks ?? []).filter(
                      (task) => task.visit_id === visit.id,
                    );
                    return (
                    <article
                      key={visit.id}
                      className="rounded-lg border border-slate-200 bg-slate-50 p-3"
                    >
                      <div className="flex justify-between gap-3">
                        <p className="font-extrabold text-slate-950">
                          {visitScheduleLabel(visit)}
                        </p>
                        <StatusPill>
                          {VISIT_STATUS_LABELS[visit.status] ?? visit.status}
                        </StatusPill>
                      </div>
                      <p className="mt-1 text-sm text-slate-650">
                        {employeeById.get(visit.primary_employee_id)
                          ?.full_name || "nicht zugewiesen"}{" "}
                        ·{" "}
                        {tasksForVisit.length}{" "}
                        Aufgaben
                      </p>
                      {tasksForVisit.length ? (
                        <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
                          <p className="text-xs font-black uppercase tracking-wide text-slate-500">
                            Geplante Checkliste
                          </p>
                          <ul className="mt-2 grid gap-2">
                            {tasksForVisit.map((task) => (
                              <li
                                key={task.id}
                                className="flex items-start justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2"
                              >
                                <span className="min-w-0">
                                  <span className="block text-sm font-extrabold text-slate-950">
                                    {task.title}
                                  </span>
                                  <span className="block text-xs font-semibold text-slate-500">
                                    {task.category ||
                                      (task.source_type === "damage"
                                        ? "Schadensmeldung"
                                        : "Leistung")}
                                  </span>
                                </span>
                                <StatusPill>
                                  {task.status === "open"
                                    ? "Offen"
                                    : task.status === "in_progress"
                                      ? "In Arbeit"
                                      : task.status === "done"
                                        ? "Erledigt"
                                        : "Nicht ausführbar"}
                                </StatusPill>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : (
                        <p className="mt-3 rounded-xl border border-dashed border-slate-200 bg-white p-3 text-sm text-slate-600">
                          Für diesen Termin ist nach Leistungs- und Saisonprüfung keine Aufgabe fällig.
                        </p>
                      )}
                      {visit.status === "scheduled" ? (
                        <div className="mt-3 grid gap-2">
                          <details className="rounded-lg border border-slate-200 bg-white p-3">
                            <summary className="cursor-pointer text-sm font-extrabold text-brand">
                              Termin verschieben
                            </summary>
                            <form
                              action={rescheduleVisitAction}
                              className="mt-3 grid gap-3"
                            >
                              <input
                                type="hidden"
                                name="propertyId"
                                value={id}
                              />
                              <input
                                type="hidden"
                                name="visitId"
                                value={visit.id}
                              />
                              <Field label="Neues Datum">
                                <input
                                  name="scheduledDate"
                                  type="date"
                                  min={berlinIsoDate()}
                                  required
                                  defaultValue={visit.scheduled_date}
                                  className={inputClass}
                                />
                              </Field>
                              <Field label="Neue Uhrzeit">
                                <input
                                  name="plannedStartTime"
                                  type="time"
                                  required
                                  defaultValue={
                                    visit.planned_start_time?.slice(0, 5) ||
                                    formatBerlinDateTimeLocal(
                                      visit.scheduled_start,
                                    ).slice(11, 16)
                                  }
                                  className={inputClass}
                                />
                              </Field>
                              <div className="grid gap-3 sm:grid-cols-2">
                                <Field label="Zeitfenster von optional">
                                  <input
                                    name="windowStart"
                                    type="time"
                                    defaultValue={
                                      visit.window_start?.slice(0, 5) || ""
                                    }
                                    className={inputClass}
                                  />
                                </Field>
                                <Field label="Zeitfenster bis optional">
                                  <input
                                    name="windowEnd"
                                    type="time"
                                    defaultValue={
                                      visit.window_end?.slice(0, 5) || ""
                                    }
                                    className={inputClass}
                                  />
                                </Field>
                              </div>
                              <Field label="Pflichtgrund">
                                <textarea
                                  name="reason"
                                  minLength={5}
                                  maxLength={1000}
                                  required
                                  rows={2}
                                  className={inputClass}
                                />
                              </Field>
                              <button className={buttonClass}>
                                Neuen Termin speichern
                              </button>
                            </form>
                          </details>
                          <details className="rounded-lg border border-red-200 bg-red-50 p-3">
                            <summary className="cursor-pointer text-sm font-extrabold text-red-800">
                              Einsatz absagen
                            </summary>
                            <form
                              action={cancelVisitAction}
                              className="mt-3 grid gap-3"
                            >
                              <input
                                type="hidden"
                                name="propertyId"
                                value={id}
                              />
                              <input
                                type="hidden"
                                name="visitId"
                                value={visit.id}
                              />
                              <Field label="Pflichtgrund der Absage">
                                <textarea
                                  name="reason"
                                  minLength={5}
                                  maxLength={1000}
                                  required
                                  rows={2}
                                  className={inputClass}
                                />
                              </Field>
                              <button className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-red-700 px-4 py-2 text-sm font-extrabold text-white transition hover:bg-red-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700 focus-visible:ring-offset-2 sm:w-auto">
                                Einsatz verbindlich absagen
                              </button>
                            </form>
                          </details>
                        </div>
                      ) : null}
                      {visit.status === "completed" ? (
                        <div className="mt-3 grid gap-2">
                          {report ? (
                            <details className="rounded-lg border border-slate-200 bg-white p-3">
                              <summary className="cursor-pointer text-sm font-extrabold text-brand">
                                Unveränderlichen Leistungsbericht anzeigen
                              </summary>
                              <div className="mt-3 grid gap-3 text-sm text-slate-700">
                                <p>
                                  <strong>Ausgeführt von:</strong> {report.employeeName}
                                </p>
                                <p>
                                  <strong>Zeitraum:</strong>{" "}
                                  {formatGermanDate(report.startedAt, {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}{" "}
                                  bis{" "}
                                  {formatGermanDate(report.completedAt, {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}{" "}
                                  · {report.durationMinutes} Minuten
                                </p>
                                <p>
                                  <strong>Gebäude:</strong>{" "}
                                  {report.buildings
                                    .map((building) => building.label || building.address)
                                    .join(", ") || "Immobilie gesamt"}
                                </p>
                                <div className="grid gap-2">
                                  {report.tasks.map((task) => (
                                    <div
                                      key={task.id}
                                      className={`rounded-lg p-3 ${
                                        task.status === "done"
                                          ? "bg-emerald-50"
                                          : "bg-amber-50"
                                      }`}
                                    >
                                      <p className="font-extrabold text-slate-950">
                                        {task.title}
                                      </p>
                                      {task.checklist.length ? (
                                        <ul className="mt-2 list-inside list-disc">
                                          {task.checklist.map((item, index) => (
                                            <li key={item.id ?? `${task.id}-${index}`}>
                                              {item.label}
                                            </li>
                                          ))}
                                        </ul>
                                      ) : null}
                                      {task.blockedReason ? (
                                        <p className="mt-2">
                                          Nicht ausführbar: {task.blockedReason}
                                        </p>
                                      ) : null}
                                      {task.photos.length ? (
                                        <div className="mt-2 flex flex-wrap gap-2">
                                          {task.photos.map((photo) =>
                                            recordAttachmentUrls[photo.id] ? (
                                              <a
                                                key={photo.id}
                                                href={recordAttachmentUrls[photo.id]}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="font-extrabold text-brand underline"
                                              >
                                                {photo.filename}
                                              </a>
                                            ) : null,
                                          )}
                                        </div>
                                      ) : null}
                                    </div>
                                  ))}
                                </div>
                                {report.damages.length ? (
                                  <div className="rounded-lg border border-slate-200 p-3">
                                    <p className="font-extrabold text-slate-950">
                                      Verknüpfte Schäden
                                    </p>
                                    {report.damages.map((damage) => (
                                      <div key={damage.id} className="mt-2">
                                        <p className="font-bold">{damage.title}</p>
                                        {damage.resolutionNote ? (
                                          <p>{damage.resolutionNote}</p>
                                        ) : null}
                                        {damage.photos.map((photo) =>
                                          recordAttachmentUrls[photo.id] ? (
                                            <a
                                              key={photo.id}
                                              href={recordAttachmentUrls[photo.id]}
                                              target="_blank"
                                              rel="noreferrer"
                                              className="mr-3 font-extrabold text-brand underline"
                                            >
                                              {photo.filename}
                                            </a>
                                          ) : null,
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                ) : null}
                                {(operationalSnapshotByVisitId.get(visit.id) ?? [])
                                  .length ? (
                                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                                    <p className="font-extrabold text-slate-950">
                                      Betriebliche Meldungen beim Abschluss (nur intern)
                                    </p>
                                    {(operationalSnapshotByVisitId.get(visit.id) ?? []).map(
                                      (operationalReport) => (
                                        <div
                                          key={operationalReport.id}
                                          className="mt-3 border-t border-amber-200 pt-3 first:border-t-0 first:pt-0"
                                        >
                                          <p className="font-bold">
                                            {operationalReport.title}
                                          </p>
                                          <p>{operationalReport.description}</p>
                                          <p className="mt-1 text-xs font-semibold text-slate-600">
                                            Dringlichkeit: {operationalReport.urgency} · Status beim Abschluss: {operationalReport.statusAtCompletion}
                                          </p>
                                          {operationalReport.photos.map((photo) =>
                                            recordAttachmentUrls[photo.id] ? (
                                              <a
                                                key={photo.id}
                                                href={recordAttachmentUrls[photo.id]}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="mr-3 mt-2 inline-flex font-extrabold text-brand underline"
                                              >
                                                {photo.filename}
                                              </a>
                                            ) : null,
                                          )}
                                        </div>
                                      ),
                                    )}
                                  </div>
                                ) : null}
                              </div>
                            </details>
                          ) : (
                            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-900">
                              Für diesen älteren Einsatz liegt noch kein unveränderlicher
                              Berichtssnapshot vor.
                            </p>
                          )}
                        <details className="rounded-lg border border-slate-200 bg-white p-3">
                          <summary className="cursor-pointer text-sm font-extrabold text-brand">
                            Zeit korrigieren
                          </summary>
                          <form
                            action={correctVisitTimeAction}
                            className="mt-3 grid gap-3"
                          >
                            <input
                              type="hidden"
                              name="visitId"
                              value={visit.id}
                            />
                            <input type="hidden" name="propertyId" value={id} />
                            <Field label="Start">
                              <input
                                name="startedAt"
                                type="datetime-local"
                                required
                                defaultValue={formatBerlinDateTimeLocal(visit.started_at)}
                                className={inputClass}
                              />
                            </Field>
                            <Field label="Ende">
                              <input
                                name="completedAt"
                                type="datetime-local"
                                required
                                defaultValue={formatBerlinDateTimeLocal(visit.completed_at)}
                                className={inputClass}
                              />
                            </Field>
                            <Field label="Pflichtbegründung">
                              <textarea
                                name="reason"
                                minLength={5}
                                required
                                rows={2}
                                className={inputClass}
                              />
                            </Field>
                            <button className={buttonClass}>
                              Zeitkorrektur speichern
                            </button>
                          </form>
                        </details>
                        </div>
                      ) : null}
                    </article>
                    );
                  })}
                  {!selectedVisit ? (
                    <EmptyState
                      title="Termin auswählen"
                      text="Wählen Sie einen Eintrag im Kalender aus, um Checkliste, Verschiebung und Bericht zu öffnen."
                    />
                  ) : null}
                </div>
              </div>
            </div>

            {!propertyReadOnly ? (
            <details className="mt-5 rounded-xl border border-slate-200 bg-white p-4">
              <summary className="cursor-pointer font-extrabold text-brand">
                Besuchsplan anlegen
              </summary>
              {!recurringServices.length ? (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-900">
                  Legen Sie zuerst mindestens eine regelmäßige Leistung für
                  diese Immobilie an. Leistungen „nach Bedarf“ werden weiterhin
                  bei manuellen Einsätzen verwendet.{" "}
                  <Link
                    href={"/admin/properties/" + id + "?view=leistungen"}
                    className="font-extrabold underline underline-offset-2"
                  >
                    Zu den Leistungen
                  </Link>
                </div>
              ) : null}
              <form
                action={createVisitPlanAction}
                className="mt-4 grid gap-4"
              >
                <input type="hidden" name="propertyId" value={id} />
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Bezeichnung">
                    <input
                      name="label"
                      required
                      placeholder="z. B. Regelbetreuung Parleweg"
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Primärer Mitarbeiter">
                    <select
                      name="primaryEmployeeId"
                      required
                      defaultValue=""
                      className={inputClass}
                    >
                      <option value="">Mitarbeiter auswählen</option>
                      {schedulableEmployees.map((employee) => (
                        <option key={employee.id} value={employee.id}>
                          {employee.full_name}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>

                <VisitPlanServiceFields
                  services={visitPlanServiceOptions}
                  initialMaxVisitMinutes={maxVisitMinutes}
                />

                <VisitPlanScheduleFields initialStartDate={berlinIsoDate()} />

                <details className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                  <summary className="cursor-pointer text-sm font-extrabold text-brand">
                    Weitere Einstellungen: Gebäude und zusätzliches Team
                  </summary>
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <fieldset className="rounded-xl border border-slate-200 bg-white p-3">
                      <legend className="px-1 text-sm font-bold">Gebäude</legend>
                      <div className="grid gap-2">
                        {(buildings ?? [])
                          .filter((building) => building.status === "active")
                          .map((building) => (
                            <label
                              key={building.id}
                              className="flex items-center gap-2 text-sm font-semibold"
                            >
                              <input
                                type="checkbox"
                                name="buildingId"
                                value={building.id}
                              />
                              {building.label || building.formatted_address}
                            </label>
                          ))}
                      </div>
                      <p className="mt-2 text-xs text-slate-500">
                        Ohne Auswahl umfasst der Plan alle aktiven Gebäude.
                      </p>
                    </fieldset>
                    <fieldset className="rounded-xl border border-slate-200 bg-white p-3">
                      <legend className="px-1 text-sm font-bold">
                        Weitere Mitarbeiter
                      </legend>
                      <div className="grid gap-2">
                        {schedulableEmployees.map((employee) => (
                          <label
                            key={employee.id}
                            className="flex items-center gap-2 text-sm font-semibold"
                          >
                            <input
                              type="checkbox"
                              name="additionalEmployeeId"
                              value={employee.id}
                            />
                            {employee.full_name}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  </div>
                </details>
                {!schedulableEmployees.length ? (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">
                    Weisen Sie der Immobilie zuerst mindestens einen aktiven
                    Mitarbeiter im Bereich Team zu.
                  </p>
                ) : null}
                <button
                  disabled={
                    !schedulableEmployees.length || !recurringServices.length
                  }
                  className={`${buttonClass} disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  Besuchsplan und Termine erstellen
                </button>
              </form>
            </details>
            ) : null}

            {!propertyReadOnly ? (
            <details className="mt-4 rounded-xl border border-brand/20 bg-brand-soft/30 p-4">
              <summary className="cursor-pointer font-extrabold text-brand">
                Bedarfs- oder manuellen Einsatz anlegen
              </summary>
              <p className="mt-3 text-sm leading-6 text-slate-650">
                Wählen Sie einen bereits aktiv zugewiesenen Mitarbeiter,
                mindestens ein Gebäude und die konkreten Bedarfsleistungen.
                Aufgaben, Checklisten und Equipment werden für diesen Einsatz
                festgeschrieben.
              </p>
              <form
                action={createManualVisitAction}
                className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4"
              >
                <input type="hidden" name="propertyId" value={id} />
                <Field label="Datum">
                  <input
                    name="scheduledDate"
                    type="date"
                    min={berlinIsoDate()}
                    required
                    defaultValue={berlinIsoDate()}
                    className={inputClass}
                  />
                </Field>
                <Field label="Uhrzeit">
                  <input
                    name="plannedStartTime"
                    type="time"
                    required
                    defaultValue="09:00"
                    className={inputClass}
                  />
                </Field>
                <Field label="Zeitfenster von optional">
                  <input name="windowStart" type="time" className={inputClass} />
                </Field>
                <Field label="Zeitfenster bis optional">
                  <input name="windowEnd" type="time" className={inputClass} />
                </Field>
                <Field label="Primärer Mitarbeiter">
                  <select
                    name="primaryEmployeeId"
                    required
                    defaultValue=""
                    className={inputClass}
                  >
                    <option value="">Mitarbeiter auswählen</option>
                    {schedulableEmployees.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employee.full_name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Maximale Einsatzdauer in Minuten">
                  <input
                    name="maxVisitMinutes"
                    type="number"
                    min="1"
                    max="1440"
                    required
                    defaultValue={maxVisitMinutes}
                    className={inputClass}
                  />
                </Field>
                <fieldset className="rounded-lg border border-slate-200 bg-white p-3 md:col-span-2">
                  <legend className="px-1 text-sm font-bold">Gebäude</legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {activeBuildings.map((building) => (
                      <label
                        key={building.id}
                        className="flex items-center gap-2 text-sm font-semibold"
                      >
                        <input
                          type="checkbox"
                          name="buildingId"
                          value={building.id}
                        />
                        {building.label || building.formatted_address}
                      </label>
                    ))}
                  </div>
                  {!activeBuildings.length ? (
                    <p className="text-sm font-semibold text-red-700">
                      Es ist kein aktives Gebäude verfügbar.
                    </p>
                  ) : null}
                </fieldset>
                <fieldset className="rounded-lg border border-slate-200 bg-white p-3 md:col-span-2 xl:col-span-4">
                  <legend className="px-1 text-sm font-bold">
                    Aktive Bedarfs- und Manuell-Leistungen
                  </legend>
                  <div className="grid gap-2 md:grid-cols-2">
                    {manualServices.map((service) => (
                      <label
                        key={service.id}
                        className="flex items-start gap-2 rounded-lg border border-slate-200 p-3 text-sm font-semibold"
                      >
                        <input
                          type="checkbox"
                          name="serviceId"
                          value={service.id}
                          className="mt-0.5"
                        />
                        <span>
                          <span className="block text-slate-950">
                            {service.name}
                          </span>
                          <span className="mt-1 block text-xs text-slate-500">
                            {EXECUTION_RULE_LABELS[
                              service.execution_rule as keyof typeof EXECUTION_RULE_LABELS
                            ] ?? service.execution_rule}
                            {service.seasonal
                              ? ` · Saison ${months[service.season_start_month - 1]} bis ${months[service.season_end_month - 1]}`
                              : ""}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                  {!manualServices.length ? (
                    <p className="text-sm font-semibold text-red-700">
                      Legen Sie zuerst eine aktive Leistung mit der Regel „Nach
                      Bedarf“ oder „Manuell terminieren“ an.
                    </p>
                  ) : null}
                </fieldset>
                {!schedulableEmployees.length ? (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900 md:col-span-2 xl:col-span-4">
                    Weisen Sie der Immobilie zuerst mindestens einen aktiven
                    Mitarbeiter zu.
                  </p>
                ) : null}
                <button
                  disabled={
                    !schedulableEmployees.length ||
                    !activeBuildings.length ||
                    !manualServices.length
                  }
                  className={`${buttonClass} disabled:cursor-not-allowed disabled:opacity-50 md:col-span-2 xl:col-span-4`}
                >
                  Bedarfs-Einsatz verbindlich anlegen
                </button>
              </form>
            </details>
            ) : null}
          </Panel>
        </section>
        ) : null}

        {activeView === "schaeden" ? (
        <section id="schaeden" className="scroll-mt-24">
          <Panel title="Schäden und betriebliche Meldungen">
            <div className="grid gap-5 lg:grid-cols-2">
              <div>
                <h3 className="font-extrabold text-slate-950">Schäden</h3>
                <details className="mt-3 rounded-xl border border-brand/20 bg-brand-soft/30 p-4">
                  <summary className="cursor-pointer font-extrabold text-brand">
                    Schadensmeldung als Admin anlegen
                  </summary>
                  <form
                    action={createAdminDamageAction}
                    className="mt-4 grid gap-3"
                  >
                    <input type="hidden" name="propertyId" value={id} />
                    <Field label="Gebäude">
                      <select
                        name="buildingId"
                        required
                        defaultValue=""
                        className={inputClass}
                      >
                        <option value="">Gebäude auswählen</option>
                        {activeBuildings.map((building) => (
                          <option key={building.id} value={building.id}>
                            {building.label || building.formatted_address}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Titel">
                      <input
                        name="title"
                        required
                        maxLength={180}
                        className={inputClass}
                      />
                    </Field>
                    <Field label="Beschreibung">
                      <textarea
                        name="description"
                        required
                        maxLength={5000}
                        rows={4}
                        className={inputClass}
                      />
                    </Field>
                    <Field label="Priorität">
                      <select
                        name="priority"
                        defaultValue="normal"
                        className={inputClass}
                      >
                        <option value="low">Niedrig</option>
                        <option value="normal">Normal</option>
                        <option value="high">Hoch</option>
                        <option value="urgent">Dringend</option>
                      </select>
                    </Field>
                    <Field label="Bild (optional)">
                      <input
                        name="image"
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                        className={inputClass}
                      />
                    </Field>
                    <p className="text-xs leading-5 text-slate-500">
                      JPG, PNG, WebP oder HEIC · maximal 4 MB.
                    </p>
                    {!activeBuildings.length ? (
                      <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">
                        Für eine Schadensmeldung wird ein aktives Gebäude benötigt.
                      </p>
                    ) : null}
                    <button
                      disabled={!activeBuildings.length}
                      className={`${buttonClass} disabled:cursor-not-allowed disabled:opacity-50`}
                    >
                      Schaden anlegen und vormerken
                    </button>
                  </form>
                </details>
                <div className="mt-4 grid gap-3">
                  {(damages ?? []).map((damage) => (
                    <article
                      key={damage.id}
                      className="rounded-lg border border-slate-200 bg-slate-50 p-4"
                    >
                      <div className="flex justify-between gap-3">
                        <div>
                          <p className="font-extrabold text-slate-950">
                            {damage.title}
                          </p>
                          <p className="mt-1 text-xs font-bold text-slate-500">
                            {buildingById.get(damage.building_id)?.label ||
                              buildingById.get(damage.building_id)
                                ?.formatted_address}{" "}
                            · {formatGermanDate(damage.created_at)}
                          </p>
                        </div>
                        <StatusPill>
                          {damageStatusLabels[damage.status] ?? damage.status}
                        </StatusPill>
                      </div>
                      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                        {damage.description}
                      </p>
                      {damage.damage_attachments?.length ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {damage.damage_attachments.map((attachment: DisplayAttachment) =>
                            recordAttachmentUrls[attachment.id] ? (
                              <a
                                key={attachment.id}
                                href={recordAttachmentUrls[attachment.id]}
                                target="_blank"
                                rel="noreferrer"
                                className="text-sm font-extrabold text-brand underline"
                              >
                                {attachment.filename}
                              </a>
                            ) : null,
                          )}
                        </div>
                      ) : null}
                      <form
                        action={updateDamageStatusAction}
                        className="mt-3 grid gap-2"
                      >
                        <input type="hidden" name="propertyId" value={id} />
                        <input
                          type="hidden"
                          name="damageId"
                          value={damage.id}
                        />
                        <select
                          name="status"
                          defaultValue={damage.status}
                          aria-label={`Status für Schaden ${damage.title}`}
                          className={inputClass}
                        >
                          {Object.entries(damageStatusLabels).map(
                            ([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ),
                          )}
                        </select>
                        <textarea
                          name="resolutionNote"
                          rows={2}
                          placeholder="Erledigungs- oder Prüfnotiz"
                          className={inputClass}
                          defaultValue={damage.resolution_note || ""}
                        />
                        <button className={buttonClass}>
                          Schadensstatus speichern
                        </button>
                      </form>
                    </article>
                  ))}
                  {!(damages ?? []).length ? (
                    <EmptyState
                      title="Keine Schäden"
                      text="Schadensmeldungen erscheinen hier gebäudegenau."
                    />
                  ) : null}
                </div>
              </div>
              <div>
                <h3 className="font-extrabold text-slate-950">
                  Betriebliche Meldungen
                </h3>
                <div className="mt-3 grid gap-3">
                  {(operationalReports ?? []).map((report) => (
                    <article
                      key={report.id}
                      className="rounded-lg border border-slate-200 bg-slate-50 p-4"
                    >
                      <div className="flex justify-between gap-3">
                        <div>
                          <p className="font-extrabold text-slate-950">
                            {report.title}
                          </p>
                          <p className="mt-1 text-xs font-bold text-slate-500">
                            {report.category} ·{" "}
                            {formatGermanDate(report.created_at)}
                          </p>
                        </div>
                        <StatusPill>
                          {operationalStatusLabels[report.status] ??
                            report.status}
                        </StatusPill>
                      </div>
                      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                        {report.description}
                      </p>
                      {report.operational_report_attachments?.length ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {report.operational_report_attachments.map((attachment: DisplayAttachment) =>
                            recordAttachmentUrls[attachment.id] ? (
                              <a
                                key={attachment.id}
                                href={recordAttachmentUrls[attachment.id]}
                                target="_blank"
                                rel="noreferrer"
                                className="text-sm font-extrabold text-brand underline"
                              >
                                {attachment.filename}
                              </a>
                            ) : null,
                          )}
                        </div>
                      ) : null}
                      <form
                        action={updateOperationalReportStatusAction}
                        className="mt-3 flex flex-col gap-2 sm:flex-row"
                      >
                        <input type="hidden" name="propertyId" value={id} />
                        <input type="hidden" name="reportId" value={report.id} />
                        <select
                          name="status"
                          defaultValue={report.status}
                          aria-label={`Status für Meldung ${report.title}`}
                          className={inputClass}
                        >
                          {Object.entries(operationalStatusLabels).map(
                            ([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ),
                          )}
                        </select>
                        <button className={buttonClass}>Status speichern</button>
                      </form>
                    </article>
                  ))}
                  {!(operationalReports ?? []).length ? (
                    <EmptyState
                      title="Keine betrieblichen Meldungen"
                      text="Interne Mitarbeiterhinweise erscheinen ausschließlich hier im Adminbereich."
                    />
                  ) : null}
                </div>
              </div>
            </div>
            <div className="mt-6 border-t border-slate-200 pt-5">
              <h3 className="font-extrabold text-slate-950">
                Vertrauliche Kundenbeschwerden
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                Dieser Bereich ist ausschließlich für Admins und den jeweils
                einreichenden Kunden sichtbar.
              </p>
              {(complaints ?? []).length ? (
                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                  {(complaints ?? []).map((complaint) => {
                    const adminNote = relation(complaint.complaint_admin_notes);
                    return (
                      <article
                        key={complaint.id}
                        className="rounded-lg border border-slate-200 bg-slate-50 p-4"
                      >
                        <div className="flex justify-between gap-3">
                          <div>
                            <p className="font-extrabold text-slate-950">
                              {complaint.title}
                            </p>
                            <p className="mt-1 text-xs font-bold text-slate-500">
                              {formatGermanDate(complaint.created_at)}
                            </p>
                          </div>
                          <StatusPill>
                            {complaintStatusLabels[complaint.status] ?? complaint.status}
                          </StatusPill>
                        </div>
                        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                          {complaint.description}
                        </p>
                        {complaint.complaint_attachments?.length ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {complaint.complaint_attachments.map((attachment: DisplayAttachment) =>
                              recordAttachmentUrls[attachment.id] ? (
                                <a
                                  key={attachment.id}
                                  href={recordAttachmentUrls[attachment.id]}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-sm font-extrabold text-brand underline"
                                >
                                  {attachment.filename}
                                </a>
                              ) : null,
                            )}
                          </div>
                        ) : null}
                        <form
                          action={updateComplaintStatusAction}
                          className="mt-3 grid gap-2"
                        >
                          <input type="hidden" name="propertyId" value={id} />
                          <input
                            type="hidden"
                            name="complaintId"
                            value={complaint.id}
                          />
                          <select
                            name="status"
                            defaultValue={complaint.status}
                            aria-label={`Status für Beschwerde ${complaint.title}`}
                            className={inputClass}
                          >
                            {Object.entries(complaintStatusLabels).map(
                              ([value, label]) => (
                                <option key={value} value={value}>
                                  {label}
                                </option>
                              ),
                            )}
                          </select>
                          <textarea
                            name="internalNote"
                            rows={3}
                            defaultValue={adminNote?.internal_note || ""}
                            placeholder="Interne Adminnotiz – für Kunden unsichtbar"
                            className={inputClass}
                          />
                          <button className={buttonClass}>
                            Beschwerde aktualisieren
                          </button>
                        </form>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-3">
                  <EmptyState
                    title="Keine Beschwerden"
                    text="Vertrauliche Kundenbeschwerden erscheinen nur in diesem Adminbereich."
                  />
                </div>
              )}
            </div>
          </Panel>
        </section>
        ) : null}

        {activeView === "team" ? (
        <section id="team" className="scroll-mt-24">
          <Panel title="Team und Equipment">
            {propertyReadOnly ? (
              <p className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                Team- und Equipmentzuordnungen sind für diese archivierte Immobilie geschlossen.
              </p>
            ) : null}
            <fieldset
              disabled={propertyReadOnly}
              aria-label="Team- und Equipmentzuordnungen"
              className="contents disabled:cursor-not-allowed"
            >
            <div className="grid gap-5 lg:grid-cols-2">
              <div>
                <h3 className="font-extrabold text-slate-950">
                  Zugewiesene Mitarbeiter
                </h3>
                {(assignments ?? []).length ? (
                  <div className="mt-3 grid gap-2">
                    {(assignments ?? []).map((assignment) => {
                      const employee = employeeById.get(assignment.employee_id);
                      return (
                        <article
                          key={`${assignment.property_id}-${assignment.employee_id}`}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3"
                        >
                          <div>
                            <p className="font-extrabold text-slate-950">
                              {employee?.full_name || "Unbekannter Mitarbeiter"}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              Zugewiesen seit {formatGermanDate(`${assignment.starts_on}T12:00:00Z`)}
                            </p>
                          </div>
                          <form action={endPropertyEmployeeAssignmentAction}>
                            <input type="hidden" name="propertyId" value={id} />
                            <input
                              type="hidden"
                              name="employeeId"
                              value={assignment.employee_id}
                            />
                            <input
                              type="hidden"
                              name="updatedAt"
                              value={assignment.updated_at}
                            />
                            <button className="min-h-11 rounded-md border border-red-300 bg-white px-3 py-2 text-sm font-extrabold text-red-700 hover:bg-red-50">
                              Zuordnung beenden
                            </button>
                          </form>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-slate-600">
                    Noch kein Mitarbeiter zugewiesen.
                  </p>
                )}
                {availablePropertyEmployees.length ? (
                  <form
                    action={assignPropertyEmployeeAction}
                    className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]"
                  >
                    <input type="hidden" name="propertyId" value={id} />
                    <Field label="Mitarbeiter hinzufügen">
                      <select
                        name="employeeId"
                        required
                        defaultValue=""
                        className={inputClass}
                      >
                        <option value="">Mitarbeiter auswählen</option>
                        {availablePropertyEmployees.map((employee) => (
                          <option key={employee.id} value={employee.id}>
                            {employee.full_name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <button className={`${buttonClass} self-end`}>
                      Zuweisen
                    </button>
                  </form>
                ) : (
                  <p className="mt-4 text-xs text-slate-500">
                    Alle aktiven Mitarbeiter sind bereits zugeordnet.
                  </p>
                )}
              </div>
              <div>
                <h3 className="font-extrabold text-slate-950">
                  Benötigtes Equipment
                </h3>
                <div className="mt-3 grid gap-2">
                  {(propertyEquipment ?? []).map((assignment) => (
                    <article
                      key={assignment.id}
                      className="rounded-lg border border-slate-200 bg-slate-50 p-3"
                    >
                      <p className="font-extrabold text-slate-950">
                        {equipmentById.get(assignment.equipment_id)?.name ||
                          "Unbekanntes Equipment"}{" "}
                        · {assignment.required_quantity}
                      </p>
                      <p className="mt-1 text-sm text-slate-650">
                        {assignment.rental ? "Mietequipment" : "Eigenbestand"}
                        {assignment.seasonal
                          ? ` · saisonal ${months[assignment.season_start_month - 1]} bis ${months[assignment.season_end_month - 1]}`
                          : ""}
                      </p>
                      <p className="mt-1 text-sm text-slate-650">
                        {assignment.provision_note ||
                          "Kein Bereitstellungshinweis."}
                      </p>
                      <p className="mt-1 text-xs font-bold text-slate-500">
                        Bezug: {assignment.building_id
                          ? buildingById.get(assignment.building_id)?.label ||
                            buildingById.get(assignment.building_id)?.formatted_address ||
                            "Gebäude"
                          : "gesamte Immobilie"} · Vorlauf {assignment.notification_lead_hours} Std.
                      </p>
                      <details className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
                        <summary className="cursor-pointer text-sm font-extrabold text-brand">
                          Zuordnung bearbeiten
                        </summary>
                        <form
                          action={updatePropertyEquipmentAssignmentAction}
                          className="mt-4 grid gap-3 sm:grid-cols-2"
                        >
                          <input type="hidden" name="propertyId" value={id} />
                          <input
                            type="hidden"
                            name="assignmentId"
                            value={assignment.id}
                          />
                          <input
                            type="hidden"
                            name="updatedAt"
                            value={assignment.updated_at}
                          />
                          <Field label="Gebäude optional">
                            <select
                              name="buildingId"
                              defaultValue={assignment.building_id || ""}
                              className={inputClass}
                            >
                              <option value="">gesamte Immobilie</option>
                              {activeBuildings.map((building) => (
                                <option key={building.id} value={building.id}>
                                  {building.label || building.formatted_address}
                                </option>
                              ))}
                            </select>
                          </Field>
                          <Field label="Benötigte Menge">
                            <input
                              name="requiredQuantity"
                              type="number"
                              min="0.001"
                              step="0.001"
                              required
                              defaultValue={assignment.required_quantity}
                              className={inputClass}
                            />
                          </Field>
                          <Field label="Vorlauf in Stunden">
                            <input
                              name="notificationLeadHours"
                              type="number"
                              min="0"
                              max="87600"
                              required
                              defaultValue={assignment.notification_lead_hours}
                              className={inputClass}
                            />
                          </Field>
                          <Field label="Saison von">
                            <select
                              name="seasonStartMonth"
                              defaultValue={assignment.season_start_month || ""}
                              className={inputClass}
                            >
                              <option value="">Monat</option>
                              {months.map((month, index) => (
                                <option key={month} value={index + 1}>
                                  {month}
                                </option>
                              ))}
                            </select>
                          </Field>
                          <Field label="Saison bis">
                            <select
                              name="seasonEndMonth"
                              defaultValue={assignment.season_end_month || ""}
                              className={inputClass}
                            >
                              <option value="">Monat</option>
                              {months.map((month, index) => (
                                <option key={month} value={index + 1}>
                                  {month}
                                </option>
                              ))}
                            </select>
                          </Field>
                          <div className="grid content-end gap-2">
                            <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
                              <input
                                type="checkbox"
                                name="seasonal"
                                defaultChecked={assignment.seasonal}
                              />
                              saisonal
                            </label>
                            <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
                              <input
                                type="checkbox"
                                name="rental"
                                defaultChecked={assignment.rental}
                              />
                              Mietequipment
                            </label>
                          </div>
                          <label className="block sm:col-span-2">
                            <span className="text-sm font-bold text-slate-800">
                              Bereitstellungshinweis
                            </span>
                            <textarea
                              name="provisionNote"
                              rows={2}
                              maxLength={2_000}
                              defaultValue={assignment.provision_note || ""}
                              className={inputClass}
                            />
                          </label>
                          <button className={`${buttonClass} sm:col-span-2`}>
                            Zuordnung aktualisieren
                          </button>
                        </form>
                        <form
                          action={deactivatePropertyEquipmentAssignmentAction}
                          className="mt-3 border-t border-slate-200 pt-3"
                        >
                          <input type="hidden" name="propertyId" value={id} />
                          <input
                            type="hidden"
                            name="assignmentId"
                            value={assignment.id}
                          />
                          <input
                            type="hidden"
                            name="updatedAt"
                            value={assignment.updated_at}
                          />
                          <button className="min-h-11 rounded-md border border-red-300 bg-white px-3 py-2 text-sm font-extrabold text-red-700 hover:bg-red-50">
                            Zuordnung beenden
                          </button>
                        </form>
                      </details>
                    </article>
                  ))}
                </div>
                <form
                  action={assignPropertyEquipmentAction}
                  className="mt-4 grid gap-3 sm:grid-cols-2"
                >
                  <input type="hidden" name="propertyId" value={id} />
                  <Field label="Equipment">
                    <select
                      name="equipmentId"
                      required
                      defaultValue=""
                      className={inputClass}
                    >
                      <option value="">Equipment auswählen</option>
                      {(equipment ?? []).map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Gebäude optional">
                    <select
                      name="buildingId"
                      defaultValue=""
                      className={inputClass}
                    >
                      <option value="">gesamte Immobilie</option>
                      {activeBuildings.map((building) => (
                        <option key={building.id} value={building.id}>
                          {building.label || building.formatted_address}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Benötigte Menge">
                    <input
                      name="requiredQuantity"
                      type="number"
                      min="0.01"
                      step="0.01"
                      defaultValue="1"
                      required
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Vorlauf in Stunden">
                    <input
                      name="notificationLeadHours"
                      type="number"
                      min="0"
                      defaultValue="48"
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Saison von">
                    <select
                      name="seasonStartMonth"
                      defaultValue=""
                      className={inputClass}
                    >
                      <option value="">Monat</option>
                      {months.map((month, index) => (
                        <option key={month} value={index + 1}>
                          {month}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Saison bis">
                    <select
                      name="seasonEndMonth"
                      defaultValue=""
                      className={inputClass}
                    >
                      <option value="">Monat</option>
                      {months.map((month, index) => (
                        <option key={month} value={index + 1}>
                          {month}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <label className="flex items-center gap-2 text-sm font-semibold">
                    <input type="checkbox" name="seasonal" /> saisonal
                  </label>
                  <label className="flex items-center gap-2 text-sm font-semibold">
                    <input type="checkbox" name="rental" /> Mietequipment
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="text-sm font-bold text-slate-800">
                      Bereitstellungshinweis
                    </span>
                    <textarea
                      name="provisionNote"
                      rows={2}
                      className={inputClass}
                    />
                  </label>
                  <button className={`${buttonClass} sm:col-span-2`}>
                    Equipment zuweisen
                  </button>
                </form>
              </div>
            </div>
            </fieldset>
          </Panel>
        </section>
        ) : null}

        {activeView === "chat" ? (
        <section id="chat" className="scroll-mt-24">
          <Panel title="Immobilien-Chat">
            <PropertyChat
              propertyId={property.id}
              propertyName={property.name}
              currentUserId={profile.id}
              currentUserRole={profile.role}
              messages={chatMessages}
              signedAttachmentUrls={signedAttachmentUrls}
              sendMessageAction={sendAdminPropertyMessageAction}
              readOnly={propertyReadOnly}
            />
          </Panel>
        </section>
        ) : null}

        {activeView === "abrechnung" ? (
        <section id="abrechnung" className="scroll-mt-24">
          <Panel title="Abrechnung">
            <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="font-extrabold text-slate-950">
                Rechnungsempfänger dieser Immobilie
              </h3>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Die Angaben werden beim Erstellen einer Rechnung als unveränderlicher
                Empfänger-Snapshot gespeichert.
              </p>
              <form
                action={updatePropertyBillingProfileAction}
                className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4"
              >
                <input type="hidden" name="propertyId" value={id} />
                <Field label="Empfängername">
                  <input
                    name="recipientName"
                    required
                    defaultValue={billingRecipientName}
                    className={inputClass}
                  />
                </Field>
                <Field label="Zusatz / c/o">
                  <input
                    name="addressAddition"
                    defaultValue={billingProfile?.address_addition || ""}
                    className={inputClass}
                  />
                </Field>
                <Field label="Rechnungs-E-Mail">
                  <input
                    name="email"
                    type="email"
                    required
                    defaultValue={billingEmail}
                    className={inputClass}
                  />
                </Field>
                <Field label="Straße">
                  <input
                    name="street"
                    required
                    defaultValue={billingStreet}
                    className={inputClass}
                  />
                </Field>
                <Field label="Hausnummer">
                  <input
                    name="houseNumber"
                    required
                    defaultValue={billingHouseNumber}
                    className={inputClass}
                  />
                </Field>
                <Field label="Postleitzahl">
                  <input
                    name="postalCode"
                    required
                    defaultValue={billingPostalCode}
                    className={inputClass}
                  />
                </Field>
                <Field label="Ort">
                  <input
                    name="city"
                    required
                    defaultValue={billingCity}
                    className={inputClass}
                  />
                </Field>
                <Field label="Land">
                  <input
                    name="country"
                    required
                    defaultValue={billingCountry}
                    className={inputClass}
                  />
                </Field>
                <button className={`${buttonClass} md:col-span-2 xl:col-span-4`}>
                  Rechnungsempfänger speichern
                </button>
              </form>
            </div>
            <div className="grid gap-5 xl:grid-cols-2">
              <div>
                <h3 className="font-extrabold text-slate-950">
                  Zusatzkosten erfassen
                </h3>
                <form
                  action={createExtraChargeAction}
                  className="mt-3 grid gap-3 sm:grid-cols-2"
                >
                  <input type="hidden" name="propertyId" value={id} />
                  <Field label="Leistungsbeschreibung">
                    <input name="description" required className={inputClass} />
                  </Field>
                  <Field label="Leistungsdatum">
                    <input
                      name="serviceDate"
                      type="date"
                      required
                      defaultValue={berlinIsoDate()}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Einsatz optional">
                    <select
                      name="visitId"
                      defaultValue=""
                      className={inputClass}
                    >
                      <option value="">ohne Einsatzbezug</option>
                      {completedVisits.map((visit) => (
                        <option key={visit.id} value={visit.id}>
                          {visit.started_at
                            ? formatGermanDate(visit.started_at)
                            : visitScheduleLabel(visit)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Dauer in Minuten">
                    <input
                      name="durationMinutes"
                      type="number"
                      min="0"
                      defaultValue="0"
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Stundensatz netto">
                    <input
                      name="hourlyRate"
                      inputMode="decimal"
                      defaultValue={(defaultHourlyRateCents / 100)
                        .toFixed(2)
                        .replace(".", ",")}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Manueller Nettobetrag optional">
                    <input
                      name="manualNetAmount"
                      inputMode="decimal"
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Materialkosten netto">
                    <input
                      name="materialCost"
                      inputMode="decimal"
                      defaultValue="0,00"
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Umsatzsteuersatz in %">
                    <input
                      name="taxRate"
                      inputMode="decimal"
                      defaultValue={taxRateBps / 100}
                      className={inputClass}
                    />
                  </Field>
                  <label className="block sm:col-span-2">
                    <span className="text-sm font-bold text-slate-800">
                      Interne Notiz
                    </span>
                    <textarea
                      name="internalNote"
                      rows={2}
                      className={inputClass}
                    />
                  </label>
                  <label className="flex items-center gap-2 text-sm font-semibold">
                    <input type="checkbox" name="billable" defaultChecked />{" "}
                    abrechenbar
                  </label>
                  <button className={`${buttonClass} sm:col-span-2`}>
                    Zusatzkosten speichern
                  </button>
                </form>
              </div>
              <div>
                <h3 className="font-extrabold text-slate-950">Zusatzkosten</h3>
                <div className="mt-3 grid gap-2">
                  {(extraCharges ?? []).map((charge) => (
                    <article
                      key={charge.id}
                      className="rounded-lg border border-slate-200 bg-slate-50 p-3"
                    >
                      <div className="flex justify-between gap-3">
                        <p className="font-bold text-slate-950">
                          {charge.description}
                        </p>
                        <StatusPill>
                          {extraChargeStatusLabels[charge.billing_status] ??
                            charge.billing_status}
                        </StatusPill>
                      </div>
                      <p className="mt-1 text-sm text-slate-650">
                        {formatGermanDate(charge.service_date)} ·{" "}
                        {formatCents(
                          Number(charge.net_amount_cents || 0) +
                            Number(charge.material_cost_cents || 0),
                        )}{" "}
                        netto
                      </p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">
                        {charge.billable ? "Abrechenbar" : "Nicht abrechenbar"}
                        {charge.manual_price ? " · Preis manuell festgelegt" : ""}
                      </p>
                      {charge.billing_status === "open" &&
                      !charge.invoice_item_id ? (
                        <form
                          action={cancelExtraChargeAction}
                          className="mt-3 flex flex-col gap-2 sm:flex-row"
                        >
                          <input type="hidden" name="propertyId" value={id} />
                          <input
                            type="hidden"
                            name="chargeId"
                            value={charge.id}
                          />
                          <label className="flex-1">
                            <span className="sr-only">
                              Stornogrund für {charge.description}
                            </span>
                            <input
                              name="reason"
                              required
                              minLength={3}
                              maxLength={500}
                              placeholder="Stornogrund"
                              className={inputClass}
                            />
                          </label>
                          <button className="inline-flex min-h-11 items-center justify-center rounded-md border border-red-200 bg-white px-4 py-2 text-sm font-extrabold text-red-700 hover:bg-red-50">
                            Stornieren
                          </button>
                        </form>
                      ) : null}
                    </article>
                  ))}
                  {!(extraCharges ?? []).length ? (
                    <EmptyState
                      title="Keine Zusatzkosten"
                      text="Zusätzliche abrechenbare Leistungen erscheinen hier."
                    />
                  ) : null}
                </div>
                <h3 className="mt-6 font-extrabold text-slate-950">
                  Rechnungen
                </h3>
                <div className="mt-3 grid gap-2">
                  {(invoices ?? []).map((invoice) => (
                    <Link
                      key={invoice.id}
                      href={`/admin/invoices/${invoice.id}`}
                      className="rounded-lg border border-slate-200 bg-slate-50 p-3 hover:border-brand"
                    >
                      <div className="flex justify-between gap-3">
                        <p className="font-extrabold text-slate-950">
                          {invoice.invoice_number || invoice.title}
                        </p>
                        <StatusPill>
                          {invoiceStatusLabels[invoice.status] ??
                            invoice.status}
                        </StatusPill>
                      </div>
                      <p className="mt-1 text-sm text-slate-650">
                        {formatGermanDate(invoice.created_at)} ·{" "}
                        {invoice.gross_total_cents != null
                          ? formatCents(Number(invoice.gross_total_cents))
                          : `${Number(invoice.gross_total || 0).toLocaleString("de-DE", { style: "currency", currency: "EUR" })}`}
                      </p>
                    </Link>
                  ))}
                  {!(invoices ?? []).length ? (
                    <EmptyState
                      title="Keine Rechnungen"
                      text="Monatsrechnungen dieser Immobilie erscheinen hier."
                    />
                  ) : null}
                </div>
              </div>
            </div>
          </Panel>
        </section>
        ) : null}
      </div>
    </>
  );
}
