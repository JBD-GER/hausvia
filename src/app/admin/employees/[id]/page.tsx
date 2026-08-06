import Link from "next/link";
import { notFound } from "next/navigation";
import {
  revokeInvitationAction,
  sendInvitationAction,
} from "@/app/actions/auth";
import {
  updateEmployeeAction,
  updateEmployeeStatusAction,
} from "@/app/actions/portalAdmin";
import {
  EmptyState,
  Field,
  PageHeader,
  Panel,
  StatusPill,
  buttonClass,
  inputClass,
} from "@/components/portal/PortalUI";
import { PortalTabs } from "@/components/portal/PortalTabs";
import {
  BERLIN_TIME_ZONE,
  EMPLOYEE_CATEGORY_LABELS,
  VISIT_STATUS_LABELS,
  berlinDateParts,
  berlinIsoDate,
  formatGermanDate,
  minutesBetweenServerTimes,
  parseBerlinDateTimeLocal,
} from "@/lib/portal/core";
import { requireAdminContext } from "@/lib/portal/access";
import { getVisitScheduleSummary } from "@/lib/portal/visitRecurrence";

type SearchParams = Promise<{
  error?: string | string[];
  status?: string | string[];
  month?: string | string[];
  view?: string | string[];
}>;

type BuildingReference = {
  id: string;
  label: string | null;
  formatted_address: string;
};

type VisitBuildingReference = {
  buildings: BuildingReference | BuildingReference[] | null;
};

const employeeStatusLabels: Record<string, string> = {
  active: "Aktiv",
  invited: "Eingeladen",
  disabled: "Deaktiviert",
};

const invitationStatusLabels: Record<string, string> = {
  draft: "Entwurf",
  sent: "Versendet",
  accepted: "Angenommen",
  expired: "Abgelaufen",
  revoked: "Widerrufen",
};

const operationalCategoryLabels: Record<string, string> = {
  equipment_broken: "Equipment defekt",
  cleaning_supply_empty: "Reinigungsmittel leer",
  consumable_low: "Verbrauchsmaterial knapp",
  tool_missing: "Werkzeug fehlt",
  access_impossible: "Zugang nicht möglich",
  key_problem: "Schlüsselproblem",
  other: "Sonstiges",
};

const operationalStatusLabels: Record<string, string> = {
  new: "Neu",
  reviewing: "In Prüfung",
  organized: "Organisiert",
  resolved: "Erledigt",
};

function queryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function relation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function effectiveInvitationStatus(invitation: {
  status: string;
  expires_at: string | null;
}) {
  if (
    invitation.status === "sent" &&
    invitation.expires_at &&
    new Date(invitation.expires_at).getTime() <= Date.now()
  ) {
    return "expired";
  }
  return invitation.status;
}

function selectedMonthFrom(value: string) {
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return value;
  const current = berlinDateParts();
  return `${current.year}-${String(current.month).padStart(2, "0")}`;
}

function berlinMonthRange(monthValue: string) {
  const [year, month] = monthValue.split("-").map(Number);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const start = parseBerlinDateTimeLocal(`${monthValue}-01T00:00`);
  const end = parseBerlinDateTimeLocal(
    `${nextYear}-${String(nextMonth).padStart(2, "0")}-01T00:00`,
  );
  if (!start || !end) throw new Error("Der ausgewählte Monat ist ungültig.");
  return { start, end };
}

function formatTime(value: string | null | undefined) {
  if (!value) return "–";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "–";
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: BERLIN_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatDuration(minutes: number) {
  const normalized = Math.max(0, Math.round(minutes));
  return `${Math.floor(normalized / 60)}:${String(normalized % 60).padStart(2, "0")}`;
}

function durationMinutes(visit: {
  duration_minutes: number | null;
  started_at: string | null;
  completed_at: string | null;
  status: string;
}) {
  if (
    visit.duration_minutes !== null &&
    Number.isFinite(Number(visit.duration_minutes))
  ) {
    return Math.max(0, Number(visit.duration_minutes));
  }
  if (visit.status === "started" && visit.started_at) {
    return minutesBetweenServerTimes(visit.started_at, new Date());
  }
  if (visit.started_at && visit.completed_at) {
    return minutesBetweenServerTimes(visit.started_at, visit.completed_at);
  }
  return 0;
}

function visitAddress(visit: { visit_buildings?: VisitBuildingReference[] }) {
  const addresses = (visit.visit_buildings ?? [])
    .map((entry) => relation(entry.buildings))
    .filter((building): building is BuildingReference => Boolean(building))
    .map((building) =>
      building.label
        ? `${building.label} · ${building.formatted_address}`
        : building.formatted_address,
    );
  return addresses.join(" | ") || "Keine Einsatzadresse hinterlegt";
}

export default async function AdminEmployeeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const selectedMonth = selectedMonthFrom(queryValue(query.month));
  const monthRange = berlinMonthRange(selectedMonth);
  const { admin: supabase } = await requireAdminContext();

  const { data: employee, error: employeeError } = await supabase
    .from("employee_profiles")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (employeeError) {
    throw new Error("Die Mitarbeiterdaten konnten nicht geladen werden.");
  }
  if (!employee) notFound();

  const [
    invitationResult,
    assignmentsResult,
    primaryPlansResult,
    additionalPlanLinksResult,
    operationalReportsResult,
  ] = await Promise.all([
    supabase
      .from("invitations")
      .select(
        "id,email,role,category,status,sent_at,accepted_at,expires_at,revoked_at,created_at",
      )
      .eq("employee_id", id)
      .eq("role", "employee")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("property_employee_assignments")
      .select(
        "property_id,active,starts_on,ends_on,created_at,properties(id,name,object_key,status)",
      )
      .eq("employee_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("visit_plans")
      .select(
        "id,property_id,label,frequency,repeat_every,weekdays,month_days,desired_time,window_start,window_end,start_date,end_date,status,primary_employee_id,properties(id,name,status)",
      )
      .eq("primary_employee_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("visit_plan_employees")
      .select("visit_plan_id")
      .eq("employee_id", id),
    supabase
      .from("operational_reports")
      .select(
        "id,property_id,building_id,visit_id,category,urgency,title,description,status,created_at,properties(id,name),buildings(id,label,formatted_address)",
      )
      .eq("employee_id", id)
      .order("created_at", { ascending: false }),
  ]);

  if (
    invitationResult.error ||
    assignmentsResult.error ||
    primaryPlansResult.error ||
    additionalPlanLinksResult.error ||
    operationalReportsResult.error
  ) {
    throw new Error("Das Mitarbeiterdetail konnte nicht vollständig geladen werden.");
  }

  const additionalPlanIds = (additionalPlanLinksResult.data ?? []).map(
    (link) => link.visit_plan_id,
  );
  const additionalPlansResult = additionalPlanIds.length
    ? await supabase
        .from("visit_plans")
        .select(
          "id,property_id,label,frequency,repeat_every,weekdays,month_days,desired_time,window_start,window_end,start_date,end_date,status,primary_employee_id,properties(id,name,status)",
        )
        .in("id", additionalPlanIds)
        .order("created_at", { ascending: false })
    : { data: [], error: null };
  if (additionalPlansResult.error) {
    throw new Error("Die zusätzlichen Einsatzpläne konnten nicht geladen werden.");
  }

  const plans = [
    ...(primaryPlansResult.data ?? []),
    ...(additionalPlansResult.data ?? []),
  ].filter(
    (plan, index, allPlans) =>
      allPlans.findIndex((candidate) => candidate.id === plan.id) === index,
  );
  const planIds = plans.map((plan) => plan.id);
  const visitSelect =
    "id,visit_plan_id,property_id,primary_employee_id,scheduled_date,scheduled_start,planned_start_time,window_start,window_end,status,started_at,completed_at,duration_minutes,started_by,properties(id,name),visit_buildings(buildings(id,label,formatted_address))";

  const upcomingPrimaryPromise = supabase
    .from("visits")
    .select(visitSelect)
    .eq("primary_employee_id", id)
    .gte("scheduled_date", berlinIsoDate())
    .in("status", ["scheduled", "started"])
    .order("scheduled_start")
    .limit(120);
  const upcomingPlanPromise = planIds.length
    ? supabase
        .from("visits")
        .select(visitSelect)
        .in("visit_plan_id", planIds)
        .gte("scheduled_date", berlinIsoDate())
        .in("status", ["scheduled", "started"])
        .order("scheduled_start")
        .limit(120)
    : Promise.resolve({ data: [], error: null });
  const workedVisitsPromise = employee.user_id
    ? supabase
        .from("visits")
        .select(visitSelect)
        .eq("started_by", employee.user_id)
        .gte("started_at", monthRange.start)
        .lt("started_at", monthRange.end)
        .in("status", ["started", "completed"])
        .order("started_at", { ascending: false })
    : Promise.resolve({ data: [], error: null });

  const [upcomingPrimaryResult, upcomingPlanResult, workedVisitsResult] =
    await Promise.all([
      upcomingPrimaryPromise,
      upcomingPlanPromise,
      workedVisitsPromise,
    ]);
  if (
    upcomingPrimaryResult.error ||
    upcomingPlanResult.error ||
    workedVisitsResult.error
  ) {
    throw new Error("Einsätze und Arbeitszeiten konnten nicht geladen werden.");
  }

  const upcomingVisits = [
    ...(upcomingPrimaryResult.data ?? []),
    ...(upcomingPlanResult.data ?? []),
  ]
    .filter(
      (visit, index, allVisits) =>
        allVisits.findIndex((candidate) => candidate.id === visit.id) === index,
    )
    .sort((left, right) =>
      String(left.scheduled_start).localeCompare(String(right.scheduled_start)),
    );
  const workedVisits = workedVisitsResult.data ?? [];
  const totalMinutes = workedVisits.reduce(
    (total, visit) => total + durationMinutes(visit),
    0,
  );
  const invitation = invitationResult.data;
  const invitationStatus = invitation
    ? effectiveInvitationStatus(invitation)
    : "missing";
  const category = employee.category as keyof typeof EMPLOYEE_CATEGORY_LABELS;
  const statusMessage = queryValue(query.status);
  const errorMessage = queryValue(query.error);
  const monthLabel = new Intl.DateTimeFormat("de-DE", {
    timeZone: BERLIN_TIME_ZONE,
    month: "long",
    year: "numeric",
  }).format(new Date(monthRange.start));
  const requestedView = queryValue(query.view);
  const activeView = [
    "overview",
    "details",
    "assignments",
    "calendar",
    "time",
    "reports",
  ].includes(requestedView)
    ? requestedView
    : "overview";

  return (
    <>
      <div className="mb-4">
        <Link
          href="/admin/employees"
          className="text-sm font-extrabold text-brand underline"
        >
          Zurück zur Mitarbeiterliste
        </Link>
      </div>
      <PageHeader
        eyebrow="Mitarbeiterdetail"
        title={employee.full_name}
        text="Stammdaten, Zuweisungen, Einsatzplanung, echte Arbeitszeiten und betriebliche Meldungen."
      />

      {statusMessage ? (
        <p
          className="mb-5 rounded-lg border border-green-200 bg-green-50 p-4 text-sm font-bold text-green-900"
          role="status"
        >
          {statusMessage}
        </p>
      ) : null}
      {errorMessage ? (
        <p
          className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-900"
          role="alert"
        >
          {errorMessage}
        </p>
      ) : null}

      <PortalTabs
        activeId={activeView}
        label="Mitarbeiterbereiche"
        items={[
          { id: "overview", label: "Übersicht", href: `/admin/employees/${id}?view=overview` },
          { id: "details", label: "Stammdaten", href: `/admin/employees/${id}?view=details` },
          {
            id: "assignments",
            label: "Objekte & Pläne",
            href: `/admin/employees/${id}?view=assignments`,
            badge: assignmentsResult.data?.length ?? 0,
          },
          {
            id: "calendar",
            label: "Kalender",
            href: `/admin/employees/${id}?view=calendar`,
            badge: upcomingVisits.length,
          },
          { id: "time", label: "Zeiten", href: `/admin/employees/${id}?view=time&month=${selectedMonth}` },
          {
            id: "reports",
            label: "Meldungen",
            href: `/admin/employees/${id}?view=reports`,
            badge: operationalReportsResult.data?.length ?? 0,
          },
        ]}
      />

      {activeView === "details" ? (
        <Panel title="Stammdaten bearbeiten">
          <form
            action={updateEmployeeAction}
            className="grid gap-4 sm:grid-cols-2"
          >
            <input type="hidden" name="employeeId" value={employee.id} />
            <input
              type="hidden"
              name="updatedAt"
              value={employee.updated_at}
            />
            <Field label="Vorname">
              <input
                name="firstName"
                required
                defaultValue={employee.first_name ?? ""}
                autoComplete="given-name"
                className={inputClass}
              />
            </Field>
            <Field label="Nachname">
              <input
                name="lastName"
                required
                defaultValue={employee.last_name ?? ""}
                autoComplete="family-name"
                className={inputClass}
              />
            </Field>
            <Field label="Mitarbeiterkategorie">
              <select
                name="category"
                required
                defaultValue={employee.category ?? "minijob"}
                className={inputClass}
              >
                {Object.entries(EMPLOYEE_CATEGORY_LABELS).map(
                  ([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ),
                )}
              </select>
            </Field>
            <Field label="Firma (nur Freelancer)">
              <input
                name="companyName"
                defaultValue={employee.company_name ?? ""}
                autoComplete="organization"
                className={inputClass}
              />
            </Field>
            <Field label="E-Mail">
              <input
                name="email"
                type="email"
                required
                readOnly={Boolean(employee.user_id)}
                defaultValue={employee.email}
                autoComplete="email"
                className={`${inputClass} read-only:bg-slate-100 read-only:text-slate-600`}
              />
            </Field>
            <Field label="Telefon">
              <input
                name="phone"
                type="tel"
                required
                defaultValue={employee.phone ?? ""}
                autoComplete="tel"
                className={inputClass}
              />
            </Field>
            <Field label="Straße">
              <input
                name="street"
                required
                defaultValue={employee.address_street ?? ""}
                autoComplete="address-line1"
                className={inputClass}
              />
            </Field>
            <Field label="Hausnummer">
              <input
                name="houseNumber"
                required
                defaultValue={employee.address_house_number ?? ""}
                className={inputClass}
              />
            </Field>
            <Field label="Postleitzahl">
              <input
                name="postalCode"
                required
                inputMode="numeric"
                pattern="[0-9]{5}"
                defaultValue={employee.address_postal_code ?? ""}
                autoComplete="postal-code"
                className={inputClass}
              />
            </Field>
            <Field label="Ort">
              <input
                name="city"
                required
                defaultValue={employee.address_city ?? ""}
                autoComplete="address-level2"
                className={inputClass}
              />
            </Field>
            <Field label="Land">
              <input
                name="country"
                required
                defaultValue={employee.address_country || "Deutschland"}
                autoComplete="country-name"
                className={inputClass}
              />
            </Field>
            <div className="hidden sm:block" />
            <label className="block sm:col-span-2">
              <span className="text-sm font-bold text-slate-800">
                Interne Notiz
              </span>
              <textarea
                name="notes"
                rows={4}
                defaultValue={employee.notes ?? ""}
                className={inputClass}
              />
            </label>
            {employee.user_id ? (
              <p className="text-xs leading-5 text-slate-500 sm:col-span-2">
                Die Login-E-Mail ist nach Aktivierung des Portalzugangs gesperrt.
              </p>
            ) : null}
            <button className={`${buttonClass} sm:col-span-2`}>
              Stammdaten speichern
            </button>
          </form>
        </Panel>

      ) : null}

      {activeView === "overview" ? (
        <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
          <Panel title="Mitarbeiterprofil">
            <dl className="grid gap-4 text-sm sm:grid-cols-2 xl:grid-cols-1">
              <div>
                <dt className="font-bold text-slate-500">Kontakt</dt>
                <dd className="mt-1 font-semibold text-slate-950">
                  {employee.email} · {employee.phone || "Keine Telefonnummer"}
                </dd>
              </div>
              <div>
                <dt className="font-bold text-slate-500">Kategorie</dt>
                <dd className="mt-1 font-semibold text-slate-950">
                  {EMPLOYEE_CATEGORY_LABELS[category] ?? employee.category}
                </dd>
              </div>
              <div>
                <dt className="font-bold text-slate-500">Aktuelle Zuordnungen</dt>
                <dd className="mt-1 text-2xl font-black text-brand">
                  {(assignmentsResult.data ?? []).filter((assignment) => assignment.active).length}
                </dd>
              </div>
            </dl>
          </Panel>
        <Panel title="Konto und Einladung">
          <div className="flex flex-wrap gap-2">
            <StatusPill>
              {employeeStatusLabels[employee.status] ?? employee.status}
            </StatusPill>
            <StatusPill>
              Einladung: {invitationStatusLabels[invitationStatus] ?? "Nicht vorhanden"}
            </StatusPill>
          </div>
          <dl className="mt-4 grid gap-3 text-sm">
            <div>
              <dt className="font-bold text-slate-500">Kategorie</dt>
              <dd className="mt-1 font-semibold text-slate-900">
                {EMPLOYEE_CATEGORY_LABELS[category] ?? employee.category}
              </dd>
            </div>
            <div>
              <dt className="font-bold text-slate-500">Portalzugang</dt>
              <dd className="mt-1 font-semibold text-slate-900">
                {employee.user_id ? "Verknüpft" : "Noch nicht aktiviert"}
              </dd>
            </div>
            <div>
              <dt className="font-bold text-slate-500">Erstellt</dt>
              <dd className="mt-1 font-semibold text-slate-900">
                {formatGermanDate(employee.created_at, {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </dd>
            </div>
            {invitation?.expires_at ? (
              <div>
                <dt className="font-bold text-slate-500">Einladung gültig bis</dt>
                <dd className="mt-1 font-semibold text-slate-900">
                  {formatGermanDate(invitation.expires_at, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </dd>
              </div>
            ) : null}
          </dl>

          <div className="mt-5 grid gap-3">
            {invitation?.id && invitationStatus !== "accepted" ? (
              <form action={sendInvitationAction}>
                <input
                  type="hidden"
                  name="invitationId"
                  value={invitation.id}
                />
                <button className={buttonClass}>
                  {invitationStatus === "expired"
                    ? "Einladung erneuern"
                    : invitationStatus === "sent"
                      ? "Einladung erneut senden"
                      : "Einladung senden"}
                </button>
              </form>
            ) : null}
            {invitation?.id && invitationStatus === "sent" ? (
              <form action={revokeInvitationAction}>
                <input
                  type="hidden"
                  name="invitationId"
                  value={invitation.id}
                />
                <button className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-red-200 bg-white px-4 py-2 text-sm font-extrabold text-red-700 hover:bg-red-50">
                  Einladung widerrufen
                </button>
              </form>
            ) : null}
            {!invitation ? (
              <EmptyState
                title="Keine Einladung"
                text="Für diesen historischen Mitarbeiterdatensatz ist keine Einladung hinterlegt."
              />
            ) : null}
          </div>

          <form
            action={updateEmployeeStatusAction}
            className="mt-5 grid gap-3 border-t border-slate-200 pt-5"
          >
            <input type="hidden" name="employeeId" value={employee.id} />
            <Field label="Kontostatus">
              <select
                name="status"
                defaultValue={
                  employee.status === "disabled" ? "disabled" : "active"
                }
                className={inputClass}
              >
                <option value="active">Aktiv</option>
                <option value="disabled">Deaktiviert</option>
              </select>
            </Field>
            <button className={buttonClass}>Status speichern</button>
          </form>
        </Panel>
        </div>
      ) : null}

      {activeView === "assignments" ? (
      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title={`Zugeordnete Immobilien (${assignmentsResult.data?.length ?? 0})`}>
          {assignmentsResult.data?.length ? (
            <div className="grid gap-3">
              {assignmentsResult.data.map((assignment) => {
                const property = relation(assignment.properties);
                return (
                  <article
                    key={assignment.property_id}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-extrabold text-slate-950">
                          {property?.name ?? "Immobilie"}
                        </p>
                        <p className="mt-1 text-sm text-slate-600">
                          {property?.object_key || "ohne Objektschlüssel"}
                        </p>
                      </div>
                      <StatusPill>
                        {assignment.active ? "Zugewiesen" : "Historisch"}
                      </StatusPill>
                    </div>
                    <p className="mt-3 text-sm text-slate-650">
                      Gültig ab {formatGermanDate(`${assignment.starts_on}T12:00:00Z`)}
                      {assignment.ends_on
                        ? ` bis ${formatGermanDate(`${assignment.ends_on}T12:00:00Z`)}`
                        : " · ohne Enddatum"}
                    </p>
                    <Link
                      href={`/admin/properties/${assignment.property_id}`}
                      className="mt-3 inline-flex text-sm font-extrabold text-brand underline"
                    >
                      Immobilie öffnen
                    </Link>
                  </article>
                );
              })}
            </div>
          ) : (
            <EmptyState
              title="Keine Immobilienzuweisung"
              text="Dieser Mitarbeiter ist noch keiner Immobilie zugeordnet."
            />
          )}
        </Panel>

        <Panel title={`Einsatzpläne (${plans.length})`}>
          {plans.length ? (
            <div className="grid gap-3">
              {plans.map((plan) => {
                const property = relation(plan.properties);
                const isPrimary = plan.primary_employee_id === employee.id;
                return (
                  <article
                    key={plan.id}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-extrabold text-slate-950">{plan.label}</p>
                        <p className="mt-1 text-sm text-slate-600">
                          {property?.name ?? "Immobilie"}
                        </p>
                      </div>
                      <StatusPill>{plan.status}</StatusPill>
                    </div>
                    <p className="mt-3 text-sm text-slate-650">
                      {isPrimary ? "Hauptmitarbeiter" : "Zusätzlich zugewiesen"}
                    </p>
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
                  </article>
                );
              })}
            </div>
          ) : (
            <EmptyState
              title="Keine Einsatzpläne"
              text="Für diesen Mitarbeiter ist noch kein Einsatzplan hinterlegt."
            />
          )}
        </Panel>
      </div>
      ) : null}

      {activeView === "calendar" ? (
      <div>
        <Panel title={`Kommende Einsätze / Kalender (${upcomingVisits.length})`}>
          {upcomingVisits.length ? (
            <div className="grid gap-3 lg:grid-cols-2">
              {upcomingVisits.map((visit) => {
                const property = relation(visit.properties);
                return (
                  <article
                    key={visit.id}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-extrabold text-slate-950">
                          {property?.name ?? "Immobilie"}
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-700">
                          {formatGermanDate(`${visit.scheduled_date}T12:00:00Z`, {
                            weekday: "long",
                            day: "2-digit",
                            month: "long",
                            year: "numeric",
                          })}
                          {visit.planned_start_time
                            ? ` · ${visit.planned_start_time.slice(0, 5)} Uhr`
                            : ""}
                        </p>
                      </div>
                      <StatusPill>
                        {VISIT_STATUS_LABELS[visit.status] ?? visit.status}
                      </StatusPill>
                    </div>
                    <p className="mt-3 text-sm text-slate-650">
                      {visitAddress(visit)}
                    </p>
                    <Link
                      href={`/admin/properties/${visit.property_id}?view=einsaetze`}
                      className="mt-3 inline-flex text-sm font-extrabold text-brand underline"
                    >
                      Einsatz in Immobilie öffnen
                    </Link>
                  </article>
                );
              })}
            </div>
          ) : (
            <EmptyState
              title="Keine kommenden Einsätze"
              text="Geplante Einsätze aus primären und zusätzlichen Plan-Zuweisungen erscheinen hier."
            />
          )}
        </Panel>
      </div>
      ) : null}

      {activeView === "time" ? (
      <div>
        <Panel title={`Arbeitszeiten · ${monthLabel}`}>
          <form
            method="get"
            className="mb-5 flex max-w-md flex-col gap-3 sm:flex-row sm:items-end"
          >
            <input type="hidden" name="view" value="time" />
            <Field label="Monat">
              <input
                name="month"
                type="month"
                defaultValue={selectedMonth}
                className={inputClass}
              />
            </Field>
            <button className={buttonClass}>Monat anzeigen</button>
          </form>

          <div className="mb-5 rounded-xl bg-brand p-4 text-white">
            <p className="text-xs font-black uppercase tracking-wide text-blue-200">
              Monatssumme tatsächlicher Ausführung
            </p>
            <p className="mt-2 text-3xl font-black">
              {Math.floor(totalMinutes / 60)} Std. {totalMinutes % 60} Min.
            </p>
            {!employee.user_id ? (
              <p className="mt-2 text-sm text-blue-100">
                Noch kein Portalprofil verknüpft; deshalb können keine echten Zeiten
                über den Ausführenden zugeordnet werden.
              </p>
            ) : null}
          </div>

          {workedVisits.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <th className="p-3">Datum</th>
                    <th className="p-3">Immobilie</th>
                    <th className="p-3">Gebäude / Adresse</th>
                    <th className="p-3">Start</th>
                    <th className="p-3">Ende</th>
                    <th className="p-3">Dauer</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {workedVisits.map((visit) => {
                    const property = relation(visit.properties);
                    const minutes = durationMinutes(visit);
                    return (
                      <tr key={visit.id} className="border-b border-slate-100">
                        <td className="p-3 font-bold">
                          {visit.started_at
                            ? formatGermanDate(visit.started_at)
                            : formatGermanDate(`${visit.scheduled_date}T12:00:00Z`)}
                        </td>
                        <td className="p-3">{property?.name ?? "Immobilie"}</td>
                        <td className="p-3 text-slate-600">
                          {visitAddress(visit)}
                        </td>
                        <td className="p-3">{formatTime(visit.started_at)}</td>
                        <td className="p-3">
                          {visit.completed_at ? formatTime(visit.completed_at) : "läuft"}
                        </td>
                        <td className="p-3 font-black">
                          {formatDuration(minutes)} Std.
                        </td>
                        <td className="p-3">
                          <StatusPill>
                            {VISIT_STATUS_LABELS[visit.status] ?? visit.status}
                          </StatusPill>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title="Keine Arbeitszeiten im gewählten Monat"
              text="Nur Einsätze, die dieser Mitarbeiter tatsächlich gestartet hat, werden hier berücksichtigt."
            />
          )}
        </Panel>
      </div>
      ) : null}

      {activeView === "reports" ? (
      <div>
        <Panel
          title={`Eigene betriebliche Meldungen (${operationalReportsResult.data?.length ?? 0})`}
        >
          {operationalReportsResult.data?.length ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {operationalReportsResult.data.map((report) => {
                const property = relation(report.properties);
                const building = relation(report.buildings);
                return (
                  <article
                    key={report.id}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">
                          {operationalCategoryLabels[report.category] ?? report.category}
                        </p>
                        <h3 className="mt-1 font-extrabold text-slate-950">
                          {report.title}
                        </h3>
                      </div>
                      <StatusPill>
                        {operationalStatusLabels[report.status] ?? report.status}
                      </StatusPill>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-700">
                      {report.description}
                    </p>
                    <dl className="mt-3 grid gap-2 text-sm text-slate-650">
                      <div>
                        <dt className="inline font-bold text-slate-900">Immobilie: </dt>
                        <dd className="inline">{property?.name ?? "–"}</dd>
                      </div>
                      <div>
                        <dt className="inline font-bold text-slate-900">Gebäude: </dt>
                        <dd className="inline">
                          {building
                            ? building.label || building.formatted_address
                            : "Immobilienweit"}
                        </dd>
                      </div>
                      <div>
                        <dt className="inline font-bold text-slate-900">Zeitpunkt: </dt>
                        <dd className="inline">
                          {formatGermanDate(report.created_at, {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </dd>
                      </div>
                      <div>
                        <dt className="inline font-bold text-slate-900">Dringlichkeit: </dt>
                        <dd className="inline">{report.urgency}</dd>
                      </div>
                    </dl>
                  </article>
                );
              })}
            </div>
          ) : (
            <EmptyState
              title="Keine betrieblichen Meldungen"
              text="Von diesem Mitarbeiter abgegebene betriebliche Meldungen erscheinen hier."
            />
          )}
        </Panel>
      </div>
      ) : null}
    </>
  );
}
