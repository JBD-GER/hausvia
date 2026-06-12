import { PageHeader, Panel, EmptyState, StatusPill } from "@/components/portal/PortalUI";
import { asText, formatDateTime } from "@/lib/portal/format";
import { requireProfile } from "@/lib/supabase/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function CustomerRequestPage() {
  const profile = await requireProfile(["customer"]);
  const supabase = await createSupabaseServerClient();
  const { data: customer } = await supabase.from("customers").select("id").eq("portal_user_id", profile.id).maybeSingle();
  const { data: leads } = customer
    ? await supabase.from("leads").select("*").eq("customer_id", customer.id).order("created_at", { ascending: false })
    : { data: [] };

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
