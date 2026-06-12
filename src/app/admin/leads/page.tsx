import { promoteLeadToCustomerAction } from "@/app/actions/admin";
import { EmptyState, PageHeader, Panel, StatusPill, buttonClass } from "@/components/portal/PortalUI";
import { asText, formatDateTime } from "@/lib/portal/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function AdminLeadsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: leads } = await supabase
    .from("leads")
    .select("id,status,company_name,contact_name,email,phone,object_address,object_type,requested_services,frequency,message,created_at,customer_id")
    .order("created_at", { ascending: false });

  return (
    <>
      <PageHeader eyebrow="Leads" title="Funnel-Anfragen" text="Alle eingehenden Anfragen aus Website und Kostencheck." />
      <Panel title="Neue und laufende Leads">
        {leads?.length ? (
          <div className="grid gap-4">
            {leads.map((lead) => (
              <article key={lead.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-lg font-extrabold text-slate-950">{asText(lead.company_name || lead.contact_name || lead.email)}</p>
                    <p className="mt-1 text-sm text-slate-650">{asText(lead.object_address)} · {asText(lead.object_type)}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-700">{asText(lead.message)}</p>
                    <p className="mt-2 text-xs font-bold text-slate-500">{formatDateTime(lead.created_at)}</p>
                  </div>
                  <StatusPill>{lead.status}</StatusPill>
                </div>
                <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold text-slate-650">
                  {(lead.requested_services ?? []).map((service: string) => (
                    <span key={service} className="rounded-full bg-white px-2.5 py-1">{service}</span>
                  ))}
                </div>
                {lead.customer_id ? (
                  <form action={promoteLeadToCustomerAction} className="mt-4">
                    <input type="hidden" name="leadId" value={lead.id} />
                    <input type="hidden" name="customerId" value={lead.customer_id} />
                    <button className={buttonClass}>Lead zu aktivem Kunden machen</button>
                  </form>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <EmptyState title="Keine Leads vorhanden" text="Neue Funnel-Anfragen werden automatisch gespeichert." />
        )}
      </Panel>
    </>
  );
}
