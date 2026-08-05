export default function AdminLoading() {
  return (
    <div
      className="grid gap-5"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">Adminbereich wird geladen.</span>

      <div className="animate-pulse" aria-hidden="true">
        <div className="h-4 w-32 rounded-full bg-brand/15" />
        <div className="mt-3 h-9 max-w-md rounded-lg bg-slate-200" />
        <div className="mt-3 h-5 max-w-2xl rounded bg-slate-100" />
      </div>

      <section
        className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
        aria-hidden="true"
      >
        <div className="animate-pulse">
          <div className="h-6 w-44 rounded bg-slate-200" />
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, index) => (
              <div
                key={index}
                className="rounded-xl border border-slate-100 bg-slate-50 p-4"
              >
                <div className="h-5 w-2/3 rounded bg-slate-200" />
                <div className="mt-3 h-4 w-full rounded bg-slate-200/80" />
                <div className="mt-2 h-4 w-4/5 rounded bg-slate-200/80" />
                <div className="mt-5 h-11 w-32 rounded-md bg-brand/10" />
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
