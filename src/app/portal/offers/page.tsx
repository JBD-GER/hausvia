import { ChevronRight, Download, FileText } from "lucide-react";
import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/portal/PortalUI";
import { berlinIsoDate } from "@/lib/portal/core";
import { requireCustomerContext } from "@/lib/portal/access";
import {
  effectiveOfferStatus,
  OfferDateLine,
  OfferPriceSummary,
  OfferStatusBadge,
  offerGroup,
  type PortalOfferVersion,
} from "./_shared";

const groupDefinitions = [
  { key: "open", title: "Offene Angebote", text: "Diese Angebote können Sie bis zum angegebenen Datum annehmen oder ablehnen." },
  { key: "accepted", title: "Angenommene Angebote", text: "Ihre verbindlich angenommenen Angebotsversionen." },
  { key: "rejected", title: "Abgelehnte Angebote", text: "Von Ihnen abgelehnte Angebotsversionen." },
  { key: "expired", title: "Abgelaufene & frühere Angebote", text: "Abgelaufene, zurückgezogene oder durch eine neue Version ersetzte Angebote." },
] as const;

export default async function CustomerOffersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; error?: string }>;
}) {
  const query = await searchParams;
  const { customerId, supabase } = await requireCustomerContext();
  const { data, error } = await supabase
    .from("offer_versions")
    .select("id,offer_id,version_number,lifecycle_status,offer_number,title,offer_date,valid_until,net_total_cents,tax_total_cents,gross_total_cents,billing_totals,original_pdf_path")
    .eq("customer_id", customerId)
    .in("lifecycle_status", ["sent", "viewed", "accepted", "linked", "rejected", "expired", "withdrawn", "superseded"])
    .order("offer_date", { ascending: false })
    .order("version_number", { ascending: false });
  if (error) throw new Error("Die Angebote konnten nicht geladen werden.");

  const today = berlinIsoDate();
  const versions = (data ?? []).map((row) => {
    const version = row as unknown as PortalOfferVersion;
    return { ...version, effectiveStatus: effectiveOfferStatus(version, today) };
  });

  return (
    <>
      <PageHeader
        eyebrow="Angebote"
        title="Ihre Angebote"
        text="Prüfen Sie Leistungsumfang und Preise in Ruhe. Jede angezeigte Version bleibt unverändert nachvollziehbar."
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

      {versions.length ? (
        <div className="grid gap-7">
          {groupDefinitions.map((group) => {
            const groupVersions = versions.filter(
              (version) => offerGroup(version.effectiveStatus) === group.key,
            );
            if (!groupVersions.length) return null;

            return (
              <section key={group.key} aria-labelledby={`offers-${group.key}`}>
                <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <h2 id={`offers-${group.key}`} className="text-xl font-black text-slate-950">
                      {group.title}
                    </h2>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{group.text}</p>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-extrabold text-slate-600 shadow-sm">
                    {groupVersions.length} {groupVersions.length === 1 ? "Angebot" : "Angebote"}
                  </span>
                </div>

                <div className="grid gap-4">
                  {groupVersions.map((version) => (
                    <article key={version.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                      <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(340px,.9fr)]">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <OfferStatusBadge status={version.effectiveStatus} />
                            <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">
                              Version {version.version_number}
                            </span>
                          </div>
                          <p className="mt-3 text-xs font-black uppercase tracking-[0.12em] text-brand">
                            {version.offer_number}
                          </p>
                          <h3 className="mt-1 text-xl font-black leading-tight text-slate-950">{version.title}</h3>
                          <div className="mt-2"><OfferDateLine version={version} /></div>
                        </div>

                        <OfferPriceSummary
                          billingTotals={version.billing_totals}
                          netTotalCents={version.net_total_cents}
                          taxTotalCents={version.tax_total_cents}
                          grossTotalCents={version.gross_total_cents}
                          compact
                        />
                      </div>

                      <div className="flex flex-col gap-2 border-t border-slate-100 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-end sm:px-5">
                        <Link
                          href={`/api/documents/offers/${version.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-extrabold text-slate-800 transition hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                        >
                          <Download aria-hidden="true" size={17} /> PDF öffnen
                        </Link>
                        <Link
                          href={`/portal/offers/${version.id}`}
                          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-extrabold text-white transition hover:bg-brand-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
                        >
                          <FileText aria-hidden="true" size={17} /> Angebot ansehen
                          <ChevronRight aria-hidden="true" size={17} />
                        </Link>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <EmptyState
          title="Noch keine Angebote"
          text="Sobald Hausvia Ihnen ein Angebot sendet, erscheint es hier inklusive PDF und Preisübersicht."
        />
      )}
    </>
  );
}
