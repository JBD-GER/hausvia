import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { LinkItem } from "@/lib/site";

export function InternalLinks({ links, title = "Passende Seiten" }: { links: LinkItem[]; title?: string }) {
  return (
    <section className="bg-slate-50">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <h2 className="text-2xl font-extrabold text-slate-950">{title}</h2>
        <div className="mt-5 flex flex-wrap gap-3">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="inline-flex min-h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-800 transition hover:border-brand/40 hover:text-brand"
            >
              {link.label}
              <ArrowUpRight aria-hidden="true" size={15} />
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
