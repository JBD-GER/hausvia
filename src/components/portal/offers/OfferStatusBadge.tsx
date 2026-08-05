import type { OfferLifecycleStatus } from "@/components/portal/offers/types";
import { offerStatusLabels } from "@/components/portal/offers/types";

const tones: Record<OfferLifecycleStatus, string> = {
  draft: "border-slate-300 bg-slate-100 text-slate-700",
  sent: "border-blue-200 bg-blue-50 text-blue-800",
  viewed: "border-violet-200 bg-violet-50 text-violet-800",
  accepted: "border-emerald-200 bg-emerald-50 text-emerald-800",
  rejected: "border-red-200 bg-red-50 text-red-800",
  expired: "border-amber-200 bg-amber-50 text-amber-900",
  withdrawn: "border-orange-200 bg-orange-50 text-orange-900",
  superseded: "border-slate-300 bg-white text-slate-600",
  linked: "border-teal-200 bg-teal-50 text-teal-900",
};

export function OfferStatusBadge({ status }: { status: string }) {
  const normalized = (status in offerStatusLabels ? status : "draft") as OfferLifecycleStatus;
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-extrabold ${tones[normalized]}`}>
      {offerStatusLabels[normalized]}
    </span>
  );
}
