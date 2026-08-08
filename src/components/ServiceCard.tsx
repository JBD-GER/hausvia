import Link from "next/link";
import {
  Building2,
  ChevronRight,
  ClipboardCheck,
  Hammer,
  Home,
  Leaf,
  Recycle,
  ShieldCheck,
  Snowflake,
  Sparkles,
} from "lucide-react";
import type { LinkItem } from "@/lib/site";

const iconMap = [
  { needle: "Garten", Icon: Leaf },
  { needle: "Winter", Icon: Snowflake },
  { needle: "Reinigung", Icon: Sparkles },
  { needle: "Klein", Icon: Hammer },
  { needle: "Müll", Icon: Recycle },
  { needle: "Kontroll", Icon: ClipboardCheck },
  { needle: "Objekt", Icon: Building2 },
  { needle: "Hausverwaltung", Icon: ShieldCheck },
  { needle: "WEG", Icon: Home },
];

export function ServiceCard({ item }: { item: LinkItem }) {
  const match = iconMap.find(({ needle }) => item.label.includes(needle));
  const Icon = match?.Icon ?? Home;

  return (
    <Link
      href={item.href}
      className="group flex h-full min-h-44 flex-col rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-md"
    >
      <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-md bg-brand-soft text-brand">
        <Icon aria-hidden="true" size={22} />
      </div>
      <h3 className="text-lg font-extrabold text-slate-950">{item.label}</h3>
      {item.description ? (
        <p className="mt-3 flex-1 text-sm leading-6 text-slate-650">{item.description}</p>
      ) : null}
      <span className="mt-5 inline-flex items-center gap-1 text-sm font-bold text-brand">
        Details zu {item.label}
        <ChevronRight aria-hidden="true" className="h-4 w-4 transition group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}
