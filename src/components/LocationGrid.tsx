import Link from "next/link";
import { MapPin } from "lucide-react";
import type { LinkItem } from "@/lib/site";

export function LocationGrid({ locations }: { locations: LinkItem[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {locations.map((location) => (
        <Link
          href={location.href}
          key={`${location.label}-${location.href}`}
          className="flex min-h-12 items-center gap-3 rounded-md border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 transition hover:border-brand/40 hover:text-brand"
        >
          <MapPin aria-hidden="true" className="h-4 w-4 flex-none text-green-700" />
          <span>{location.label}</span>
        </Link>
      ))}
    </div>
  );
}
