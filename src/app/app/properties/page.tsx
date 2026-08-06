import Link from "next/link";
import { ArrowRight, Building2, MapPin, MessageCircle, Wrench } from "lucide-react";
import { EmptyState, PageHeader, StatusPill } from "@/components/portal/PortalUI";
import { requireEmployeeContext } from "@/lib/portal/access";

function relation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

export default async function EmployeePropertiesPage() {
  const { employee, supabase } = await requireEmployeeContext();
  const { data: assignments } = await supabase
    .from("property_employee_assignments")
    .select("property_id,properties(id,name,status,buildings(id,label,formatted_address),property_services(id,status))")
    .eq("employee_id", employee.id)
    .eq("active", true);

  return (
    <>
      <PageHeader
        eyebrow="Meine Immobilien"
        title="Zugewiesene Objekte"
        text="Adresse, Briefing und Chat mit einem Tipp erreichbar."
        icon={<Building2 aria-hidden="true" size={20} />}
        compact
      />
      {assignments?.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {assignments.map((assignment) => {
            const property = relation(assignment.properties) as {
              id: string;
              name: string;
              status: string;
              buildings: { id: string; label: string | null; formatted_address: string }[];
              property_services: { id: string; status: string }[];
            } | null;
            if (!property) return null;
            const mainBuilding = property.buildings?.[0];
            const activeServices = property.property_services?.filter((service) => service.status === "active").length ?? 0;

            return (
              <Link
                key={property.id}
                href={`/app/properties/${property.id}`}
                className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-brand hover:shadow-lg"
              >
                <div className="flex items-start gap-3">
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
                    <Building2 aria-hidden="true" size={21} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-lg font-black text-slate-950 group-hover:text-brand">{property.name}</span>
                    <span className="mt-1 flex items-start gap-1.5 text-sm leading-5 text-slate-500">
                      <MapPin aria-hidden="true" size={15} className="mt-0.5 shrink-0" />
                      {mainBuilding?.formatted_address || "Adresse im Objekt"}
                    </span>
                  </span>
                  <StatusPill>{property.status === "active" ? "Aktiv" : property.status}</StatusPill>
                </div>
                <div className="mt-4 flex items-center gap-4 border-t border-slate-100 pt-3 text-xs font-black text-slate-500">
                  <span className="flex items-center gap-1.5"><Wrench aria-hidden="true" size={14} /> {activeServices} Leistungen</span>
                  <span className="flex items-center gap-1.5"><MessageCircle aria-hidden="true" size={14} /> Chat & Briefing</span>
                  <ArrowRight aria-hidden="true" size={17} className="ml-auto text-brand transition group-hover:translate-x-1" />
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <EmptyState title="Keine Immobilien zugewiesen" text="Ihre aktiven Objektzuweisungen erscheinen hier." />
      )}
    </>
  );
}
