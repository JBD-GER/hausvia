import { CheckCircle2 } from "lucide-react";

export function TrustBar({ items }: { items: string[] }) {
  return (
    <section className="border-y border-slate-200 bg-slate-50/70">
      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {items.map((item) => (
          <div
            key={item}
            className="flex min-h-14 items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-extrabold leading-5 text-slate-800 shadow-sm shadow-slate-950/5"
          >
            <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-green-50 text-green-700">
              <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
            </span>
            <span className="min-w-0">{item}</span>
          </div>
        ))}
        </div>
      </div>
    </section>
  );
}
