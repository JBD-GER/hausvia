import Link from "next/link";
import { createInvoiceFromOfferAction, saveInvoiceAction } from "@/app/actions/admin";
import { DocumentEditor } from "@/components/portal/DocumentEditor";
import { EmptyState, PageHeader, Panel, StatusPill, buttonClass, inputClass } from "@/components/portal/PortalUI";
import { asText, formatDate, formatEuro } from "@/lib/portal/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function statusLabel(status: string) {
  if (status === "released") return "Erstellt";
  if (status === "open") return "Offen";
  if (status === "draft") return "Entwurf";
  if (status === "paid") return "Bezahlt";
  if (status === "overdue") return "Überfällig";
  if (status === "canceled") return "Storniert";
  return status;
}

export default async function AdminInvoicesPage() {
  const supabase = await createSupabaseServerClient();
  const [{ data: invoices }, { data: customers }, { data: projects }, { data: offers }] = await Promise.all([
    supabase.from("invoices").select("id,status,title,invoice_number,gross_total,due_date").order("created_at", { ascending: false }),
    supabase.from("customers").select("id,company_name,contact_name,email").order("created_at", { ascending: false }),
    supabase.from("projects").select("id,name,customer_id,object_address").order("created_at", { ascending: false }),
    supabase
      .from("offers")
      .select("id,title,offer_number,status,gross_total,customers(company_name,contact_name,email)")
      .in("status", ["released", "accepted"])
      .order("created_at", { ascending: false }),
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
      <PageHeader eyebrow="Rechnungen" title="Rechnungen erstellen und senden" text="Rechnungen können aus Angeboten oder manuell erstellt, als PDF geladen und per E-Mail ins Kundenportal gesendet werden." />
      <div className="grid gap-5">
        <Panel title="Rechnung aus Angebot erstellen">
          <form action={createInvoiceFromOfferAction} className="grid gap-4 lg:grid-cols-[1.4fr_0.8fr_0.8fr_auto] lg:items-end">
            <label className="block">
              <span className="text-sm font-bold text-slate-800">Angebot übernehmen</span>
              <select name="offerId" required className={inputClass}>
                <option value="">Angebot auswählen</option>
                {offers?.map((offer) => {
                  const customer = Array.isArray(offer.customers) ? offer.customers[0] : offer.customers;
                  return (
                    <option key={offer.id} value={offer.id}>
                      {asText(offer.offer_number)} · {offer.title} · {asText(customer?.company_name || customer?.contact_name || customer?.email)} · {formatEuro(offer.gross_total)}
                    </option>
                  );
                })}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-bold text-slate-800">Leistungsmonat ab</span>
              <input name="servicePeriodStart" type="date" className={inputClass} />
            </label>
            <label className="block">
              <span className="text-sm font-bold text-slate-800">Fällig optional</span>
              <input name="dueDate" type="date" className={inputClass} />
            </label>
            <button className={buttonClass}>Als Entwurf anlegen</button>
          </form>
        </Panel>
        <Panel title="Neue Rechnung erstellen">
          <DocumentEditor
            kind="invoice"
            action={saveInvoiceAction}
            customers={customerOptions}
            projects={projectOptions}
            submitLabel="Rechnung als Entwurf speichern"
            initial={{
              title: "Hausvia Objektbetreuung",
              billingNote: "Diese Rechnung wurde auf Grundlage der vereinbarten Leistungen erstellt.",
              items: [
                {
                  title: "Objektbetreuung",
                  description: "Leistungsumfang nach Vereinbarung",
                  quantity: 1,
                  unit: "Pauschale",
                  unitNet: 0,
                },
              ],
            }}
          />
        </Panel>
        <Panel title="Rechnungsliste">
          {invoices?.length ? (
            <div className="grid gap-3">
              {invoices.map((invoice) => (
                <article key={invoice.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-extrabold text-slate-950">{invoice.title}</p>
                      <p className="mt-1 text-sm text-slate-650">{asText(invoice.invoice_number)} · {formatEuro(invoice.gross_total)} · fällig {formatDate(invoice.due_date)}</p>
                    </div>
                    <StatusPill>{statusLabel(invoice.status)}</StatusPill>
                  </div>
                  <Link href={`/admin/invoices/${invoice.id}`} className={`${buttonClass} mt-3`}>
                    Rechnung öffnen
                  </Link>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState title="Keine Rechnungen" text="Rechnungsentwürfe und freigegebene Rechnungen erscheinen hier." />
          )}
        </Panel>
      </div>
    </>
  );
}
