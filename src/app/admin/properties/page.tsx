import Link from "next/link";
import { createPropertyAction, generateVisitsAction } from "@/app/actions/portalAdmin";
import { EmptyState, Field, PageHeader, Panel, StatusPill, buttonClass, inputClass } from "@/components/portal/PortalUI";
import { PaginationNav } from "@/components/portal/PaginationNav";
import { AcceptedOfferPropertyFields } from "@/components/portal/AcceptedOfferPropertyFields";
import { CUSTOMER_CATEGORY_LABELS, PROPERTY_TYPE_LABELS, formatCents, formatGermanDate } from "@/lib/portal/core";
import { requireAdminContext } from "@/lib/portal/access";
import { paginateItems } from "@/lib/portal/listing";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const propertyStatusLabels: Record<string, string> = { planning: "In Planung", active: "Aktiv", paused: "Pausiert", archived: "Archiviert" };

function queryValue(params: Awaited<SearchParams>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function customerLabel(customer: Record<string, unknown> | undefined) {
  if (!customer) return "Unbekannter Kunde";
  const person = [customer.first_name, customer.last_name].filter(Boolean).join(" ");
  return String(customer.company_name || person || customer.contact_name || customer.email || "Unbekannter Kunde");
}

export default async function AdminPropertiesPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const search = queryValue(params, "q").trim().toLocaleLowerCase("de");
  const customerFilter = queryValue(params, "customerId");
  const employeeFilter = queryValue(params, "employeeId");
  const statusFilter = queryValue(params, "propertyStatus");
  const typeFilter = queryValue(params, "propertyType");
  const cityFilter = queryValue(params, "city");
  const serviceFilter = queryValue(params, "serviceKey");
  const winterOnly = queryValue(params, "winter") === "true";
  const sort = queryValue(params, "sort") || "newest";
  const { admin: supabase } = await requireAdminContext();
  const [
    { data: properties, error: propertiesError },
    { data: customers, error: customersError },
    { data: buildings, error: buildingsError },
    { data: assignments, error: assignmentsError },
    { data: employees, error: employeesError },
    { data: services, error: servicesError },
    { data: visits, error: visitsError },
    { data: propertySettings, error: propertySettingsError },
    { data: acceptedOffers, error: acceptedOffersError },
  ] = await Promise.all([
    supabase.from("properties").select("*").order("created_at", { ascending: false }),
    supabase.from("customers").select("*").order("company_name"),
    supabase
      .from("buildings")
      .select("id,property_id,label,formatted_address,city,status")
      .neq("status", "archived"),
    supabase.from("property_employee_assignments").select("*").eq("active", true),
    supabase.from("employee_profiles").select("id,full_name,status").neq("status", "disabled").order("full_name"),
    supabase.from("property_services").select("*").eq("status", "active"),
    supabase.from("visits").select("*").eq("status", "scheduled").order("scheduled_date", { ascending: true }).order("planned_start_time", { ascending: true }),
    supabase.from("property_admin_settings").select("property_id,monthly_fee_net_cents"),
    supabase
      .from("offer_versions")
      .select("id,offer_id,customer_id,offer_number,title,object_label,object_address,offer_property_links(id)")
      .eq("lifecycle_status", "accepted")
      .order("accepted_at", { ascending: false }),
  ]);
  if (
    propertiesError || customersError || buildingsError || assignmentsError ||
    employeesError || servicesError || visitsError || propertySettingsError || acceptedOffersError
  ) {
    throw new Error("Die Immobilienliste konnte nicht vollständig geladen werden.");
  }

  const customerById = new Map((customers ?? []).map((customer) => [customer.id, customer]));
  const employeeById = new Map((employees ?? []).map((employee) => [employee.id, employee]));
  const settingsByPropertyId = new Map((propertySettings ?? []).map((settings) => [settings.property_id, settings]));
  const selectableCustomers = (customers ?? []).filter((customer) => customer.status !== "archived");
  const acceptedOfferOptions = (acceptedOffers ?? [])
    .filter((offer) => !offer.offer_property_links?.length)
    .map((offer) => ({
      id: offer.id,
      customerId: offer.customer_id,
      number: offer.offer_number,
      title: offer.title,
      objectLabel: offer.object_label,
      objectAddress: offer.object_address,
    }));
  const cityOptions = [...new Set((buildings ?? []).map((building) => building.city).filter(Boolean))].sort((left, right) => left.localeCompare(right, "de"));
  const serviceOptions = [...new Map((services ?? []).map((service) => [service.service_key, service.name])).entries()]
    .sort((left, right) => left[1].localeCompare(right[1], "de"));
  const filteredProperties = (properties ?? []).filter((property) => {
    const propertyBuildings = (buildings ?? []).filter((building) => building.property_id === property.id);
    const propertyAssignments = (assignments ?? []).filter((assignment) => assignment.property_id === property.id);
    const propertyServices = (services ?? []).filter((service) => service.property_id === property.id);
    const haystack = [
      property.name,
      property.object_key,
      customerLabel(customerById.get(property.customer_id)),
      ...propertyBuildings.flatMap((building) => [building.formatted_address, building.city]),
    ]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("de");
    return (
      (!search || haystack.includes(search)) &&
      (!customerFilter || property.customer_id === customerFilter) &&
      (!employeeFilter || propertyAssignments.some((assignment) => assignment.employee_id === employeeFilter)) &&
      (!statusFilter || property.status === statusFilter) &&
      (!typeFilter || property.property_type === typeFilter) &&
      (!cityFilter || propertyBuildings.some((building) => building.city === cityFilter)) &&
      (!serviceFilter || propertyServices.some((service) => service.service_key === serviceFilter)) &&
      (!winterOnly || propertyServices.some((service) => service.service_key === "winterdienst"))
    );
  }).sort((left, right) => {
    if (sort === "name") return String(left.name).localeCompare(String(right.name), "de");
    if (sort === "customer") return customerLabel(customerById.get(left.customer_id)).localeCompare(customerLabel(customerById.get(right.customer_id)), "de");
    if (sort === "oldest") return String(left.created_at).localeCompare(String(right.created_at));
    return String(right.created_at).localeCompare(String(left.created_at));
  });
  const propertyPage = paginateItems(filteredProperties, queryValue(params, "page"));

  return (
    <>
      <PageHeader
        eyebrow="Immobilien"
        title="Immobilien und Gebäude"
        text="Immobilien sind die zentrale Vertrags-, Einsatz- und Abrechnungseinheit. Das erste Gebäude wird direkt mit angelegt."
      />
      {queryValue(params, "status") ? <p className="mb-5 rounded-lg border border-green-200 bg-green-50 p-4 text-sm font-bold text-green-900" role="status">{queryValue(params, "status")}</p> : null}
      {queryValue(params, "error") ? <p className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-900" role="alert">{queryValue(params, "error")}</p> : null}

      <div className="grid gap-5">
        <Panel title="Immobilie mit erstem Gebäude anlegen">
          <form action={createPropertyAction} className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <AcceptedOfferPropertyFields
              customers={selectableCustomers.map((customer) => {
                const category = customer.category as keyof typeof CUSTOMER_CATEGORY_LABELS;
                return {
                  id: customer.id,
                  label: `${customerLabel(customer)} · ${CUSTOMER_CATEGORY_LABELS[category] ?? customer.category}`,
                };
              })}
              offers={acceptedOfferOptions}
            />
            <Field label="Immobilienname"><input name="name" required placeholder="z. B. WEG Musterstraße 1–7" className={inputClass} /></Field>
            <Field label="Interner Objektschlüssel"><input name="objectKey" placeholder="optional" className={inputClass} /></Field>
            <Field label="Objektart">
              <select name="propertyType" required defaultValue="multi_family" className={inputClass}>
                {Object.entries(PROPERTY_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </Field>
            <Field label="Immobilienstatus">
              <select name="status" required defaultValue="active" className={inputClass}>
                <option value="planning">In Planung</option>
                <option value="active">Aktiv</option>
                <option value="paused">Pausiert</option>
              </select>
            </Field>
            <Field label="WEG-/Eigentümerbezeichnung"><input name="ownershipName" className={inputClass} /></Field>
            <Field label="Monatliche Grundvergütung netto"><input name="monthlyFee" required inputMode="decimal" defaultValue="0,00" className={inputClass} /></Field>
            <Field label="Umsatzsteuersatz in %"><input name="taxRate" required inputMode="decimal" defaultValue="19" className={inputClass} /></Field>
            <Field label="Maximale Einsatzdauer in Minuten"><input name="maxVisitMinutes" required type="number" min="1" max="1440" defaultValue="120" className={inputClass} /></Field>
            <Field label="Betreuungsbeginn"><input name="careStartDate" required type="date" className={inputClass} /></Field>
            <Field label="Bezeichnung erstes Gebäude"><input name="buildingLabel" placeholder="z. B. Haus A" className={inputClass} /></Field>
            <Field label="Straße"><input name="street" required autoComplete="address-line1" className={inputClass} /></Field>
            <Field label="Hausnummer"><input name="houseNumber" required className={inputClass} /></Field>
            <Field label="Postleitzahl"><input name="postalCode" required inputMode="numeric" pattern="[0-9]{5}" autoComplete="postal-code" className={inputClass} /></Field>
            <Field label="Ort"><input name="city" required autoComplete="address-level2" className={inputClass} /></Field>
            <Field label="Land"><input name="country" required defaultValue="Deutschland" autoComplete="country-name" className={inputClass} /></Field>
            <label className="block md:col-span-2"><span className="text-sm font-bold text-slate-800">Interne Zugangs- oder Objekthinweise</span><textarea name="accessNotes" rows={3} className={inputClass} /></label>
            <label className="block md:col-span-2"><span className="text-sm font-bold text-slate-800">Internes Briefing</span><textarea name="internalBriefing" rows={3} className={inputClass} /></label>
            <button className={`${buttonClass} md:col-span-2 xl:col-span-4`}>Immobilie und Gebäude anlegen</button>
          </form>
        </Panel>

        <Panel title="Immobilien filtern">
          <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <Field label="Suche"><input name="q" defaultValue={queryValue(params, "q")} placeholder="Name, Schlüssel, Ort …" className={inputClass} /></Field>
            <Field label="Kunde"><select name="customerId" defaultValue={customerFilter} className={inputClass}><option value="">Alle Kunden</option>{(customers ?? []).map((customer) => <option key={customer.id} value={customer.id}>{customerLabel(customer)}</option>)}</select></Field>
            <Field label="Mitarbeiter"><select name="employeeId" defaultValue={employeeFilter} className={inputClass}><option value="">Alle Mitarbeiter</option>{(employees ?? []).map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name}</option>)}</select></Field>
            <Field label="Status"><select name="propertyStatus" defaultValue={statusFilter} className={inputClass}><option value="">Alle Status</option><option value="planning">In Planung</option><option value="active">Aktiv</option><option value="paused">Pausiert</option><option value="archived">Archiviert</option></select></Field>
            <Field label="Objektart"><select name="propertyType" defaultValue={typeFilter} className={inputClass}><option value="">Alle Objektarten</option>{Object.entries(PROPERTY_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
            <Field label="Ort"><select name="city" defaultValue={cityFilter} className={inputClass}><option value="">Alle Orte</option>{cityOptions.map((city) => <option key={city} value={city}>{city}</option>)}</select></Field>
            <Field label="Leistung"><select name="serviceKey" defaultValue={serviceFilter} className={inputClass}><option value="">Alle Leistungen</option>{serviceOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field>
            <Field label="Sortierung"><select name="sort" defaultValue={sort} className={inputClass}><option value="newest">Neueste zuerst</option><option value="oldest">Älteste zuerst</option><option value="name">Immobilie A–Z</option><option value="customer">Kunde A–Z</option></select></Field>
            <div className="grid content-end gap-2">
              <label className="flex min-h-11 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700"><input type="checkbox" name="winter" value="true" defaultChecked={winterOnly} /> Winterdienst aktiv</label>
              <button className={buttonClass}>Filter anwenden</button>
            </div>
          </form>
          <div className="mt-3 flex flex-wrap justify-between gap-3">
            <Link href="/admin/properties" className="text-sm font-bold text-brand underline">Filter zurücksetzen</Link>
            <form action={generateVisitsAction}><button className="inline-flex min-h-11 items-center justify-center rounded-md border border-brand/20 bg-white px-4 py-2 text-sm font-extrabold text-brand hover:bg-brand-soft">Termine für 90 Tage ergänzen</button></form>
          </div>
        </Panel>

        <Panel title={`Immobilienliste (${filteredProperties.length})`}>
          {filteredProperties.length ? (
            <>
              <div className="grid gap-4 lg:grid-cols-2">
              {propertyPage.items.map((property) => {
                const propertyBuildings = (buildings ?? []).filter((building) => building.property_id === property.id);
                const propertyAssignments = (assignments ?? []).filter((assignment) => assignment.property_id === property.id);
                const propertyServices = (services ?? []).filter((service) => service.property_id === property.id);
                const nextVisit = (visits ?? []).find((visit) => visit.property_id === property.id);
                const type = property.property_type as keyof typeof PROPERTY_TYPE_LABELS;
                return (
                  <article key={property.id} className="flex flex-col rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="text-lg font-extrabold text-slate-950">{property.name}</h2>
                        <p className="mt-1 text-sm text-slate-650">{property.object_key || "ohne Objektschlüssel"} · {PROPERTY_TYPE_LABELS[type] ?? property.property_type}</p>
                        <p className="mt-1 text-sm font-semibold text-slate-700">{customerLabel(customerById.get(property.customer_id))}</p>
                      </div>
                      <StatusPill>{propertyStatusLabels[property.status] ?? property.status}</StatusPill>
                    </div>
                    <div className="mt-4 grid gap-2 text-sm text-slate-650">
                      <p><strong className="text-slate-900">Gebäude:</strong> {propertyBuildings.length} · {propertyBuildings.map((building) => building.formatted_address).join(" | ") || "keine Adresse"}</p>
                      <p><strong className="text-slate-900">Team:</strong> {propertyAssignments.map((assignment) => employeeById.get(assignment.employee_id)?.full_name).filter(Boolean).join(", ") || "nicht zugewiesen"}</p>
                      <p><strong className="text-slate-900">Leistungen:</strong> {propertyServices.length}{propertyServices.some((service) => service.service_key === "winterdienst") ? " · Winterdienst" : ""}</p>
                      <p><strong className="text-slate-900">Nächste Ausführung:</strong> {nextVisit ? `${formatGermanDate(`${nextVisit.scheduled_date}T12:00:00Z`)}${nextVisit.planned_start_time ? ` · ${nextVisit.planned_start_time.slice(0, 5)} Uhr` : ""}` : "nicht geplant"}</p>
                      <p><strong className="text-slate-900">Grundvergütung:</strong> {formatCents(Number(settingsByPropertyId.get(property.id)?.monthly_fee_net_cents || 0))} netto</p>
                    </div>
                    <Link href={`/admin/properties/${property.id}`} className={`${buttonClass} mt-4`}>Immobilie öffnen</Link>
                  </article>
                );
              })}
              </div>
              <PaginationNav
                pathname="/admin/properties"
                query={{ q: queryValue(params, "q"), customerId: customerFilter, employeeId: employeeFilter, propertyStatus: statusFilter, propertyType: typeFilter, city: cityFilter, serviceKey: serviceFilter, winter: winterOnly ? "true" : "", sort }}
                page={propertyPage.page}
                totalPages={propertyPage.totalPages}
                totalItems={propertyPage.totalItems}
              />
            </>
          ) : <EmptyState title="Keine Immobilien gefunden" text="Passen Sie die Filter an oder legen Sie die erste Immobilie an." />}
        </Panel>
      </div>
    </>
  );
}
