"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Calculator,
  Check,
  CheckCircle2,
  CircleAlert,
  CloudSnow,
  Edit3,
  Euro,
  Keyboard,
  Loader2,
  MapPin,
  MapPinned,
  Ruler,
  ShieldCheck,
  Snowflake,
} from "lucide-react";
import type { WinterAddressSelection } from "@/components/WinterAddressSearch";
import { winterRequestEventName, writeWinterCalculatorDraft } from "@/lib/winterCalculatorDraft";
import type { WinterMapPoint } from "@/lib/winterMap";
import {
  calculateWinterPrice,
  deriveWinterSurfaceProfile,
  parseWinterArea,
  winterPricingConfig,
  winterSeasonTotal,
  type WinterAccess,
  type WinterObjectType,
} from "@/lib/winterPricing";

const WinterAddressSearch = dynamic(
  () => import("@/components/WinterAddressSearch").then((module) => module.WinterAddressSearch),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-16 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600">
        <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin text-brand" /> Adressfinder wird vorbereitet …
      </div>
    ),
  },
);

const WinterAreaMapDialog = dynamic(
  () => import("@/components/WinterAreaMapDialog").then((module) => module.WinterAreaMapDialog),
  { ssr: false },
);

const currency = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

const wizardSteps = [
  { title: "Adresse", icon: MapPin },
  { title: "Fläche", icon: Ruler },
  { title: "Objekt", icon: ShieldCheck },
  { title: "Preis", icon: Euro },
] as const;

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
            ? "border-brand bg-brand-soft shadow-sm ring-2 ring-brand/10"
            : "border-slate-200 bg-white hover:border-brand/40 hover:bg-brand-soft/50"
      }`}
      aria-pressed={active}
    >
      <span className="block pr-7 text-sm font-extrabold text-slate-950">{title}</span>
      <span className="mt-1.5 block text-xs leading-5 text-slate-600">{text}</span>
      {active ? (
        <span className="absolute right-3 top-3 grid h-6 w-6 place-items-center rounded-full bg-brand text-white">
          <Check aria-hidden="true" className="h-3.5 w-3.5" />
        </span>
      ) : null}
    </button>
  );
}

function WizardProgress({ step }: { step: number }) {
  return (
    <ol className="grid grid-cols-4 border-b border-slate-200 bg-slate-50" aria-label="Fortschritt der Preiseinschätzung">
      {wizardSteps.map((item, index) => {
        const Icon = item.icon;
        const completed = index < step;
        const active = index === step;

        return (
          <li
            key={item.title}
            className={`relative flex min-w-0 flex-col items-center gap-1 px-1 py-3 text-center sm:flex-row sm:justify-center sm:gap-2 sm:px-3 sm:py-4 ${
              active ? "bg-white text-brand" : completed ? "text-emerald-700" : "text-slate-400"
            }`}
            aria-current={active ? "step" : undefined}
          >
            <span
              className={`grid h-7 w-7 place-items-center rounded-full ${
                active ? "bg-brand text-white" : completed ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"
              }`}
            >
              {completed ? <Check aria-hidden="true" className="h-4 w-4" /> : <Icon aria-hidden="true" className="h-3.5 w-3.5" />}
            </span>
            <span className="truncate text-[10px] font-extrabold uppercase tracking-wide sm:text-xs">{item.title}</span>
            {active ? <span className="absolute inset-x-2 bottom-0 h-1 rounded-t-full bg-accent" aria-hidden="true" /> : null}
          </li>
        );
      })}
    </ol>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-bold text-slate-650 transition hover:bg-slate-50 hover:text-brand"
    >
      <ArrowLeft aria-hidden="true" className="h-4 w-4" /> Zurück
    </button>
  );
}

export function WinterdienstCalculator({ googleMapsApiKey = "" }: { googleMapsApiKey?: string }) {
  const router = useRouter();
  const mapsAvailable = Boolean(googleMapsApiKey.trim());
  const [step, setStep] = useState(0);
  const [address, setAddress] = useState("");
  const [location, setLocation] = useState<WinterMapPoint | null>(null);
  const [mapsActivated, setMapsActivated] = useState(false);
  const [manualAddressMode, setManualAddressMode] = useState(!mapsAvailable);
  const [mapOpen, setMapOpen] = useState(false);
  const [hasSeenMapGuide, setHasSeenMapGuide] = useState(false);
  const [polygonPoints, setPolygonPoints] = useState<WinterMapPoint[]>([]);
  const [areaSource, setAreaSource] = useState<"map" | "manual">("manual");
  const [area, setArea] = useState("");
  const [objectType, setObjectType] = useState<WinterObjectType>("residential");
  const [access, setAccess] = useState<WinterAccess>("standard");
  const [error, setError] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const areaInputRef = useRef<HTMLInputElement>(null);

  const numericArea = parseWinterArea(area) ?? Number.NaN;
  const areaIsValid =
    Number.isFinite(numericArea) &&
    numericArea >= winterPricingConfig.minimumArea &&
    numericArea <= winterPricingConfig.maximumArea;
  const surfaceProfile = deriveWinterSurfaceProfile(areaIsValid ? numericArea : 0, access);
  const estimate = useMemo(
    () =>
      areaIsValid
        ? calculateWinterPrice({ objectType, area: Math.round(numericArea), surfaceProfile, access })
        : null,
    [access, areaIsValid, numericArea, objectType, surfaceProfile],
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

  const resetAreaMeasurement = useCallback(() => {
    setPolygonPoints([]);
    setArea("");
    setAreaSource("manual");
  }, []);

  const handleAddressSelection = useCallback((selection: WinterAddressSelection) => {
    setAddress(selection.address);
    setLocation(selection.location);
    resetAreaMeasurement();
    setError("");
  }, [resetAreaMeasurement]);

  function goToStep(nextStep: number) {
    setStep(nextStep);
    setError("");
    window.requestAnimationFrame(() => {
      panelRef.current?.focus({ preventScroll: true });
      panelRef.current?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "start",
      });
    });
  }

  function continueFromAddress() {
    if (address.trim().length < 5) {
      setError("Bitte geben Sie die vollständige Objektadresse ein.");
      return;
    }
    if (!location && !/\d/.test(address)) {
      setError("Bitte ergänzen Sie die Hausnummer der Objektadresse.");
      return;
    }

    goToStep(1);
    if (mapsAvailable && mapsActivated && location) {
      window.requestAnimationFrame(() => setMapOpen(true));
    }
  }

  function continueFromArea() {
    if (!areaIsValid) {
      setError(
        `Bitte geben Sie eine Winterdienstfläche zwischen ${winterPricingConfig.minimumArea} und ${winterPricingConfig.maximumArea.toLocaleString("de-DE")} m² ein.`,
      );
      window.requestAnimationFrame(() => areaInputRef.current?.focus());
      return;
    }

    goToStep(2);
  }

  function showResult() {
    if (!estimate) {
      setError("Bitte prüfen Sie die Flächen- und Objektangaben.");
      return;
    }
    goToStep(3);
  }

  const startWinterRequest = useCallback(() => {
    const draftId = writeWinterCalculatorDraft({
      objectAddress: address,
      areaSource,
      polygonPoints: areaSource === "map" ? polygonPoints : [],
    });

    const separator = requestHref.includes("?") ? "&" : "?";
    router.push(draftId ? `${requestHref}${separator}entwurf=${encodeURIComponent(draftId)}` : requestHref);
  }, [address, areaSource, polygonPoints, requestHref, router]);

  useEffect(() => {
    function handleStickyRequest(event: Event) {
      event.preventDefault();
      startWinterRequest();
    }

    window.addEventListener(winterRequestEventName, handleStickyRequest);
    return () => window.removeEventListener(winterRequestEventName, handleStickyRequest);
  }, [startWinterRequest]);

  return (
    <section
      id="winterdienst-preis"
      className="scroll-mt-24 overflow-hidden rounded-2xl border border-brand/15 bg-white shadow-[0_24px_70px_rgba(8,43,97,0.12)]"
      aria-labelledby="winter-calculator-title"
    >
      <div className="border-b border-brand bg-brand px-5 py-6 text-white sm:px-7">
        <div className="flex items-start gap-4">
          <span className="grid h-12 w-12 flex-none place-items-center rounded-xl bg-white text-brand shadow-lg shadow-black/15">
            <Calculator aria-hidden="true" className="h-6 w-6" />
          </span>
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-blue-100">Direkt und ohne E-Mail</p>
            <h3 id="winter-calculator-title" className="mt-1 text-2xl font-extrabold sm:text-3xl">
              Winterdienst-Preis berechnen
            </h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-blue-100">
              Adresse finden, Fläche auf der Karte markieren und sofort Grundbetrag sowie Einsatzpreis sehen.
            </p>
          </div>
        </div>
      </div>

      <WizardProgress step={step} />

      <div ref={panelRef} tabIndex={-1} className="scroll-mt-24 outline-none">
        {step === 0 ? (
          <div className="mx-auto max-w-4xl p-5 sm:p-8 lg:p-10">
            <div className="max-w-2xl">
              <p className="text-sm font-extrabold uppercase tracking-[0.16em] text-brand">Schritt 1 von 4</p>
              <h4 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">
                Wo soll der Winterdienst stattfinden?
              </h4>
              <p className="mt-3 text-sm leading-7 text-slate-650 sm:text-base">
                Wählen Sie die Objektadresse aus. Danach richten wir die Satellitenkarte direkt auf das Grundstück aus.
              </p>
            </div>

            <div className="mt-7">
              {!manualAddressMode && !mapsActivated && mapsAvailable ? (
                <div className="rounded-2xl border border-brand/15 bg-brand-soft p-5 sm:p-6">
                  <div className="flex items-start gap-4">
                    <span className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-brand text-white">
                      <MapPinned aria-hidden="true" className="h-5 w-5" />
                    </span>
                    <div>
                      <h5 className="font-extrabold text-slate-950">Google-Adressfinder aktivieren</h5>
                      <p className="mt-1 text-sm leading-6 text-slate-650">
                        Google wird erst nach Ihrem Klick geladen. Dabei werden technisch erforderliche Daten an Google übertragen.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMapsActivated(true)}
                    className="mt-5 inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-xl bg-brand px-5 py-3 text-sm font-extrabold text-white transition hover:bg-brand-dark"
                  >
                    Adressfinder starten <ArrowRight aria-hidden="true" className="h-4 w-4" />
                  </button>
                  <p className="mt-3 text-center text-xs leading-5 text-slate-500">
                    Weitere Informationen finden Sie in unserer{" "}
                    <Link href="/datenschutz" className="font-bold text-brand underline underline-offset-2">
                      Datenschutzerklärung
                    </Link>
                    .
                  </p>
                </div>
              ) : null}

              {!manualAddressMode && mapsActivated && mapsAvailable && !location ? (
                <WinterAddressSearch apiKey={googleMapsApiKey} onSelect={handleAddressSelection} />
              ) : null}

              {manualAddressMode ? (
                <label className="block">
                  <span className="text-sm font-extrabold text-slate-900">Objektadresse</span>
                  <span className="relative mt-2 block">
                    <MapPin aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-brand" />
                    <input
                      value={address}
                      onChange={(event) => {
                        setAddress(event.target.value);
                        setLocation(null);
                        resetAreaMeasurement();
                        setError("");
                      }}
                      autoComplete="street-address"
                      maxLength={300}
                      placeholder="z. B. Musterstraße 12, 30159 Hannover"
                      className="min-h-14 w-full rounded-xl border border-slate-300 bg-white py-3 pl-12 pr-4 text-base font-semibold text-slate-950 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10"
                    />
                  </span>
                </label>
              ) : null}

              {address && location ? (
                <div className="mt-4 flex items-start justify-between gap-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <div className="flex gap-3">
                    <CheckCircle2 aria-hidden="true" className="mt-0.5 h-5 w-5 flex-none text-emerald-700" />
                    <div>
                      <p className="text-xs font-extrabold uppercase tracking-wide text-emerald-800">Adresse gefunden</p>
                      <p className="mt-1 text-sm font-bold leading-6 text-slate-800">{address}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setAddress("");
                      setLocation(null);
                      resetAreaMeasurement();
                    }}
                    className="flex-none text-xs font-extrabold text-brand underline underline-offset-4"
                  >
                    Ändern
                  </button>
                </div>
              ) : null}

              {mapsAvailable ? (
                <button
                  type="button"
                  onClick={() => {
                    setManualAddressMode((current) => !current);
                    setAddress("");
                    setLocation(null);
                    resetAreaMeasurement();
                    setError("");
                  }}
                  className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg px-1 text-sm font-bold text-brand underline decoration-brand/30 underline-offset-4"
                >
                  <Keyboard aria-hidden="true" className="h-4 w-4" />
                  {manualAddressMode ? "Google-Adressfinder nutzen" : "Adresse manuell eingeben"}
                </button>
              ) : null}
            </div>

            {error ? (
              <p className="mt-5 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-950" role="alert">
                <CircleAlert aria-hidden="true" className="mt-0.5 h-5 w-5 flex-none" /> {error}
              </p>
            ) : null}

            <button
              type="button"
              onClick={continueFromAddress}
              className="mt-7 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-brand px-6 py-3.5 text-base font-extrabold text-white shadow-lg shadow-brand/15 transition hover:bg-brand-dark"
            >
              {location ? "Adresse übernehmen & Fläche markieren" : "Weiter zur Flächeneingabe"}
              <ArrowRight aria-hidden="true" className="h-5 w-5" />
            </button>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="mx-auto max-w-4xl p-5 sm:p-8 lg:p-10">
            <p className="text-sm font-extrabold uppercase tracking-[0.16em] text-brand">Schritt 2 von 4</p>
            <h4 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">
              Welche Fläche soll betreut werden?
            </h4>
            <p className="mt-3 text-sm leading-7 text-slate-650 sm:text-base">
              Markieren Sie nur Gehwege, Eingänge und Zufahrten, die tatsächlich geräumt oder gestreut werden sollen.
            </p>

            <div className="mt-6 flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <MapPin aria-hidden="true" className="mt-0.5 h-5 w-5 flex-none text-brand" />
              <div>
                <p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Gewählte Adresse</p>
                <p className="mt-1 text-sm font-bold leading-6 text-slate-800">{address}</p>
              </div>
            </div>

            {mapsAvailable && mapsActivated && location ? (
              <div className={`mt-5 rounded-2xl border p-5 sm:p-6 ${areaSource === "map" && areaIsValid ? "border-emerald-200 bg-emerald-50" : "border-brand/15 bg-brand-soft"}`}>
                <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-4">
                    <span className="grid h-12 w-12 flex-none place-items-center rounded-xl bg-brand text-white">
                      <MapPinned aria-hidden="true" className="h-6 w-6" />
                    </span>
                    <div>
                      <p className="font-extrabold text-slate-950">
                        {areaSource === "map" && areaIsValid ? "Fläche auf der Karte gemessen" : "Fläche auf Satellitenkarte markieren"}
                      </p>
                      <p className="mt-1 text-sm leading-6 text-slate-650">
                        {areaSource === "map" && areaIsValid
                          ? `${Math.round(numericArea).toLocaleString("de-DE")} m² aus ${polygonPoints.length} Eckpunkten übernommen.`
                          : "Punkte um Wege und Zugänge setzen und den ersten Punkt zum Abschluss anklicken."}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMapOpen(true)}
                    className="inline-flex min-h-12 flex-none items-center justify-center gap-2 rounded-xl bg-brand px-5 py-3 text-sm font-extrabold text-white transition hover:bg-brand-dark"
                  >
                    {areaSource === "map" ? "Markierung ändern" : "Karte öffnen"} <ArrowRight aria-hidden="true" className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ) : null}

            <div className="my-6 flex items-center gap-4" aria-hidden="true">
              <span className="h-px flex-1 bg-slate-200" />
              <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">
                {location && mapsAvailable ? "Oder manuell" : "Fläche eingeben"}
              </span>
              <span className="h-px flex-1 bg-slate-200" />
            </div>

            <label className="block">
              <span className="text-base font-extrabold text-slate-950">Winterdienstfläche in m²</span>
              <span className="mt-1 block text-xs leading-5 text-slate-600">
                Online kalkulierbar von {winterPricingConfig.minimumArea} bis {winterPricingConfig.maximumArea.toLocaleString("de-DE")} m².{" "}
                Bei mehreren getrennten Teilflächen können Sie deren Gesamtsumme hier manuell eintragen.
              </span>
              <span className="relative mt-3 block max-w-sm">
                <input
                  ref={areaInputRef}
                  value={area}
                  onChange={(event) => {
                    setArea(event.target.value.replace(/[^\d.,\s]/g, ""));
                    setAreaSource("manual");
                    setPolygonPoints([]);
                    setError("");
                  }}
                  inputMode="decimal"
                  placeholder="z. B. 85"
                  aria-invalid={Boolean(error) && !areaIsValid}
                  className="min-h-14 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 pr-16 text-xl font-extrabold text-slate-950 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/15"
                />
                <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm font-bold text-slate-500">m²</span>
              </span>
            </label>

            {error ? (
              <p className="mt-5 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-950" role="alert">
                <CircleAlert aria-hidden="true" className="mt-0.5 h-5 w-5 flex-none" /> {error}
              </p>
            ) : null}

            <div className="mt-7 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
              <BackButton onClick={() => goToStep(0)} />
              <button
                type="button"
                onClick={continueFromArea}
                className="inline-flex min-h-14 items-center justify-center gap-2 rounded-xl bg-brand px-7 py-3.5 text-base font-extrabold text-white transition hover:bg-brand-dark"
              >
                Fläche übernehmen <ArrowRight aria-hidden="true" className="h-5 w-5" />
              </button>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="mx-auto max-w-5xl p-5 sm:p-8 lg:p-10">
            <p className="text-sm font-extrabold uppercase tracking-[0.16em] text-brand">Schritt 3 von 4</p>
            <h4 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">Noch zwei kurze Objektangaben</h4>
            <p className="mt-3 text-sm leading-7 text-slate-650 sm:text-base">
              Die häufigste Variante ist vorausgewählt. Bitte kurz prüfen – die passende Bearbeitungsart plant der Rechner automatisch mit ein.
            </p>

            <div className="mt-6 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-[1fr_auto_auto] sm:items-center">
              <div className="min-w-0">
                <p className="truncate text-sm font-extrabold text-slate-950">{address}</p>
                <p className="mt-1 text-xs font-semibold text-slate-600">
                  {Math.round(numericArea).toLocaleString("de-DE")} m² · {areaSource === "map" ? "auf Karte gemessen" : "manuell eingegeben"}
                </p>
              </div>
              <button type="button" onClick={() => goToStep(0)} className="inline-flex items-center gap-1 text-xs font-extrabold text-brand underline underline-offset-4">
                <Edit3 aria-hidden="true" className="h-3.5 w-3.5" /> Adresse
              </button>
              <button type="button" onClick={() => goToStep(1)} className="inline-flex items-center gap-1 text-xs font-extrabold text-brand underline underline-offset-4">
                <Edit3 aria-hidden="true" className="h-3.5 w-3.5" /> Fläche
              </button>
            </div>

            <div className="mt-8 space-y-8">
              <fieldset>
                <legend className="text-base font-extrabold text-slate-950">1. Welche Objektart wird betreut?</legend>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  {winterPricingConfig.objectTypes.map((item) => (
                    <SelectionCard key={item.id} active={objectType === item.id} title={item.label} text={item.description} onClick={() => setObjectType(item.id)} />
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend className="text-base font-extrabold text-slate-950">2. Gibt es Erschwernisse?</legend>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {winterPricingConfig.accessOptions.map((item) => (
                    <SelectionCard
                      key={item.id}
                      active={access === item.id}
                      title={item.label}
                      text={item.description}
                      onClick={() => setAccess(item.id)}
                    />
                  ))}
                </div>
              </fieldset>

              <p className="rounded-xl border border-brand/15 bg-brand-soft p-4 text-xs font-semibold leading-5 text-slate-650">
                Die voraussichtliche Bearbeitung – Handarbeit, gemischt oder maschinell – wird anhand von Fläche und Zugänglichkeit automatisch berücksichtigt.
              </p>
            </div>

            {error ? (
              <p className="mt-5 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-950" role="alert">
                <CircleAlert aria-hidden="true" className="mt-0.5 h-5 w-5 flex-none" /> {error}
              </p>
            ) : null}

            <div className="mt-8 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
              <BackButton onClick={() => goToStep(1)} />
              <button
                type="button"
                onClick={showResult}
                className="inline-flex min-h-14 items-center justify-center gap-2 rounded-xl bg-brand px-7 py-3.5 text-base font-extrabold text-white shadow-lg shadow-brand/15 transition hover:bg-brand-dark"
              >
                <Euro aria-hidden="true" className="h-5 w-5" /> Preis jetzt anzeigen
              </button>
            </div>
          </div>
        ) : null}

        {step === 3 && estimate ? (
          <div className="bg-gradient-to-b from-brand-soft/60 to-white p-5 sm:p-8 lg:p-10">
            <div className="mx-auto max-w-5xl">
              <div className="flex items-center gap-2 text-brand">
                <Snowflake aria-hidden="true" className="h-5 w-5" />
                <p className="text-xs font-extrabold uppercase tracking-[0.17em]">Ihre direkte Preiseinschätzung</p>
              </div>
              <h4 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">Der Winterdienst für dieses Objekt</h4>
              <p className="mt-3 text-sm font-semibold leading-6 text-slate-650">
                {address} · {Math.round(numericArea).toLocaleString("de-DE")} m²
              </p>

              <div className="mt-7 grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-brand/15 bg-white p-6 shadow-sm">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Grundbetrag pro Monat</p>
                  <p className="mt-2 text-4xl font-extrabold tracking-tight text-slate-950">{currency.format(estimate.monthlyBaseGross)}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {currency.format(estimate.seasonBaseGross)} fester Grundbetrag für November bis März.
                  </p>
                </div>
                <div className="rounded-2xl border border-brand bg-brand p-6 text-white shadow-lg shadow-brand/10">
                  <p className="text-xs font-bold uppercase tracking-wide text-blue-100">Je tatsächlichem Einsatz</p>
                  <p className="mt-2 text-4xl font-extrabold tracking-tight">+ {currency.format(estimate.deploymentGross)}</p>
                  <p className="mt-2 text-sm leading-6 text-blue-100">Nur wenn am Objekt tatsächlich geräumt oder gestreut wird.</p>
                </div>
              </div>

              <button
                type="button"
                onClick={startWinterRequest}
                className="mt-6 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-brand-dark px-6 py-3.5 text-base font-extrabold text-white transition hover:bg-brand"
              >
                Winterdienst für dieses Objekt anfragen <ArrowRight aria-hidden="true" className="h-5 w-5" />
              </button>
              <p className="mt-3 text-center text-xs leading-5 text-slate-500">
                Adresse, Fläche und Rechnerangaben werden übernommen. Die Anfrage bleibt kostenlos und unverbindlich.
              </p>

              <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
                <p className="text-sm font-extrabold text-slate-950">Saisonbeispiele zur Budgetplanung</p>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  {[5, 10, 15].map((deployments) => (
                    <div key={deployments} className="rounded-xl bg-slate-50 px-2 py-3">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{deployments} Einsätze</p>
                      <p className="mt-1 text-sm font-extrabold text-slate-950 sm:text-lg">{currency.format(winterSeasonTotal(estimate, deployments))}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-xs leading-5 text-slate-500">Budgetbeispiele, keine Wetter- oder Einsatzprognose.</p>
              </div>

              <ul className="mt-6 grid gap-2 text-xs font-semibold leading-5 text-slate-600 sm:grid-cols-3">
                <li className="flex gap-2"><Check aria-hidden="true" className="mt-0.5 h-4 w-4 flex-none text-emerald-600" /> Vertragslaufzeit: 1. November bis 31. März</li>
                <li className="flex gap-2"><Check aria-hidden="true" className="mt-0.5 h-4 w-4 flex-none text-emerald-600" /> Streugut und Leistungsumfang werden im Angebot ausgewiesen</li>
                <li className="flex gap-2"><Check aria-hidden="true" className="mt-0.5 h-4 w-4 flex-none text-emerald-600" /> Alle Rechnerpreise inklusive 19 % MwSt.</li>
              </ul>

              <div className="mt-5 flex justify-center">
                <button
                  type="button"
                  onClick={() => goToStep(2)}
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-brand underline decoration-brand/30 underline-offset-4"
                >
                  <Edit3 aria-hidden="true" className="h-4 w-4" /> Angaben ändern
                </button>
              </div>

              <div className="mt-7 flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-600">
                <CloudSnow aria-hidden="true" className="mt-0.5 h-5 w-5 flex-none text-brand" />
                <p>
                  Ein Einsatz umfasst eine wetterbedingte Anfahrt und einen vereinbarten Winterdienstdurchgang – je nach Situation Räumen, Streuen oder beides. Ein später erneut erforderlicher Durchgang zählt als weiterer Einsatz.
                </p>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="border-t border-slate-200 bg-slate-50 px-5 py-4 text-xs leading-5 text-slate-600 sm:px-7">
        Unverbindliche Online-Preiseinschätzung für Objekte im Hausvia-Tourengebiet Hannover. Vor Vertragsschluss prüfen wir Adresse, markierte Flächen, Objektgegebenheiten und verfügbare Kapazitäten.
      </div>

      {mapOpen && location ? (
        <WinterAreaMapDialog
          apiKey={googleMapsApiKey}
          address={address}
          location={location}
          initialPoints={polygonPoints}
          showGuide={!hasSeenMapGuide}
          onGuideSeen={() => setHasSeenMapGuide(true)}
          onClose={() => setMapOpen(false)}
          onUseManual={() => {
            setMapOpen(false);
            setAreaSource("manual");
            setPolygonPoints([]);
            window.requestAnimationFrame(() => areaInputRef.current?.focus());
          }}
          onConfirm={({ area: measuredArea, points }) => {
            setArea(String(measuredArea));
            setAreaSource("map");
            setPolygonPoints(points);
            setError("");
            setMapOpen(false);
          }}
        />
      ) : null}
    </section>
  );
}
