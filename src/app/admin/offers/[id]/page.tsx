import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Copy, FileDown, Mail, Send, ShieldCheck } from "lucide-react";
import {
  duplicateOfferAction,
  retryOfferAcceptanceDeliveryAction,
  resendOfferVersionAction,
  sendOfferVersionAction,
  withdrawOfferVersionAction,
} from "@/app/actions/offers";
import { OfferEditor } from "@/components/portal/offers/OfferEditor";
import { OfferLinkWizard } from "@/components/portal/offers/OfferLinkWizard";
import { OfferStatusBadge } from "@/components/portal/offers/OfferStatusBadge";
import {
  offerCatalogItems,
  offerCustomerOptions,
  offerEditorItems,
  overallEditorDiscounts,
} from "@/components/portal/offers/data";
import type {
  OfferEditorInitial,
  OfferLifecycleStatus,
  OfferPropertyOption,
  OfferRecipientSnapshot,
} from "@/components/portal/offers/types";
import { EmptyState, PageHeader, Panel, buttonClass, inputClass } from "@/components/portal/PortalUI";
import { billingBucketLabels, formatCents, type BillingBucket } from "@/lib/offerPricing";
import { berlinIsoDate } from "@/lib/portal/core";
import { requireAdminContext } from "@/lib/portal/access";

type UnknownRow = Record<string, unknown>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function queryValue(params: Awaited<SearchParams>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : value == null ? fallback : String(value);
}

function relation(value: unknown): UnknownRow {
  if (Array.isArray(value)) return relation(value[0]);
  return value && typeof value === "object" ? value as UnknownRow : {};
}

function jsonObject(value: unknown): UnknownRow {
  return value && !Array.isArray(value) && typeof value === "object" ? value as UnknownRow : {};
}

function dateLabel(value: unknown, withTime = false) {
  const raw = text(value);
  if (!raw) return "—";
  const date = new Date(raw.length === 10 ? `${raw}T12:00:00Z` : raw);
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat("de-DE", withTime
    ? { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }
    : { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

function secondaryButton(tone: "default" | "danger" = "default") {
  return `inline-flex min-h-11 items-center justify-center gap-2 rounded-md border bg-white px-4 py-2 text-sm font-extrabold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${tone === "danger" ? "border-red-200 text-red-700 hover:bg-red-50 focus-visible:ring-red-600" : "border-slate-300 text-slate-750 hover:border-brand hover:text-brand focus-visible:ring-brand"}`;
}

function recipientSnapshot(value: unknown): OfferRecipientSnapshot {
  const source = jsonObject(value);
  return {
    company_name: text(source.company_name),
    contact_name: text(source.contact_name),
    first_name: text(source.first_name),
    last_name: text(source.last_name),
    email: text(source.email),
    phone: text(source.phone),
    recipient_name: text(source.recipient_name),
    address: text(source.address),
    postal_code: text(source.postal_code),
    city: text(source.city),
    country: text(source.country, "Deutschland"),
  };
}

export default async function AdminOfferDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const query = await searchParams;
  const successMessage = queryValue(query, "status") || queryValue(query, "message");
  const { admin: supabase } = await requireAdminContext();
  const [{ data: offer, error: offerError }, { data: versions, error: versionsError }] = await Promise.all([
    supabase
      .from("offers")
      .select("id,customer_id,lifecycle_status,current_version_id,active_version_id,draft_version_id,offer_number,title,source_offer_id,created_at,updated_at")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("offer_versions")
      .select("*")
      .eq("offer_id", id)
      .order("version_number", { ascending: false }),
  ]);
  if (offerError || versionsError) throw new Error("Das Angebot konnte nicht geladen werden.");
  if (!offer) notFound();

  const selectedId = queryValue(query, "version") || text(offer.draft_version_id || offer.current_version_id || offer.active_version_id);
  const selectedVersion = (versions ?? []).find((version) => text(version.id) === selectedId) ?? versions?.[0];
  if (!selectedVersion) notFound();

  const [
    itemsResult,
    discountsResult,
    customersResult,
    catalogResult,
    propertiesResult,
    buildingsResult,
    linkResult,
    acceptanceResult,
    rejectionResult,
  ] = await Promise.all([
    supabase.from("offer_version_items").select("*").eq("offer_version_id", selectedVersion.id).order("sort_order", { ascending: true }),
    supabase.from("offer_discounts").select("*").eq("offer_version_id", selectedVersion.id).order("sort_order", { ascending: true }),
    supabase.from("customers").select("id,status,company_name,contact_name,first_name,last_name,email,phone,billing_address,billing_street,billing_house_number,billing_postal_code,billing_city,billing_country").neq("status", "archived").order("company_name", { ascending: true }),
    supabase.from("service_catalog").select("id,service_key,name,category,customer_description,default_execution_rule,default_occurrences_per_period,default_seasonal,default_season_start_month,default_season_end_month,sort_order,service_pricing_rules(*)").eq("status", "active").order("sort_order", { ascending: true }),
    supabase.from("properties").select("id,customer_id,name,status").eq("customer_id", selectedVersion.customer_id).in("status", ["planning", "active", "paused"]).order("name", { ascending: true }),
    supabase.from("buildings").select("id,property_id,label,formatted_address,status,properties!inner(customer_id)").eq("properties.customer_id", selectedVersion.customer_id).neq("status", "archived").order("created_at", { ascending: true }),
    supabase.from("offer_property_links").select("id,offer_id,offer_version_id,property_id,linked_at,import_completed_at,properties(id,name)").eq("offer_id", id).maybeSingle(),
    supabase.from("offer_acceptances").select("id,offer_version_id,accepted_name,accepted_at,confirmed_gross_total_cents,comment,confirmation_pdf_path,offer_acceptance_delivery_jobs(id,status,attempts,available_at,last_attempt_at,sent_at,failed_at,last_error)").eq("offer_version_id", selectedVersion.id).maybeSingle(),
    supabase.from("offer_rejections").select("id,offer_version_id,rejected_name,rejected_at,comment").eq("offer_version_id", selectedVersion.id).maybeSingle(),
  ]);
  const loadError = [itemsResult, discountsResult, customersResult, catalogResult, propertiesResult, buildingsResult, linkResult, acceptanceResult, rejectionResult].find((result) => result.error)?.error;
  if (loadError) throw new Error("Die Angebotsversion konnte nicht vollständig geladen werden.");

  const catalogItems = offerCatalogItems(catalogResult.data ?? []);
  const storedEditorItems = offerEditorItems(itemsResult.data ?? [], discountsResult.data ?? []);
  const storedStatus = text(selectedVersion.lifecycle_status, "draft") as OfferLifecycleStatus;
  const status = (["sent", "viewed"].includes(storedStatus) && text(selectedVersion.valid_until) < berlinIsoDate())
    ? "expired"
    : storedStatus;
  const isDraftLifecycle = status === "draft";
  const isEditableDraft = isDraftLifecycle && !selectedVersion.frozen_at;
  const isSelectedDraft = text(offer.draft_version_id) === text(selectedVersion.id);
  const isSelectedActive = text(offer.active_version_id) === text(selectedVersion.id);
  const canCreateRevision = !offer.draft_version_id && isSelectedActive && !["accepted", "linked"].includes(text(offer.lifecycle_status));
  const currentCatalogById = new Map(catalogItems.map((item) => [item.id, item]));
  const editorItems = isEditableDraft
    ? storedEditorItems.map((item) => {
        const catalogItem = item.serviceCatalogId ? currentCatalogById.get(item.serviceCatalogId) : null;
        if (!catalogItem) return item;
        return {
          ...item,
          calculationType: catalogItem.rule.calculationType,
          unitPriceCents: catalogItem.rule.unitPriceCents,
          rule: catalogItem.rule,
        };
      })
    : storedEditorItems;
  const propertyLink = linkResult.data;
  const acceptanceDeliveryJob = relation(acceptanceResult.data?.offer_acceptance_delivery_jobs);
  const linkedProperty = relation(propertyLink?.properties);
  const buildingsByProperty = new Map<string, Array<{ id: string; name: string }>>();
  const propertyAddressById = new Map<string, string>();
  for (const building of buildingsResult.data ?? []) {
    const propertyId = text(building.property_id);
    buildingsByProperty.set(propertyId, [...(buildingsByProperty.get(propertyId) ?? []), { id: text(building.id), name: text(building.label || building.formatted_address, "Gebäude") }]);
    if (!propertyAddressById.has(propertyId)) propertyAddressById.set(propertyId, text(building.formatted_address));
  }
  const propertyOptions: OfferPropertyOption[] = (propertiesResult.data ?? []).map((property) => ({
    id: text(property.id),
    name: text(property.name, "Unbenannte Immobilie"),
    address: propertyAddressById.get(text(property.id)) ?? "",
    buildings: buildingsByProperty.get(text(property.id)) ?? [],
  }));
  const initial: OfferEditorInitial = {
    offerId: text(offer.id),
    versionId: text(selectedVersion.id),
    expectedUpdatedAt: isEditableDraft ? text(selectedVersion.updated_at) : undefined,
    offerNumber: text(selectedVersion.offer_number || offer.offer_number),
    versionNumber: Number(selectedVersion.version_number),
    customerId: text(selectedVersion.customer_id || offer.customer_id),
    title: text(selectedVersion.title || offer.title),
    contactName: text(selectedVersion.contact_name),
    recipientSnapshot: recipientSnapshot(selectedVersion.recipient_snapshot),
    objectLabel: text(selectedVersion.object_label),
    objectAddress: text(selectedVersion.object_address),
    offerDate: text(selectedVersion.offer_date),
    validUntil: text(selectedVersion.valid_until),
    plannedStartDate: text(selectedVersion.planned_start_date),
    intro: text(selectedVersion.intro),
    visibleNote: text(selectedVersion.visible_note),
    internalNote: text(selectedVersion.internal_note),
    paymentTerms: text(selectedVersion.payment_terms),
    contractTerms: text(selectedVersion.contract_terms),
    items: editorItems,
    overallDiscounts: overallEditorDiscounts(discountsResult.data ?? []),
  };
  const billingTotals = jsonObject(selectedVersion.billing_totals);
  const billingRows = (Object.entries(billingTotals) as Array<[BillingBucket, unknown]>).filter(([bucket]) => bucket in billingBucketLabels).map(([bucket, value]) => ({ bucket, values: jsonObject(value) }));

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link href="/admin/offers" className="inline-flex min-h-11 items-center gap-2 text-sm font-extrabold text-brand hover:underline"><ArrowLeft size={18} aria-hidden="true" /> Zur Angebotsübersicht</Link>
        <OfferStatusBadge status={status} />
      </div>
      <PageHeader eyebrow={`${text(selectedVersion.offer_number)} · Version ${selectedVersion.version_number}`} title={text(selectedVersion.title)} text={isEditableDraft ? "Bearbeitbarer Entwurf. Beim Versand wird diese Version versiegelt und danach unveränderlich archiviert." : isDraftLifecycle ? "Diese Version ist bereits versiegelt. Ein unterbrochener Versand kann sicher fortgesetzt werden." : "Versiegelte Angebotsversion. Inhalt und Original-PDF bleiben unveränderlich nachvollziehbar."} />

      {successMessage ? <p role="status" className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-900">{successMessage}</p> : null}
      {queryValue(query, "error") ? <p role="alert" className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-900">{queryValue(query, "error")}</p> : null}

      <div className="mb-5 grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
        <Panel title="Version & Aktionen">
          <div className="flex flex-wrap gap-2">
            {isDraftLifecycle && isSelectedDraft && !selectedVersion.sent_at ? <form action={sendOfferVersionAction}><input type="hidden" name="offerId" value={id} /><input type="hidden" name="versionId" value={selectedVersion.id} /><button className={buttonClass}><Send size={17} aria-hidden="true" /> {selectedVersion.frozen_at ? "Versand fortsetzen" : "Version versiegeln und senden"}</button></form> : null}
            {selectedVersion.sent_at && selectedVersion.original_pdf_path ? <form action={resendOfferVersionAction}><input type="hidden" name="offerId" value={id} /><input type="hidden" name="versionId" value={selectedVersion.id} /><button className={secondaryButton()}><Mail size={17} aria-hidden="true" /> Erneut senden</button></form> : null}
            {selectedVersion.original_pdf_path ? <Link href={`/api/documents/offers/${id}?version=${selectedVersion.id}`} className={secondaryButton()}><FileDown size={17} aria-hidden="true" /> Original-PDF</Link> : null}
            <form action={duplicateOfferAction}><input type="hidden" name="offerId" value={id} /><input type="hidden" name="versionId" value={selectedVersion.id} /><button className={secondaryButton()}><Copy size={17} aria-hidden="true" /> Als neues Angebot duplizieren</button></form>
          </div>
          {["sent", "viewed"].includes(status) && isSelectedActive ? (
            <form action={withdrawOfferVersionAction} className="mt-4 grid gap-3 rounded-lg border border-red-200 bg-red-50 p-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <input type="hidden" name="offerId" value={id} />
              <input type="hidden" name="versionId" value={selectedVersion.id} />
              <label className="block"><span className="text-sm font-bold text-red-900">Grund für das Zurückziehen</span><input name="reason" required minLength={3} maxLength={1000} placeholder="z. B. Leistungsumfang wird neu abgestimmt" className={inputClass} /></label>
              <button className={secondaryButton("danger")}>Angebot zurückziehen</button>
            </form>
          ) : null}
          {selectedVersion.last_email_error ? <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-950">Letzter E-Mail-Versand: {text(selectedVersion.last_email_error)}</p> : null}
        </Panel>

        <Panel title="Kaufmännische Übersicht">
          <dl className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
            <div className="rounded-lg bg-slate-50 p-3"><dt className="text-xs font-bold uppercase tracking-wide text-slate-500">Netto</dt><dd className="mt-1 text-lg font-extrabold text-slate-950">{formatCents(Number(selectedVersion.net_total_cents || 0))}</dd></div>
            <div className="rounded-lg bg-slate-50 p-3"><dt className="text-xs font-bold uppercase tracking-wide text-slate-500">Umsatzsteuer</dt><dd className="mt-1 text-lg font-extrabold text-slate-950">{formatCents(Number(selectedVersion.tax_total_cents || 0))}</dd></div>
            <div className="rounded-lg bg-brand-soft p-3"><dt className="text-xs font-bold uppercase tracking-wide text-brand">Rechnerisch brutto</dt><dd className="mt-1 text-2xl font-extrabold text-brand">{formatCents(Number(selectedVersion.gross_total_cents || 0))}</dd></div>
          </dl>
          {billingRows.length ? <div className="mt-4 grid gap-2">{billingRows.map(({ bucket, values }) => <div key={bucket} className="flex items-center justify-between gap-3 border-t border-slate-100 pt-2 text-sm"><span className="font-bold text-slate-650">{billingBucketLabels[bucket]}</span><span className="font-extrabold text-slate-950">{formatCents(Number(values.gross_cents ?? values.grossCents ?? 0))} brutto</span></div>)}</div> : null}
        </Panel>
      </div>

      <div className="mb-5 grid gap-5 xl:grid-cols-[0.72fr_1.28fr]">
        <Panel title="Versionsverlauf">
          <ol className="grid gap-3">
            {(versions ?? []).map((version) => {
              const selected = text(version.id) === text(selectedVersion.id);
              return <li key={version.id}><Link href={`/admin/offers/${id}?version=${version.id}`} aria-current={selected ? "page" : undefined} className={`block rounded-lg border p-3 transition ${selected ? "border-brand bg-brand-soft" : "border-slate-200 bg-slate-50 hover:border-brand/50"}`}><div className="flex items-center justify-between gap-2"><p className="font-extrabold text-slate-950">Version {version.version_number}</p><OfferStatusBadge status={text(version.lifecycle_status)} /></div><p className="mt-2 text-xs font-semibold text-slate-600">Erstellt {dateLabel(version.created_at, true)}{version.sent_at ? ` · versendet ${dateLabel(version.sent_at, true)}` : ""}</p></Link></li>;
            })}
          </ol>
        </Panel>

        <Panel title="Nachweis & Kundenentscheidung">
          {acceptanceResult.data ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950"><div className="flex items-center gap-2 font-extrabold"><ShieldCheck size={19} aria-hidden="true" /> Verbindlich angenommen</div><p className="mt-2 leading-6">{text(acceptanceResult.data.accepted_name)} · {dateLabel(acceptanceResult.data.accepted_at, true)} · rechnerische Vergleichssumme {formatCents(Number(acceptanceResult.data.confirmed_gross_total_cents || 0))}</p><p className="mt-1 text-xs leading-5">Verbindlich bleiben die getrennten Abrechnungsbeträge der angenommenen Version; die Vergleichssumme ist kein einheitlicher Zahlbetrag.</p>{acceptanceResult.data.comment ? <p className="mt-2 leading-6">Kommentar: {text(acceptanceResult.data.comment)}</p> : null}{acceptanceResult.data.confirmation_pdf_path ? <Link href={`/api/documents/offers/${id}/acceptance?version=${selectedVersion.id}`} className={`${secondaryButton()} mt-3`}><FileDown size={16} aria-hidden="true" /> Annahmebestätigung</Link> : null}{acceptanceDeliveryJob.status && acceptanceDeliveryJob.status !== "sent" ? <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-950"><p className="font-extrabold">Bestätigungszustellung: {acceptanceDeliveryJob.status === "processing" ? "wird verarbeitet" : acceptanceDeliveryJob.status === "failed" ? "erneuter Versuch vorgesehen" : "ausstehend"}</p>{acceptanceDeliveryJob.last_error ? <p className="mt-1 text-xs leading-5">Letzter Fehler: {text(acceptanceDeliveryJob.last_error)}</p> : null}{["pending", "failed"].includes(text(acceptanceDeliveryJob.status)) ? <form action={retryOfferAcceptanceDeliveryAction} className="mt-3"><input type="hidden" name="offerId" value={id} /><input type="hidden" name="jobId" value={text(acceptanceDeliveryJob.id)} /><button className={secondaryButton()}>Jetzt erneut zustellen</button></form> : null}</div> : null}</div>
          ) : rejectionResult.data ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-950"><p className="font-extrabold">Im Kundenportal abgelehnt</p><p className="mt-2 leading-6">{text(rejectionResult.data.rejected_name) || "Kunde"} · {dateLabel(rejectionResult.data.rejected_at, true)}</p>{rejectionResult.data.comment ? <p className="mt-2 leading-6">Kommentar: {text(rejectionResult.data.comment)}</p> : null}</div>
          ) : (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-650">{isDraftLifecycle ? "Noch nicht versendet. Nach dem Versand kann der Kunde diese exakte Version im Portal ansehen, annehmen oder ablehnen." : `Noch keine Kundenentscheidung gespeichert.${selectedVersion.viewed_at ? ` Angesehen am ${dateLabel(selectedVersion.viewed_at, true)}.` : ""}`}</div>
          )}
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2"><div><dt className="font-bold text-slate-500">Angebotsdatum</dt><dd className="mt-1 font-semibold text-slate-950">{dateLabel(selectedVersion.offer_date)}</dd></div><div><dt className="font-bold text-slate-500">Gültig bis</dt><dd className="mt-1 font-semibold text-slate-950">{dateLabel(selectedVersion.valid_until)}</dd></div><div><dt className="font-bold text-slate-500">Versiegelt</dt><dd className="mt-1 font-semibold text-slate-950">{dateLabel(selectedVersion.frozen_at, true)}</dd></div><div><dt className="font-bold text-slate-500">Letzte E-Mail</dt><dd className="mt-1 font-semibold text-slate-950">{dateLabel(selectedVersion.last_email_sent_at, true)}</dd></div></dl>
        </Panel>
      </div>

      {status === "accepted" && isSelectedActive && !propertyLink ? (
        <div className="mb-5"><Panel title="Angenommenes Angebot mit Immobilie verknüpfen"><OfferLinkWizard offerId={id} versionId={text(selectedVersion.id)} items={(itemsResult.data ?? []).map((item) => ({ id: text(item.id), title: text(item.title) }))} properties={propertyOptions} /></Panel></div>
      ) : propertyLink ? (
        <div className="mb-5"><Panel title="Verknüpfte Immobilie"><div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-teal-200 bg-teal-50 p-4"><div><p className="font-extrabold text-teal-950">{text(linkedProperty.name, "Immobilie")}</p><p className="mt-1 text-sm text-teal-900">{propertyAddressById.get(text(propertyLink.property_id)) || "Adresse über Gebäude hinterlegt"} · verknüpft {dateLabel(propertyLink.linked_at, true)}</p></div><Link href={`/admin/properties/${propertyLink.property_id}`} className={secondaryButton()}>Immobilie öffnen</Link></div></Panel></div>
      ) : null}

      {editorItems.length ? (
        <OfferEditor customers={offerCustomerOptions(customersResult.data ?? [])} catalog={catalogItems} initial={initial} readOnly={!isEditableDraft} allowRevision={canCreateRevision} />
      ) : (
        <EmptyState title="Keine Angebotspositionen" text="Diese Version enthält keine lesbaren Positionen." />
      )}
    </>
  );
}
