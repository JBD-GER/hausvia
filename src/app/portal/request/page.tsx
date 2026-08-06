import { ClipboardList } from "lucide-react";
import { CompactSection, PageHeader, EmptyState, StatusPill } from "@/components/portal/PortalUI";
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
      <PageHeader
        eyebrow="Anfrage"
        title="Ihre Anfragen"
        text="Status und Eckdaten Ihrer übermittelten Kostenchecks."
        icon={<ClipboardList aria-hidden="true" size={20} />}
        compact
      />
      <div className="grid gap-3">
        {leads?.length ? (
          leads.map((lead, index) => (
            <CompactSection
              key={lead.id}
              title={asText(lead.object_address)}
              description={`${asText(lead.object_type)} · ${formatDateTime(lead.created_at)}`}
              badge={<StatusPill>{lead.status}</StatusPill>}
              defaultOpen={index === 0}
            >
              <article>
                <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-start">
                  <div className="min-w-0">
                    <p className="font-extrabold text-slate-950">{asText(lead.object_address)}</p>
                    <p className="mt-1 text-sm text-slate-650">{asText(lead.object_type)} · {asText(lead.frequency)}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-700">{asText(lead.message)}</p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {(lead.requested_services ?? []).map((service: string) => (
                    <span key={service} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-650">{service}</span>
                  ))}
                </div>
              </article>
            </CompactSection>
          ))
        ) : (
          <EmptyState title="Keine Anfrage gefunden" text="Sobald eine Anfrage zugeordnet ist, wird sie hier angezeigt." />
        )}
      </div>
    </>
  );
}
