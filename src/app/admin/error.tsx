"use client";

import Link from "next/link";

export default function AdminError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section
      className="rounded-xl border border-red-200 bg-white p-6 shadow-sm sm:p-8"
      aria-labelledby="admin-error-title"
      role="alert"
    >
      <p className="text-sm font-extrabold uppercase tracking-wide text-red-700">
        Adminportal
      </p>
      <h1
        id="admin-error-title"
        className="mt-2 text-2xl font-extrabold leading-tight text-slate-950 sm:text-3xl"
      >
        Diese Ansicht konnte nicht geladen werden
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-650 sm:text-base">
        Es ist ein unerwarteter Fehler aufgetreten. Versuchen Sie es erneut oder
        wechseln Sie zurück zur Immobilienverwaltung.
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-brand px-4 py-2 text-sm font-extrabold text-white transition hover:bg-brand-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          Erneut versuchen
        </button>
        <Link
          href="/admin/properties"
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-extrabold text-slate-800 transition hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          Zur Immobilienverwaltung
        </Link>
      </div>
    </section>
  );
}
