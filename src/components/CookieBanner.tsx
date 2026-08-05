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
      aria-describedby="cookie-description"
      className="fixed inset-0 z-[100] flex items-end justify-center overflow-hidden bg-slate-950/70 backdrop-blur-sm sm:items-center sm:p-6"
    >
      <section
        aria-label="Cookie-Einstellungen"
        className="flex max-h-[100svh] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl border border-white/20 bg-white shadow-2xl shadow-slate-950/30 sm:max-h-[calc(100svh-3rem)] sm:rounded-xl"
      >
        <div className="shrink-0 border-b border-slate-200 bg-brand px-4 py-3 text-white sm:px-7 sm:py-4">
          <p className="hidden text-xs font-bold uppercase tracking-[0.22em] text-blue-100 sm:block">
            Datenschutz & Conversion-Messung
          </p>
          <h2 id="cookie-title" className="text-xl font-extrabold leading-tight sm:mt-2 sm:text-3xl">
            Cookies und Tracking auswählen
          </h2>
        </div>

        <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[1.15fr_0.85fr] lg:items-start lg:gap-5 lg:overflow-y-auto lg:p-7">
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-7 sm:py-5 lg:overflow-visible lg:p-0">
            <p id="cookie-description" className="text-sm font-semibold leading-6 text-slate-750 sm:text-base sm:leading-7">
              Hausvia nutzt notwendige Speicherungen für den Betrieb der Website. Mit Ihrer Zustimmung nutzen wir
              außerdem Analyse- und Marketingdienste, damit Anfragen und Conversion-Quellen sauber gemessen werden
              können.
            </p>
            <div className="mt-4 hidden gap-3 sm:grid sm:grid-cols-3">
              {[
                "Auswahl erforderlich, bevor es weitergeht",
                "Werbe-Cookies und erweiterte Messdaten nur mit Zustimmung",
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
              aria-expanded={showDetails}
              aria-controls="cookie-details"
              className="mt-3 text-sm font-bold text-brand underline sm:mt-5"
            >
              {showDetails ? "Details ausblenden" : "Details und Auswahl anzeigen"}
            </button>

            {showDetails ? (
              <div id="cookie-details" className="mt-3 grid gap-3 text-sm text-slate-750 sm:mt-4">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 sm:p-4">
                  <p className="font-extrabold text-slate-950">Notwendig</p>
                  <p className="mt-1 leading-6">Erforderlich für Grundfunktionen und die Speicherung dieser Auswahl.</p>
                </div>
                <label className="rounded-lg border border-slate-200 bg-slate-50 p-3 sm:p-4">
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
                <label className="rounded-lg border border-slate-200 bg-slate-50 p-3 sm:p-4">
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
                        Ermöglicht Conversion-Messung und die gehashte Zuordnung abgesendeter Anfragen bei
                        Google Ads. Ohne Zustimmung bleibt der Google Consent Mode vollständig eingeschränkt.
                      </span>
                    </span>
                  </span>
                </label>
              </div>
            ) : null}
          </div>

          <div className="shrink-0 border-t border-slate-200 bg-slate-50 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(15,23,42,0.08)] lg:rounded-xl lg:border lg:p-4 lg:shadow-none">
            <div className="hidden lg:block">
              <p className="text-sm font-extrabold uppercase tracking-wide text-brand">Empfohlen</p>
              <p className="mt-2 text-xl font-extrabold leading-tight text-slate-950">
                Alle akzeptieren und Website nutzen
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-650">
                Damit können wir messen, welche Anfragen entstehen und die Kampagnen sauber optimieren.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 lg:mt-5 lg:grid-cols-1">
              <button
                type="button"
                onClick={acceptAll}
                className="min-h-11 rounded-md bg-brand px-3 py-2.5 text-sm font-extrabold text-white transition hover:bg-brand-dark lg:min-h-12 lg:px-5 lg:py-3"
              >
                <span className="lg:hidden">Alle akzeptieren</span>
                <span className="hidden lg:inline">Alle akzeptieren und fortfahren</span>
              </button>
              {showDetails ? (
                <button
                  type="button"
                  onClick={acceptSelection}
                  className="order-first col-span-2 min-h-11 rounded-md border border-brand bg-white px-5 py-2.5 text-sm font-bold text-brand transition hover:bg-brand-soft lg:order-none lg:col-span-1"
                >
                  Auswahl speichern
                </button>
              ) : null}
              <button
                type="button"
                onClick={acceptNecessaryOnly}
                className="min-h-11 rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm font-bold text-slate-800 transition hover:border-brand hover:text-brand lg:px-5"
              >
                <span className="lg:hidden">Nur notwendige</span>
                <span className="hidden lg:inline">Nur notwendige Cookies</span>
              </button>
            </div>
            <div className="mt-2 flex items-center justify-center gap-4 text-xs font-bold text-slate-500 lg:mt-4 lg:flex-col lg:gap-2">
              {editingSavedConsent ? (
                <button
                  type="button"
                  onClick={closeSettings}
                  className="underline underline-offset-4 transition hover:text-brand"
                >
                  Ohne Änderungen schließen
                </button>
              ) : null}
              <Link href="/datenschutz" className="underline">
                Datenschutzhinweise öffnen
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
