import type { FaqItem } from "@/lib/site";

export function FAQAccordion({ items }: { items: FaqItem[] }) {
  return (
    <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
      {items.map((item) => (
        <details key={item.question} className="group px-5 py-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left text-base font-bold text-slate-950">
            <span>{item.question}</span>
            <span className="grid h-7 w-7 flex-none place-items-center rounded-md bg-slate-100 text-slate-700 group-open:bg-brand group-open:text-white">
              +
            </span>
          </summary>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-700">{item.answer}</p>
        </details>
      ))}
    </div>
  );
}
