import Link from "next/link";
import { createOfferFromLeadAction } from "@/app/actions/admin";
import { PortalDialog } from "@/components/portal/PortalDialog";
import { EmptyState, PageHeader, Panel, StatusPill, buttonClass, secondaryButtonClass } from "@/components/portal/PortalUI";
import { asText, formatDateTime, formatEuro, leadStatusLabel, offerStatusLabel } from "@/lib/portal/format";
import { requireAdminContext } from "@/lib/portal/access";

type LeadRow = {
  id: string;
  status: string;
  company_name: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  object_address: string | null;
  object_type: string | null;
  requested_services: string[] | null;
  frequency: string | null;
  message: string | null;
  created_at: string;
  customer_id: string | null;
  desired_start_date: string | null;
  preferred_callback_time: string | null;
  estimate: Record<string, unknown> | null;
};

type OfferRow = {
  id: string;
  customer_id: string;
  title: string;
  status: string;
  gross_total: number | null;
  created_at: string;
};

function estimateText(estimate: Record<string, unknown> | null) {
  if (!estimate) return "-";
  if (estimate.pricingModel === "winter-season-plus-deployment") {
    const monthlyBase = Number(estimate.monthlyBaseGross ?? 0);
    const deployment = Number(estimate.deploymentGross ?? 0);
    if (monthlyBase > 0 && deployment > 0) {
      return `${formatEuro(monthlyBase)} Grundbetrag / Monat + ${formatEuro(deployment)} / Einsatz`;
    }
  }
  const lower = typeof estimate.lower === "number" ? estimate.lower : Number(estimate.lower ?? 0);
  const upper = typeof estimate.upper === "number" ? estimate.upper : Number(estimate.upper ?? 0);
  if (lower > 0 && upper > 0) return `${formatEuro(lower)} bis ${formatEuro(upper)} / Monat`;
  return "-";
}

export default async function AdminLeadsPage() {
  const { admin: supabase } = await requireAdminContext();
  const { data: leads } = await supabase
    .from("leads")
    .select("id,status,company_name,contact_name,email,phone,object_address,object_type,requested_services,frequency,message,created_at,customer_id,desired_start_date,preferred_callback_time,estimate")
    .neq("status", "converted")
    .order("created_at", { ascending: false });

  const customerIds = [...new Set(((leads ?? []) as LeadRow[]).map((lead) => lead.customer_id).filter(Boolean))] as string[];
  const { data: offers } = customerIds.length
    ? await supabase
        .from("offers")
        .select("id,customer_id,title,status,gross_total,created_at")
        .in("customer_id", customerIds)
        .order("created_at", { ascending: false })
    : { data: [] };

  const offerByCustomer = new Map<string, OfferRow>();
  ((offers ?? []) as OfferRow[]).forEach((offer) => {
    if (!offerByCustomer.has(offer.customer_id)) offerByCustomer.set(offer.customer_id, offer);
  });

  return (
    <>
      <PageHeader
        eyebrow="Leads"
        title="Funnel-Anfragen und Angebotsstart"
        text="Neue Anfragen bleiben hier sichtbar, bis ein Angebot angenommen wurde. Danach wird der Lead automatisch zum aktiven Kunden mit Projekt."
      />
      <Panel title="Neue und laufende Leads">
        {leads?.length ? (
          <div className="grid gap-4">
            {((leads ?? []) as LeadRow[]).map((lead) => {
              const offer = lead.customer_id ? offerByCustomer.get(lead.customer_id) : null;

              return (
              <article key={lead.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-lg font-extrabold text-slate-950">{asText(lead.company_name || lead.contact_name || lead.email)}</p>
                    <p className="mt-1 text-sm text-slate-650">{asText(lead.object_address)} · {asText(lead.object_type)}</p>
                    <p className="mt-1 text-sm font-semibold text-slate-700">
                      {asText(lead.email)} · {asText(lead.phone)}
                    </p>
                    <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-700">{asText(lead.message)}</p>
                    <p className="mt-2 text-xs font-bold text-slate-500">{formatDateTime(lead.created_at)}</p>
                  </div>
                  <StatusPill>{leadStatusLabel(lead.status)}</StatusPill>
                </div>
                <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold text-slate-650">
                  {(lead.requested_services ?? []).map((service: string) => (
                    <span key={service} className="rounded-full bg-white px-2.5 py-1">{service}</span>
                  ))}
                </div>

                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <PortalDialog
                    triggerLabel="Anfragedetails"
                    triggerClassName={secondaryButtonClass}
                    title={asText(lead.company_name || lead.contact_name || lead.email)}
                    description="Alle Angaben aus der Anfrage auf einen Blick."
                  >
                    <div className="grid gap-3 text-sm md:grid-cols-2">
                      <div className="rounded-xl bg-slate-50 p-4">
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Objekt</p>
                        <p className="mt-1 font-semibold text-slate-900">{asText(lead.object_type)}</p>
                        <p className="mt-1 text-slate-650">{asText(lead.object_address)}</p>
                      </div>
                      <div className="rounded-xl bg-slate-50 p-4">
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Kostenspanne</p>
                        <p className="mt-1 font-semibold text-slate-900">{estimateText(lead.estimate)}</p>
                        <p className="mt-1 text-slate-650">{asText(lead.frequency)}</p>
                      </div>
                      <div className="rounded-xl bg-slate-50 p-4">
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Start / Rückruf</p>
                        <p className="mt-1 font-semibold text-slate-900">{asText(lead.desired_start_date)}</p>
                        <p className="mt-1 text-slate-650">{asText(lead.preferred_callback_time)}</p>
                      </div>
                      <div className="rounded-xl bg-slate-50 p-4">
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Angebotsstatus</p>
                        <p className="mt-1 font-semibold text-slate-900">
                          {offer ? offerStatusLabel(offer.status) : "Noch kein Angebot geöffnet"}
                        </p>
                        {offer ? <p className="mt-1 text-slate-650">{formatEuro(offer.gross_total ?? 0)} brutto</p> : null}
                      </div>
                      <div className="rounded-xl bg-slate-50 p-4 md:col-span-2">
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Nachricht</p>
                        <p className="mt-2 whitespace-pre-wrap leading-6 text-slate-700">{asText(lead.message)}</p>
                      </div>
                    </div>
                  </PortalDialog>
                  {offer ? (
                    <Link href={`/admin/offers/${offer.id}`} className={buttonClass}>
                      Angebot öffnen
                    </Link>
                  ) : (
                    <form action={createOfferFromLeadAction}>
                      <input type="hidden" name="leadId" value={lead.id} />
                      <button className={buttonClass}>Angebot erstellen</button>
                    </form>
                  )}
                </div>
              </article>
            );
            })}
          </div>
        ) : (
          <EmptyState title="Keine offenen Leads" text="Neue Funnel-Anfragen erscheinen hier. Angenommene Angebote werden automatisch zu aktiven Kunden und verschwinden aus dieser Liste." />
        )}
      </Panel>
    </>
  );
}
