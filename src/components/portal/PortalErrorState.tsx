"use client";

import { AlertTriangle, LogOut, RefreshCw } from "lucide-react";
import { useEffect } from "react";
import { logoutAction } from "@/app/actions/auth";

export function PortalErrorState({
  error,
  reset,
  portalLabel,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  portalLabel: string;
}) {
  useEffect(() => {
    console.error(`[Hausvia ${portalLabel}]`, error);
  }, [error, portalLabel]);

  return (
    <section
      role="alert"
      aria-labelledby="portal-error-title"
      className="mx-auto max-w-3xl overflow-hidden rounded-3xl border border-rose-200 bg-white shadow-[0_20px_60px_rgba(4,20,47,0.12)]"
    >
      <div className="h-1.5 bg-gradient-to-r from-rose-500 via-amber-400 to-[#08aeb4]" />
      <div className="p-6 sm:p-9">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-rose-50 text-rose-700">
          <AlertTriangle aria-hidden="true" size={27} />
        </span>
        <p className="mt-5 text-xs font-black uppercase tracking-[0.16em] text-rose-700">{portalLabel}</p>
        <h1 id="portal-error-title" className="mt-2 text-2xl font-black tracking-[-0.03em] text-[#071c3e] sm:text-3xl">
          Diese Ansicht konnte nicht geladen werden
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
          Bitte versuchen Sie es erneut. Falls die Meldung bestehen bleibt, melden Sie sich sicher ab und wenden Sie sich an die Hausvia-Administration.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand px-5 text-sm font-black text-white transition hover:bg-brand-dark focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/20"
          >
            <RefreshCw aria-hidden="true" size={18} />
            Erneut versuchen
          </button>
          <form action={logoutAction}>
            <button className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 text-sm font-black text-slate-700 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-200 sm:w-auto">
              <LogOut aria-hidden="true" size={18} />
              Sicher abmelden
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
