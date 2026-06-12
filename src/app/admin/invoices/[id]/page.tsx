import Link from "next/link";
import { notFound } from "next/navigation";
import { saveInvoiceAction, sendInvoiceAction } from "@/app/actions/admin";
import { DocumentEditor } from "@/components/portal/DocumentEditor";
import { PageHeader, Panel, StatusPill, buttonClass } from "@/components/portal/PortalUI";
import { asText, formatDate, formatEuro } from "@/lib/portal/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type InvoiceItemRow = {
  title: string;
  description: string | null;
  quantity: number;
  unit: string;
  unit_net: number;
};

function statusLabel(status: string) {
  if (status === "released") return "Erstellt";
  if (status === "open") return "Offen";
  if (status === "draft") return "Entwurf";
  if (status === "paid") return "Bezahlt";
  if (status === "overdue") return "Überfällig";
  if (status === "canceled") return "Storniert";
  return status;
}

export default async function AdminInvoiceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string; error?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const supabase = await createSupabaseServerClient();
  const [{ data: invoice }, { data: items }, { data: customers }, { data: projects }] = await Promise.all([
    supabase
      .from("invoices")
      .select(
        "id,status,title,invoice_number,customer_id,project_id,due_date,net_total,tax_total,gross_total,source_offer_id,invoice_cycle_id,service_period_start,service_period_end,billing_note,created_at,sent_at,customers(company_name,contact_name,email)",
      )
      .eq("id", id)
      .single(),
    supabase
      .from("invoice_items")
      .select("title,description,quantity,unit,unit_net,total_net,sort_order")
      .eq("invoice_id", id)
      .order("sort_order", { ascending: true }),
    supabase.from("customers").select("id,company_name,contact_name,email").order("created_at", { ascending: false }),
    supabase.from("projects").select("id,name,customer_id,object_address").order("created_at", { ascending: false }),
  ]);

  if (!invoice) notFound();

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
        eyebrow="Rechnung"
        title={invoice.title}
        text="Rechnung bearbeiten, PDF prüfen und anschließend an den Kunden senden."
      />

      {query.status === "saved" ? (
        <p className="mb-5 rounded-md border border-green-200 bg-green-50 p-4 text-sm font-bold text-green-800">
          Rechnung wurde gespeichert.
        </p>
      ) : null}
      {query.status === "sent" ? (
        <p className="mb-5 rounded-md border border-green-200 bg-green-50 p-4 text-sm font-bold text-green-800">
          Rechnung wurde per E-Mail gesendet und im Kundenportal sichtbar gemacht.
        </p>
      ) : null}
      {query.error ? (
        <p className="mb-5 rounded-md border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800">
          Aktion konnte nicht abgeschlossen werden. Bitte Daten und E-Mail-Konfiguration prüfen.
        </p>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[1.4fr_0.8fr]">
        <Panel title="Rechnung bearbeiten">
          <DocumentEditor
            kind="invoice"
            action={saveInvoiceAction}
            customers={customerOptions}
            projects={projectOptions}
            submitLabel="Änderungen speichern"
            initial={{
              id: invoice.id,
              number: invoice.invoice_number,
              customerId: invoice.customer_id,
              projectId: invoice.project_id,
              title: invoice.title,
              dueDate: invoice.due_date,
              servicePeriodStart: invoice.service_period_start,
              servicePeriodEnd: invoice.service_period_end,
              billingNote: invoice.billing_note,
              sourceOfferId: invoice.source_offer_id,
              invoiceCycleId: invoice.invoice_cycle_id,
              items: ((items ?? []) as InvoiceItemRow[]).map((item) => ({
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
                <StatusPill>{statusLabel(invoice.status)}</StatusPill>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Gesamt brutto</p>
                <p className="mt-1 text-2xl font-extrabold text-slate-950">{formatEuro(invoice.gross_total)}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-650">
                <p>
                  <strong className="text-slate-900">Fällig:</strong> {formatDate(invoice.due_date)}
                </p>
                <p>
                  <strong className="text-slate-900">Zeitraum:</strong> {formatDate(invoice.service_period_start)} bis{" "}
                  {formatDate(invoice.service_period_end)}
                </p>
              </div>
              <Link href={`/api/documents/invoices/${invoice.id}`} className={buttonClass}>
                PDF herunterladen
              </Link>
              <form action={sendInvoiceAction}>
                <input type="hidden" name="invoiceId" value={invoice.id} />
                <button className={`${buttonClass} w-full`}>Rechnung an Kunden senden</button>
              </form>
              <p className="text-xs leading-5 text-slate-500">
                Beim Senden erhält der Kunde die Rechnung als PDF-Anhang. Im Portal erscheint sie mit dem Status
                „Erstellt“.
              </p>
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
