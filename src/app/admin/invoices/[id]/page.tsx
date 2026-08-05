import Link from "next/link";
import { notFound } from "next/navigation";
import {
  cancelInvoiceAction,
  markInvoicePaidAction,
  saveInvoiceAction,
  sendInvoiceAction,
} from "@/app/actions/admin";
import { DocumentEditor } from "@/components/portal/DocumentEditor";
import {
  PageHeader,
  Panel,
  StatusPill,
  buttonClass,
  inputClass,
} from "@/components/portal/PortalUI";
import {
  canCancelInvoice,
  canMarkInvoicePaid,
  hasStoredInvoiceOriginal,
  invoiceErrorDescription,
  isInvoiceContentImmutable,
} from "@/lib/invoiceIntegrity";
import {
  asText,
  formatDate,
  formatDateTime,
  formatEuro,
} from "@/lib/portal/format";
import { requireAdminContext } from "@/lib/portal/access";

type InvoiceItemRow = {
  title: string;
  description: string | null;
  quantity: number;
  unit: string;
  unit_net: number;
  total_net: number;
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

function errorMessage(error: string) {
  if (error === "immutable") {
    return "Diese Rechnung ist unveränderlich. Für Änderungen muss eine Korrektur oder ein Storno erstellt werden.";
  }
  if (error === "integrity") {
    return "Das gespeicherte Original konnte die Integritätsprüfung nicht bestehen. Die Rechnung wurde nicht versendet.";
  }
  if (error === "original") {
    return "Das gespeicherte Original-PDF ist nicht verfügbar. Die Rechnung wurde nicht versendet.";
  }
  if (error === "processing") {
    return "Die Monatsrechnung wird gerade automatisch verarbeitet. Bitte versuchen Sie es nach Abschluss erneut.";
  }
  if (error === "canceled") {
    return "Eine stornierte Rechnung kann nicht erneut versendet werden.";
  }
  if (error === "email") {
    return "Im unveränderlichen Empfänger-Snapshot ist keine gültige Rechnungs-E-Mail hinterlegt.";
  }
  if (error === "mail") {
    return "Der E-Mail-Versand ist fehlgeschlagen. An der Rechnung wurden keine Inhaltsänderungen vorgenommen.";
  }
  if (error === "paid-transition") {
    return "Nur erstellte, offene oder überfällige Rechnungen können als bezahlt markiert werden.";
  }
  if (error === "cancel-transition") {
    return "Diese Rechnung kann aus ihrem aktuellen Status nicht storniert werden.";
  }
  if (error === "cancel-reason") {
    return "Für die Stornierung ist ein nachvollziehbarer Grund mit mindestens fünf Zeichen erforderlich.";
  }
  if (error === "audit") {
    return "Der Status wurde gespeichert, aber das Audit-Protokoll konnte nicht geschrieben werden. Bitte den Vorgang technisch prüfen.";
  }
  if (error === "state") {
    return "Der Rechnungsstatus hat sich zwischenzeitlich geändert. Bitte prüfen Sie den aktuellen Stand und versuchen Sie es gegebenenfalls erneut.";
  }
  return "Aktion konnte nicht abgeschlossen werden. Bitte Daten und E-Mail-Konfiguration prüfen.";
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
  const { admin: supabase } = await requireAdminContext();
  const [{ data: invoice }, { data: items }, { data: customers }, { data: projects }] = await Promise.all([
    supabase
      .from("invoices")
      .select(
        "id,status,title,invoice_number,invoice_kind,billing_month,immutable_at,processing_token,error_code,error_message,original_pdf_bucket,original_pdf_path,customer_id,project_id,due_date,net_total,tax_total,gross_total,net_total_cents,tax_total_cents,gross_total_cents,source_offer_id,invoice_cycle_id,service_period_start,service_period_end,billing_note,created_at,sent_at,paid_at,canceled_at,cancellation_reason,customers(company_name,contact_name,email)",
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

  const contentIsImmutable = isInvoiceContentImmutable(invoice);
  const hasOriginalPdf = hasStoredInvoiceOriginal(invoice);
  const canSend =
    invoice.status !== "canceled" &&
    !invoice.processing_token &&
    (hasOriginalPdf || (!contentIsImmutable && invoice.status === "draft"));
  const canMarkPaid =
    !invoice.processing_token && canMarkInvoicePaid(invoice.status);
  const canCancel =
    !invoice.processing_token && canCancelInvoice(invoice.status);
  const processingError =
    typeof invoice.error_code === "string" &&
    invoice.error_code.startsWith("processing:");

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
        text={
          contentIsImmutable
            ? "Unveränderliches Rechnungsdokument prüfen, herunterladen oder als gespeichertes Original erneut senden."
            : "Rechnung bearbeiten, PDF prüfen und anschließend an den Kunden senden."
        }
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
      {query.status === "resent" ? (
        <p className="mb-5 rounded-md border border-green-200 bg-green-50 p-4 text-sm font-bold text-green-800">
          Das unveränderte Original wurde erneut an die im Rechnungssnapshot hinterlegte E-Mail-Adresse gesendet.
        </p>
      ) : null}
      {query.status === "paid" ? (
        <p className="mb-5 rounded-md border border-green-200 bg-green-50 p-4 text-sm font-bold text-green-800">
          Die Rechnung wurde manuell als bezahlt markiert und im Audit-Protokoll erfasst.
        </p>
      ) : null}
      {query.status === "canceled" ? (
        <p className="mb-5 rounded-md border border-green-200 bg-green-50 p-4 text-sm font-bold text-green-800">
          Die Rechnung wurde mit Begründung storniert und im Audit-Protokoll erfasst.
        </p>
      ) : null}
      {query.error ? (
        <p className="mb-5 rounded-md border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800">
          {errorMessage(query.error)}
        </p>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[1.4fr_0.8fr]">
        {contentIsImmutable ? (
          <Panel title="Rechnungsinhalt (unveränderlich)">
            <div className="grid gap-4">
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
                Freigegebene und regelmäßig erzeugte Rechnungen sind revisionssicher gesperrt. Empfänger,
                Zeitraum, Beträge und Positionen können hier nicht mehr bearbeitet werden.
              </p>
              <dl className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="font-bold text-slate-500">Rechnungsnummer</dt>
                  <dd className="mt-1 text-slate-950">{invoice.invoice_number || "–"}</dd>
                </div>
                <div>
                  <dt className="font-bold text-slate-500">Abrechnungsmonat</dt>
                  <dd className="mt-1 text-slate-950">{formatDate(invoice.billing_month)}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="font-bold text-slate-500">Hinweis</dt>
                  <dd className="mt-1 whitespace-pre-wrap text-slate-950">{invoice.billing_note || "–"}</dd>
                </div>
              </dl>
              <div className="grid gap-3">
                {((items ?? []) as InvoiceItemRow[]).map((item, index) => (
                  <div
                    key={`${item.title}-${index}`}
                    className="flex flex-col gap-2 rounded-lg border border-slate-200 p-4 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div>
                      <p className="font-bold text-slate-950">{item.title}</p>
                      {item.description ? (
                        <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-600">{item.description}</p>
                      ) : null}
                      <p className="mt-1 text-xs text-slate-500">
                        {item.quantity} {item.unit} × {formatEuro(item.unit_net)}
                      </p>
                    </div>
                    <p className="font-extrabold text-slate-950">{formatEuro(item.total_net)}</p>
                  </div>
                ))}
              </div>
            </div>
          </Panel>
        ) : (
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
        )}

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
                {invoice.paid_at ? (
                  <p>
                    <strong className="text-slate-900">Bezahlt am:</strong> {formatDateTime(invoice.paid_at)}
                  </p>
                ) : null}
                {invoice.canceled_at ? (
                  <p>
                    <strong className="text-slate-900">Storniert am:</strong> {formatDateTime(invoice.canceled_at)}
                  </p>
                ) : null}
              </div>
              {hasOriginalPdf || !contentIsImmutable ? (
                <Link href={`/api/documents/invoices/${invoice.id}`} className={buttonClass}>
                  PDF herunterladen
                </Link>
              ) : null}
              {invoice.net_total_cents !== null &&
              invoice.tax_total_cents !== null &&
              invoice.gross_total_cents !== null ? (
                <Link
                  href={`/api/invoices/${invoice.id}/structured`}
                  className={`${buttonClass} bg-slate-800 hover:bg-slate-950`}
                >
                  Strukturierte Daten (JSON)
                </Link>
              ) : null}
              {canSend ? (
                <form action={sendInvoiceAction}>
                  <input type="hidden" name="invoiceId" value={invoice.id} />
                  <button className={`${buttonClass} w-full`}>
                    {hasOriginalPdf && invoice.sent_at
                      ? "Unverändertes Original erneut senden"
                      : hasOriginalPdf
                        ? "Unverändertes Original senden"
                        : "Rechnung an Kunden senden"}
                  </button>
                </form>
              ) : (
                <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">
                  {invoice.processing_token
                    ? "Die Rechnung wird gerade automatisch verarbeitet."
                    : invoice.status === "canceled"
                      ? "Stornierte Rechnungen werden nicht erneut versendet."
                      : "Für den Versand ist das geprüfte Original-PDF erforderlich."}
                </p>
              )}
              <p className="text-xs leading-5 text-slate-500">
                {hasOriginalPdf
                  ? "Der Versand verwendet ausschließlich das gespeicherte, per SHA-256 geprüfte PDF und die E-Mail-Adresse aus dem Empfänger-Snapshot."
                  : "Beim Senden erhält der Kunde die Rechnung als PDF-Anhang. Im Portal erscheint sie mit dem Status „Erstellt“."}
              </p>
            </div>
          </Panel>

          <Panel title="Zahlung & Storno">
            {invoice.processing_token ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
                Während der automatischen Verarbeitung sind manuelle Statusänderungen gesperrt.
              </p>
            ) : (
              <div className="grid gap-4">
                {query.error === "audit" && invoice.status === "paid" ? (
                  <form action={markInvoicePaidAction}>
                    <input type="hidden" name="invoiceId" value={invoice.id} />
                    <button className={`${buttonClass} w-full`}>
                      Audit-Protokoll erneut schreiben
                    </button>
                  </form>
                ) : null}
                {query.error === "audit" &&
                invoice.status === "canceled" &&
                invoice.cancellation_reason ? (
                  <form action={cancelInvoiceAction}>
                    <input type="hidden" name="invoiceId" value={invoice.id} />
                    <input
                      type="hidden"
                      name="cancellationReason"
                      value={invoice.cancellation_reason}
                    />
                    <button className={`${buttonClass} w-full`}>
                      Audit-Protokoll erneut schreiben
                    </button>
                  </form>
                ) : null}
                {canMarkPaid ? (
                  <form action={markInvoicePaidAction}>
                    <input type="hidden" name="invoiceId" value={invoice.id} />
                    <button className={`${buttonClass} w-full`}>
                      Manuell als bezahlt markieren
                    </button>
                  </form>
                ) : invoice.status === "paid" ? (
                  <p className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm leading-6 text-green-900">
                    Diese Rechnung ist als bezahlt erfasst.
                  </p>
                ) : null}

                {canCancel ? (
                  <details className="rounded-lg border border-red-200 bg-red-50 p-3">
                    <summary className="cursor-pointer text-sm font-extrabold text-red-800">
                      Rechnung stornieren
                    </summary>
                    <p className="mt-3 text-xs leading-5 text-red-800">
                      Das Original und alle Rechnungspositionen bleiben unverändert erhalten. Der Stornogrund wird dauerhaft protokolliert.
                    </p>
                    <form action={cancelInvoiceAction} className="mt-3 grid gap-3">
                      <input type="hidden" name="invoiceId" value={invoice.id} />
                      <label className="text-sm font-bold text-slate-900">
                        Pflichtgrund
                        <textarea
                          name="cancellationReason"
                          className={inputClass}
                          rows={3}
                          minLength={5}
                          maxLength={1000}
                          required
                          placeholder="Warum wird diese Rechnung storniert?"
                        />
                      </label>
                      <button className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-red-700 px-4 py-2 text-sm font-extrabold text-white transition hover:bg-red-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700 focus-visible:ring-offset-2">
                        Stornierung verbindlich ausführen
                      </button>
                    </form>
                  </details>
                ) : invoice.status === "canceled" ? (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-900">
                    <p className="font-extrabold">Diese Rechnung ist storniert.</p>
                    <p className="mt-1 whitespace-pre-wrap">
                      {invoice.cancellation_reason || "Kein Stornogrund gespeichert."}
                    </p>
                  </div>
                ) : null}
              </div>
            )}
          </Panel>

          {invoice.error_code || invoice.error_message ? (
            <Panel title={processingError ? "Abrechnung wird verarbeitet" : "Abrechnungsfehler"}>
              <div
                className={`rounded-lg border p-3 text-sm leading-6 ${
                  processingError
                    ? "border-amber-200 bg-amber-50 text-amber-950"
                    : "border-red-200 bg-red-50 text-red-950"
                }`}
              >
                <p className="font-extrabold">
                  {invoiceErrorDescription(invoice.error_code)}
                </p>
                {invoice.error_message ? (
                  <p className="mt-2 whitespace-pre-wrap">{invoice.error_message}</p>
                ) : null}
                {invoice.error_code && !processingError ? (
                  <p className="mt-2 font-mono text-xs">Fehlercode: {invoice.error_code}</p>
                ) : null}
              </div>
            </Panel>
          ) : null}
        </div>
      </div>
    </>
  );
}
