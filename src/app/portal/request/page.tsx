import { PageHeader, Panel, EmptyState, StatusPill } from "@/components/portal/PortalUI";
import { asText, formatDateTime } from "@/lib/portal/format";
import { requireCustomerContext } from "@/lib/portal/access";

export default async function CustomerRequestPage() {
  const { customerId, supabase } = await requireCustomerContext();
  const { data: leads, error } = await supabase
    .from("leads")
    .select(
      "id,status,object_address,object_type,requested_services,frequency,message,created_at",
    )
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });
  if (error) throw new Error("Die Anfragedaten konnten nicht geladen werden.");

  return (
    <>
      <PageHeader eyebrow="Anfrage" title="Ihre Anfrage" text="Die übermittelten Objekt- und Leistungsdaten aus dem Kostencheck." />
      <Panel title="Funnel-Anfrage">
        {leads?.length ? (
          <div className="grid gap-4">
            {leads.map((lead) => (
              <article key={lead.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-extrabold text-slate-950">{asText(lead.object_address)}</p>
                    <p className="mt-1 text-sm text-slate-650">{asText(lead.object_type)} · {asText(lead.frequency)}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-700">{asText(lead.message)}</p>
                    <p className="mt-2 text-xs font-bold text-slate-500">{formatDateTime(lead.created_at)}</p>
                  </div>
                  <StatusPill>{lead.status}</StatusPill>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {(lead.requested_services ?? []).map((service: string) => (
                    <span key={service} className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-slate-650">{service}</span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState title="Keine Anfrage gefunden" text="Sobald eine Anfrage zugeordnet ist, wird sie hier angezeigt." />
        )}
      </Panel>
    </>
  );
}
