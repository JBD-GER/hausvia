import Link from "next/link";
import { EmptyState, PageHeader, Panel, StatusPill, buttonClass } from "@/components/portal/PortalUI";
import { berlinIsoDate, formatGermanDate } from "@/lib/portal/core";
import { requireAdminContext } from "@/lib/portal/access";
import { selectWinterServiceVisitSummary } from "@/lib/winterServiceVisits";

function customerLabel(customer: Record<string, unknown> | undefined) {
  if (!customer) return "Unbekannter Kunde";
  const person = [customer.first_name, customer.last_name].filter(Boolean).join(" ");
  return String(customer.company_name || person || customer.contact_name || customer.email || "Unbekannter Kunde");
}

export default async function AdminWinterServicePage() {
  const { admin: supabase } = await requireAdminContext();
  const [
    { data: winterServices },
    { data: properties },
    { data: customers },
    { data: buildings },
    { data: assignments },
    { data: employees },
    { data: propertyEquipment },
    { data: equipment },
    { data: visits },
  ] = await Promise.all([
    supabase
      .from("property_services")
      .select(
        "id,property_id,execution_rule,occurrences_per_period,seasonal,season_start_month,season_end_month,start_date,end_date,property_service_buildings(building_id)",
      )
      .eq("service_key", "winterdienst")
      .eq("status", "active"),
    supabase.from("properties").select("*").eq("status", "active"),
    supabase.from("customers").select("*"),
    supabase
      .from("buildings")
      .select("id,property_id,label,formatted_address,status")
      .eq("status", "active"),
    supabase.from("property_employee_assignments").select("*").eq("active", true),
    supabase.from("employee_profiles").select("id,full_name"),
    supabase.from("property_equipment").select("*").eq("active", true),
    supabase.from("equipment").select("id,name"),
    supabase
      .from("visits")
      .select(
        "id,property_id,scheduled_date,planned_start_time,scheduled_start,status,completed_at,visit_buildings(building_id),visit_tasks(property_service_id,due_period_key,building_id)",
      ),
  ]);

  const activePropertyIds = new Set((winterServices ?? []).map((service) => service.property_id));
  const winterProperties = (properties ?? []).filter((property) => activePropertyIds.has(property.id));
  const customerById = new Map((customers ?? []).map((customer) => [customer.id, customer]));
  const employeeById = new Map((employees ?? []).map((employee) => [employee.id, employee]));
  const equipmentById = new Map((equipment ?? []).map((item) => [item.id, item]));

  return (
    <>
      <PageHeader
        eyebrow="Winterdienst"
        title="Aktive Winterdienst-Immobilien"
        text="Automatisch aus allen aktiven Leistungen mit dem eindeutigen Schlüssel „winterdienst“ abgeleitet."
      />
      <Panel title={`Winterdienstübersicht (${winterProperties.length})`}>
        {winterProperties.length ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {winterProperties.map((property) => {
              const service = (winterServices ?? []).find((item) => item.property_id === property.id);
              const propertyBuildings = (buildings ?? []).filter((building) => building.property_id === property.id);
              const propertyAssignments = (assignments ?? []).filter((assignment) => assignment.property_id === property.id);
              const equipmentAssignments = (propertyEquipment ?? []).filter((assignment) => assignment.property_id === property.id);
              const { nextVisit, lastVisit } = selectWinterServiceVisitSummary(
                visits ?? [],
                service,
                berlinIsoDate(),
              );
              const rentalEquipment = equipmentAssignments.filter((assignment) => assignment.rental);
              return (
                <article key={property.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div><h2 className="text-lg font-extrabold text-slate-950">{property.name}</h2><p className="mt-1 text-sm font-semibold text-slate-700">{customerLabel(customerById.get(property.customer_id))}</p></div>
                    <StatusPill>Aktiv</StatusPill>
                  </div>
                  <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                    <div><dt className="font-bold text-slate-500">Gebäude und Adressen</dt><dd className="mt-1 text-slate-800">{propertyBuildings.map((building) => `${building.label ? `${building.label}: ` : ""}${building.formatted_address}`).join(" | ") || "–"}</dd></div>
                    <div><dt className="font-bold text-slate-500">Saison</dt><dd className="mt-1 text-slate-800">{service?.seasonal ? `${service.season_start_month}. bis ${service.season_end_month}. Monat` : "dauerhaft / nach Bedarf"}</dd></div>
                    <div><dt className="font-bold text-slate-500">Mitarbeiter</dt><dd className="mt-1 text-slate-800">{propertyAssignments.map((assignment) => employeeById.get(assignment.employee_id)?.full_name).filter(Boolean).join(", ") || "nicht zugewiesen"}</dd></div>
                    <div><dt className="font-bold text-slate-500">Equipment</dt><dd className="mt-1 text-slate-800">{equipmentAssignments.map((assignment) => equipmentById.get(assignment.equipment_id)?.name).filter(Boolean).join(", ") || "nicht zugewiesen"}</dd></div>
                    <div><dt className="font-bold text-slate-500">Mietequipment</dt><dd className="mt-1 text-slate-800">{rentalEquipment.map((assignment) => equipmentById.get(assignment.equipment_id)?.name).filter(Boolean).join(", ") || "nein"}</dd></div>
                    <div><dt className="font-bold text-slate-500">Nächster Einsatz</dt><dd className="mt-1 text-slate-800">{nextVisit ? `${formatGermanDate(`${nextVisit.scheduled_date}T12:00:00Z`)}${nextVisit.planned_start_time ? ` · ${nextVisit.planned_start_time.slice(0, 5)} Uhr` : ""}` : "nicht geplant"}</dd></div>
                    <div><dt className="font-bold text-slate-500">Letzter Einsatz</dt><dd className="mt-1 text-slate-800">{lastVisit ? formatGermanDate(lastVisit.completed_at || `${lastVisit.scheduled_date}T12:00:00Z`) : "noch keiner"}</dd></div>
                  </dl>
                  <Link href={`/admin/properties/${property.id}#leistungen`} className={`${buttonClass} mt-4`}>Immobilie öffnen</Link>
                </article>
              );
            })}
          </div>
        ) : <EmptyState title="Kein aktiver Winterdienst" text="Sobald einer Immobilie die aktive Leistung „Winterdienst“ zugewiesen wird, erscheint sie automatisch hier." />}
      </Panel>
    </>
  );
}
