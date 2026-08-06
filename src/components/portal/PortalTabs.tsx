import Link from "next/link";
import type { ReactNode } from "react";

export type PortalTabItem = {
  id: string;
  label: string;
  href: string;
  icon?: ReactNode;
  badge?: ReactNode;
};

export function PortalTabs({
  items,
  activeId,
  label = "Seitenbereiche",
}: {
  items: PortalTabItem[];
  activeId: string;
  label?: string;
}) {
  return (
    <nav
      aria-label={label}
      className="mb-5 flex snap-x gap-1.5 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-[0_10px_30px_rgba(8,43,97,0.055)]"
    >
      {items.map((item) => {
        const active = item.id === activeId;
        return (
          <Link
            key={item.id}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-11 min-w-max snap-start items-center justify-center gap-2 rounded-xl px-3.5 text-sm font-extrabold transition sm:flex-1 ${
              active
                ? "bg-brand text-white shadow-[0_8px_20px_rgba(8,43,97,0.2)]"
                : "text-slate-600 hover:bg-brand-soft hover:text-brand"
            }`}
          >
            {item.icon}
            <span>{item.label}</span>
            {item.badge}
          </Link>
        );
      })}
    </nav>
  );
}
