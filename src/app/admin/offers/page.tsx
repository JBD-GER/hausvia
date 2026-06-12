import Link from "next/link";
import { saveOfferAction } from "@/app/actions/admin";
import { DocumentEditor } from "@/components/portal/DocumentEditor";
import { EmptyState, PageHeader, Panel, StatusPill, buttonClass } from "@/components/portal/PortalUI";
import { asText, formatEuro } from "@/lib/portal/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function AdminOffersPage() {
  const supabase = await createSupabaseServerClient();
  const [{ data: offers }, { data: customers }, { data: projects }] = await Promise.all([
    supabase.from("offers").select("id,status,title,offer_number,gross_total,customer_id,created_at,customers(company_name,contact_name,email)").order("created_at", { ascending: false }),
    supabase.from("customers").select("id,company_name,contact_name,email").order("created_at", { ascending: false }),
    supabase.from("projects").select("id,name,customer_id,object_address").order("created_at", { ascending: false }),
  ]);

  const customerOptions =
    customers?.map((customer) => ({
      id: customer.id,
      label: asText(customer.company_name || customer.contact_name || customer.email),
    })) ?? [];
  const projectOptions =
    projects?.map((project) => ({
      id: project.id,
      label: asText(project.name || project.object_address),
      customerId: project.customer_id,
    })) ?? [];

  return (
    <>
      <PageHeader eyebrow="Angebote" title="Angebote erstellen, bearbeiten und senden" text="Funnel-Angebote starten als Entwurf. Positionen können angepasst, ergänzt und anschließend als PDF an den Kunden gesendet werden." />
      <div className="grid gap-5">
        <Panel title="Neues Angebot erstellen">
          <DocumentEditor
            kind="offer"
            action={saveOfferAction}
            customers={customerOptions}
            projects={projectOptions}
            submitLabel="Angebot als Entwurf speichern"
            initial={{
              title: "Hausvia Objektbetreuung",
              intro: "Vielen Dank für Ihre Anfrage. Auf Grundlage der bekannten Objekt- und Leistungsdaten erhalten Sie folgendes Angebot.",
              billingMode: "monthly",
              billingIntervalLabel: "monatlich nach Vereinbarung",
              billingInAdvance: true,
              paymentDueDaysBeforeMonthEnd: 15,
              items: [
                {
                  title: "Objektbetreuung",
                  description: "Regelmäßige Betreuung laut vereinbartem Leistungsumfang",
                  quantity: 1,
                  unit: "Monat",
                  unitNet: 0,
                },
              ],
            }}
          />
        </Panel>
        <Panel title="Angebotsliste">
          {offers?.length ? (
            <div className="grid gap-3">
              {offers.map((offer) => (
                <article key={offer.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-extrabold text-slate-950">{offer.title}</p>
                      <p className="mt-1 text-sm text-slate-650">
                        {asText(offer.offer_number)} · {formatEuro(offer.gross_total)} brutto
                      </p>
                    </div>
                    <StatusPill>{offer.status}</StatusPill>
                  </div>
                  <Link href={`/admin/offers/${offer.id}`} className={`${buttonClass} mt-3`}>
                    Angebot öffnen
                  </Link>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState title="Keine Angebote" text="Angebote können hier als Entwurf vorbereitet und später freigegeben werden." />
          )}
        </Panel>
      </div>
    </>
  );
}
