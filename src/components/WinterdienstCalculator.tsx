"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { FormEvent, useCallback, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Calculator,
  Check,
  CheckCircle2,
  CircleAlert,
  CloudSnow,
  Edit3,
  Euro,
  FileCheck2,
  Keyboard,
  Loader2,
  Mail,
  MapPin,
  MapPinned,
  Phone,
  Ruler,
  Send,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { WinterdienstConversionTracker } from "@/components/LeadConversionTracker";
import type { WinterAddressSelection } from "@/components/WinterAddressSearch";
import { loadGoogleGeocoding } from "@/lib/googleMapsClient";
import type { WinterMapPoint } from "@/lib/winterMap";
import {
  calculateWinterPrice,
  deriveWinterSurfaceProfile,
  parseWinterArea,
  winterPricingConfig,
  winterSeasonTotal,
  type WinterAccess,
  type WinterObjectType,
  type WinterPricingEstimate,
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
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function isFinitePrice(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function parseServerWinterEstimate(value: unknown): WinterPricingEstimate | null {
  if (!value || typeof value !== "object") return null;

  const estimate = value as Record<string, unknown>;
  const pricingOptions = estimate.pricingOptions as Record<string, unknown> | undefined;
  const flex = pricingOptions?.flex as Record<string, unknown> | undefined;
  const plan = pricingOptions?.plan as Record<string, unknown> | undefined;
  const breakdown = estimate.deploymentBreakdown as Record<string, unknown> | undefined;
  const estimateNumbers = [
    estimate.monthlyBaseGross,
    estimate.seasonBaseGross,
    estimate.deploymentGross,
    estimate.monthlyBaseNet,
    estimate.seasonBaseNet,
    estimate.deploymentNet,
  ];
  const flexNumbers = [flex?.monthlyBaseGross, flex?.seasonBaseGross, flex?.deploymentGross];
  const planNumbers = [
    plan?.includedDeployments,
    plan?.monthlyGross,
    plan?.seasonGross,
    plan?.additionalDeploymentGross,
  ];
  const breakdownNumbers = [
    breakdown?.areaSquareMeters,
    breakdown?.manualShare,
    breakdown?.machineShare,
    breakdown?.clearingRateGrossPerSquareMeter,
    breakdown?.gritReferenceRateGrossPerSquareMeter,
    breakdown?.gritRateGrossPerSquareMeter,
    breakdown?.totalRateGrossPerSquareMeter,
    breakdown?.clearingGross,
    breakdown?.gritGross,
  ];

  if (
    estimate.seasonMonths !== 5 ||
    estimate.contractPeriod !== "1. November bis 31. März" ||
    estimate.vatRate !== 19 ||
    !["manual", "mixed", "machine"].includes(String(breakdown?.appliedSurfaceProfile)) ||
    ![...estimateNumbers, ...flexNumbers, ...planNumbers, ...breakdownNumbers].every(isFinitePrice)
  ) {
    return null;
  }

  return value as WinterPricingEstimate;
}

const wizardSteps = [
  { title: "Adresse", icon: MapPin },
  { title: "Fläche", icon: Ruler },
  { title: "Objekt", icon: ShieldCheck },
  { title: "Kontakt", icon: UserRound },
  { title: "Preis", icon: Euro },
] as const;

const hannoverCenter: WinterMapPoint = { lat: 52.3759, lng: 9.732 };

const initialContactForm = {
  firstName: "",
  lastName: "",
  company: "",
  phone: "",
  email: "",
  privacyAccepted: false,
  termsAccepted: false,
};

const contactInputClassName =
  "mt-2 min-h-13 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base font-semibold text-slate-950 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10";

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
    <ol className="grid grid-cols-5 border-b border-slate-200 bg-slate-50" aria-label="Fortschritt der Preiseinschätzung">
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
  const mapsAvailable = Boolean(googleMapsApiKey.trim());
  const [step, setStep] = useState(0);
  const [address, setAddress] = useState("");
  const [location, setLocation] = useState<WinterMapPoint | null>(null);
  const [manualLocationNotice, setManualLocationNotice] = useState("");
  const [locatingAddress, setLocatingAddress] = useState(false);
  const [mapsActivated, setMapsActivated] = useState(false);
  const [manualAddressMode, setManualAddressMode] = useState(!mapsAvailable);
  const [mapOpen, setMapOpen] = useState(false);
  const [hasSeenMapGuide, setHasSeenMapGuide] = useState(false);
  const [polygons, setPolygons] = useState<WinterMapPoint[][]>([]);
  const [mapSnapshot, setMapSnapshot] = useState("");
  const [areaSource, setAreaSource] = useState<"map" | "manual">("manual");
  const [area, setArea] = useState("");
  const [objectType, setObjectType] = useState<WinterObjectType>("residential");
  const [access, setAccess] = useState<WinterAccess>("standard");
  const [contact, setContact] = useState(initialContactForm);
  const [submitting, setSubmitting] = useState(false);
  const [confirmedEstimate, setConfirmedEstimate] = useState<WinterPricingEstimate | null>(null);
  const [selectedPriceModel, setSelectedPriceModel] = useState<"plan" | "flex">("plan");
  const [emailDelivered, setEmailDelivered] = useState<boolean | null>(null);
  const [deliveryWarning, setDeliveryWarning] = useState("");
  const [confirmedEmail, setConfirmedEmail] = useState("");
  const [confirmedSubmissionId, setConfirmedSubmissionId] = useState("");
  const [error, setError] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const areaInputRef = useRef<HTMLInputElement>(null);
  const submissionIdRef = useRef("");
  const submittedAtRef = useRef("");
  const addressRef = useRef("");

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
  const resetAreaMeasurement = useCallback(() => {
    setPolygons([]);
    setMapSnapshot("");
    setArea("");
    setAreaSource("manual");
  }, []);

  const handleAddressSelection = useCallback((selection: WinterAddressSelection) => {
    addressRef.current = selection.address;
    setAddress(selection.address);
    setLocation(selection.location);
    setManualLocationNotice("");
    resetAreaMeasurement();
    setError("");
  }, [resetAreaMeasurement]);

  const goToStep = useCallback((nextStep: number) => {
    setStep(nextStep);
    setError("");
    window.requestAnimationFrame(() => {
      panelRef.current?.focus({ preventScroll: true });
      panelRef.current?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "start",
      });
    });
  }, []);

  async function continueFromAddress() {
    const requestedAddress = address.trim();
    if (requestedAddress.length < 5) {
      setError("Bitte geben Sie die vollständige Objektadresse ein.");
      return;
    }
    if (!location && !/\d/.test(requestedAddress)) {
      setError("Bitte ergänzen Sie die Hausnummer der Objektadresse.");
      return;
    }

    if (!location && mapsAvailable && mapsActivated) {
      setLocatingAddress(true);
      setError("");

      let approximateLocation = hannoverCenter;
      try {
        const { Geocoder } = await loadGoogleGeocoding(googleMapsApiKey);
        const response = await new Geocoder().geocode({
          address: requestedAddress,
          componentRestrictions: { country: "DE" },
          region: "DE",
        });
        const firstResult = response.results[0];
        if (firstResult?.geometry.location) {
          approximateLocation = {
            lat: firstResult.geometry.location.lat(),
            lng: firstResult.geometry.location.lng(),
          };
        }
      } catch {
        // Wenn Google keinen Treffer liefert, startet die Karte bewusst im Zentrum Hannovers.
      } finally {
        setLocatingAddress(false);
      }

      if (addressRef.current.trim() !== requestedAddress) return;

      setLocation(approximateLocation);
      setManualLocationNotice(
        "Google konnte diese Adresse nicht eindeutig als vollständige Hausadresse bestätigen. Bitte verschieben und zoomen Sie die Karte selbst bis zum richtigen Gebäude.",
      );
      goToStep(1);
      window.requestAnimationFrame(() => setMapOpen(true));
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

  function showContactGate() {
    if (!estimate) {
      setError("Bitte prüfen Sie die Flächen- und Objektangaben.");
      return;
    }
    goToStep(3);
  }

  function updateContact<K extends keyof typeof contact>(key: K, value: (typeof contact)[K]) {
    setContact((current) => ({ ...current, [key]: value }));
    setError("");
  }

  async function submitContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!estimate || !areaIsValid) {
      setError("Bitte prüfen Sie zuerst die Objekt- und Flächenangaben.");
      return;
    }

    const firstName = contact.firstName.trim();
    const lastName = contact.lastName.trim();
    const company = contact.company.trim();
    const phone = contact.phone.trim();
    const email = contact.email.trim();

    if (!firstName) {
      setError("Bitte geben Sie Ihren Vornamen ein.");
      return;
    }
    if (!lastName) {
      setError("Bitte geben Sie Ihren Nachnamen ein.");
      return;
    }
    if (!company) {
      setError("Bitte geben Sie Ihre Firma an oder tragen Sie „Privatperson“ ein.");
      return;
    }
    if (!phone) {
      setError("Bitte geben Sie Ihre Telefonnummer ein.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Bitte geben Sie eine gültige E-Mail-Adresse ein.");
      return;
    }
    if (!contact.privacyAccepted) {
      setError("Bitte bestätigen Sie die Datenschutzerklärung.");
      return;
    }
    if (!contact.termsAccepted) {
      setError("Bitte bestätigen Sie die AGB.");
      return;
    }

    if (!submissionIdRef.current) {
      submissionIdRef.current =
        typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
      submittedAtRef.current = new Date().toISOString();
    }

    setSubmitting(true);
    setError("");
    setDeliveryWarning("");

    try {
      const response = await fetch("/api/lead", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": submissionIdRef.current,
        },
        body: JSON.stringify({
          source: "offer-request",
          submittedAt: submittedAtRef.current,
          submissionId: submissionIdRef.current,
          lead: {
            firstName,
            lastName,
            company,
            name: `${firstName} ${lastName}`,
            phone,
            email,
            services: ["Winterdienst"],
            winterContactGate: "direct-price-v1",
            objectAddress: address,
            winterAreaSource: areaSource,
            ...(areaSource === "map"
              ? {
                  winterPolygons: polygons,
                  winterPolygonPoints: polygons[0] ?? [],
                }
              : {}),
            winterPricingInput: {
              objectType,
              area: String(Math.round(numericArea)),
              surfaceProfile,
              access,
            },
            privacyAccepted: contact.privacyAccepted,
            termsAccepted: contact.termsAccepted,
          },
        }),
      });

      const result = (await response.json().catch(() => null)) as {
        ok?: boolean;
        message?: string;
        emailDelivered?: boolean;
        deliveryWarning?: string;
        estimate?: unknown;
        submissionId?: string;
      } | null;
      if (!response.ok || !result?.ok) {
        throw new Error(result?.message || "Die Preiseinschätzung konnte gerade nicht versendet werden.");
      }

      const serverEstimate = parseServerWinterEstimate(result.estimate);
      if (!serverEstimate) {
        throw new Error("Die serverseitig geprüfte Preiseinschätzung konnte nicht geladen werden.");
      }

      setEmailDelivered(result.emailDelivered !== false);
      setDeliveryWarning(result.deliveryWarning || "");
      setConfirmedEmail(email);
      setConfirmedSubmissionId(
        typeof result.submissionId === "string" && result.submissionId
          ? result.submissionId
          : submissionIdRef.current,
      );
      setConfirmedEstimate(serverEstimate);
      goToStep(4);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error && caughtError.message
          ? caughtError.message
          : "Die Preiseinschätzung konnte gerade nicht versendet werden. Bitte versuchen Sie es erneut.",
      );
    } finally {
      setSubmitting(false);
    }
  }

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
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-blue-100">Digital vermessen · als PDF erhalten</p>
            <h3 id="winter-calculator-title" className="mt-1 text-2xl font-extrabold sm:text-3xl">
              Winterdienst-Preis berechnen
            </h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-blue-100">
              Adresse finden, alle Winterdienstflächen markieren und nach den Kontaktdaten die Einschätzung als PDF erhalten.
            </p>
          </div>
        </div>
      </div>

      <WizardProgress step={step} />

      <div ref={panelRef} tabIndex={-1} className="scroll-mt-24 outline-none">
        {step === 0 ? (
          <div className="mx-auto max-w-4xl p-5 sm:p-8 lg:p-10">
            <div className="max-w-2xl">
              <p className="text-sm font-extrabold uppercase tracking-[0.16em] text-brand">Schritt 1 von 5</p>
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
                <div>
                  {mapsAvailable && mapsActivated ? (
                    <p className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-950">
                      <CircleAlert aria-hidden="true" className="mt-0.5 h-5 w-5 flex-none" />
                      Ist die Hausadresse bei Google nicht gelistet, öffnen wir die Karte ungefähr am eingegebenen Ort. Navigieren Sie dort selbst zum richtigen Gebäude.
                    </p>
                  ) : null}
                  <label className="block">
                    <span className="text-sm font-extrabold text-slate-900">Objektadresse</span>
                    <span className="relative mt-2 block">
                      <MapPin aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-brand" />
                      <input
                        value={address}
                        onChange={(event) => {
                          addressRef.current = event.target.value;
                          setAddress(event.target.value);
                          setLocation(null);
                          setManualLocationNotice("");
                          resetAreaMeasurement();
                          setError("");
                        }}
                        autoComplete="street-address"
                        disabled={locatingAddress}
                        maxLength={300}
                        placeholder="z. B. Musterstraße 12, 30159 Hannover"
                        className="min-h-14 w-full rounded-xl border border-slate-300 bg-white py-3 pl-12 pr-4 text-base font-semibold text-slate-950 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10"
                      />
                    </span>
                  </label>
                </div>
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
                      addressRef.current = "";
                      setAddress("");
                      setLocation(null);
                      setManualLocationNotice("");
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
                    setMapsActivated(true);
                    setManualAddressMode((current) => !current);
                    addressRef.current = "";
                    setAddress("");
                    setLocation(null);
                    setManualLocationNotice("");
                    resetAreaMeasurement();
                    setError("");
                  }}
                  disabled={locatingAddress}
                  className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg px-1 text-sm font-bold text-brand underline decoration-brand/30 underline-offset-4 disabled:cursor-wait disabled:opacity-60"
                >
                  <Keyboard aria-hidden="true" className="h-4 w-4" />
                  {manualAddressMode
                    ? "Google-Adressfinder nutzen"
                    : "Adresse nicht gefunden? Manuell eingeben und auf der Karte suchen"}
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
              onClick={() => void continueFromAddress()}
              disabled={locatingAddress}
              className="mt-7 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-brand px-6 py-3.5 text-base font-extrabold text-white shadow-lg shadow-brand/15 transition hover:bg-brand-dark"
            >
              {locatingAddress ? <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" /> : null}
              {locatingAddress
                ? "Ort für die Karte wird gesucht …"
                : location
                  ? "Adresse übernehmen & Fläche markieren"
                  : mapsAvailable && mapsActivated
                    ? "Adresse übernehmen & auf der Karte suchen"
                    : "Weiter zur Flächeneingabe"}
              {!locatingAddress ? <ArrowRight aria-hidden="true" className="h-5 w-5" /> : null}
            </button>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="mx-auto max-w-4xl p-5 sm:p-8 lg:p-10">
            <p className="text-sm font-extrabold uppercase tracking-[0.16em] text-brand">Schritt 2 von 5</p>
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
                          ? `${Math.round(numericArea).toLocaleString("de-DE")} m² aus ${polygons.length} ${polygons.length === 1 ? "Teilfläche" : "Teilflächen"} übernommen.`
                          : "Nur die zu räumenden Wege markieren. Getrennte Bereiche können als weitere Teilfläche ergänzt werden."}
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
                Alternativ können Sie die bekannte Gesamtsumme hier manuell eintragen.
              </span>
              <span className="relative mt-3 block max-w-sm">
                <input
                  ref={areaInputRef}
                  value={area}
                  onChange={(event) => {
                    setArea(event.target.value.replace(/[^\d.,\s]/g, ""));
                    setAreaSource("manual");
                    setPolygons([]);
                    setMapSnapshot("");
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
            <p className="text-sm font-extrabold uppercase tracking-[0.16em] text-brand">Schritt 3 von 5</p>
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
                onClick={showContactGate}
                className="inline-flex min-h-14 items-center justify-center gap-2 rounded-xl bg-brand px-7 py-3.5 text-base font-extrabold text-white shadow-lg shadow-brand/15 transition hover:bg-brand-dark"
              >
                Weiter zu den Kontaktdaten <ArrowRight aria-hidden="true" className="h-5 w-5" />
              </button>
            </div>
          </div>
        ) : null}

        {step === 3 && estimate ? (
          <form onSubmit={submitContact} className="mx-auto max-w-5xl p-5 sm:p-8 lg:p-10" aria-labelledby="winter-contact-title">
            <fieldset disabled={submitting} className="grid gap-7 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
              <div>
                <p className="text-sm font-extrabold uppercase tracking-[0.16em] text-brand">Schritt 4 von 5</p>
                <h4 id="winter-contact-title" className="mt-2 text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">
                  Wohin dürfen wir Ihre Preiseinschätzung senden?
                </h4>
                <p className="mt-3 text-sm leading-7 text-slate-650 sm:text-base">
                  Nach dem Absenden sehen Sie den Preis direkt auf der letzten Seite und Ihre Anfrage geht an Hausvia.
                  Gleichzeitig erhalten Sie die „Winterdienst Preiseinschätzung“ als PDF per E-Mail.
                </p>

                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
                      <UserRound aria-hidden="true" className="h-4 w-4 text-brand" /> Vorname
                    </span>
                    <input
                      value={contact.firstName}
                      onChange={(event) => updateContact("firstName", event.target.value)}
                      autoComplete="given-name"
                      maxLength={80}
                      className={contactInputClassName}
                      required
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-extrabold text-slate-900">Nachname</span>
                    <input
                      value={contact.lastName}
                      onChange={(event) => updateContact("lastName", event.target.value)}
                      autoComplete="family-name"
                      maxLength={80}
                      className={contactInputClassName}
                      required
                    />
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
                      <Building2 aria-hidden="true" className="h-4 w-4 text-brand" /> Firma / Privatperson
                    </span>
                    <input
                      value={contact.company}
                      onChange={(event) => updateContact("company", event.target.value)}
                      autoComplete="organization"
                      maxLength={160}
                      placeholder="z. B. Musterverwaltung GmbH oder Privatperson"
                      className={contactInputClassName}
                      required
                    />
                  </label>
                  <label className="block">
                    <span className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
                      <Phone aria-hidden="true" className="h-4 w-4 text-brand" /> Telefon
                    </span>
                    <input
                      type="tel"
                      value={contact.phone}
                      onChange={(event) => updateContact("phone", event.target.value)}
                      autoComplete="tel"
                      inputMode="tel"
                      maxLength={40}
                      className={contactInputClassName}
                      required
                    />
                  </label>
                  <label className="block">
                    <span className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
                      <Mail aria-hidden="true" className="h-4 w-4 text-brand" /> E-Mail
                    </span>
                    <input
                      type="email"
                      value={contact.email}
                      onChange={(event) => updateContact("email", event.target.value)}
                      autoComplete="email"
                      inputMode="email"
                      maxLength={180}
                      className={contactInputClassName}
                      required
                    />
                  </label>
                </div>

                <div className="mt-5 grid gap-3">
                  <label className="flex gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
                    <input
                      type="checkbox"
                      checked={contact.privacyAccepted}
                      onChange={(event) => updateContact("privacyAccepted", event.target.checked)}
                      className="mt-1 h-5 w-5 flex-none rounded border-slate-300 text-brand focus:ring-brand"
                      required
                    />
                    <span>
                      Ich habe die{" "}
                      <Link href="/datenschutz" target="_blank" className="font-bold text-brand underline underline-offset-2">
                        Datenschutzerklärung
                      </Link>{" "}
                      gelesen und bin mit der Verarbeitung zur Bearbeitung meiner Anfrage einverstanden.
                    </span>
                  </label>
                  <label className="flex gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
                    <input
                      type="checkbox"
                      checked={contact.termsAccepted}
                      onChange={(event) => updateContact("termsAccepted", event.target.checked)}
                      className="mt-1 h-5 w-5 flex-none rounded border-slate-300 text-brand focus:ring-brand"
                      required
                    />
                    <span>
                      Ich akzeptiere die{" "}
                      <Link href="/agb" target="_blank" className="font-bold text-brand underline underline-offset-2">
                        AGB
                      </Link>{" "}
                      von Hausvia.
                    </span>
                  </label>
                </div>

                {error ? (
                  <p className="mt-5 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold leading-6 text-red-900" role="alert">
                    <CircleAlert aria-hidden="true" className="mt-0.5 h-5 w-5 flex-none" /> {error}
                  </p>
                ) : null}

                <div className="mt-7 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <BackButton onClick={() => goToStep(2)} />
                  <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex min-h-14 items-center justify-center gap-2 rounded-xl bg-brand px-7 py-3.5 text-base font-extrabold text-white shadow-lg shadow-brand/15 transition hover:bg-brand-dark disabled:cursor-wait disabled:opacity-70"
                  >
                    {submitting ? <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" /> : <Send aria-hidden="true" className="h-5 w-5" />}
                    {submitting ? "Anfrage und PDF werden gesendet …" : "Anfrage senden & Preis anzeigen"}
                  </button>
                </div>
              </div>

              <aside className="rounded-2xl border border-brand/15 bg-brand-soft p-5 sm:p-6 lg:sticky lg:top-24">
                <div className="flex items-start gap-3">
                  <span className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-brand text-white">
                    <FileCheck2 aria-hidden="true" className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-xs font-extrabold uppercase tracking-wide text-brand">Ihre Angaben</p>
                    <p className="mt-1 font-extrabold leading-6 text-slate-950">{address}</p>
                  </div>
                </div>
                <dl className="mt-5 grid gap-3 text-sm">
                  <div className="flex items-center justify-between gap-4 rounded-xl bg-white px-4 py-3">
                    <dt className="font-semibold text-slate-600">Winterdienstfläche</dt>
                    <dd className="font-extrabold text-slate-950">{Math.round(numericArea).toLocaleString("de-DE")} m²</dd>
                  </div>
                  <div className="flex items-center justify-between gap-4 rounded-xl bg-white px-4 py-3">
                    <dt className="font-semibold text-slate-600">Erfassung</dt>
                    <dd className="text-right font-extrabold text-slate-950">
                      {areaSource === "map" ? `${polygons.length} ${polygons.length === 1 ? "Teilfläche" : "Teilflächen"}` : "Manuell"}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-4 rounded-xl bg-white px-4 py-3">
                    <dt className="font-semibold text-slate-600">Vertragszeitraum</dt>
                    <dd className="font-extrabold text-slate-950">Nov.–März</dd>
                  </div>
                </dl>
                <p className="mt-4 text-xs leading-5 text-slate-600">
                  Ihre Kontaktdaten werden nicht auf der Karte angezeigt. Die Preisberechnung wird serverseitig erneut geprüft.
                </p>
              </aside>
            </fieldset>
          </form>
        ) : null}

        {step === 4 && confirmedEstimate ? (
          <div className="bg-gradient-to-b from-brand-soft/60 to-white p-5 sm:p-8 lg:p-10">
            <WinterdienstConversionTracker submissionId={confirmedSubmissionId} />
            <div className="mx-auto max-w-5xl">
              <div className="flex items-center gap-2 text-brand">
                <CheckCircle2 aria-hidden="true" className="h-5 w-5 text-emerald-600" />
                <p className="text-xs font-extrabold uppercase tracking-[0.17em]">
                  {emailDelivered === false ? "Direkt freigeschaltet" : "Anfrage versendet und direkt freigeschaltet"}
                </p>
              </div>
              <h4 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">Ihre Winterdienst-Preiseinschätzung</h4>
              <p className="mt-3 text-sm font-semibold leading-6 text-slate-650">
                {address} · {Math.round(numericArea).toLocaleString("de-DE")} m²
              </p>

              {emailDelivered === false ? (
                <div className="mt-5 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-950" role="status">
                  <CircleAlert aria-hidden="true" className="mt-0.5 h-5 w-5 flex-none" />
                  <p>
                    {deliveryWarning || "Der PDF-Versand ist vorübergehend fehlgeschlagen."} Ihre validierte Preiseinschätzung bleibt hier sichtbar. Bitte kontaktieren Sie uns bei Bedarf über die{" "}
                    <Link href="/kontakt" className="font-extrabold text-brand underline underline-offset-2">
                      Kontaktseite
                    </Link>
                    .
                  </p>
                </div>
              ) : (
                <div className="mt-5 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold leading-6 text-emerald-950">
                  <Mail aria-hidden="true" className="mt-0.5 h-5 w-5 flex-none text-emerald-700" />
                  <p>
                    Das PDF „Winterdienst Preiseinschätzung“ wurde an <strong>{confirmedEmail}</strong> versendet. Hausvia hat parallel eine Kopie Ihrer Anfrage erhalten.
                  </p>
                </div>
              )}

              <section className="mt-7" aria-labelledby="pricing-model-title">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-brand">Tarifansicht wechseln</p>
                    <h5 id="pricing-model-title" className="mt-1 text-xl font-extrabold text-slate-950">Planbar oder flexibel vergleichen</h5>
                  </div>
                  <p className="text-xs font-semibold leading-5 text-slate-600">Die Auswahl wechselt die Budgetansicht; beide Varianten stehen gemeinsam in Ihrer Anfrage und im PDF.</p>
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setSelectedPriceModel("plan")}
                    aria-pressed={selectedPriceModel === "plan"}
                    className={`relative rounded-2xl border p-6 text-left transition ${
                      selectedPriceModel === "plan"
                        ? "border-brand bg-brand text-white shadow-lg shadow-brand/15 ring-2 ring-brand/10"
                        : "border-slate-200 bg-white text-slate-950 hover:border-brand/40"
                    }`}
                  >
                    <span
                      className={`inline-flex rounded-full px-3 py-1 text-[10px] font-extrabold uppercase tracking-wide ${
                        selectedPriceModel === "plan" ? "bg-white/15 text-blue-50" : "bg-brand-soft text-brand"
                      }`}
                    >
                      10 Einsätze enthalten
                    </span>
                    <span className="mt-4 block text-xs font-bold uppercase tracking-wide opacity-75">Planbar · Saisonpauschale</span>
                    <span className="mt-1 block text-4xl font-extrabold tracking-tight">
                      {currency.format(confirmedEstimate.pricingOptions.plan.monthlyGross)}
                      <span className="ml-1 text-sm font-bold opacity-75">/ Monat</span>
                    </span>
                    <span className="mt-3 block text-sm leading-6 opacity-85">
                      {currency.format(confirmedEstimate.pricingOptions.plan.seasonGross)} für November bis März inklusive zehn Einsätzen. Danach {currency.format(confirmedEstimate.pricingOptions.plan.additionalDeploymentGross)} je weiterem Einsatz.
                    </span>
                    {selectedPriceModel === "plan" ? (
                      <span className="absolute right-4 top-4 grid h-7 w-7 place-items-center rounded-full bg-white text-brand">
                        <Check aria-hidden="true" className="h-4 w-4" />
                      </span>
                    ) : null}
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedPriceModel("flex")}
                    aria-pressed={selectedPriceModel === "flex"}
                    className={`relative rounded-2xl border p-6 text-left transition ${
                      selectedPriceModel === "flex"
                        ? "border-brand bg-brand text-white shadow-lg shadow-brand/15 ring-2 ring-brand/10"
                        : "border-slate-200 bg-white text-slate-950 hover:border-brand/40"
                    }`}
                  >
                    <span
                      className={`inline-flex rounded-full px-3 py-1 text-[10px] font-extrabold uppercase tracking-wide ${
                        selectedPriceModel === "flex" ? "bg-white/15 text-blue-50" : "bg-brand-soft text-brand"
                      }`}
                    >
                      Nur tatsächliche Einsätze
                    </span>
                    <span className="mt-4 block text-xs font-bold uppercase tracking-wide opacity-75">Flex · Grundbetrag + Einsatz</span>
                    <span className="mt-1 block text-4xl font-extrabold tracking-tight">
                      {currency.format(confirmedEstimate.pricingOptions.flex.monthlyBaseGross)}
                      <span className="ml-1 text-sm font-bold opacity-75">Grundbetrag / Monat</span>
                    </span>
                    <span className="mt-3 block text-sm leading-6 opacity-85">
                      Plus {currency.format(confirmedEstimate.pricingOptions.flex.deploymentGross)} je tatsächlich ausgeführtem Einsatz. Saison-Grundbetrag: {currency.format(confirmedEstimate.pricingOptions.flex.seasonBaseGross)}.
                    </span>
                    {selectedPriceModel === "flex" ? (
                      <span className="absolute right-4 top-4 grid h-7 w-7 place-items-center rounded-full bg-white text-brand">
                        <Check aria-hidden="true" className="h-4 w-4" />
                      </span>
                    ) : null}
                  </button>
                </div>
              </section>

              <div className="mt-5 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
                <CircleAlert aria-hidden="true" className="mt-0.5 h-5 w-5 flex-none" />
                <p>
                  <strong>Diese Preiseinschätzung stellt kein Angebot dar.</strong> Ein finales Angebot erhalten Sie erst nach Prüfung der Angaben und Flächen durch Hausvia; falls erforderlich, vereinbaren wir zuvor einen Vor-Ort-Termin.
                </p>
              </div>

              <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-sm font-extrabold text-slate-950">So entsteht der Einsatzpreis</p>
                    <p className="mt-1 text-xs leading-5 text-slate-600">Bruttowerte inklusive 19 % MwSt. für die markierte Gesamtfläche.</p>
                  </div>
                  <p className="text-xs font-bold text-brand">
                    {currency.format(confirmedEstimate.deploymentBreakdown.totalRateGrossPerSquareMeter)} pro m²
                  </p>
                </div>
                <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl bg-slate-50 p-4">
                    <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">Räumen</dt>
                    <dd className="mt-1 text-lg font-extrabold text-slate-950">
                      {currency.format(confirmedEstimate.deploymentBreakdown.clearingGross)}
                    </dd>
                    <p className="mt-1 text-xs text-slate-600">
                      {currency.format(confirmedEstimate.deploymentBreakdown.clearingRateGrossPerSquareMeter)} pro m²
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-4">
                    <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">Streugut</dt>
                    <dd className="mt-1 text-lg font-extrabold text-slate-950">
                      {currency.format(confirmedEstimate.deploymentBreakdown.gritGross)}
                    </dd>
                    <p className="mt-1 text-xs text-slate-600">
                      {currency.format(confirmedEstimate.deploymentBreakdown.gritRateGrossPerSquareMeter)} pro m²
                    </p>
                  </div>
                </dl>
                <p className="mt-4 text-xs leading-5 text-slate-600">
                  Grundlage sind 80 % innerhalb der von MyHammer veröffentlichten Preisspannen. Der rechnerische Streugutsatz von 0,44 €/m² wird auf 0,45 €/m² gerundet. {" "}
                  <Link
                    href="https://www.my-hammer.de/garten-aussenbereich/preisradar/was-kostet-winterdienst"
                    target="_blank"
                    rel="noreferrer"
                    className="font-extrabold text-brand underline underline-offset-2"
                  >
                    Preisquelle ansehen
                  </Link>
                </p>
              </div>

              {mapSnapshot ? (
                <figure className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <Image
                    src={mapSnapshot}
                    alt={`Flächenskizze mit ${polygons.length} markierten Winterdienstflächen`}
                    width={720}
                    height={405}
                    unoptimized
                    className="h-auto w-full"
                  />
                  <figcaption className="border-t border-slate-200 px-5 py-3 text-xs font-semibold leading-5 text-slate-600">
                    Flächenübersicht · {polygons.length} {polygons.length === 1 ? "Teilfläche" : "Teilflächen"} · insgesamt {Math.round(numericArea).toLocaleString("de-DE")} m²
                  </figcaption>
                </figure>
              ) : null}

              <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
                <p className="text-sm font-extrabold text-slate-950">
                  Saisonbeispiele · {selectedPriceModel === "plan" ? "Planbar" : "Flex"}
                </p>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  {[5, 10, 15].map((deployments) => (
                    <div key={deployments} className="rounded-xl bg-slate-50 px-2 py-3">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{deployments} Einsätze</p>
                      <p className="mt-1 text-sm font-extrabold text-slate-950 sm:text-lg">
                        {currency.format(winterSeasonTotal(confirmedEstimate, deployments, selectedPriceModel))}
                      </p>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-xs leading-5 text-slate-500">
                  {selectedPriceModel === "plan"
                    ? "Planbar enthält zehn Einsätze fest; deshalb bleibt der Saisonbetrag bis einschließlich zehn Einsätzen gleich."
                    : "Flex wird aus Saison-Grundbetrag und tatsächlich ausgeführten Einsätzen berechnet."}{" "}
                  Budgetbeispiele, keine Wetter- oder Einsatzprognose.
                </p>
              </div>

              <ul className="mt-6 grid gap-2 text-xs font-semibold leading-5 text-slate-600 sm:grid-cols-3">
                <li className="flex gap-2"><Check aria-hidden="true" className="mt-0.5 h-4 w-4 flex-none text-emerald-600" /> Vertragslaufzeit: 1. November bis 31. März</li>
                <li className="flex gap-2"><Check aria-hidden="true" className="mt-0.5 h-4 w-4 flex-none text-emerald-600" /> Streugut und Leistungsumfang werden im Angebot ausgewiesen</li>
                <li className="flex gap-2"><Check aria-hidden="true" className="mt-0.5 h-4 w-4 flex-none text-emerald-600" /> Alle Rechnerpreise inklusive 19 % MwSt.</li>
              </ul>

              <div className="mt-5 flex justify-center">
                <button
                  type="button"
                  onClick={() => {
                    submissionIdRef.current = "";
                    submittedAtRef.current = "";
                    setConfirmedEstimate(null);
                    setSelectedPriceModel("plan");
                    setEmailDelivered(null);
                    setDeliveryWarning("");
                    setConfirmedEmail("");
                    setConfirmedSubmissionId("");
                    goToStep(2);
                  }}
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-brand underline decoration-brand/30 underline-offset-4"
                >
                  <Edit3 aria-hidden="true" className="h-4 w-4" /> Angaben ändern und neu berechnen
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
        Diese unverbindliche Online-Preiseinschätzung stellt kein Angebot dar. Vor einem finalen Angebot prüft Hausvia Adresse, markierte Flächen, Objektgegebenheiten und verfügbare Kapazitäten – falls erforderlich bei einem Vor-Ort-Termin.
      </div>

      {mapOpen && location ? (
        <WinterAreaMapDialog
          apiKey={googleMapsApiKey}
          address={address}
          location={location}
          locationNotice={manualLocationNotice}
          initialPolygons={polygons}
          showGuide={!hasSeenMapGuide}
          onGuideSeen={() => setHasSeenMapGuide(true)}
          onClose={() => setMapOpen(false)}
          onUseManual={() => {
            setMapOpen(false);
            setAreaSource("manual");
            setPolygons([]);
            setMapSnapshot("");
            window.requestAnimationFrame(() => areaInputRef.current?.focus());
          }}
          onConfirm={({ area: measuredArea, polygons: measuredPolygons, snapshotDataUrl }) => {
            setArea(String(measuredArea));
            setAreaSource("map");
            setPolygons(measuredPolygons);
            setMapSnapshot(snapshotDataUrl ?? "");
            setError("");
            setMapOpen(false);
          }}
        />
      ) : null}
    </section>
  );
}
