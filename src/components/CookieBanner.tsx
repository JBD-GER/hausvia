"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";

const storageKey = "hausvia-cookie-consent-v1";

type Consent = {
  necessary: true;
  analytics: boolean;
  marketing: boolean;
  savedAt: string;
};

function saveConsent(consent: Omit<Consent, "necessary" | "savedAt">) {
  const value: Consent = {
    necessary: true,
    analytics: consent.analytics,
    marketing: consent.marketing,
    savedAt: new Date().toISOString(),
  };

  window.localStorage.setItem(storageKey, JSON.stringify(value));
  window.dispatchEvent(new Event("hausvia-cookie-consent-change"));
}

function hasStoredConsent() {
  if (typeof window === "undefined") return true;
  return Boolean(window.localStorage.getItem(storageKey));
}

function subscribeConsentChange(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("hausvia-cookie-consent-change", callback);

  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("hausvia-cookie-consent-change", callback);
  };
}

export function CookieBanner() {
  const [showDetails, setShowDetails] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const hasConsent = useSyncExternalStore(subscribeConsentChange, hasStoredConsent, () => true);

  function acceptSelection() {
    saveConsent({ analytics, marketing });
  }

  function acceptNecessaryOnly() {
    saveConsent({ analytics: false, marketing: false });
  }

  function acceptAll() {
    saveConsent({ analytics: true, marketing: true });
  }

  if (hasConsent) return null;

  return (
    <section
      aria-label="Cookie-Einstellungen"
      className="fixed inset-x-3 bottom-20 z-50 mx-auto max-h-[calc(100svh-7rem)] max-w-5xl overflow-y-auto rounded-lg border border-slate-200 bg-white p-3 shadow-2xl shadow-slate-950/20 md:bottom-4 md:p-5"
    >
      <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-brand sm:text-sm">Datenschutz-Einstellungen</p>
          <h2 className="mt-1 text-lg font-extrabold leading-tight text-slate-950 sm:text-xl">
            Cookies und Dienste verwalten
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-650 sm:max-w-3xl">
            Hausvia nutzt aktuell keine Analyse- oder Marketingdienste. Ihre Auswahl wird nur lokal im Browser
            gespeichert.
          </p>
          <button
            type="button"
            onClick={() => setShowDetails((current) => !current)}
            className="mt-2 text-sm font-bold text-brand underline"
          >
            {showDetails ? "Details ausblenden" : "Details anzeigen"}
          </button>

          {showDetails ? (
            <div className="mt-4 grid gap-3 text-sm text-slate-750 sm:grid-cols-3">
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <p className="font-extrabold text-slate-950">Notwendig</p>
                <p className="mt-1 leading-5">Erforderlich für Grundfunktionen und die Speicherung dieser Auswahl.</p>
              </div>
              <label className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <span className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={analytics}
                    onChange={(event) => setAnalytics(event.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
                  />
                  <span>
                    <span className="block font-extrabold text-slate-950">Analyse</span>
                    <span className="mt-1 block leading-5">Aktuell nicht aktiv.</span>
                  </span>
                </span>
              </label>
              <label className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <span className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={marketing}
                    onChange={(event) => setMarketing(event.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
                  />
                  <span>
                    <span className="block font-extrabold text-slate-950">Marketing</span>
                    <span className="mt-1 block leading-5">Aktuell nicht aktiv.</span>
                  </span>
                </span>
              </label>
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-1">
          <button
            type="button"
            onClick={acceptAll}
            className="col-span-2 min-h-11 rounded-md bg-brand px-4 py-2.5 text-sm font-bold text-white transition hover:bg-brand-dark sm:col-span-1"
          >
            Alle akzeptieren
          </button>
          <button
            type="button"
            onClick={acceptSelection}
            className="min-h-11 rounded-md border border-brand bg-white px-4 py-2.5 text-sm font-bold text-brand transition hover:bg-brand-soft"
          >
            Auswahl speichern
          </button>
          <button
            type="button"
            onClick={acceptNecessaryOnly}
            className="min-h-11 rounded-md border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 transition hover:border-brand hover:text-brand"
          >
            Nur notwendige
          </button>
          <Link href="/datenschutz" className="text-center text-xs font-bold text-slate-500 underline lg:text-right">
            Datenschutz
          </Link>
        </div>
      </div>
    </section>
  );
}
