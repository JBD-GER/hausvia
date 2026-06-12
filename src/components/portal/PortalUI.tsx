export function PageHeader({
  eyebrow,
  title,
  text,
}: {
  eyebrow: string;
  title: string;
  text?: string;
}) {
  return (
    <div className="mb-6">
      <p className="text-sm font-extrabold uppercase tracking-wide text-brand">{eyebrow}</p>
      <h1 className="mt-2 text-3xl font-extrabold leading-tight text-slate-950 sm:text-4xl">{title}</h1>
      {text ? <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-650 sm:text-base">{text}</p> : null}
    </div>
  );
}

export function MetricCard({ label, value, tone = "default" }: { label: string; value: string | number; tone?: "default" | "accent" }) {
  return (
    <article className={`rounded-xl border p-4 shadow-sm ${tone === "accent" ? "border-accent bg-accent/15" : "border-slate-200 bg-white"}`}>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-extrabold text-slate-950">{value}</p>
    </article>
  );
}

export function StatusPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex rounded-full border border-brand/20 bg-brand-soft px-2.5 py-1 text-xs font-extrabold text-brand">
      {children}
    </span>
  );
}

export function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center">
      <p className="text-lg font-extrabold text-slate-950">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-650">{text}</p>
    </div>
  );
}

export function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <h2 className="text-xl font-extrabold text-slate-950">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-slate-800">{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  "mt-2 min-h-11 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20";

export const buttonClass =
  "inline-flex min-h-11 items-center justify-center rounded-md bg-brand px-4 py-2 text-sm font-extrabold text-white transition hover:bg-brand-dark";
