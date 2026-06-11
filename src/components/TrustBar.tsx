import { CheckCircle2 } from "lucide-react";

export function TrustBar({ items }: { items: string[] }) {
  return (
    <section className="border-y border-slate-200 bg-white">
      <div className="mx-auto grid max-w-7xl gap-3 px-4 py-5 sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:px-8">
        {items.map((item) => (
          <div key={item} className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <CheckCircle2 aria-hidden="true" className="h-5 w-5 text-green-700" />
            <span>{item}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
