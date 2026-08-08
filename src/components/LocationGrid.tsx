import Link from "next/link";
import { MapPin } from "lucide-react";
import type { LinkItem } from "@/lib/site";

export function LocationGrid({
  locations,
  currentHref,
}: {
  locations: readonly LinkItem[];
  currentHref?: string;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {locations.map((location) => {
        const content = (
          <>
            <MapPin aria-hidden="true" className="h-4 w-4 flex-none text-green-700" />
            <span>{location.label}</span>
          </>
        );

        return location.href === currentHref ? (
          <div
            key={`${location.label}-${location.href}`}
            className="flex min-h-12 items-center gap-3 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700"
          >
            {content}
          </div>
        ) : (
          <Link
            href={location.href}
            key={`${location.label}-${location.href}`}
            className="flex min-h-12 items-center gap-3 rounded-md border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 transition hover:border-brand/40 hover:text-brand"
          >
            {content}
          </Link>
        );
      })}
    </div>
  );
}
