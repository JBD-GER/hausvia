import Link from "next/link";
import { createInvoiceFromOfferAction, saveInvoiceAction } from "@/app/actions/admin";
import { DocumentEditor } from "@/components/portal/DocumentEditor";
import { PaginationNav } from "@/components/portal/PaginationNav";
import { EmptyState, Field, PageHeader, Panel, StatusPill, buttonClass, inputClass } from "@/components/portal/PortalUI";
import { asText, formatDate, formatEuro } from "@/lib/portal/format";
import { requireAdminContext } from "@/lib/portal/access";
import { paginateItems } from "@/lib/portal/listing";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function queryValue(params: Awaited<SearchParams>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function statusLabel(status: string) {
  if (status === "released") return "Erstellt";
  if (status === "open") return "Offen";
  if (status === "draft") return "Entwurf";
  if (status === "paid") return "Bezahlt";
  if (status === "overdue") return "Überfällig";
  if (status === "canceled") return "Storniert";
  return status;
}

export default async function AdminInvoicesPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const search = queryValue(params, "q").trim().toLocaleLowerCase("de");
  const statusFilter = queryValue(params, "invoiceStatus");
  const sort = queryValue(params, "sort") || "newest";
  const { admin: supabase } = await requireAdminContext();
  const [
    { data: invoices, error: invoicesError },
    { data: customers, error: customersError },
    { data: projects, error: projectsError },
    { data: offers, error: offersError },
  ] = await Promise.all([
    supabase.from("invoices").select("id,status,title,invoice_number,gross_total,due_date,created_at,customers(company_name,contact_name,email)").order("created_at", { ascending: false }),
    supabase.from("customers").select("id,company_name,contact_name,email").order("created_at", { ascending: false }),
    supabase.from("projects").select("id,name,customer_id,object_address").order("created_at", { ascending: false }),
    supabase
      .from("offers")
      .select("id,title,offer_number,status,gross_total,customers(company_name,contact_name,email)")
      .in("status", ["released", "accepted"])
      .order("created_at", { ascending: false }),
  ]);
  if (invoicesError || customersError || projectsError || offersError) {
    throw new Error("Die Rechnungsliste konnte nicht vollständig geladen werden.");
  }

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
  const filteredInvoices = (invoices ?? []).filter((invoice) => {
    const customer = Array.isArray(invoice.customers) ? invoice.customers[0] : invoice.customers;
    const haystack = [invoice.title, invoice.invoice_number, customer?.company_name, customer?.contact_name, customer?.email]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("de");
    return (!search || haystack.includes(search)) && (!statusFilter || invoice.status === statusFilter);
  }).sort((left, right) => {
    if (sort === "number") return String(left.invoice_number || "").localeCompare(String(right.invoice_number || ""), "de");
    if (sort === "amount-high") return Number(right.gross_total) - Number(left.gross_total);
    if (sort === "oldest") return String(left.created_at).localeCompare(String(right.created_at));
    return String(right.created_at).localeCompare(String(left.created_at));
  });
  const invoicePage = paginateItems(filteredInvoices, queryValue(params, "page"));

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
        <Panel title="Rechnungen suchen und filtern">
          <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Suche"><input name="q" defaultValue={queryValue(params, "q")} placeholder="Nummer, Titel, Kunde …" className={inputClass} /></Field>
            <Field label="Status"><select name="invoiceStatus" defaultValue={statusFilter} className={inputClass}><option value="">Alle Status</option><option value="draft">Entwurf</option><option value="released">Erstellt</option><option value="open">Offen</option><option value="paid">Bezahlt</option><option value="overdue">Überfällig</option><option value="canceled">Storniert</option></select></Field>
            <Field label="Sortierung"><select name="sort" defaultValue={sort} className={inputClass}><option value="newest">Neueste zuerst</option><option value="oldest">Älteste zuerst</option><option value="number">Rechnungsnummer</option><option value="amount-high">Höchster Betrag</option></select></Field>
            <div className="flex items-end gap-2"><button className={buttonClass}>Anwenden</button><Link href="/admin/invoices" className="inline-flex min-h-11 items-center text-sm font-bold text-brand underline">Zurücksetzen</Link></div>
          </form>
        </Panel>
        <Panel title={`Rechnungsliste (${filteredInvoices.length})`}>
          {filteredInvoices.length ? (
            <>
              <div className="grid gap-3">
              {invoicePage.items.map((invoice) => (
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
              <PaginationNav pathname="/admin/invoices" query={{ q: queryValue(params, "q"), invoiceStatus: statusFilter, sort }} page={invoicePage.page} totalPages={invoicePage.totalPages} totalItems={invoicePage.totalItems} />
            </>
          ) : (
            <EmptyState
              title={search || statusFilter ? "Keine Rechnungen gefunden" : "Noch keine Rechnungen"}
              text={search || statusFilter ? "Passen Sie die Suche oder den Statusfilter an." : "Rechnungsentwürfe und freigegebene Rechnungen erscheinen hier."}
            />
          )}
        </Panel>
      </div>
    </>
  );
}
