import Link from "next/link";
import { notFound } from "next/navigation";
import {
  createInvoiceCycleAction,
  createInvoiceFromCycleAction,
  createInvoiceFromOfferAction,
  saveOfferAction,
  sendOfferAction,
} from "@/app/actions/admin";
import { DocumentEditor } from "@/components/portal/DocumentEditor";
import { EmptyState, PageHeader, Panel, StatusPill, buttonClass, inputClass } from "@/components/portal/PortalUI";
import { billingModeLabels } from "@/lib/commerce";
import { asText, formatDate, formatEuro } from "@/lib/portal/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type OfferItemRow = {
  title: string;
  description: string | null;
  quantity: number;
  unit: string;
  unit_net: number;
};

export default async function AdminOfferDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string; error?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const supabase = await createSupabaseServerClient();
  const [{ data: offer }, { data: items }, { data: customers }, { data: projects }, { data: cycles }, { data: invoices }] =
    await Promise.all([
      supabase
        .from("offers")
        .select(
          "id,status,title,intro,closing_text,admin_notes,offer_number,customer_id,project_id,net_total,tax_total,gross_total,billing_mode,billing_interval_label,billing_in_advance,payment_due_days_before_month_end,created_at,sent_at,customers(company_name,contact_name,email)",
        )
        .eq("id", id)
        .single(),
      supabase
        .from("offer_items")
        .select("title,description,quantity,unit,unit_net,total_net,sort_order")
        .eq("offer_id", id)
        .order("sort_order", { ascending: true }),
      supabase.from("customers").select("id,company_name,contact_name,email").order("created_at", { ascending: false }),
      supabase.from("projects").select("id,name,customer_id,object_address").order("created_at", { ascending: false }),
      supabase.from("invoice_cycles").select("id,title,status,frequency,next_period_start,amount_gross").eq("offer_id", id).order("created_at", { ascending: false }),
      supabase.from("invoices").select("id,title,status,invoice_number,gross_total,due_date").eq("source_offer_id", id).order("created_at", { ascending: false }),
    ]);

  if (!offer) notFound();

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
      <PageHeader
        eyebrow="Angebot"
        title={offer.title}
        text="Angebot prüfen, Positionen bearbeiten, PDF herunterladen oder direkt an den Kunden senden."
      />

      {query.status === "saved" ? (
        <p className="mb-5 rounded-md border border-green-200 bg-green-50 p-4 text-sm font-bold text-green-800">
          Angebot wurde gespeichert.
        </p>
      ) : null}
      {query.status === "sent" ? (
        <p className="mb-5 rounded-md border border-green-200 bg-green-50 p-4 text-sm font-bold text-green-800">
          Angebot wurde per E-Mail gesendet und im Kundenportal freigegeben.
        </p>
      ) : null}
      {query.error ? (
        <p className="mb-5 rounded-md border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800">
          Aktion konnte nicht abgeschlossen werden. Bitte Daten und E-Mail-Konfiguration prüfen.
        </p>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[1.4fr_0.8fr]">
        <Panel title="Angebot bearbeiten">
          <DocumentEditor
            kind="offer"
            action={saveOfferAction}
            customers={customerOptions}
            projects={projectOptions}
            submitLabel="Änderungen speichern"
            initial={{
              id: offer.id,
              number: offer.offer_number,
              customerId: offer.customer_id,
              projectId: offer.project_id,
              title: offer.title,
              intro: offer.intro,
              closingText: offer.closing_text,
              adminNotes: offer.admin_notes,
              billingMode: offer.billing_mode,
              billingIntervalLabel: offer.billing_interval_label,
              billingInAdvance: offer.billing_in_advance,
              paymentDueDaysBeforeMonthEnd: offer.payment_due_days_before_month_end,
              items: ((items ?? []) as OfferItemRow[]).map((item) => ({
                title: item.title,
                description: item.description ?? "",
                quantity: item.quantity,
                unit: item.unit,
                unitNet: item.unit_net,
              })),
            }}
          />
        </Panel>

        <div className="grid content-start gap-5">
          <Panel title="Status & Versand">
            <div className="grid gap-3">
              <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <span className="text-sm font-bold text-slate-700">Status</span>
                <StatusPill>{offer.status}</StatusPill>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Gesamt brutto</p>
                <p className="mt-1 text-2xl font-extrabold text-slate-950">{formatEuro(offer.gross_total)}</p>
              </div>
              <Link href={`/api/documents/offers/${offer.id}`} className={buttonClass}>
                PDF herunterladen
              </Link>
              <form action={sendOfferAction}>
                <input type="hidden" name="offerId" value={offer.id} />
                <button className={`${buttonClass} w-full`}>An Kunden senden</button>
              </form>
              <p className="text-xs leading-5 text-slate-500">
                Beim Senden wird das Angebot im Kundenportal sichtbar und zusätzlich als PDF per E-Mail verschickt.
              </p>
            </div>
          </Panel>

          <Panel title="Rechnung aus Angebot">
            <form action={createInvoiceFromOfferAction} className="grid gap-3">
              <input type="hidden" name="offerId" value={offer.id} />
              <label className="block">
                <span className="text-sm font-bold text-slate-800">Leistungsmonat startet am</span>
                <input name="servicePeriodStart" type="date" className={inputClass} />
              </label>
              <label className="block">
                <span className="text-sm font-bold text-slate-800">Fälligkeitsdatum optional</span>
                <input name="dueDate" type="date" className={inputClass} />
              </label>
              <button className={buttonClass}>Rechnungsentwurf erstellen</button>
            </form>
          </Panel>

          <Panel title="Rechnungszyklus">
            <form action={createInvoiceCycleAction} className="grid gap-3">
              <input type="hidden" name="offerId" value={offer.id} />
              <label className="block">
                <span className="text-sm font-bold text-slate-800">Turnus</span>
                <select name="frequency" className={inputClass} defaultValue={offer.billing_mode || "monthly"}>
                  {Object.entries(billingModeLabels)
                    .filter(([value]) => value !== "one_time")
                    .map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-bold text-slate-800">Nächster Leistungsmonat ab</span>
                <input name="nextPeriodStart" type="date" className={inputClass} />
              </label>
              <label className="block">
                <span className="text-sm font-bold text-slate-800">Tage vor Monatsende</span>
                <input name="generateDaysBeforeMonthEnd" inputMode="numeric" className={inputClass} defaultValue={15} />
              </label>
              <label className="flex gap-3 rounded-md bg-slate-50 p-3 text-sm font-semibold text-slate-700">
                <input type="checkbox" name="billingInAdvance" defaultChecked className="mt-1 h-5 w-5 rounded border-slate-300 text-brand focus:ring-brand" />
                Rechnung für kommenden Monat vor Leistungsbeginn erstellen.
              </label>
              <button className={buttonClass}>Dauerauftrag anlegen</button>
            </form>

            <div className="mt-5 grid gap-3">
              {cycles?.length ? (
                cycles.map((cycle) => (
                  <article key={cycle.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-extrabold text-slate-950">{cycle.title}</p>
                        <p className="mt-1 text-sm text-slate-650">
                          {cycle.frequency} · nächster Monat ab {formatDate(cycle.next_period_start)} · {formatEuro(cycle.amount_gross)}
                        </p>
                      </div>
                      <StatusPill>{cycle.status}</StatusPill>
                    </div>
                    <form action={createInvoiceFromCycleAction} className="mt-3">
                      <input type="hidden" name="cycleId" value={cycle.id} />
                      <button className={buttonClass}>Nächste Rechnung erstellen</button>
                    </form>
                  </article>
                ))
              ) : (
                <EmptyState title="Kein Rechnungszyklus" text="Für regelmäßige Betreuung kann hier ein Dauerauftrag vorbereitet werden." />
              )}
            </div>
          </Panel>

          <Panel title="Rechnungen aus diesem Angebot">
            {invoices?.length ? (
              <div className="grid gap-3">
                {invoices.map((invoice) => (
                  <Link key={invoice.id} href={`/admin/invoices/${invoice.id}`} className="rounded-lg border border-slate-200 bg-slate-50 p-3 transition hover:border-brand">
                    <p className="font-extrabold text-slate-950">{invoice.title}</p>
                    <p className="mt-1 text-sm text-slate-650">
                      {asText(invoice.invoice_number)} · {formatEuro(invoice.gross_total)} · fällig {formatDate(invoice.due_date)}
                    </p>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState title="Noch keine Rechnung" text="Aus diesem Angebot wurde noch keine Rechnung erstellt." />
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
