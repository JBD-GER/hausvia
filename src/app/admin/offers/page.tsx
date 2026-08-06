import Link from "next/link";
import { Copy, FileDown, Mail, Plus, SlidersHorizontal } from "lucide-react";
import { duplicateOfferAction, resendOfferVersionAction } from "@/app/actions/offers";
import { OfferStatusBadge } from "@/components/portal/offers/OfferStatusBadge";
import type { OfferLifecycleStatus } from "@/components/portal/offers/types";
import { PaginationNav } from "@/components/portal/PaginationNav";
import { CompactSection, EmptyState, Field, PageHeader, Panel, StatusPill, buttonClass, inputClass } from "@/components/portal/PortalUI";
import { formatCents } from "@/lib/offerPricing";
import { requireAdminContext } from "@/lib/portal/access";
import { paginateItems } from "@/lib/portal/listing";
import { berlinIsoDate } from "@/lib/portal/core";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type UnknownRow = Record<string, unknown>;

const statusOptions: Array<[OfferLifecycleStatus, string]> = [
  ["draft", "Entwurf"],
  ["sent", "Versendet"],
  ["viewed", "Angesehen"],
  ["accepted", "Angenommen"],
  ["rejected", "Abgelehnt"],
  ["expired", "Abgelaufen"],
  ["withdrawn", "Zurückgezogen"],
  ["linked", "Mit Immobilie verknüpft"],
];

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

function dateLabel(value: unknown) {
  const raw = text(value);
  if (!raw) return "—";
  const date = new Date(raw.length === 10 ? `${raw}T12:00:00Z` : raw);
  return Number.isNaN(date.getTime()) ? raw : new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

function actionIconButton(tone: "default" | "brand" = "default") {
  return `inline-flex min-h-10 items-center justify-center gap-2 rounded-md border px-3 py-2 text-xs font-extrabold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 ${tone === "brand" ? "border-brand bg-brand text-white hover:bg-brand-dark" : "border-slate-300 bg-white text-slate-750 hover:border-brand hover:text-brand"}`;
}

export default async function AdminOffersPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const successMessage = queryValue(params, "statusMessage") || queryValue(params, "message");
  const search = queryValue(params, "q").trim().toLocaleLowerCase("de");
  const statusFilter = queryValue(params, "status");
  const from = queryValue(params, "from");
  const to = queryValue(params, "to");
  const openOnly = queryValue(params, "open") === "1";
  const sort = queryValue(params, "sort") || "newest";
  const { admin: supabase } = await requireAdminContext();

  const { data: offers, error: offersError } = await supabase
    .from("offers")
    .select("id,customer_id,lifecycle_status,current_version_id,active_version_id,draft_version_id,offer_number,title,created_at,updated_at,net_total,tax_total,gross_total")
    .order("created_at", { ascending: false });
  if (offersError) throw new Error("Die Angebotsübersicht konnte nicht geladen werden.");

  const versionIds = Array.from(new Set((offers ?? []).flatMap((offer) => [
    text(offer.current_version_id),
    text(offer.active_version_id),
    text(offer.draft_version_id),
  ]).filter(Boolean)));
  const offerIds = (offers ?? []).map((offer) => text(offer.id));
  const customerIds = Array.from(new Set((offers ?? []).map((offer) => text(offer.customer_id)).filter(Boolean)));
  const [versionsResult, customersResult, linksResult] = await Promise.all([
    versionIds.length
      ? supabase.from("offer_versions").select("id,offer_id,version_number,lifecycle_status,offer_number,title,offer_date,valid_until,net_total_cents,tax_total_cents,gross_total_cents,last_email_sent_at,last_email_error,original_pdf_path").in("id", versionIds)
      : Promise.resolve({ data: [], error: null }),
    customerIds.length
      ? supabase.from("customers").select("id,company_name,contact_name,first_name,last_name,email").in("id", customerIds)
      : Promise.resolve({ data: [], error: null }),
    offerIds.length
      ? supabase.from("offer_property_links").select("offer_id,offer_version_id,property_id,linked_at,properties(name)").in("offer_id", offerIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (versionsResult.error || customersResult.error || linksResult.error) throw new Error("Die Angebotsdetails konnten nicht vollständig geladen werden.");

  const versionById = new Map((versionsResult.data ?? []).map((version) => [text(version.id), version as UnknownRow]));
  const customerById = new Map((customersResult.data ?? []).map((customer) => [text(customer.id), customer as UnknownRow]));
  const linkByOfferId = new Map((linksResult.data ?? []).map((link) => [text(link.offer_id), link as UnknownRow]));

  const list = (offers ?? []).map((offer) => {
    const activeVersion = versionById.get(text(offer.active_version_id)) ?? {};
    const draftVersion = versionById.get(text(offer.draft_version_id)) ?? {};
    const currentVersion = versionById.get(text(offer.current_version_id)) ?? {};
    const lifecycleVersion = Object.keys(activeVersion).length ? activeVersion : Object.keys(draftVersion).length ? draftVersion : currentVersion;
    const customer = customerById.get(text(offer.customer_id)) ?? {};
    const propertyLink = linkByOfferId.get(text(offer.id));
    const property = relation(propertyLink?.properties);
    const customerName = text(customer.company_name)
      || text(customer.contact_name)
      || [text(customer.first_name), text(customer.last_name)].filter(Boolean).join(" ")
      || text(customer.email, "Unbekannter Kunde");
    const storedStatus = text(lifecycleVersion.lifecycle_status || offer.lifecycle_status, "draft") as OfferLifecycleStatus;
    const status = (["sent", "viewed"].includes(storedStatus) && text(lifecycleVersion.valid_until) < berlinIsoDate())
      ? "expired"
      : storedStatus;
    const offerDate = text(lifecycleVersion.offer_date || offer.created_at).slice(0, 10);
    const hasParallelDraft = Boolean(draftVersion.id && activeVersion.id && draftVersion.id !== activeVersion.id);
    return {
      id: text(offer.id),
      versionId: text(lifecycleVersion.id),
      deliveryVersionId: text(activeVersion.id || lifecycleVersion.id),
      deliveryStatus: text(activeVersion.lifecycle_status || lifecycleVersion.lifecycle_status || offer.lifecycle_status, "draft"),
      status,
      number: text(lifecycleVersion.offer_number || offer.offer_number, "Noch ohne Nummer"),
      title: text(lifecycleVersion.title || offer.title, "Unbenanntes Angebot"),
      customerName,
      offerDate,
      validUntil: text(lifecycleVersion.valid_until),
      netCents: lifecycleVersion.net_total_cents == null ? Math.round(Number(offer.net_total || 0) * 100) : Number(lifecycleVersion.net_total_cents),
      taxCents: lifecycleVersion.tax_total_cents == null ? Math.round(Number(offer.tax_total || 0) * 100) : Number(lifecycleVersion.tax_total_cents),
      grossCents: lifecycleVersion.gross_total_cents == null ? Math.round(Number(offer.gross_total || 0) * 100) : Number(lifecycleVersion.gross_total_cents),
      propertyName: text(property.name),
      pdfAvailable: Boolean(activeVersion.original_pdf_path || lifecycleVersion.original_pdf_path),
      lastEmailError: text(activeVersion.last_email_error || lifecycleVersion.last_email_error),
      hasParallelDraft,
      activeVersionNumber: Number(activeVersion.version_number || 0),
      draftVersionNumber: Number(draftVersion.version_number || 0),
      draftVersionId: text(draftVersion.id),
      draftNumber: text(draftVersion.offer_number),
      draftTitle: text(draftVersion.title),
    };
  }).filter((offer) => {
    const haystack = [offer.number, offer.title, offer.draftNumber, offer.draftTitle, offer.customerName, offer.propertyName].join(" ").toLocaleLowerCase("de");
    const isOpen = ["draft", "sent", "viewed", "accepted"].includes(offer.status);
    return (
      (!search || haystack.includes(search))
      && (!statusFilter || offer.status === statusFilter || (statusFilter === "draft" && offer.hasParallelDraft))
      && (!openOnly || isOpen)
      && (!from || offer.offerDate >= from)
      && (!to || offer.offerDate <= to)
    );
  }).sort((left, right) => {
    if (sort === "oldest") return left.offerDate.localeCompare(right.offerDate);
    if (sort === "number") return left.number.localeCompare(right.number, "de");
    if (sort === "amount-high") return right.grossCents - left.grossCents;
    if (sort === "validity") return left.validUntil.localeCompare(right.validUntil);
    return right.offerDate.localeCompare(left.offerDate);
  });
  const page = paginateItems(list, queryValue(params, "page"));

  return (
    <>
      <PageHeader
        eyebrow="Angebote"
        title="Angebote professionell steuern"
        text="Entwürfe, versendete Versionen, Kundenreaktionen und Immobilienverknüpfungen in einer revisionssicheren Übersicht."
        actions={(
          <>
            <Link href="/admin/offers/pricing" className={actionIconButton()}><SlidersHorizontal size={17} aria-hidden="true" /> Preisregeln</Link>
            <Link href="/admin/offers/new" className={buttonClass}><Plus size={17} aria-hidden="true" /> Neues Angebot</Link>
          </>
        )}
      />

      {successMessage ? <p role="status" className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-900">{successMessage}</p> : null}
      {queryValue(params, "error") ? <p role="alert" className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-900">{queryValue(params, "error")}</p> : null}

      <div className="grid gap-5">
        <CompactSection
          title="Suchen und filtern"
          description="Status, Zeitraum, offene Angebote und Sortierung"
          badge={(search || statusFilter || from || to || openOnly || sort !== "newest") ? <StatusPill tone="info">Filter aktiv</StatusPill> : null}
        >
          <form method="get" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
            <Field label="Suche"><input name="q" defaultValue={queryValue(params, "q")} placeholder="Nummer, Titel, Kunde …" className={inputClass} /></Field>
            <Field label="Status"><select name="status" defaultValue={statusFilter} className={inputClass}><option value="">Alle Status</option>{statusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
            <Field label="Von"><input name="from" type="date" defaultValue={from} className={inputClass} /></Field>
            <Field label="Bis"><input name="to" type="date" defaultValue={to} className={inputClass} /></Field>
            <Field label="Sortierung"><select name="sort" defaultValue={sort} className={inputClass}><option value="newest">Neueste zuerst</option><option value="oldest">Älteste zuerst</option><option value="number">Angebotsnummer</option><option value="amount-high">Höchster Betrag</option><option value="validity">Gültigkeit</option></select></Field>
            <label className="flex min-h-11 items-center gap-3 self-end rounded-md border border-slate-300 bg-white px-3 text-sm font-bold text-slate-750 sm:mt-2"><input type="checkbox" name="open" value="1" defaultChecked={openOnly} className="h-5 w-5 rounded border-slate-300 text-brand focus:ring-brand" /> Nur offen</label>
            <div className="flex items-end gap-2"><button className={buttonClass}>Anwenden</button><Link href="/admin/offers" className="inline-flex min-h-11 items-center px-1 text-sm font-bold text-brand underline">Zurücksetzen</Link></div>
          </form>
        </CompactSection>

        <Panel title={`Angebotsliste (${list.length})`}>
          {page.items.length ? (
            <>
              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full min-w-[1120px] border-separate border-spacing-0 text-left text-sm">
                  <thead><tr className="text-xs font-extrabold uppercase tracking-wide text-slate-500"><th className="border-b border-slate-200 px-3 py-3">Angebot</th><th className="border-b border-slate-200 px-3 py-3">Kunde</th><th className="border-b border-slate-200 px-3 py-3">Datum / gültig</th><th className="border-b border-slate-200 px-3 py-3">Beträge</th><th className="border-b border-slate-200 px-3 py-3">Status</th><th className="border-b border-slate-200 px-3 py-3">Immobilie</th><th className="border-b border-slate-200 px-3 py-3 text-right">Aktionen</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {page.items.map((offer) => (
                      <tr key={offer.id} className="align-top hover:bg-slate-50/80">
                        <td className="border-b border-slate-100 px-3 py-4"><Link href={`/admin/offers/${offer.id}?version=${offer.versionId}`} className="font-extrabold text-slate-950 hover:text-brand hover:underline">{offer.title}</Link><p className="mt-1 font-mono text-xs font-bold text-slate-500">{offer.number}</p>{offer.hasParallelDraft ? <Link href={`/admin/offers/${offer.id}?version=${offer.draftVersionId}&view=content`} className="mt-2 block text-xs font-bold text-brand hover:underline">Entwurf V{offer.draftVersionNumber}: {offer.draftTitle || offer.title}</Link> : null}</td>
                        <td className="border-b border-slate-100 px-3 py-4 font-semibold text-slate-750">{offer.customerName}</td>
                        <td className="border-b border-slate-100 px-3 py-4 text-slate-650"><p>{dateLabel(offer.offerDate)}</p><p className="mt-1 text-xs">gültig bis {dateLabel(offer.validUntil)}</p></td>
                        <td className="border-b border-slate-100 px-3 py-4"><p className="font-extrabold text-slate-950">{formatCents(offer.grossCents)} brutto</p><p className="mt-1 text-xs text-slate-500">{formatCents(offer.netCents)} netto · {formatCents(offer.taxCents)} USt.</p></td>
                        <td className="border-b border-slate-100 px-3 py-4"><OfferStatusBadge status={offer.status} />{offer.activeVersionNumber ? <p className="mt-1 text-xs font-semibold text-slate-500">Aktiv: Version {offer.activeVersionNumber}</p> : null}{offer.hasParallelDraft ? <div className="mt-2"><OfferStatusBadge status="draft" /><p className="mt-1 text-xs font-semibold text-slate-500">In Arbeit: Version {offer.draftVersionNumber}</p></div> : null}{offer.lastEmailError ? <p className="mt-2 max-w-40 text-xs font-bold text-red-700">Versand prüfen</p> : null}</td>
                        <td className="border-b border-slate-100 px-3 py-4 text-slate-650">{offer.propertyName || "Noch nicht verknüpft"}</td>
                        <td className="border-b border-slate-100 px-3 py-4"><div className="flex flex-wrap justify-end gap-2"><Link href={`/admin/offers/${offer.id}?version=${offer.versionId}`} className={actionIconButton("brand")}>Öffnen</Link>{offer.pdfAvailable ? <Link href={`/api/documents/offers/${offer.id}?version=${offer.deliveryVersionId}`} className={actionIconButton()} title="Original-PDF"><FileDown size={15} aria-hidden="true" /> PDF</Link> : null}{["sent", "viewed", "accepted", "rejected", "expired", "withdrawn", "linked"].includes(offer.deliveryStatus) && offer.deliveryVersionId ? <form action={resendOfferVersionAction}><input type="hidden" name="offerId" value={offer.id} /><input type="hidden" name="versionId" value={offer.deliveryVersionId} /><button className={actionIconButton()} title="Erneut senden"><Mail size={15} aria-hidden="true" /> Senden</button></form> : null}<form action={duplicateOfferAction}><input type="hidden" name="offerId" value={offer.id} />{offer.versionId ? <input type="hidden" name="versionId" value={offer.versionId} /> : null}<button className={actionIconButton()} title="Duplizieren"><Copy size={15} aria-hidden="true" /> Kopie</button></form></div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="grid gap-4 lg:hidden">
                {page.items.map((offer) => (
                  <article key={offer.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="font-mono text-xs font-bold text-slate-500">{offer.number}</p><h2 className="mt-1 text-lg font-extrabold text-slate-950">{offer.title}</h2><p className="mt-1 text-sm font-semibold text-slate-650">{offer.customerName}</p>{offer.hasParallelDraft ? <Link href={`/admin/offers/${offer.id}?version=${offer.draftVersionId}&view=content`} className="mt-2 block text-xs font-bold text-brand hover:underline">Entwurf V{offer.draftVersionNumber}: {offer.draftTitle || offer.title}</Link> : null}</div><div className="grid justify-items-end gap-2"><OfferStatusBadge status={offer.status} />{offer.hasParallelDraft ? <><OfferStatusBadge status="draft" /><span className="text-xs font-semibold text-slate-500">V{offer.draftVersionNumber} in Arbeit</span></> : null}</div></div>
                    <dl className="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-white p-3 text-sm"><div><dt className="text-xs font-bold text-slate-500">Datum</dt><dd className="mt-1 font-semibold text-slate-900">{dateLabel(offer.offerDate)}</dd></div><div><dt className="text-xs font-bold text-slate-500">Gültig bis</dt><dd className="mt-1 font-semibold text-slate-900">{dateLabel(offer.validUntil)}</dd></div><div><dt className="text-xs font-bold text-slate-500">Brutto</dt><dd className="mt-1 font-extrabold text-slate-950">{formatCents(offer.grossCents)}</dd></div><div><dt className="text-xs font-bold text-slate-500">Immobilie</dt><dd className="mt-1 font-semibold text-slate-900">{offer.propertyName || "Noch offen"}</dd></div></dl>
                    <div className="mt-4 flex flex-wrap gap-2"><Link href={`/admin/offers/${offer.id}?version=${offer.versionId}`} className={actionIconButton("brand")}>Angebot öffnen</Link>{offer.pdfAvailable ? <Link href={`/api/documents/offers/${offer.id}?version=${offer.deliveryVersionId}`} className={actionIconButton()}><FileDown size={15} aria-hidden="true" /> PDF</Link> : null}{["sent", "viewed", "accepted", "rejected", "expired", "withdrawn", "linked"].includes(offer.deliveryStatus) && offer.deliveryVersionId ? <form action={resendOfferVersionAction}><input type="hidden" name="offerId" value={offer.id} /><input type="hidden" name="versionId" value={offer.deliveryVersionId} /><button className={actionIconButton()}><Mail size={15} aria-hidden="true" /> Erneut senden</button></form> : null}<form action={duplicateOfferAction}><input type="hidden" name="offerId" value={offer.id} />{offer.versionId ? <input type="hidden" name="versionId" value={offer.versionId} /> : null}<button className={actionIconButton()}><Copy size={15} aria-hidden="true" /> Duplizieren</button></form></div>
                  </article>
                ))}
              </div>
              <PaginationNav pathname="/admin/offers" query={{ q: queryValue(params, "q"), status: statusFilter, from, to, open: openOnly ? "1" : "", sort }} page={page.page} totalPages={page.totalPages} totalItems={page.totalItems} />
            </>
          ) : <EmptyState title="Keine Angebote gefunden" text={search || statusFilter || from || to || openOnly ? "Passen Sie die Suche oder Filter an." : "Erstellen Sie das erste Angebot aus dem Leistungskatalog."} />}
        </Panel>
      </div>
    </>
  );
}
