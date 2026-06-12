import Link from "next/link";
import { PageHeader, MetricCard, Panel, EmptyState, StatusPill } from "@/components/portal/PortalUI";
import { asText, formatEuro } from "@/lib/portal/format";
import { requireProfile } from "@/lib/supabase/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function CustomerPortalPage() {
  const profile = await requireProfile(["customer"]);
  const supabase = await createSupabaseServerClient();
  const { data: customer } = await supabase.from("customers").select("id,status,company_name,contact_name").eq("portal_user_id", profile.id).maybeSingle();

  if (!customer) {
    return (
      <>
        <PageHeader eyebrow="Kundenportal" title="Noch kein Kunde verknüpft" text="Ihr Login ist aktiv, aber noch nicht mit einem Kundenprofil verbunden." />
        <EmptyState title="Verknüpfung offen" text="Bitte kontaktieren Sie Hausvia, damit Ihr Kundenprofil zugeordnet wird." />
      </>
    );
  }

  const [{ data: offers }, { data: projects }, { data: invoices }] = await Promise.all([
    supabase.from("offers").select("id,status,title,gross_total").eq("customer_id", customer.id),
    supabase.from("projects").select("id,status,name").eq("customer_id", customer.id),
    supabase.from("invoices").select("id,status,gross_total").eq("customer_id", customer.id),
  ]);

  return (
    <>
      <PageHeader eyebrow="Kundenportal" title={`Willkommen, ${asText(customer.company_name || customer.contact_name)}`} text="Ihre Anfrage, freigegebene Angebote, Betreuung und Rechnungen an einem Ort." />
      <div className="grid gap-3 sm:grid-cols-4">
        <MetricCard label="Angebote" value={offers?.length ?? 0} tone="accent" />
        <MetricCard label="Betreuungen" value={projects?.length ?? 0} />
        <MetricCard label="Rechnungen" value={invoices?.length ?? 0} />
        <MetricCard label="Status" value={customer.status} />
      </div>
      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <Panel title="Aktuelle Angebote">
          {offers?.length ? (
            <div className="grid gap-3">
              {offers.map((offer) => (
                <Link key={offer.id} href="/portal/offers" className="rounded-lg border border-slate-200 bg-slate-50 p-4 transition hover:border-brand">
                  <div className="flex justify-between gap-3">
                    <p className="font-extrabold text-slate-950">{offer.title}</p>
                    <StatusPill>{offer.status}</StatusPill>
                  </div>
                  <p className="mt-1 text-sm text-slate-650">{formatEuro(offer.gross_total)}</p>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState title="Keine freigegebenen Angebote" text="Sobald Hausvia ein Angebot freigibt, erscheint es hier." />
          )}
        </Panel>
        <Panel title="Betreuung">
          {projects?.length ? (
            <div className="grid gap-3">
              {projects.map((project) => (
                <Link key={project.id} href="/portal/care" className="rounded-lg border border-slate-200 bg-slate-50 p-4 transition hover:border-brand">
                  <p className="font-extrabold text-slate-950">{project.name}</p>
                  <StatusPill>{project.status}</StatusPill>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState title="Noch keine aktive Betreuung" text="Nach Angebotsannahme oder Admin-Freigabe wird dieser Bereich aktiv." />
          )}
        </Panel>
      </div>
    </>
  );
}
