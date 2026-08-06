import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Download,
  FileCheck2,
  MapPin,
  ReceiptText,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { acceptOfferVersionAction, rejectOfferVersionAction } from "@/app/actions/offers";
import { PortalDialog } from "@/components/portal/PortalDialog";
import { OfferViewedTracker } from "@/components/portal/offers/OfferViewedTracker";
import { CompactSection, Field, PageHeader, inputClass } from "@/components/portal/PortalUI";
import {
  offerDiscountsForPdf,
  offerVersionItemsForPdf,
  type OfferAcceptanceDocumentRow,
  type OfferVersionDocumentRow,
} from "@/lib/offerDocuments";
import { berlinIsoDate, formatCents, formatGermanDate } from "@/lib/portal/core";
import { requireCustomerContext } from "@/lib/portal/access";
import {
  effectiveOfferStatus,
  OfferDateLine,
  OfferPriceSummary,
  OfferStatusBadge,
  type PortalOfferVersion,
} from "../_shared";

const PORTAL_OFFER_VERSION_SELECT = [
  "id,offer_id,customer_id,version_number,lifecycle_status,offer_number,title,contact_name",
  "recipient_snapshot,object_label,object_address,offer_date,valid_until,planned_start_date",
  "intro,visible_note,payment_terms,contract_terms,issuer_snapshot",
  "subtotal_cents,discount_total_cents,net_total_cents,tax_total_cents,gross_total_cents,billing_totals",
  "frozen_at,sent_at,original_pdf_bucket,original_pdf_path,original_pdf_sha256,document_content_sha256,created_at",
  "offer_version_items(id,client_key,item_kind,title,description,area_sqm,quantity,unit,frequency,frequency_occurrences,billing_type,calculation_type,unit_price_cents,minimum_price_cents,automatic_total_cents,total_net_cents,tax_rate_bps,manual_price,permanent,seasonal,season_start_month,season_end_month,visible_note,winter_surface_type,winter_model,included_visits,additional_visit_price_cents,monthly_base_fee_cents,seasonal_flat_rate_cents,surcharge_cents,price_components,pricing_snapshot,sort_order)",
  "offer_discounts(id,offer_item_id,scope,discount_type,percentage_bps,amount_cents,applied_amount_cents,reason,sort_order)",
].join(",");

type RejectionRow = {
  id: string;
  rejected_name: string | null;
  comment: string | null;
  rejected_at: string;
};

type DetailRow = OfferVersionDocumentRow & {
  offer_acceptances: OfferAcceptanceDocumentRow[] | null;
  offer_rejections: RejectionRow[] | null;
};

const unitLabels: Record<string, string> = {
  square_meter: "m²",
  piece: "Stück",
  hour: "Stunde",
  visit: "Einsatz",
  month: "Monat",
  flat: "Pauschale",
};

const frequencyLabels: Record<string, string> = {
  once: "Einmalig",
  weekly: "Wöchentlich",
  multiple_weekly: "Mehrmals wöchentlich",
  monthly: "Monatlich",
  quarterly: "Vierteljährlich",
  yearly: "Jährlich",
  on_demand: "Nach Bedarf",
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function recipientLines(value: unknown) {
  const recipient = asRecord(value);
  const name = text(recipient.recipient_name) || text(recipient.company_name) || [text(recipient.first_name), text(recipient.last_name)].filter(Boolean).join(" ") || text(recipient.contact_name);
  const street = text(recipient.address) || [text(recipient.street), text(recipient.house_number)].filter(Boolean).join(" ");
  const city = [text(recipient.postal_code), text(recipient.city)].filter(Boolean).join(" ");
  return [name, street, city, text(recipient.country)].filter(Boolean) as string[];
}

function numberValue(value: number | string | null | undefined) {
  const result = typeof value === "number" ? value : Number(value);
  return Number.isFinite(result) ? result : 0;
}

export default async function CustomerOfferDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string; error?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const { profile, customerId, supabase } = await requireCustomerContext();
  const detailSelect = `${PORTAL_OFFER_VERSION_SELECT},offer_acceptances(id,offer_version_id,accepted_name,accepted_at,confirmed_gross_total_cents,confirmed_totals,confirmed_content_sha256,comment,confirmation_pdf_bucket,confirmation_pdf_path,confirmation_pdf_sha256),offer_rejections(id,rejected_name,comment,rejected_at)`;
  const { data, error } = await supabase
    .from("offer_versions")
    .select(detailSelect)
    .eq("id", id)
    .eq("customer_id", customerId)
    .maybeSingle();
  if (error || !data) notFound();

  const version = data as unknown as DetailRow;
  if (["draft"].includes(version.lifecycle_status)) notFound();

  const { data: historyData } = await supabase
    .from("offer_versions")
    .select("id,offer_id,version_number,lifecycle_status,offer_number,title,offer_date,valid_until,net_total_cents,tax_total_cents,gross_total_cents,billing_totals")
    .eq("offer_id", version.offer_id)
    .eq("customer_id", customerId)
    .neq("lifecycle_status", "draft")
    .order("version_number", { ascending: false });

  const today = berlinIsoDate();
  const portalVersion = version as unknown as PortalOfferVersion;
  const status = effectiveOfferStatus(portalVersion, today);
  const canRespond = ["sent", "viewed"].includes(status);
  const acceptance = version.offer_acceptances?.[0] ?? null;
  const rejection = version.offer_rejections?.[0] ?? null;
  const sortedItems = (version.offer_version_items ?? []).slice().sort((left, right) => left.sort_order - right.sort_order);
  const pdfItems = offerVersionItemsForPdf(version);
  const discounts = offerDiscountsForPdf(version);
  const recipient = asRecord(version.recipient_snapshot);
  const recipientAddress = recipientLines(recipient);
  const history = (historyData ?? []) as unknown as PortalOfferVersion[];

  return (
    <>
      {["sent", "viewed"].includes(version.lifecycle_status) ? <OfferViewedTracker offerVersionId={version.id} /> : null}
      <Link href="/portal/offers" className="mb-4 inline-flex items-center gap-2 text-sm font-extrabold text-brand hover:underline">
        <ArrowLeft aria-hidden="true" size={17} /> Zurück zu allen Angeboten
      </Link>
      <PageHeader
        eyebrow={`${version.offer_number} · Version ${version.version_number}`}
        title={version.title}
        text="Preis und Entscheidung zuerst – Details öffnen Sie nur bei Bedarf."
        icon={<FileCheck2 aria-hidden="true" size={20} />}
        compact
      />

      {query.status ? (
        <p className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-900">
          {query.status}
        </p>
      ) : null}
      {query.error ? (
        <p role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800">
          {query.error}
        </p>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid gap-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <OfferStatusBadge status={status} />
                <div className="mt-3"><OfferDateLine version={portalVersion} /></div>
              </div>
              <Link
                href={`/api/documents/offers/${version.id}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-extrabold text-white transition hover:bg-brand-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
              >
                <Download aria-hidden="true" size={17} /> Original-PDF öffnen
              </Link>
            </div>

            <div className="mt-5 grid gap-4 border-t border-slate-100 pt-5 md:grid-cols-2">
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-slate-500">
                  <ReceiptText aria-hidden="true" size={16} /> Empfänger
                </p>
                <div className="mt-2 text-sm font-semibold leading-6 text-slate-800">
                  {recipientAddress.length ? recipientAddress.map((line) => <p key={line}>{line}</p>) : <p>Keine Anschrift hinterlegt</p>}
                  {text(recipient.email) ? <p className="mt-1 text-slate-600">{text(recipient.email)}</p> : null}
                </div>
              </div>
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-slate-500">
                  <MapPin aria-hidden="true" size={16} /> Objekt
                </p>
                <p className="mt-2 font-black text-slate-900">{version.object_label || "Noch keinem Objekt zugeordnet"}</p>
                {version.object_address ? <p className="mt-1 text-sm leading-6 text-slate-600">{version.object_address}</p> : null}
                {version.planned_start_date ? (
                  <p className="mt-2 flex items-center gap-2 text-sm font-bold text-slate-700">
                    <CalendarDays aria-hidden="true" size={16} /> Geplanter Start: {formatGermanDate(`${version.planned_start_date}T12:00:00Z`)}
                  </p>
                ) : null}
              </div>
            </div>

            {version.intro ? <p className="mt-5 whitespace-pre-wrap text-sm leading-7 text-slate-700">{version.intro}</p> : null}
          </section>

          <CompactSection
            title="Leistungspositionen"
            description="Mengen, Intervalle und Einzelkalkulationen"
            badge={<span className="rounded-full bg-brand-soft px-2.5 py-1 text-xs font-black text-brand">{sortedItems.length}</span>}
          >
            <div className="grid gap-3">
              {sortedItems.map((item, index) => {
                const winterDetails = item.item_kind === "winter"
                  ? (pdfItems[index]?.details ?? []).filter((detail) => (
                      !/^(Fläche|Ausführung|Saison):/.test(detail)
                      && detail !== item.visible_note
                    ))
                  : [];
                return (
                <article key={item.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-black text-slate-950">{index + 1}. {item.title}</p>
                      {item.description ? <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-600">{item.description}</p> : null}
                      <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold text-slate-600">
                        <span className="rounded-full bg-slate-100 px-2.5 py-1">
                          {numberValue(item.quantity).toLocaleString("de-DE")} {unitLabels[item.unit] || item.unit}
                        </span>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1">
                          {frequencyLabels[item.frequency] || item.frequency}
                          {item.frequency === "multiple_weekly" ? ` · ${item.frequency_occurrences}×` : ""}
                        </span>
                        {numberValue(item.area_sqm) > 0 ? (
                          <span className="rounded-full bg-slate-100 px-2.5 py-1">{numberValue(item.area_sqm).toLocaleString("de-DE")} m²</span>
                        ) : null}
                        {item.seasonal && item.season_start_month && item.season_end_month ? (
                          <span className="rounded-full bg-slate-100 px-2.5 py-1">Saison {item.season_start_month}–{item.season_end_month}</span>
                        ) : null}
                        {item.manual_price ? <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-800">Individuell kalkuliert</span> : null}
                      </div>
                      {winterDetails.length ? (
                        <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 p-3">
                          <p className="text-xs font-extrabold uppercase tracking-wide text-sky-900">Verbindliche Winterdienst-Konditionen</p>
                          <ul className="mt-2 grid gap-1.5 text-sm font-semibold leading-6 text-sky-950 sm:grid-cols-2">
                            {winterDetails.map((detail) => <li key={detail}>• {detail}</li>)}
                          </ul>
                        </div>
                      ) : null}
                      {item.visible_note ? <p className="mt-3 text-sm font-semibold leading-6 text-slate-700">{item.visible_note}</p> : null}
                    </div>
                    <div className="shrink-0 rounded-xl bg-brand-soft px-3 py-2 text-right">
                      <p className="text-sm font-black text-brand">{pdfItems[index]?.billingLabel || formatCents(numberValue(item.total_net_cents))}</p>
                      <p className="mt-0.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">netto</p>
                    </div>
                  </div>
                </article>
                );
              })}
            </div>
          </CompactSection>

          {discounts.length ? (
            <CompactSection
              title="Berücksichtigte Rabatte"
              description="Alle Nachlässe dieser Angebotsversion"
              badge={<span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-700">{discounts.length}</span>}
            >
              <div className="grid gap-2">
                {discounts.map((discount, index) => (
                  <div key={`${discount.label}-${index}`} className="flex items-start justify-between gap-4 rounded-xl bg-white p-3 text-sm">
                    <div>
                      <p className="font-extrabold text-slate-900">{discount.label}</p>
                      {discount.detail ? <p className="mt-0.5 text-slate-600">{discount.detail}</p> : null}
                    </div>
                    <p className="shrink-0 font-black text-emerald-800">−{formatCents(discount.amountCents)}</p>
                  </div>
                ))}
              </div>
            </CompactSection>
          ) : null}

          <CompactSection
            title="Preisübersicht"
            description="Einmalige, monatliche, saisonale und einsatzbezogene Beträge"
            defaultOpen
          >
            <div>
              <OfferPriceSummary
                billingTotals={version.billing_totals}
                netTotalCents={version.net_total_cents}
                taxTotalCents={version.tax_total_cents}
                grossTotalCents={version.gross_total_cents}
              />
            </div>
          </CompactSection>

          {version.visible_note || version.payment_terms || version.contract_terms ? (
            <CompactSection
              title="Hinweise & Bedingungen"
              description="Leistungs-, Zahlungs- und Vertragsbedingungen"
            >
              <div className="grid gap-4">
                {version.visible_note ? <div><h3 className="font-extrabold text-slate-900">Hinweise zum Leistungsumfang</h3><p className="mt-1 whitespace-pre-wrap text-sm leading-7 text-slate-700">{version.visible_note}</p></div> : null}
                {version.payment_terms ? <div><h3 className="font-extrabold text-slate-900">Zahlungsbedingungen</h3><p className="mt-1 whitespace-pre-wrap text-sm leading-7 text-slate-700">{version.payment_terms}</p></div> : null}
                {version.contract_terms ? <div><h3 className="font-extrabold text-slate-900">Vertragsbedingungen</h3><p className="mt-1 whitespace-pre-wrap text-sm leading-7 text-slate-700">{version.contract_terms}</p></div> : null}
              </div>
            </CompactSection>
          ) : null}
        </div>

        <aside className="order-first grid content-start gap-4 xl:order-none">
          {canRespond ? (
            <PortalDialog
              triggerLabel="Angebot beantworten"
              triggerIcon={<ShieldCheck aria-hidden="true" size={18} />}
              title="Angebot verbindlich beantworten"
              description="Prüfen Sie Ihren Namen und bestätigen Sie Ihre Entscheidung."
              size="md"
              triggerClassName="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-black text-white shadow-sm transition hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-200"
            >
              <div className="flex items-start gap-3">
                <span className="rounded-xl bg-emerald-100 p-2 text-emerald-700"><ShieldCheck aria-hidden="true" size={22} /></span>
                <div>
                  <h2 className="font-black text-slate-950">Verbindlich annehmen</h2>
                  <p className="mt-1 text-sm leading-6 text-slate-600">Ihre Bestätigung wird mit Name, Zeitpunkt, Version und den getrennten Abrechnungsbeträgen protokolliert.</p>
                </div>
              </div>
              <form action={acceptOfferVersionAction} className="mt-4 grid gap-4">
                <input type="hidden" name="offerVersionId" value={version.id} />
                <input type="hidden" name="expectedGrossTotalCents" value={String(numberValue(version.gross_total_cents))} />
                <Field label="Name der annehmenden Person">
                  <input name="acceptedName" defaultValue={profile.full_name || ""} required minLength={2} maxLength={200} autoComplete="name" className={inputClass} />
                </Field>
                <Field label="Kommentar (optional)">
                  <textarea name="comment" maxLength={4000} rows={3} className={inputClass} placeholder="Optionaler Hinweis an Hausvia" />
                </Field>
                <label className="flex gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-bold leading-6 text-slate-800">
                  <input type="checkbox" name="confirmed" value="true" required className="mt-1 h-5 w-5 shrink-0 rounded border-slate-300 text-brand focus:ring-brand" />
                  <span>Ich nehme das vorliegende Angebot verbindlich an.</span>
                </label>
                <button className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-black text-white transition hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2">
                  <CheckCircle2 aria-hidden="true" size={18} /> Angebot verbindlich annehmen
                </button>
              </form>

              <details className="mt-5 border-t border-slate-100 pt-4">
                <summary className="cursor-pointer text-sm font-extrabold text-rose-700">Angebot ablehnen</summary>
                <form action={rejectOfferVersionAction} className="mt-3 grid gap-3">
                  <input type="hidden" name="offerVersionId" value={version.id} />
                  <input type="hidden" name="rejectedName" value={profile.full_name || ""} />
                  <Field label="Grund (optional)">
                    <textarea name="comment" maxLength={4000} rows={3} className={inputClass} placeholder="Optionaler Ablehnungsgrund" />
                  </Field>
                  <button className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-rose-300 bg-white px-4 py-2 text-sm font-black text-rose-700 transition hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600">
                    <XCircle aria-hidden="true" size={18} /> Angebot ablehnen
                  </button>
                </form>
              </details>
            </PortalDialog>
          ) : null}

          {acceptance ? (
            <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 sm:p-5">
              <FileCheck2 aria-hidden="true" className="text-emerald-700" size={26} />
              <h2 className="mt-3 font-black text-emerald-950">Verbindlich angenommen</h2>
              <p className="mt-2 text-sm leading-6 text-emerald-900">
                {acceptance.accepted_name} · {formatGermanDate(acceptance.accepted_at, { hour: "2-digit", minute: "2-digit" })}
              </p>
              <p className="mt-3 text-sm font-bold leading-6 text-emerald-950">Verbindlich bestätigt wurden die folgenden getrennten Abrechnungsbeträge:</p>
              <div className="mt-3">
                <OfferPriceSummary
                  billingTotals={acceptance.confirmed_totals}
                  netTotalCents={version.net_total_cents}
                  taxTotalCents={version.tax_total_cents}
                  grossTotalCents={acceptance.confirmed_gross_total_cents}
                />
              </div>
              <p className="mt-3 text-xs font-semibold leading-5 text-emerald-900">
                Rechnerische Vergleichssumme: {formatCents(numberValue(acceptance.confirmed_gross_total_cents))} brutto. Sie ist bei gemischter Abrechnung kein einheitlicher Zahlbetrag.
              </p>
              {acceptance.comment ? <p className="mt-3 whitespace-pre-wrap rounded-xl bg-white/80 p-3 text-sm leading-6 text-slate-700">{acceptance.comment}</p> : null}
              <Link
                href={`/api/documents/offers/${acceptance.id}/acceptance`}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-extrabold text-white hover:bg-emerald-800"
              >
                <Download aria-hidden="true" size={17} /> Annahmebestätigung als PDF
              </Link>
            </section>
          ) : null}

          {rejection ? (
            <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4 sm:p-5">
              <XCircle aria-hidden="true" className="text-rose-700" size={26} />
              <h2 className="mt-3 font-black text-rose-950">Abgelehnt</h2>
              <p className="mt-2 text-sm leading-6 text-rose-900">
                {formatGermanDate(rejection.rejected_at, { hour: "2-digit", minute: "2-digit" })}
              </p>
              {rejection.comment ? <p className="mt-3 whitespace-pre-wrap rounded-xl bg-white/80 p-3 text-sm leading-6 text-slate-700">{rejection.comment}</p> : null}
            </section>
          ) : null}

          {history.length > 1 ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <h2 className="font-black text-slate-950">Versionsverlauf</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">Frühere Versionen bleiben unverändert lesbar.</p>
              <div className="mt-3 grid gap-2">
                {history.map((historyVersion) => {
                  const historyStatus = effectiveOfferStatus(historyVersion, today);
                  return (
                    <Link
                      key={historyVersion.id}
                      href={`/portal/offers/${historyVersion.id}`}
                      aria-current={historyVersion.id === version.id ? "page" : undefined}
                      className={`rounded-xl border p-3 transition ${historyVersion.id === version.id ? "border-brand bg-brand-soft" : "border-slate-200 hover:border-brand/40"}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-black text-slate-900">Version {historyVersion.version_number}</p>
                        <OfferStatusBadge status={historyStatus} />
                      </div>
                      <p className="mt-1 text-xs font-semibold text-slate-500">vom {formatGermanDate(`${historyVersion.offer_date}T12:00:00Z`)}</p>
                    </Link>
                  );
                })}
              </div>
            </section>
          ) : null}
        </aside>
      </div>
    </>
  );
}
