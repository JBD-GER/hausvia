import { CheckCircle2, Clock3, Eye, Link2, XCircle } from "lucide-react";
import { formatCents, formatGermanDate } from "@/lib/portal/core";
import { offerBillingBuckets } from "@/lib/offerDocuments";

export type PortalOfferVersion = {
  id: string;
  offer_id: string;
  version_number: number;
  lifecycle_status: string;
  offer_number: string;
  title: string;
  offer_date: string;
  valid_until: string;
  net_total_cents: number | string;
  tax_total_cents: number | string;
  gross_total_cents: number | string;
  billing_totals: unknown;
  original_pdf_path?: string | null;
};

export const offerStatusLabels: Record<string, string> = {
  sent: "Offen",
  viewed: "Angesehen",
  accepted: "Angenommen",
  linked: "Angenommen & verknüpft",
  rejected: "Abgelehnt",
  expired: "Abgelaufen",
  withdrawn: "Zurückgezogen",
  superseded: "Durch neue Version ersetzt",
};

export function effectiveOfferStatus(version: PortalOfferVersion, today: string) {
  if (["sent", "viewed"].includes(version.lifecycle_status) && version.valid_until < today) {
    return "expired";
  }
  return version.lifecycle_status;
}

export function offerGroup(status: string) {
  if (["sent", "viewed"].includes(status)) return "open";
  if (["accepted", "linked"].includes(status)) return "accepted";
  if (status === "rejected") return "rejected";
  return "expired";
}

export function OfferStatusBadge({ status }: { status: string }) {
  const tone =
    status === "accepted" || status === "linked"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : status === "rejected" || status === "withdrawn"
        ? "border-rose-200 bg-rose-50 text-rose-800"
        : status === "expired" || status === "superseded"
          ? "border-slate-200 bg-slate-100 text-slate-700"
          : status === "viewed"
            ? "border-blue-200 bg-blue-50 text-blue-800"
            : "border-amber-200 bg-amber-50 text-amber-900";
  const Icon =
    status === "accepted"
      ? CheckCircle2
      : status === "linked"
        ? Link2
        : status === "rejected" || status === "withdrawn"
          ? XCircle
          : status === "viewed"
            ? Eye
            : Clock3;

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-extrabold ${tone}`}>
      <Icon aria-hidden="true" size={14} />
      {offerStatusLabels[status] || status}
    </span>
  );
}

function cents(value: number | string) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(number) ? number : 0;
}

export function OfferPriceSummary({
  billingTotals,
  netTotalCents,
  taxTotalCents,
  grossTotalCents,
  compact = false,
}: {
  billingTotals: unknown;
  netTotalCents: number | string;
  taxTotalCents: number | string;
  grossTotalCents: number | string;
  compact?: boolean;
}) {
  const buckets = offerBillingBuckets(billingTotals);

  if (!buckets.length) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Angebotssumme</p>
        <p className="mt-2 text-xl font-black text-slate-950">{formatCents(cents(grossTotalCents))} brutto</p>
        <p className="mt-1 text-xs font-semibold text-slate-500">
          {formatCents(cents(netTotalCents))} netto · {formatCents(cents(taxTotalCents))} USt.
        </p>
      </div>
    );
  }

  return (
    <div className={`grid gap-2 ${compact ? "sm:grid-cols-2 xl:grid-cols-4" : "sm:grid-cols-2"}`}>
      {buckets.map((bucket) => (
        <div key={bucket.key} className="rounded-xl border border-brand/15 bg-brand-soft/60 p-3.5">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-extrabold uppercase tracking-wide text-brand">{bucket.label}</p>
            <span className="text-[11px] font-bold text-slate-500">{bucket.suffix}</span>
          </div>
          <p className="mt-2 text-lg font-black text-slate-950">{formatCents(bucket.grossCents)} brutto</p>
          <p className="mt-1 text-xs font-semibold leading-5 text-slate-600">
            {formatCents(bucket.netCents)} netto · {formatCents(bucket.taxCents)} USt.
          </p>
          {bucket.discountCents > 0 ? (
            <p className="mt-1 text-xs font-bold text-emerald-700">
              {formatCents(bucket.discountCents)} Rabatt berücksichtigt
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function OfferDateLine({ version }: { version: PortalOfferVersion }) {
  return (
    <p className="text-sm font-semibold text-slate-600">
      Angebot vom {formatGermanDate(`${version.offer_date}T12:00:00Z`)} · gültig bis{" "}
      {formatGermanDate(`${version.valid_until}T12:00:00Z`)}
    </p>
  );
}
