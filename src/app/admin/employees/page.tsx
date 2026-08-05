import Link from "next/link";
import { revokeInvitationAction, sendInvitationAction } from "@/app/actions/auth";
import { createEmployeeAction, updateEmployeeStatusAction } from "@/app/actions/portalAdmin";
import { EmptyState, Field, PageHeader, Panel, StatusPill, buttonClass, inputClass } from "@/components/portal/PortalUI";
import { PaginationNav } from "@/components/portal/PaginationNav";
import { EMPLOYEE_CATEGORY_LABELS, berlinIsoDate, formatGermanDate, parseBerlinDateTimeLocal } from "@/lib/portal/core";
import { requireAdminContext } from "@/lib/portal/access";
import { paginateItems } from "@/lib/portal/listing";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const employeeStatusLabels: Record<string, string> = { active: "Aktiv", invited: "Eingeladen", disabled: "Deaktiviert" };
const invitationStatusLabels: Record<string, string> = {
  draft: "Entwurf",
  sent: "Versendet",
  pending: "Versendet",
  accepted: "Angenommen",
  expired: "Abgelaufen",
  revoked: "Widerrufen",
};

function queryValue(params: Awaited<SearchParams>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function berlinMonthRange(monthValue: string) {
  const [year, month] = monthValue.split("-").map(Number);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const start = parseBerlinDateTimeLocal(`${monthValue}-01T00:00`);
  const end = parseBerlinDateTimeLocal(`${nextYear}-${String(nextMonth).padStart(2, "0")}-01T00:00`);
  if (!start || !end) throw new Error("Der Stundenmonat ist ungültig.");
  return { startMs: new Date(start).getTime(), endMs: new Date(end).getTime() };
}

export default async function AdminEmployeesPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const search = queryValue(params, "q").trim().toLocaleLowerCase("de");
  const categoryFilter = queryValue(params, "category");
  const statusFilter = queryValue(params, "employeeStatus");
  const sort = queryValue(params, "sort") || "newest";
  const selectedMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(queryValue(params, "month")) ? queryValue(params, "month") : berlinIsoDate().slice(0, 7);
  const monthRange = berlinMonthRange(selectedMonth);
  const { admin: supabase } = await requireAdminContext();
  const [
    { data: employees, error: employeesError },
    { data: invitations, error: invitationsError },
    { data: assignments, error: assignmentsError },
    { data: visitPlanEmployees, error: visitPlanEmployeesError },
    { data: properties, error: propertiesError },
    { data: visits, error: visitsError },
  ] = await Promise.all([
    supabase.from("employee_profiles").select("*").order("created_at", { ascending: false }),
    supabase.from("invitations").select("*").eq("role", "employee").order("created_at", { ascending: false }),
    supabase.from("property_employee_assignments").select("*").eq("active", true),
    supabase.from("visit_plan_employees").select("visit_plan_id,employee_id"),
    supabase.from("properties").select("id,name,status"),
    supabase.from("visits").select("*").order("scheduled_date", { ascending: true }).order("planned_start_time", { ascending: true }),
  ]);
  if (employeesError || invitationsError || assignmentsError || visitPlanEmployeesError || propertiesError || visitsError) {
    throw new Error("Die Mitarbeiterliste konnte nicht vollständig geladen werden.");
  }

  const propertyById = new Map((properties ?? []).map((property) => [property.id, property]));
  const invitationByEmployee = new Map<string, Record<string, unknown>>();
  for (const invitation of invitations ?? []) {
    if (invitation.employee_id && !invitationByEmployee.has(invitation.employee_id)) invitationByEmployee.set(invitation.employee_id, invitation);
  }
  const additionalPlanIdsByEmployee = new Map<string, Set<string>>();
  for (const assignment of visitPlanEmployees ?? []) {
    const planIds = additionalPlanIdsByEmployee.get(assignment.employee_id) ?? new Set<string>();
    planIds.add(assignment.visit_plan_id);
    additionalPlanIdsByEmployee.set(assignment.employee_id, planIds);
  }

  const filteredEmployees = (employees ?? []).filter((employee) => {
    const haystack = [employee.full_name, employee.email, employee.phone, employee.company_name, employee.address_city]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("de");
    return (
      (!search || haystack.includes(search)) &&
      (!categoryFilter || employee.category === categoryFilter) &&
      (!statusFilter || employee.status === statusFilter)
    );
  }).sort((left, right) => {
    if (sort === "name") return String(left.full_name).localeCompare(String(right.full_name), "de");
    if (sort === "oldest") return String(left.created_at).localeCompare(String(right.created_at));
    return String(right.created_at).localeCompare(String(left.created_at));
  });
  const employeePage = paginateItems(filteredEmployees, queryValue(params, "page"));

  return (
    <>
      <PageHeader
        eyebrow="Mitarbeiter"
        title="Mitarbeiter verwalten"
        text="Beschäftigungsart, Adresse, Portalstatus, Immobilienzuweisungen und Monatsstunden zentral verwalten."
      />

      {queryValue(params, "status") ? <p className="mb-5 rounded-lg border border-green-200 bg-green-50 p-4 text-sm font-bold text-green-900" role="status">{queryValue(params, "status")}</p> : null}
      {queryValue(params, "error") ? <p className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-900" role="alert">{queryValue(params, "error")}</p> : null}

      <div className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
        <Panel title="Mitarbeiter anlegen">
          <form action={createEmployeeAction} className="grid gap-4 sm:grid-cols-2">
            <Field label="Vorname"><input name="firstName" required autoComplete="given-name" className={inputClass} /></Field>
            <Field label="Nachname"><input name="lastName" required autoComplete="family-name" className={inputClass} /></Field>
            <Field label="Mitarbeiterkategorie">
              <select name="category" required defaultValue="minijob" className={inputClass}>
                {Object.entries(EMPLOYEE_CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </Field>
            <Field label="Firma (nur Freelancer)"><input name="companyName" autoComplete="organization" className={inputClass} /></Field>
            <Field label="E-Mail"><input name="email" type="email" required autoComplete="email" className={inputClass} /></Field>
            <Field label="Telefon"><input name="phone" type="tel" required autoComplete="tel" className={inputClass} /></Field>
            <Field label="Straße"><input name="street" required autoComplete="address-line1" className={inputClass} /></Field>
            <Field label="Hausnummer"><input name="houseNumber" required className={inputClass} /></Field>
            <Field label="Postleitzahl"><input name="postalCode" required inputMode="numeric" autoComplete="postal-code" pattern="[0-9]{5}" className={inputClass} /></Field>
            <Field label="Ort"><input name="city" required autoComplete="address-level2" className={inputClass} /></Field>
            <Field label="Land"><input name="country" required defaultValue="Deutschland" autoComplete="country-name" className={inputClass} /></Field>
            <label className="block sm:col-span-2"><span className="text-sm font-bold text-slate-800">Interne Notiz</span><textarea name="notes" rows={3} className={inputClass} /></label>
            <p className="text-xs leading-5 text-slate-500 sm:col-span-2">Nach dem Speichern kann die Einladung gezielt aus der Mitarbeiterliste versendet werden.</p>
            <button className={`${buttonClass} sm:col-span-2`}>Mitarbeiter speichern</button>
          </form>
        </Panel>

        <div className="grid content-start gap-5">
          <Panel title="Suchen und filtern">
            <form method="get" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
              <Field label="Suche"><input name="q" defaultValue={queryValue(params, "q")} placeholder="Name, E-Mail, Ort …" className={inputClass} /></Field>
              <Field label="Kategorie"><select name="category" defaultValue={categoryFilter} className={inputClass}><option value="">Alle Kategorien</option>{Object.entries(EMPLOYEE_CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
              <Field label="Kontostatus"><select name="employeeStatus" defaultValue={statusFilter} className={inputClass}><option value="">Alle Status</option><option value="active">Aktiv</option><option value="invited">Eingeladen</option><option value="disabled">Deaktiviert</option></select></Field>
              <Field label="Stundenmonat"><input name="month" type="month" defaultValue={selectedMonth} className={inputClass} /></Field>
              <Field label="Sortierung"><select name="sort" defaultValue={sort} className={inputClass}><option value="newest">Neueste zuerst</option><option value="oldest">Älteste zuerst</option><option value="name">Name A–Z</option></select></Field>
              <div className="flex items-end gap-2"><button className={buttonClass}>Anwenden</button><Link href="/admin/employees" className="inline-flex min-h-11 items-center px-2 text-sm font-bold text-brand underline">Zurücksetzen</Link></div>
            </form>
          </Panel>

          <Panel title={`Mitarbeiterliste (${filteredEmployees.length})`}>
            {filteredEmployees.length ? (
              <>
                <div className="grid gap-4">
                {employeePage.items.map((employee) => {
                  const category = employee.category as keyof typeof EMPLOYEE_CATEGORY_LABELS;
                  const invitation = invitationByEmployee.get(employee.id);
                  const inviteStatus = String(invitation?.status ?? "draft");
                  const employeeAssignments = (assignments ?? []).filter((assignment) => assignment.employee_id === employee.id);
                  const additionalPlanIds = additionalPlanIdsByEmployee.get(employee.id) ?? new Set<string>();
                  const scheduledVisits = (visits ?? []).filter((visit) =>
                    visit.primary_employee_id === employee.id ||
                    (visit.visit_plan_id && additionalPlanIds.has(visit.visit_plan_id)),
                  );
                  const nextVisit = scheduledVisits.find((visit) => visit.status === "scheduled" && visit.scheduled_date >= berlinIsoDate());
                  const workedVisits = (visits ?? []).filter((visit) => visit.started_by === employee.user_id);
                  const monthMinutes = workedVisits
                    .filter((visit) => {
                      if (visit.status !== "completed" || !visit.started_at) return false;
                      const startedAt = new Date(visit.started_at).getTime();
                      return startedAt >= monthRange.startMs && startedAt < monthRange.endMs;
                    })
                    .reduce((total, visit) => total + Number(visit.duration_minutes || 0), 0);

                  return (
                    <article key={employee.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <h2 className="text-lg font-extrabold text-slate-950">{employee.full_name}</h2>
                          <p className="mt-1 text-sm text-slate-650">{EMPLOYEE_CATEGORY_LABELS[category] ?? employee.category}{employee.company_name ? ` · ${employee.company_name}` : ""}</p>
                          <p className="mt-1 break-words text-sm text-slate-650">{employee.email} · {employee.phone || "keine Telefonnummer"}</p>
                          <p className="mt-1 text-sm text-slate-650">{employee.address_formatted || "Keine Meldeadresse"}</p>
                        </div>
                        <div className="flex flex-wrap gap-2"><StatusPill>{employeeStatusLabels[employee.status] ?? employee.status}</StatusPill><StatusPill>Einladung: {invitationStatusLabels[inviteStatus] ?? inviteStatus}</StatusPill></div>
                      </div>

                      <dl className="mt-4 grid gap-3 rounded-lg bg-white p-3 text-sm sm:grid-cols-3">
                        <div><dt className="font-bold text-slate-500">Immobilien</dt><dd className="mt-1 font-semibold text-slate-900">{employeeAssignments.length ? employeeAssignments.map((assignment) => propertyById.get(assignment.property_id)?.name).filter(Boolean).join(", ") : "Keine Zuweisung"}</dd></div>
                        <div><dt className="font-bold text-slate-500">Nächster Einsatz</dt><dd className="mt-1 font-semibold text-slate-900">{nextVisit ? `${formatGermanDate(`${nextVisit.scheduled_date}T12:00:00Z`)}${nextVisit.planned_start_time ? ` · ${nextVisit.planned_start_time.slice(0, 5)} Uhr` : ""}` : "Kein Termin"}</dd></div>
                        <div><dt className="font-bold text-slate-500">Stunden {selectedMonth}</dt><dd className="mt-1 font-extrabold text-slate-950">{(monthMinutes / 60).toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} Std.</dd></div>
                      </dl>

                      <div className="mt-4 flex flex-wrap gap-3">
                        <Link
                          href={`/admin/employees/${employee.id}`}
                          className="inline-flex min-h-11 items-center justify-center rounded-md border border-brand/20 bg-white px-4 py-2 text-sm font-extrabold text-brand hover:bg-brand-soft"
                        >
                          Details bearbeiten
                        </Link>
                        {invitation?.id && inviteStatus !== "accepted" ? <form action={sendInvitationAction}><input type="hidden" name="invitationId" value={String(invitation.id)} /><button className={buttonClass}>{["sent", "pending"].includes(inviteStatus) ? "Einladung erneut senden" : "Einladung senden"}</button></form> : null}
                        {invitation?.id && ["sent", "pending"].includes(inviteStatus) ? <form action={revokeInvitationAction}><input type="hidden" name="invitationId" value={String(invitation.id)} /><button className="inline-flex min-h-11 items-center justify-center rounded-md border border-red-200 bg-white px-4 py-2 text-sm font-extrabold text-red-700 hover:bg-red-50">Einladung widerrufen</button></form> : null}
                        <form action={updateEmployeeStatusAction} className="flex flex-1 flex-wrap gap-2 sm:justify-end">
                          <input type="hidden" name="employeeId" value={employee.id} />
                          <select name="status" defaultValue={employee.status === "disabled" ? "disabled" : "active"} aria-label={`Status für ${employee.full_name}`} className="min-h-11 rounded-md border border-slate-300 bg-white px-3 text-sm font-bold"><option value="active">Aktiv</option><option value="disabled">Deaktiviert</option></select>
                          <button className="inline-flex min-h-11 items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-extrabold text-slate-800 hover:border-brand hover:text-brand">Status speichern</button>
                        </form>
                      </div>
                    </article>
                  );
                })}
                </div>
                <PaginationNav
                  pathname="/admin/employees"
                  query={{ q: queryValue(params, "q"), category: categoryFilter, employeeStatus: statusFilter, month: selectedMonth, sort }}
                  page={employeePage.page}
                  totalPages={employeePage.totalPages}
                  totalItems={employeePage.totalItems}
                />
              </>
            ) : <EmptyState title="Keine Mitarbeiter gefunden" text="Passen Sie die Filter an oder legen Sie den ersten Mitarbeiter an." />}
          </Panel>
        </div>
      </div>
    </>
  );
}
