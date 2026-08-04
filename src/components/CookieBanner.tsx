"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import {
  getCookieConsentRaw,
  parseCookieConsent,
  saveCookieConsent,
  subscribeCookieConsentChange,
} from "@/lib/cookieConsent";

export function CookieBanner() {
  const [showDetails, setShowDetails] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [editingSavedConsent, setEditingSavedConsent] = useState(false);
  const rawConsent = useSyncExternalStore(subscribeCookieConsentChange, getCookieConsentRaw, () => "server");
  const hasConsent = Boolean(rawConsent);

  function closeSettings() {
    setEditingSavedConsent(false);
    setShowDetails(false);
  }

  function openSettings() {
    const consent = parseCookieConsent(rawConsent);
    setAnalytics(consent?.analytics === true);
    setMarketing(consent?.marketing === true);
    setShowDetails(true);
    setEditingSavedConsent(true);
  }

  function acceptSelection() {
    saveCookieConsent({ analytics, marketing });
    closeSettings();
  }

  function acceptNecessaryOnly() {
    saveCookieConsent({ analytics: false, marketing: false });
    closeSettings();
  }

  function acceptAll() {
    saveCookieConsent({ analytics: true, marketing: true });
    closeSettings();
  }

  if (hasConsent && !editingSavedConsent) {
    return (
      <button
        type="button"
        onClick={openSettings}
        className="fixed bottom-20 left-3 z-40 min-h-10 rounded-full border border-slate-300 bg-white/95 px-4 py-2 text-xs font-bold text-slate-700 shadow-lg shadow-slate-950/10 backdrop-blur transition hover:border-brand hover:text-brand focus:outline-none focus:ring-4 focus:ring-brand/20 md:bottom-3"
      >
        Cookie-Einstellungen
      </button>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cookie-title"
      className="fixed inset-0 z-[100] flex items-end justify-center overflow-y-auto bg-slate-950/70 p-3 backdrop-blur-sm sm:items-center sm:p-6"
    >
      <section
        aria-label="Cookie-Einstellungen"
        className="max-h-[calc(100svh-1.5rem)] w-full max-w-4xl overflow-y-auto rounded-xl border border-white/20 bg-white shadow-2xl shadow-slate-950/30"
      >
        <div className="border-b border-slate-200 bg-brand px-5 py-4 text-white sm:px-7">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-blue-100">Datenschutz & Conversion-Messung</p>
          <h2 id="cookie-title" className="mt-2 text-2xl font-extrabold leading-tight sm:text-3xl">
            Cookies und Tracking auswählen
          </h2>
        </div>

        <div className="grid gap-5 p-5 sm:p-7 lg:grid-cols-[1.15fr_0.85fr] lg:items-start">
          <div>
            <p className="text-base font-semibold leading-7 text-slate-750">
              Hausvia nutzt notwendige Speicherungen für den Betrieb der Website. Mit Ihrer Zustimmung nutzen wir
              außerdem Analyse- und Marketingdienste, damit Anfragen und Conversion-Quellen sauber gemessen werden
              können.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {[
                "Auswahl erforderlich, bevor es weitergeht",
                "Google Ads Conversion-Messung nur mit Zustimmung",
                "Auswahl jederzeit über Cookie-Einstellungen änderbar",
              ].map((item) => (
                <div key={item} className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm font-bold leading-5 text-slate-800">
                  {item}
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setShowDetails((current) => !current)}
              className="mt-5 text-sm font-bold text-brand underline"
            >
              {showDetails ? "Details ausblenden" : "Details und Auswahl anzeigen"}
            </button>

            {showDetails ? (
              <div className="mt-4 grid gap-3 text-sm text-slate-750">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <p className="font-extrabold text-slate-950">Notwendig</p>
                  <p className="mt-1 leading-6">Erforderlich für Grundfunktionen und die Speicherung dieser Auswahl.</p>
                </div>
                <label className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <span className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={analytics}
                      onChange={(event) => setAnalytics(event.target.checked)}
                      className="mt-1 h-5 w-5 rounded border-slate-300 text-brand focus:ring-brand"
                    />
                    <span>
                      <span className="block font-extrabold text-slate-950">Analyse</span>
                      <span className="mt-1 block leading-6">Hilft dabei, die Nutzung der Website besser zu verstehen.</span>
                    </span>
                  </span>
                </label>
                <label className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <span className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={marketing}
                      onChange={(event) => setMarketing(event.target.checked)}
                      className="mt-1 h-5 w-5 rounded border-slate-300 text-brand focus:ring-brand"
                    />
                    <span>
                      <span className="block font-extrabold text-slate-950">Marketing & Google Ads</span>
                      <span className="mt-1 block leading-6">
                        Ermöglicht Google Ads Tag und Conversion-Messung für abgesendete Anfragen.
                      </span>
                    </span>
                  </span>
                </label>
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-extrabold uppercase tracking-wide text-brand">Empfohlen</p>
            <p className="mt-2 text-xl font-extrabold leading-tight text-slate-950">
              Alle akzeptieren und Website nutzen
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-650">
              Damit können wir messen, welche Anfragen entstehen und die Kampagnen sauber optimieren.
            </p>
            <div className="mt-5 grid gap-2">
              <button
                type="button"
                onClick={acceptAll}
                className="min-h-12 rounded-md bg-brand px-5 py-3 text-sm font-extrabold text-white transition hover:bg-brand-dark"
              >
                Alle akzeptieren und fortfahren
              </button>
              <button
                type="button"
                onClick={acceptSelection}
                className="min-h-11 rounded-md border border-brand bg-white px-5 py-2.5 text-sm font-bold text-brand transition hover:bg-brand-soft"
              >
                Auswahl speichern
              </button>
              <button
                type="button"
                onClick={acceptNecessaryOnly}
                className="min-h-11 rounded-md border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-800 transition hover:border-brand hover:text-brand"
              >
                Nur notwendige Cookies
              </button>
              {editingSavedConsent ? (
                <button
                  type="button"
                  onClick={closeSettings}
                  className="min-h-10 px-4 py-2 text-xs font-bold text-slate-600 underline underline-offset-4 transition hover:text-brand"
                >
                  Ohne Änderungen schließen
                </button>
              ) : null}
            </div>
            <Link href="/datenschutz" className="mt-4 block text-center text-xs font-bold text-slate-500 underline">
              Datenschutzhinweise öffnen
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
