import Link from "next/link";
import { ChevronRight } from "lucide-react";

export function Breadcrumbs({ items }: { items: { label: string; href: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="bg-white">
      <ol className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 py-4 text-sm text-slate-600 sm:px-6 lg:px-8">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={item.href} className="flex items-center gap-2">
              {index > 0 ? <ChevronRight aria-hidden="true" className="h-4 w-4 text-slate-400" /> : null}
              {last ? (
                <span aria-current="page" className="font-semibold text-slate-900">
                  {item.label}
                </span>
              ) : (
                <Link href={item.href} className="hover:text-brand">
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
