import type { ReactNode } from "react";

type PageHeaderProps = {
  eyebrow: string;
  title: string;
  text?: string;
  actions?: ReactNode;
  icon?: ReactNode;
  compact?: boolean;
};

export function PageHeader({
  eyebrow,
  title,
  text,
  actions,
  icon,
  compact = false,
}: PageHeaderProps) {
  return (
    <header className={compact ? "mb-5" : "mb-6 sm:mb-8"}>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 max-w-4xl">
          <div className="flex items-center gap-3">
            {icon ? (
              <span className="grid size-10 shrink-0 place-items-center rounded-2xl border border-[#08AEB4]/20 bg-[#E7F8F9] text-[#05777C] shadow-[0_8px_24px_rgba(8,43,97,0.08)]">
                {icon}
              </span>
            ) : (
              <span
                aria-hidden="true"
                className="h-1.5 w-7 shrink-0 rounded-full bg-[#08AEB4] shadow-[0_0_0_4px_rgba(8,174,180,0.1)]"
              />
            )}
            <p className="text-[0.7rem] font-black uppercase tracking-[0.18em] text-[#05777C] sm:text-xs">
              {eyebrow}
            </p>
          </div>

          <h1
            className={`text-balance font-black leading-[1.08] tracking-[-0.035em] text-slate-950 ${
              compact
                ? "mt-3 text-2xl sm:text-3xl"
                : "mt-3 text-[1.75rem] sm:text-4xl lg:text-[2.65rem]"
            }`}
          >
            {title}
          </h1>
          {text ? (
            <p className="mt-3 max-w-3xl text-pretty text-sm leading-6 text-slate-600 sm:mt-4 sm:text-[0.98rem] sm:leading-7">
              {text}
            </p>
          ) : null}
        </div>

        {actions ? (
          <div className="flex w-full shrink-0 flex-wrap gap-2.5 sm:w-auto sm:justify-end">
            {actions}
          </div>
        ) : null}
      </div>
    </header>
  );
}

type MetricTone = "default" | "accent" | "brand" | "teal" | "success";

const metricToneClasses: Record<MetricTone, { card: string; marker: string; value: string }> = {
  default: {
    card: "border-slate-200/80 bg-white",
    marker: "bg-brand-soft text-brand",
    value: "text-slate-950",
  },
  accent: {
    card: "border-[#F5C542]/45 bg-gradient-to-br from-[#FFF9E5] to-white",
    marker: "bg-[#F5C542]/25 text-[#846300]",
    value: "text-[#5C4705]",
  },
  brand: {
    card: "border-brand/15 bg-gradient-to-br from-brand to-brand-dark text-white",
    marker: "bg-white/12 text-white ring-1 ring-white/15",
    value: "text-white",
  },
  teal: {
    card: "border-[#08AEB4]/25 bg-gradient-to-br from-[#E7F8F9] to-white",
    marker: "bg-[#08AEB4]/15 text-[#05777C]",
    value: "text-[#064A4E]",
  },
  success: {
    card: "border-emerald-200 bg-gradient-to-br from-emerald-50 to-white",
    marker: "bg-emerald-100 text-emerald-700",
    value: "text-emerald-950",
  },
};

type MetricCardProps = {
  label: string;
  value: string | number;
  tone?: MetricTone;
  icon?: ReactNode;
  detail?: ReactNode;
};

export function MetricCard({
  label,
  value,
  tone = "default",
  icon,
  detail,
}: MetricCardProps) {
  const toneClasses = metricToneClasses[tone];
  const isBrand = tone === "brand";

  return (
    <article
      className={`relative isolate overflow-hidden rounded-2xl border p-4 shadow-[0_12px_35px_rgba(8,43,97,0.07)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_45px_rgba(8,43,97,0.11)] sm:p-5 ${toneClasses.card}`}
    >
      <span
        aria-hidden="true"
        className={`absolute -right-7 -top-9 -z-10 size-24 rounded-full blur-2xl ${
          isBrand ? "bg-[#08AEB4]/25" : "bg-[#08AEB4]/10"
        }`}
      />
      <div className="flex items-start justify-between gap-3">
        <p
          className={`text-[0.68rem] font-black uppercase tracking-[0.14em] ${
            isBrand ? "text-white/70" : "text-slate-500"
          }`}
        >
          {label}
        </p>
        <span
          aria-hidden={icon ? undefined : true}
          className={`grid size-9 shrink-0 place-items-center rounded-xl ${toneClasses.marker}`}
        >
          {icon ?? <span className="size-2 rounded-full bg-current shadow-[0_0_0_4px_currentColor] opacity-40" />}
        </span>
      </div>
      <p className={`mt-3 text-3xl font-black tracking-[-0.035em] sm:text-[2rem] ${toneClasses.value}`}>
        {value}
      </p>
      {detail ? (
        <div className={`mt-2 text-xs font-bold ${isBrand ? "text-white/70" : "text-slate-500"}`}>
          {detail}
        </div>
      ) : null}
    </article>
  );
}

type StatusTone = "default" | "brand" | "accent" | "success" | "warning" | "danger" | "info" | "muted";

const statusToneClasses: Record<StatusTone, string> = {
  default: "border-[#08AEB4]/20 bg-[#E7F8F9] text-[#056C71]",
  brand: "border-brand/15 bg-brand-soft text-brand",
  accent: "border-[#F5C542]/40 bg-[#FFF7D6] text-[#765900]",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  danger: "border-rose-200 bg-rose-50 text-rose-700",
  info: "border-sky-200 bg-sky-50 text-sky-700",
  muted: "border-slate-200 bg-slate-100 text-slate-600",
};

export function StatusPill({
  children,
  tone = "default",
  dot = true,
  className = "",
}: {
  children: ReactNode;
  tone?: StatusTone;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex min-h-7 max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.7rem] font-extrabold leading-4 ${statusToneClasses[tone]} ${className}`}
    >
      {dot ? <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-current opacity-70" /> : null}
      <span className="truncate">{children}</span>
    </span>
  );
}

function DefaultEmptyStateIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      className="size-7"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4.5 9.5 12 4l7.5 5.5v8.25A2.25 2.25 0 0 1 17.25 20H6.75a2.25 2.25 0 0 1-2.25-2.25Z" />
      <path d="M8 20v-6.5h8V20M8.5 9.75h.01M15.5 9.75h.01" />
    </svg>
  );
}

export function EmptyState({
  title,
  text,
  icon,
  action,
  compact = false,
}: {
  title: string;
  text: string;
  icon?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={`relative isolate overflow-hidden rounded-2xl border border-dashed border-slate-300/90 bg-gradient-to-br from-white via-white to-[#E7F8F9]/55 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] ${
        compact ? "p-5" : "px-5 py-8 sm:px-8 sm:py-10"
      }`}
    >
      <span
        aria-hidden="true"
        className="absolute left-1/2 top-4 -z-10 size-32 -translate-x-1/2 rounded-full bg-[#08AEB4]/8 blur-3xl"
      />
      <span className="mx-auto grid size-14 place-items-center rounded-2xl border border-[#08AEB4]/20 bg-white text-[#05777C] shadow-[0_10px_30px_rgba(8,43,97,0.1)]">
        {icon ?? <DefaultEmptyStateIcon />}
      </span>
      <p className="mt-4 text-lg font-black tracking-[-0.02em] text-slate-950 sm:text-xl">{title}</p>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">{text}</p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

type PanelProps = {
  title: ReactNode;
  children: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  contentClassName?: string;
  flush?: boolean;
};

export function Panel({
  title,
  children,
  description,
  action,
  className = "",
  contentClassName = "",
  flush = false,
}: PanelProps) {
  return (
    <section
      className={`relative overflow-hidden rounded-2xl border border-slate-200/85 bg-white shadow-[0_12px_40px_rgba(8,43,97,0.065)] ${className}`}
    >
      <div className="h-1 w-full bg-gradient-to-r from-brand via-[#08AEB4] to-[#08AEB4]/20" />
      <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5 sm:py-5">
        <div className="min-w-0">
          <h2 className="text-lg font-black tracking-[-0.025em] text-slate-950 sm:text-xl">{title}</h2>
          {description ? <p className="mt-1.5 text-sm leading-6 text-slate-600">{description}</p> : null}
        </div>
        {action ? <div className="flex shrink-0 flex-wrap gap-2">{action}</div> : null}
      </div>
      <div className={`${flush ? "" : "p-4 sm:p-5"} ${contentClassName}`}>{children}</div>
    </section>
  );
}

export function Field({
  label,
  children,
  hint,
  error,
  required = false,
  className = "",
}: {
  label: string;
  children: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  className?: string;
}) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className="flex items-baseline justify-between gap-3 text-sm font-extrabold text-slate-800">
        <span>
          {label}
          {required ? <span className="ml-1 text-rose-600" aria-hidden="true">*</span> : null}
        </span>
        {required ? <span className="sr-only">Pflichtfeld</span> : null}
      </span>
      {hint ? <span className="mt-1 block text-xs leading-5 text-slate-500">{hint}</span> : null}
      {children}
      {error ? <span className="mt-1.5 block text-xs font-bold text-rose-700">{error}</span> : null}
    </label>
  );
}

export const inputClass =
  "mt-2 min-h-12 w-full rounded-xl border border-slate-300/90 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-950 shadow-[0_1px_2px_rgba(8,43,97,0.04)] outline-none transition duration-150 placeholder:text-slate-400 hover:border-slate-400 focus:border-brand focus:ring-4 focus:ring-brand/10 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-soft file:px-3 file:py-1.5 file:text-xs file:font-extrabold file:text-brand";

export const buttonClass =
  "inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand to-brand-dark px-5 py-2.5 text-sm font-extrabold text-white shadow-[0_10px_24px_rgba(8,43,97,0.2)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(8,43,97,0.26)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/20 focus-visible:ring-offset-2 active:translate-y-0 disabled:pointer-events-none disabled:opacity-50 sm:w-auto";

export const secondaryButtonClass =
  "inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-extrabold text-brand shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-brand/30 hover:bg-brand-soft/60 hover:shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/15 focus-visible:ring-offset-2 active:translate-y-0 disabled:pointer-events-none disabled:opacity-50 sm:w-auto";

function SkeletonBlock({ className }: { className: string }) {
  return <div className={`rounded-xl bg-slate-200/80 ${className}`} />;
}

const skeletonMetrics = ["metric-1", "metric-2", "metric-3"] as const;
const employeeSkeletonRows = ["visit-1", "visit-2", "visit-3", "visit-4"] as const;
const customerSkeletonRows = ["property-1", "property-2", "property-3"] as const;

export function PortalPageSkeleton({
  variant = "customer",
}: {
  variant?: "employee" | "customer";
}) {
  const rows = variant === "employee" ? employeeSkeletonRows : customerSkeletonRows;

  return (
    <div role="status" aria-busy="true" aria-label="Portal-Inhalte werden geladen" className="motion-safe:animate-pulse">
      <p className="sr-only">Portal-Inhalte werden geladen.</p>

      <div aria-hidden="true">
        <div className="mb-7 max-w-3xl sm:mb-8">
          <div className="flex items-center gap-3">
            <SkeletonBlock className="h-1.5 w-7 bg-[#08AEB4]/45" />
            <SkeletonBlock className="h-3 w-28" />
          </div>
          <SkeletonBlock className="mt-4 h-8 w-4/5 max-w-xl sm:h-10" />
          <SkeletonBlock className="mt-3 h-4 w-full max-w-2xl" />
          <SkeletonBlock className="mt-2 h-4 w-3/5 max-w-lg" />
        </div>

        <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
          {skeletonMetrics.map((key, index) => (
            <div
              key={key}
              className={`rounded-2xl border p-4 shadow-[0_12px_35px_rgba(8,43,97,0.06)] sm:p-5 ${
                index === 0
                  ? "border-[#08AEB4]/20 bg-[#E7F8F9]/60"
                  : "border-slate-200/80 bg-white"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <SkeletonBlock className="h-3 w-20" />
                <SkeletonBlock className="size-9" />
              </div>
              <SkeletonBlock className="mt-4 h-8 w-16" />
              <SkeletonBlock className="mt-3 h-3 w-24" />
            </div>
          ))}
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(280px,0.75fr)]">
          <section className="overflow-hidden rounded-2xl border border-slate-200/85 bg-white shadow-[0_12px_40px_rgba(8,43,97,0.06)]">
            <div className="h-1 bg-gradient-to-r from-brand via-[#08AEB4] to-[#08AEB4]/20" />
            <div className="border-b border-slate-100 p-4 sm:p-5">
              <SkeletonBlock className="h-6 w-44" />
              <SkeletonBlock className="mt-2 h-3.5 w-64 max-w-full" />
            </div>
            <div className="grid gap-3 p-4 sm:p-5">
              {rows.map((key) => (
                <div key={key} className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-3 sm:p-4">
                  <SkeletonBlock className="size-11 shrink-0 bg-brand-soft" />
                  <div className="min-w-0 flex-1">
                    <SkeletonBlock className="h-4 w-2/3" />
                    <SkeletonBlock className="mt-2 h-3 w-2/5" />
                  </div>
                  <SkeletonBlock className="hidden h-7 w-16 rounded-full sm:block" />
                </div>
              ))}
            </div>
          </section>

          <section className="h-fit overflow-hidden rounded-2xl border border-slate-200/85 bg-white shadow-[0_12px_40px_rgba(8,43,97,0.06)]">
            <div className="h-1 bg-gradient-to-r from-brand via-[#08AEB4] to-[#08AEB4]/20" />
            <div className="p-4 sm:p-5">
              <SkeletonBlock className="h-6 w-36" />
              <SkeletonBlock className="mt-3 h-4 w-full" />
              <SkeletonBlock className="mt-2 h-4 w-4/5" />
              <div className="mt-5 grid gap-2.5">
                <SkeletonBlock className="h-12 w-full bg-brand/20" />
                <SkeletonBlock className="h-12 w-full" />
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
