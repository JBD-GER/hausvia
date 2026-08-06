import Link from "next/link";
import { EmptyState, PageHeader, Panel, StatusPill } from "@/components/portal/PortalUI";
import { asText, formatDate, formatEuro } from "@/lib/portal/format";
import { requireCustomerContext } from "@/lib/portal/access";

function statusLabel(status: string) {
  if (status === "released") return "Erstellt";
  if (status === "open") return "Offen";
  if (status === "paid") return "Bezahlt";
  if (status === "overdue") return "Überfällig";
  if (status === "canceled") return "Storniert";
  return status;
}

export default async function CustomerInvoicesPage() {
  const { customerId, supabase } = await requireCustomerContext();
  const { data: invoices, error } = await supabase.from("invoices").select("id,status,invoice_number,title,due_date,gross_total,invoice_items(title,quantity,unit,total_net)").eq("customer_id", customerId).order("created_at", { ascending: false });
  if (error) throw new Error("Die Rechnungen konnten nicht geladen werden.");

  return (
    <>
      <PageHeader eyebrow="Rechnungen" title="Ihre Rechnungen" text="Freigegebene Rechnungen mit Status und vorbereiteter PDF-Struktur." />
      <Panel title="Rechnungsliste">
        {invoices?.length ? (
          <div className="grid gap-4">
            {invoices.map((invoice) => (
              <article key={invoice.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-extrabold text-slate-950">{invoice.title}</p>
                    <p className="mt-1 text-sm text-slate-650">{asText(invoice.invoice_number)} · fällig {formatDate(invoice.due_date)}</p>
                  </div>
                  <StatusPill>{statusLabel(invoice.status)}</StatusPill>
                </div>
                <div className="mt-4 rounded-md bg-white p-4">
                  {(invoice.invoice_items ?? []).map((item: { title: string; quantity: number; unit: string; total_net: number }) => (
                    <div key={item.title} className="flex justify-between gap-3 border-b border-slate-100 py-2 text-sm last:border-0">
                      <span>{item.title} · {item.quantity} {item.unit}</span>
                      <span className="font-bold">{formatEuro(item.total_net)}</span>
                    </div>
                  ))}
                  <p className="mt-4 text-right text-2xl font-extrabold text-slate-950">{formatEuro(invoice.gross_total)}</p>
                </div>
                <Link
                  href={`/api/documents/invoices/${invoice.id}`}
                  className="mt-4 inline-flex min-h-11 items-center justify-center rounded-md bg-brand px-4 py-2 text-sm font-extrabold text-white transition hover:bg-brand-dark"
                >
                  Rechnung als PDF öffnen
                </Link>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState title="Keine Rechnungen" text="Sobald Hausvia eine Rechnung freigibt, erscheint sie hier." />
        )}
      </Panel>
    </>
  );
}
