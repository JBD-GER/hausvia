"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Calculator,
  Check,
  CircleAlert,
  CloudSnow,
  Euro,
  Snowflake,
} from "lucide-react";
import {
  calculateWinterPrice,
  parseWinterArea,
  winterPricingConfig,
  winterSeasonTotal,
  type WinterAccess,
  type WinterObjectType,
  type WinterSurfaceProfile,
} from "@/lib/winterPricing";

const currency = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

function SelectionCard({
  active,
  title,
  text,
  onClick,
  disabled = false,
}: {
  active: boolean;
  title: string;
  text: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`relative min-h-24 rounded-xl border p-4 text-left transition ${
        disabled
          ? "cursor-not-allowed border-slate-200 bg-slate-50 opacity-55"
          : active
          ? "border-cyan-400 bg-cyan-50 shadow-sm ring-2 ring-cyan-100"
          : "border-slate-200 bg-white hover:border-cyan-300 hover:bg-sky-50/50"
      }`}
      aria-pressed={active}
    >
      <span className="block pr-7 text-sm font-extrabold text-slate-950">{title}</span>
      <span className="mt-1.5 block text-xs leading-5 text-slate-600">{text}</span>
      {active ? (
        <span className="absolute right-3 top-3 grid h-6 w-6 place-items-center rounded-full bg-cyan-600 text-white">
          <Check aria-hidden="true" className="h-3.5 w-3.5" />
        </span>
      ) : null}
    </button>
  );
}

export function WinterdienstCalculator() {
  const [objectType, setObjectType] = useState<WinterObjectType>("residential");
  const [area, setArea] = useState("100");
  const [surfaceProfile, setSurfaceProfile] = useState<WinterSurfaceProfile>("manual");
  const [access, setAccess] = useState<WinterAccess>("standard");
  const [hasCalculated, setHasCalculated] = useState(false);
  const [showAreaError, setShowAreaError] = useState(false);
  const areaInputRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  const numericArea = parseWinterArea(area) ?? Number.NaN;
  const areaIsValid =
    Number.isFinite(numericArea) &&
    numericArea >= winterPricingConfig.minimumArea &&
    numericArea <= winterPricingConfig.maximumArea;
  const machineIsAvailable =
    areaIsValid && numericArea >= winterPricingConfig.minimumMachineArea && access === "standard";
  const estimate = useMemo(
    () =>
      areaIsValid && (surfaceProfile !== "machine" || machineIsAvailable)
        ? calculateWinterPrice({ objectType, area: Math.round(numericArea), surfaceProfile, access })
        : null,
    [access, areaIsValid, machineIsAvailable, numericArea, objectType, surfaceProfile],
  );
  const requestHref = useMemo(() => {
    if (!estimate) return "/angebot-anfragen?leistung=winterdienst";

    const params = new URLSearchParams({
      leistung: "winterdienst",
      objectType,
      area: String(Math.round(numericArea)),
      surfaceProfile,
      access,
    });

    return `/angebot-anfragen?${params.toString()}`;
  }, [access, estimate, numericArea, objectType, surfaceProfile]);

  function calculate() {
    if (!areaIsValid) {
      setShowAreaError(true);
      window.requestAnimationFrame(() => areaInputRef.current?.focus());
      return;
    }

    setHasCalculated(true);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        resultRef.current?.focus({ preventScroll: true });
        resultRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    });
  }

  return (
    <section
      id="winterdienst-preis"
      className="scroll-mt-24 overflow-hidden rounded-2xl border border-cyan-200 bg-white shadow-[0_24px_70px_rgba(8,47,73,0.12)]"
      aria-labelledby="winter-calculator-title"
    >
      <div className="border-b border-cyan-200 bg-gradient-to-r from-slate-950 via-sky-950 to-cyan-950 px-5 py-6 text-white sm:px-7">
        <div className="flex items-start gap-4">
          <span className="grid h-12 w-12 flex-none place-items-center rounded-xl bg-cyan-300 text-sky-950 shadow-lg shadow-cyan-950/20">
            <Calculator aria-hidden="true" className="h-6 w-6" />
          </span>
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-cyan-200">
              Direkt und ohne E-Mail
            </p>
            <h3 id="winter-calculator-title" className="mt-1 text-2xl font-extrabold sm:text-3xl">
              Winterdienst-Preis berechnen
            </h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-sky-100">
              Vier Angaben genügen für Grundbetrag und Preis je tatsächlichem Einsatz.
            </p>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1.08fr_0.92fr]">
        <div className="space-y-8 p-5 sm:p-7 lg:border-r lg:border-slate-200">
          <fieldset>
            <legend className="text-base font-extrabold text-slate-950">1. Welche Objektart wird betreut?</legend>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {winterPricingConfig.objectTypes.map((item) => (
                <SelectionCard
                  key={item.id}
                  active={objectType === item.id}
                  title={item.label}
                  text={item.description}
                  onClick={() => setObjectType(item.id)}
                />
              ))}
            </div>
          </fieldset>

          <label className="block">
            <span className="text-base font-extrabold text-slate-950">2. Wie groß ist die tatsächliche Winterdienstfläche?</span>
            <span className="mt-1 block text-xs leading-5 text-slate-600">
              Nur Wege, Zugänge und Flächen angeben, die tatsächlich geräumt und gestreut werden sollen.
            </span>
            <span className="relative mt-4 block max-w-sm">
              <input
                ref={areaInputRef}
                name="winterdienstflaeche"
                type="text"
                value={area}
                onChange={(event) => {
                  const nextArea = event.target.value.replace(/[^\d.,\s]/g, "");
                  const parsedNextArea = parseWinterArea(nextArea);
                  setArea(nextArea);
                  setShowAreaError(false);
                  if (
                    surfaceProfile === "machine" &&
                    (parsedNextArea === null || parsedNextArea < winterPricingConfig.minimumMachineArea)
                  ) {
                    setSurfaceProfile("mixed");
                  }
                }}
                onBlur={() => setShowAreaError(true)}
                inputMode="decimal"
                aria-describedby="winter-area-help"
                aria-invalid={showAreaError && !areaIsValid}
                required
                className="min-h-14 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 pr-16 text-xl font-extrabold text-slate-950 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
              />
              <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm font-bold text-slate-500">m²</span>
            </span>
            <span id="winter-area-help" className="mt-2 block text-xs font-semibold text-slate-500">
              Online kalkulierbar von {winterPricingConfig.minimumArea} bis {winterPricingConfig.maximumArea.toLocaleString("de-DE")} m².
            </span>
          </label>

          <fieldset>
            <legend className="text-base font-extrabold text-slate-950">3. Wie kann die Fläche bearbeitet werden?</legend>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {winterPricingConfig.surfaceProfiles.map((item) => (
                <SelectionCard
                  key={item.id}
                  active={surfaceProfile === item.id}
                  title={item.label}
                  text={item.description}
                  onClick={() => setSurfaceProfile(item.id)}
                  disabled={item.id === "machine" && !machineIsAvailable}
                />
              ))}
            </div>
            <p className="mt-3 text-xs font-semibold leading-5 text-slate-500">
              Maschinelle Bearbeitung ist online ab {winterPricingConfig.minimumMachineArea} m² und nur für zusammenhängende, normal zugängliche Flächen kalkulierbar.
            </p>
          </fieldset>

          <fieldset>
            <legend className="text-base font-extrabold text-slate-950">4. Gibt es Erschwernisse?</legend>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {winterPricingConfig.accessOptions.map((item) => (
                <SelectionCard
                  key={item.id}
                  active={access === item.id}
                  title={item.label}
                  text={item.description}
                  onClick={() => {
                    setAccess(item.id);
                    if (item.id === "difficult" && surfaceProfile === "machine") {
                      setSurfaceProfile("mixed");
                    }
                  }}
                />
              ))}
            </div>
          </fieldset>

          {!areaIsValid && showAreaError ? (
            <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-900" role="alert">
              <CircleAlert aria-hidden="true" className="mt-0.5 h-5 w-5 flex-none" />
              Bitte geben Sie eine Fläche zwischen {winterPricingConfig.minimumArea} und {winterPricingConfig.maximumArea.toLocaleString("de-DE")} m² ein. Größere Flächen kalkulieren wir individuell.
            </p>
          ) : null}

          <button
            type="button"
            onClick={calculate}
            className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-cyan-700 px-6 py-3.5 text-base font-extrabold text-white shadow-lg shadow-cyan-900/15 transition hover:bg-cyan-800"
          >
            <Euro aria-hidden="true" className="h-5 w-5" /> Preis jetzt anzeigen
          </button>
        </div>

        <div className="bg-gradient-to-b from-sky-50 to-white p-5 sm:p-7">
          <p className="sr-only" aria-live="polite">
            {hasCalculated && estimate
              ? `Preiseinschätzung: ${currency.format(estimate.monthlyBaseGross)} Grundbetrag pro Monat und ${currency.format(estimate.deploymentGross)} je tatsächlichem Einsatz.`
              : ""}
          </p>
          {hasCalculated && estimate ? (
            <div ref={resultRef} tabIndex={-1} className="scroll-mt-24 outline-none">
              <div className="flex items-center gap-2 text-cyan-800">
                <Snowflake aria-hidden="true" className="h-5 w-5" />
                <p className="text-xs font-extrabold uppercase tracking-[0.17em]">Ihre direkte Preiseinschätzung</p>
              </div>

              <div className="mt-6 grid gap-3">
                <div className="rounded-2xl border border-sky-200 bg-white p-5 shadow-sm">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Grundbetrag pro Monat</p>
                  <p className="mt-2 text-4xl font-extrabold tracking-tight text-slate-950">{currency.format(estimate.monthlyBaseGross)}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {currency.format(estimate.seasonBaseGross)} fester Grundbetrag für die gesamte Saison.
                  </p>
                </div>
                <div className="rounded-2xl border border-cyan-700 bg-cyan-800 p-5 text-white shadow-lg shadow-cyan-900/10">
                  <p className="text-xs font-bold uppercase tracking-wide text-white">Je tatsächlichem Einsatz</p>
                  <p className="mt-2 text-4xl font-extrabold tracking-tight">+ {currency.format(estimate.deploymentGross)}</p>
                  <p className="mt-2 text-sm leading-6 text-white">Nur wenn am Objekt tatsächlich geräumt oder gestreut wird.</p>
                </div>
              </div>

              <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
                <p className="text-sm font-extrabold text-slate-950">Saisonbeispiele zur Budgetplanung</p>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  {[5, 10, 15].map((deployments) => (
                    <div key={deployments} className="rounded-xl bg-slate-50 px-2 py-3">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{deployments} Einsätze</p>
                      <p className="mt-1 text-sm font-extrabold text-slate-950 sm:text-base">
                        {currency.format(winterSeasonTotal(estimate, deployments))}
                      </p>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-xs leading-5 text-slate-500">Budgetbeispiele, keine Wetter- oder Einsatzprognose.</p>
                <p className="mt-3 border-t border-slate-200 pt-3 text-xs leading-5 text-slate-600">
                  Ein Einsatz umfasst eine wetterbedingte Anfahrt und einen vereinbarten Winterdienstdurchgang – je nach Situation Räumen, Streuen oder beides. Ein später erneut erforderlicher Durchgang zählt als weiterer Einsatz. Schneeabtransport und Streugutentfernung sind nicht automatisch enthalten.
                </p>
              </div>

              <ul className="mt-6 space-y-2 text-xs font-semibold leading-5 text-slate-600">
                <li className="flex gap-2"><Check aria-hidden="true" className="mt-0.5 h-4 w-4 flex-none text-emerald-600" /> Vertragslaufzeit: 1. November bis 31. März</li>
                <li className="flex gap-2"><Check aria-hidden="true" className="mt-0.5 h-4 w-4 flex-none text-emerald-600" /> Kalkuliertes abstumpfendes Streugut gemäß Angebot</li>
                <li className="flex gap-2"><Check aria-hidden="true" className="mt-0.5 h-4 w-4 flex-none text-emerald-600" /> Alle Rechnerpreise inklusive 19 % Umsatzsteuer</li>
              </ul>

              <Link
                href={requestHref}
                className="mt-7 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-6 py-3.5 text-base font-extrabold text-white transition hover:bg-sky-950"
              >
                Diese Einschätzung anfragen <ArrowRight aria-hidden="true" className="h-5 w-5" />
              </Link>
              <p className="mt-3 text-center text-xs leading-5 text-slate-500">
                Ihre vier Angaben werden übernommen. Das Angebot bleibt kostenlos und unverbindlich.
              </p>
            </div>
          ) : (
            <div className="flex min-h-[32rem] flex-col items-center justify-center rounded-2xl border border-dashed border-cyan-300 bg-white/70 p-8 text-center">
              <span className="grid h-16 w-16 place-items-center rounded-2xl bg-cyan-100 text-cyan-800">
                <CloudSnow aria-hidden="true" className="h-8 w-8" />
              </span>
              <h3 className="mt-6 text-2xl font-extrabold text-slate-950">Ihr Preis ohne Kontaktdaten</h3>
              <p className="mt-3 max-w-sm text-sm leading-7 text-slate-600">
                Erst vier Objektangaben auswählen und dann auf „Preis jetzt anzeigen“ klicken. E-Mail und Telefonnummer sind dafür nicht nötig.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-slate-200 bg-slate-50 px-5 py-4 text-xs leading-5 text-slate-600 sm:px-7">
        Unverbindliche Online-Preiseinschätzung für Objekte im Hausvia-Tourengebiet Hannover. Voraussetzung sind zutreffende Flächen- und Zugänglichkeitsangaben sowie verfügbare Kapazitäten. Vor Vertragsschluss prüfen wir Adresse und Objektgegebenheiten.
      </div>
    </section>
  );
}
