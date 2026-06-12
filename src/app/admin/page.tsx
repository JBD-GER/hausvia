import { PageHeader, MetricCard, Panel, StatusPill, EmptyState } from "@/components/portal/PortalUI";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatDateTime, asText } from "@/lib/portal/format";

export default async function AdminDashboardPage() {
  const supabase = await createSupabaseServerClient();
  const [
    leads,
    customers,
    projects,
    offers,
    shifts,
    materials,
    invoices,
  ] = await Promise.all([
    supabase.from("leads").select("id,status,contact_name,email,created_at").order("created_at", { ascending: false }).limit(6),
    supabase.from("customers").select("id,status").eq("status", "active"),
    supabase.from("projects").select("id,status,primary_employee_id,name").order("created_at", { ascending: false }).limit(8),
    supabase.from("offers").select("id,status,title,created_at").order("created_at", { ascending: false }).limit(6),
    supabase.from("shifts").select("id,status,started_at").in("status", ["submitted", "open"]).order("created_at", { ascending: false }).limit(6),
    supabase.from("material_requests").select("id,status,title,created_at").eq("status", "requested").order("created_at", { ascending: false }).limit(6),
    supabase.from("invoices").select("id,status,title,gross_total").in("status", ["open", "overdue"]),
  ]);

  const activeCustomers = customers.data?.length ?? 0;
  const unassignedProjects = projects.data?.filter((project) => !project.primary_employee_id).length ?? 0;
  const openOffers = offers.data?.filter((offer) => offer.status === "released").length ?? 0;
  const acceptedOffers = offers.data?.filter((offer) => offer.status === "accepted").length ?? 0;

  return (
    <>
      <PageHeader
        eyebrow="Admin Dashboard"
        title="Hausvia Steuerzentrale"
        text="Neue Funnel-Anfragen, offene Angebote, Schichten, Material und Kundenstatus auf einen Blick."
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Neue Leads" value={leads.data?.length ?? 0} tone="accent" />
        <MetricCard label="Aktive Kunden" value={activeCustomers} />
        <MetricCard label="Ohne Zuweisung" value={unassignedProjects} />
        <MetricCard label="Offene Angebote" value={openOffers} />
      </div>
      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <Panel title="Neue Funnel-Anfragen">
          {leads.data?.length ? (
            <div className="grid gap-3">
              {leads.data.map((lead) => (
                <article key={lead.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-extrabold text-slate-950">{asText(lead.contact_name || lead.email)}</p>
                      <p className="mt-1 text-sm text-slate-650">{formatDateTime(lead.created_at)}</p>
                    </div>
                    <StatusPill>{lead.status}</StatusPill>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState title="Keine neuen Leads" text="Neue Funnel-Anfragen erscheinen hier automatisch." />
          )}
        </Panel>
        <Panel title="Wichtige Statusmeldungen">
          <div className="grid gap-3">
            <StatusPill>{acceptedOffers} angenommene Angebote</StatusPill>
            <StatusPill>{shifts.data?.length ?? 0} Schichten offen/zur Prüfung</StatusPill>
            <StatusPill>{materials.data?.length ?? 0} Materialanforderungen offen</StatusPill>
            <StatusPill>{invoices.data?.length ?? 0} offene/überfällige Rechnungen</StatusPill>
          </div>
        </Panel>
      </div>
    </>
  );
}
