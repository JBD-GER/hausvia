import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { curateInternalLinks } from "@/lib/internalLinking";
import type { LinkItem } from "@/lib/site";

export function InternalLinks({
  links,
  title = "Passende Themen",
  currentHref,
  maxLinks = 3,
}: {
  links: readonly LinkItem[];
  title?: string;
  currentHref?: string;
  maxLinks?: number;
}) {
  const visibleLinks = curateInternalLinks(links, { currentHref, maxLinks });

  if (visibleLinks.length === 0) return null;

  return (
    <section className="bg-slate-50">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <h2 className="text-2xl font-extrabold text-slate-950">{title}</h2>
        <nav className="mt-5" aria-label={title}>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visibleLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="flex min-h-12 h-full items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-4 py-3 text-sm font-bold leading-6 text-slate-800 transition hover:border-brand/40 hover:text-brand"
                >
                  <span>{link.label}</span>
                  <ArrowRight aria-hidden="true" className="h-4 w-4 flex-none" />
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </section>
  );
}
