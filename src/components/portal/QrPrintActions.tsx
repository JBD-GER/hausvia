"use client";

import { Download, Printer } from "lucide-react";

export function QrPrintActions({ buildingId }: { buildingId: string }) {
  return (
    <div className="mt-6 print:hidden">
      <div className="grid gap-2 sm:grid-cols-3">
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand to-brand-dark px-4 text-sm font-black text-white shadow-[0_10px_24px_rgba(8,43,97,0.22)] transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/20"
        >
          <Printer aria-hidden="true" size={18} />
          Drucken
        </button>
        <a
          href={`/api/buildings/${buildingId}/qr?download=1`}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-brand/20 bg-white px-4 text-sm font-black text-brand transition hover:border-brand/40 hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/15"
        >
          <Download aria-hidden="true" size={18} />
          PNG laden
        </a>
        <a
          href={`/api/buildings/${buildingId}/qr?format=svg&download=1`}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-brand/20 bg-white px-4 text-sm font-black text-brand transition hover:border-brand/40 hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/15"
        >
          <Download aria-hidden="true" size={18} />
          SVG laden
        </a>
      </div>
      <p className="mt-3 text-center text-xs leading-5 text-slate-500">
        Für Druckereien eignet sich die skalierbare SVG-Datei. Ein erneuertes Token macht alle älteren Ausdrucke ungültig.
      </p>
    </div>
  );
}
