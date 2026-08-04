"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Calculator,
  Check,
  ClipboardCheck,
  Home,
  Loader2,
  MapPin,
  Ruler,
  ShieldCheck,
  Sparkles,
  Star,
} from "lucide-react";
import {
  getServiceLabels,
  pricingConfig,
  type ComplexityId,
  type FrequencyId,
  type ObjectTypeId,
  type ServiceId,
} from "@/lib/pricing";
import { markLeadConversionPending } from "@/components/LeadConversionTracker";

type LeadData = {
  objectType: ObjectTypeId | "";
  location: string;
  outsideArea: boolean;
  unitCount: string;
  averageUnitArea: string;
  outdoorArea: string;
  services: ServiceId[];
  servicePackage: boolean;
  frequency: FrequencyId | "";
  complexity: ComplexityId | "";
  name: string;
  company: string;
  email: string;
  phone: string;
  objectAddress: string;
  message: string;
  desiredStartDate: string;
  preferredCallbackTime: string;
  privacyAccepted: boolean;
  termsAccepted: boolean;
};

const initialLead: LeadData = {
  objectType: "",
  location: "",
  outsideArea: false,
  unitCount: "1",
  averageUnitArea: "",
  outdoorArea: "",
  services: [],
  servicePackage: false,
  frequency: "",
  complexity: "",
  name: "",
  company: "",
  email: "",
  phone: "",
  objectAddress: "",
  message: "",
  desiredStartDate: "",
  preferredCallbackTime: "",
  privacyAccepted: false,
  termsAccepted: false,
};

const locationChips = [
  "Hannover",
  "List",
  "Südstadt",
  "Mitte",
  "Linden",
  "Ricklingen",
  "Bothfeld",
  "Vahrenwald",
  "Döhren",
  "Kleefeld",
  "Kirchrode",
  "Misburg",
  "Langenhagen",
  "Garbsen",
  "Laatzen",
  "Hemmingen",
  "Ronnenberg",
  "Seelze",
  "Isernhagen",
  "Lehrte",
  "Sehnde",
  "Burgdorf",
  "Wedemark",
  "Neustadt am Rübenberge",
  "Barsinghausen",
];

const steps = ["Objektart", "Standort", "Flächen", "Leistungen", "Häufigkeit", "Komplexität", "Kosten & Anfrage"];

const objectIcons: Record<ObjectTypeId, typeof Building2> = {
  weg: Building2,
  private: Home,
  commercial: ShieldCheck,
  other: ClipboardCheck,
};

const serviceIconMap: Partial<Record<ServiceId, typeof Sparkles>> = {
  caretaker: ShieldCheck,
  gardenCare: Sparkles,
  technicalChecks: ClipboardCheck,
};

function Stars() {
  return (
    <span className="inline-flex text-amber-500" aria-label="5 Sterne">
      {[0, 1, 2, 3, 4].map((item) => (
        <Star key={item} aria-hidden="true" className="h-4 w-4 fill-current" />
      ))}
    </span>
  );
}

function OptionCard({
  title,
  text,
  active,
  onClick,
  icon: Icon,
}: {
  title: string;
  text?: string;
  active: boolean;
  onClick: () => void;
  icon?: typeof Building2;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative min-h-16 w-full rounded-xl border p-4 text-left transition active:scale-[0.99] ${
        active
          ? "border-brand bg-brand text-white shadow-md shadow-brand/10"
          : "border-slate-200 bg-white text-slate-800 shadow-sm hover:border-brand/50 hover:bg-brand-soft"
      }`}
    >
      <span className="flex w-full items-start gap-3">
        {Icon ? (
          <span
            className={`flex h-11 w-11 flex-none items-center justify-center rounded-lg ${
              active ? "bg-white/15 text-white" : "bg-brand-soft text-brand"
            }`}
          >
            <Icon aria-hidden="true" className="h-5 w-5" />
          </span>
        ) : null}
        <span className="min-w-0 flex-1 pr-8">
          <span className="block text-base font-extrabold leading-6 sm:text-sm sm:leading-5">{title}</span>
          {text ? (
            <span className={`mt-1 block text-sm font-semibold leading-6 sm:text-xs sm:leading-5 ${active ? "text-blue-50" : "text-slate-650"}`}>
              {text}
            </span>
          ) : null}
        </span>
        {active ? (
          <span className="absolute right-4 top-4 flex h-6 w-6 items-center justify-center rounded-full bg-white text-brand">
            <Check aria-hidden="true" className="h-4 w-4" />
          </span>
        ) : null}
      </span>
    </button>
  );
}

function NumberInput({
  label,
  value,
  onChange,
  helper,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  helper: string;
  placeholder: string;
}) {
  return (
    <label className="block rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <span className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
        <Ruler aria-hidden="true" className="h-4 w-4 text-brand" />
        {label}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/[^\d]/g, ""))}
        inputMode="numeric"
        placeholder={placeholder}
        className="mt-3 min-h-12 w-full rounded-md border border-slate-300 px-4 py-3 text-base font-bold outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
      />
      <span className="mt-2 block text-xs font-semibold leading-5 text-slate-600">{helper}</span>
    </label>
  );
}

export function ServiceFunnel({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const funnelRef = useRef<HTMLElement>(null);
  const stepTopRef = useRef<HTMLDivElement>(null);
  const shouldScrollToStepRef = useRef(false);
  const [step, setStep] = useState(0);
  const [lead, setLead] = useState<LeadData>(initialLead);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const progress = useMemo(() => Math.round(((step + 1) / steps.length) * 100), [step]);
  const selectedObjectType = pricingConfig.objectTypes.find((item) => item.id === lead.objectType);
  const selectedServiceLabels = getServiceLabels(lead.services);
  const unitCount = Math.max(0, Number(lead.unitCount) || 0);
  const averageUnitArea = Math.max(0, Number(lead.averageUnitArea) || 0);
  const computedUsableArea = unitCount * averageUnitArea;
  const selectedFrequency = pricingConfig.frequencies.find((item) => item.id === lead.frequency);
  const selectedComplexity = pricingConfig.complexity.find((item) => item.id === lead.complexity);

  useEffect(() => {
    if (!shouldScrollToStepRef.current) return;

    shouldScrollToStepRef.current = false;
    const timeoutId = window.setTimeout(() => {
      const target = stepTopRef.current ?? funnelRef.current;
      if (!target) return;

      const offset = window.matchMedia("(max-width: 767px)").matches ? 78 : 96;
      const top = target.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    }, 40);

    return () => window.clearTimeout(timeoutId);
  }, [step]);

  function update<K extends keyof LeadData>(key: K, value: LeadData[K]) {
    setLead((current) => ({ ...current, [key]: value }));
    setError("");
  }

  function toggleService(service: ServiceId) {
    setLead((current) => ({
      ...current,
      servicePackage: false,
      services: current.services.includes(service)
        ? current.services.filter((item) => item !== service)
        : [...current.services, service],
    }));
    setError("");
  }

  function selectFullServicePackage() {
    setLead((current) => ({
      ...current,
      servicePackage: !current.servicePackage,
      services: current.servicePackage ? [] : pricingConfig.servicePackageIds,
    }));
    setError("");
  }

  function validationMessage(currentStep = step) {
    if (currentStep === 0 && !lead.objectType) return "Bitte wählen Sie eine Objektart aus.";
    if (currentStep === 1 && !lead.location.trim()) {
      return lead.outsideArea
        ? "Bitte tragen Sie den Ort außerhalb des genannten Einsatzgebiets ein."
        : "Bitte geben Sie Standort oder Stadtteil an.";
    }
    if (currentStep === 2) {
      const unitCountValue = Number(lead.unitCount);
      const averageUnitAreaValue = Number(lead.averageUnitArea);
      const outdoorArea = Number(lead.outdoorArea || "0");
      if (!unitCountValue || unitCountValue <= 0) return "Bitte geben Sie die Anzahl der Einheiten an.";
      if (!averageUnitAreaValue || averageUnitAreaValue <= 0) {
        return "Bitte geben Sie die durchschnittliche Wohn- oder Nutzfläche pro Einheit an.";
      }
      if (outdoorArea < 0) return "Bitte geben Sie eine gültige Außenfläche ein.";
    }
    if (currentStep === 3 && lead.services.length === 0) return "Bitte wählen Sie mindestens eine Leistung aus.";
    if (currentStep === 4 && !lead.frequency) return "Bitte wählen Sie eine Häufigkeit aus.";
    if (currentStep === 5 && !lead.complexity) return "Bitte wählen Sie die Objektkomplexität aus.";
    if (currentStep === 6) {
      if (!lead.name.trim()) return "Bitte geben Sie Ihren Namen an.";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email.trim())) {
        return "Bitte geben Sie eine gültige E-Mail-Adresse an.";
      }
      if (!lead.phone.trim()) return "Bitte geben Sie eine Telefonnummer an.";
      if (!lead.objectAddress.trim()) return "Bitte geben Sie Adresse oder Ort des Objekts an.";
      if (!lead.privacyAccepted) return "Bitte bestätigen Sie den Datenschutz-Hinweis.";
      if (!lead.termsAccepted) return "Bitte bestätigen Sie die AGB.";
    }
    return "";
  }

  function next() {
    const message = validationMessage();
    if (message) {
      setError(message);
      return;
    }
    shouldScrollToStepRef.current = true;
    setStep((current) => Math.min(current + 1, steps.length - 1));
  }

  function back() {
    setError("");
    shouldScrollToStepRef.current = true;
    setStep((current) => Math.max(current - 1, 0));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const message = validationMessage(6);
    if (message) {
      setError(message);
      setStep(6);
      return;
    }

    const preparedLead = {
      ...lead,
      computedUsableArea,
      selectedServiceLabels,
      objectTypeLabel: selectedObjectType?.label ?? "",
      frequencyLabel: selectedFrequency?.label ?? "",
      complexityLabel: selectedComplexity?.label ?? "",
    };

    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "cost-funnel",
          submittedAt: new Date().toISOString(),
          lead: preparedLead,
        }),
      });

      const result = (await response.json().catch(() => null)) as
        | { message?: string; submissionId?: string }
        | null;

      if (!response.ok) {
        throw new Error(result?.message || "Lead request failed");
      }

      markLeadConversionPending("cost-funnel", result?.submissionId || crypto.randomUUID(), {
        email: lead.email,
        phone: lead.phone,
      });
      router.push("/danke");
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      setError(message || "Der E-Mail-Versand konnte gerade nicht abgeschlossen werden. Bitte versuchen Sie es erneut.");
    } finally {
      setSubmitting(false);
    }
  }

  const nextLabel = step === 0 ? "Kosten jetzt einschätzen" : step === 5 ? "Angaben prüfen" : "Weiter";

  return (
    <section
      ref={funnelRef}
      id="anfrage"
      className={`scroll-mt-24 rounded-lg border border-slate-200 bg-white shadow-sm ${compact ? "p-4 sm:p-5" : "p-5 sm:p-7"}`}
      aria-labelledby="funnel-title"
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-bold uppercase tracking-wide text-brand">Kostencheck für Objektbetreuung</p>
          <h2 id="funnel-title" className="mt-2 text-2xl font-extrabold leading-tight text-slate-950 sm:text-3xl">
            Hausmeisterservice-Kosten in 60 Sekunden einschätzen
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-650">
            Beantworte wenige Fragen zu Objektart, Fläche und gewünschten Leistungen und erhalte eine realistische
            unverbindliche Ersteinschätzung für deinen Bedarf.
          </p>
          <div className="mt-4 inline-flex flex-wrap items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-slate-800">
            <Stars />
            <span>Realistische Einschätzung für WEG, Privathaushalt und Gewerbeobjekt</span>
          </div>
        </div>
        <div className="min-w-36 rounded-md bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800">
          Schritt {step + 1} / {steps.length}
        </div>
      </div>

      <div className="mt-6" aria-hidden="true">
        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${progress}%` }} />
        </div>
        <p className="mt-2 text-xs font-semibold text-slate-500">{steps[step]}</p>
      </div>

      <div ref={stepTopRef} className="mt-7 scroll-mt-24" />
      <form onSubmit={submit}>
        {step === 0 ? (
          <div>
            <h3 className="text-xl font-extrabold text-slate-950">Welche Objektart soll kalkuliert werden?</h3>
            <p className="mt-2 text-sm text-slate-650">
              Die Objektart beeinflusst Häufigkeit, Abstimmung und Mindestumfang der Betreuung.
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {pricingConfig.objectTypes.map((type) => (
                <OptionCard
                  key={type.id}
                  title={type.label}
                  text={type.description}
                  icon={objectIcons[type.id as ObjectTypeId]}
                  active={lead.objectType === type.id}
                  onClick={() => update("objectType", type.id as ObjectTypeId)}
                />
              ))}
            </div>
          </div>
        ) : null}

        {step === 1 ? (
          <div>
            <h3 className="text-xl font-extrabold text-slate-950">Wo befindet sich Ihr Objekt?</h3>
            <p className="mt-2 text-sm text-slate-650">Stadtteil, Ort oder grobe Lage in Hannover und Umgebung.</p>
            <label className="mt-5 block">
              <span className="flex items-center gap-2 text-sm font-bold text-slate-800">
                <MapPin aria-hidden="true" className="h-4 w-4 text-brand" />
                {lead.outsideArea ? "Ort außerhalb des Einsatzgebiets" : "Standort"}
              </span>
              <input
                value={lead.location}
                onChange={(event) => update("location", event.target.value)}
                placeholder={
                  lead.outsideArea
                    ? "Bitte Ort eintragen, z. B. Celle oder Hildesheim"
                    : "z. B. Hannover List oder Langenhagen"
                }
                className="mt-2 min-h-12 w-full rounded-md border border-slate-300 px-4 py-3 text-base outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
              />
            </label>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setLead((current) => ({ ...current, location: "", outsideArea: true }));
                  setError("");
                }}
                className={`min-h-11 rounded-lg border px-4 py-2.5 text-sm font-bold ${
                  lead.outsideArea
                    ? "border-brand bg-brand text-white"
                    : "border-slate-200 bg-slate-50 text-slate-700 hover:border-brand/50 hover:text-brand"
                }`}
              >
                Außerhalb
              </button>
              {locationChips.map((location) => {
                const isActiveLocation = !lead.outsideArea && lead.location === location;

                return (
                  <button
                    key={location}
                    type="button"
                    aria-pressed={isActiveLocation}
                    onClick={() => {
                      setLead((current) => ({ ...current, location, outsideArea: false }));
                      setError("");
                    }}
                    className={`inline-flex min-h-11 items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-bold transition active:scale-[0.98] ${
                      isActiveLocation
                        ? "border-brand bg-brand text-white shadow-sm shadow-brand/20"
                        : "border-slate-200 bg-slate-50 text-slate-700 hover:border-brand/50 hover:text-brand"
                    }`}
                  >
                    {isActiveLocation ? <Check aria-hidden="true" className="h-4 w-4" /> : null}
                    {location}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div>
            <h3 className="text-xl font-extrabold text-slate-950">Wie groß ist das Objekt ungefähr?</h3>
            <p className="mt-2 text-sm text-slate-650">
              Eine grobe Schätzung reicht. Bei WEGs oder Mehrfamilienhäusern können Sie einfach die Anzahl der
              Einheiten und eine durchschnittliche Fläche pro Einheit angeben.
            </p>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <NumberInput
                label="Anzahl Wohneinheiten / Nutzbereiche"
                value={lead.unitCount}
                onChange={(value) => update("unitCount", value)}
                placeholder="z. B. 12"
                helper="Bei Privathaushalten reicht 1. Bei Gewerbeobjekten grob nach Nutzbereichen schätzen."
              />
              <NumberInput
                label="Ø Wohn-/Nutzfläche pro Einheit in m²"
                value={lead.averageUnitArea}
                onChange={(value) => update("averageUnitArea", value)}
                placeholder="z. B. 75"
                helper="Ein Durchschnittswert genügt. Daraus berechnen wir die ungefähre Gesamtfläche."
              />
              <NumberInput
                label="Aktiv zu betreuende Außenfläche in m²"
                value={lead.outdoorArea}
                onChange={(value) => update("outdoorArea", value)}
                placeholder="z. B. 300"
                helper="Gemeint ist vor allem die aktiv zu pflegende Außenfläche, nicht zwingend das komplette Flurstück."
              />
              <div className="rounded-xl border border-brand/15 bg-brand-soft p-4">
                <p className="text-sm font-extrabold text-brand">Automatisch berechnet</p>
                <p className="mt-2 text-3xl font-extrabold text-slate-950">
                  ca. {computedUsableArea.toLocaleString("de-DE")} m²
                </p>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-650">
                  Wohn-/Nutzfläche aus {lead.unitCount || "0"} Einheit(en) ×{" "}
                  {lead.averageUnitArea || "0"} m² Durchschnittsfläche.
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div>
            <h3 className="text-xl font-extrabold text-slate-950">Welche Leistungen sollen berücksichtigt werden?</h3>
            <p className="mt-2 text-sm text-slate-650">
              Mehrfachauswahl möglich. Reparaturen, Instandsetzungen und größere Handwerksleistungen werden separat
              kalkuliert.
            </p>
            <button
              type="button"
              onClick={selectFullServicePackage}
              className={`mt-5 flex min-h-20 w-full items-center justify-between gap-4 rounded-xl border px-4 py-4 text-left text-base font-extrabold transition active:scale-[0.99] ${
                lead.servicePackage
                  ? "border-brand bg-brand text-white shadow-md shadow-brand/10"
                  : "border-accent bg-accent/20 text-slate-950 shadow-sm hover:border-brand hover:bg-brand-soft"
              }`}
            >
              <span className="min-w-0">
                Rundum-Sorglos-Paket
                <span className={`mt-1 block text-sm font-semibold leading-6 ${lead.servicePackage ? "text-blue-50" : "text-slate-650"}`}>
                  Hausmeisterservice, Reinigung, Mülldienst, Gartenpflege, Kontrollgänge und Organisation bündeln
                </span>
              </span>
              <span
                aria-hidden="true"
                className={`flex flex-none items-center justify-center rounded-full px-3 py-1 text-sm ${
                  lead.servicePackage ? "bg-white text-brand" : "bg-white text-brand"
                }`}
              >
                {lead.servicePackage ? <Check className="h-4 w-4" /> : "Alles"}
              </span>
            </button>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {pricingConfig.services.map((service) => {
                const serviceId = service.id as ServiceId;
                const Icon = serviceIconMap[serviceId] ?? Sparkles;
                return (
                  <OptionCard
                    key={service.id}
                    title={service.label}
                    icon={Icon}
                    active={lead.services.includes(serviceId)}
                    onClick={() => toggleService(serviceId)}
                  />
                );
              })}
            </div>
          </div>
        ) : null}

        {step === 4 ? (
          <div>
            <h3 className="text-xl font-extrabold text-slate-950">Wie häufig soll die Betreuung stattfinden?</h3>
            <p className="mt-2 text-sm text-slate-650">
              Die Häufigkeit beeinflusst den Aufwand deutlich und macht die Einschätzung realistischer.
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {pricingConfig.frequencies.map((frequency) => (
                <OptionCard
                  key={frequency.id}
                  title={frequency.label}
                  active={lead.frequency === frequency.id}
                  onClick={() => update("frequency", frequency.id as FrequencyId)}
                  icon={Calculator}
                />
              ))}
            </div>
          </div>
        ) : null}

        {step === 5 ? (
          <div>
            <h3 className="text-xl font-extrabold text-slate-950">Wie komplex ist das Objekt?</h3>
            <p className="mt-2 text-sm text-slate-650">
              Zugänglichkeit, mehrere Eingänge, Außenflächen und Abstimmungsaufwand wirken sich auf die Kostenspanne aus.
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {pricingConfig.complexity.map((complexity) => (
                <OptionCard
                  key={complexity.id}
                  title={complexity.label}
                  active={lead.complexity === complexity.id}
                  onClick={() => update("complexity", complexity.id as ComplexityId)}
                  icon={ClipboardCheck}
                />
              ))}
            </div>
          </div>
        ) : null}

        {step === 6 ? (
          <div>
            <h3 className="text-2xl font-extrabold text-slate-950">Kosteneinschätzung per E-Mail anfordern</h3>
            <p className="mt-2 text-sm leading-6 text-slate-650">
              Die Kostenspanne wird erst nach dem Absenden serverseitig berechnet und als offizielles Hausvia-Dokument
              per E-Mail verschickt.
            </p>
            <div id="funnel-contact" className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-5">
              <h4 className="text-xl font-extrabold text-slate-950">
                Kontaktdaten eintragen
              </h4>
              <p className="mt-2 text-sm leading-6 text-slate-650">
                Nach dem Absenden erhalten Sie die unverbindliche Einschätzung per E-Mail.
              </p>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-bold text-slate-800">Name</span>
                  <input
                    value={lead.name}
                    onChange={(event) => update("name", event.target.value)}
                    className="mt-2 min-h-12 w-full rounded-md border border-slate-300 px-4 py-3 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                    autoComplete="name"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-bold text-slate-800">Firma / Verwaltung optional</span>
                  <input
                    value={lead.company}
                    onChange={(event) => update("company", event.target.value)}
                    className="mt-2 min-h-12 w-full rounded-md border border-slate-300 px-4 py-3 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                    autoComplete="organization"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-bold text-slate-800">E-Mail</span>
                  <input
                    value={lead.email}
                    onChange={(event) => update("email", event.target.value)}
                    className="mt-2 min-h-12 w-full rounded-md border border-slate-300 px-4 py-3 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                    autoComplete="email"
                    inputMode="email"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-bold text-slate-800">Telefon</span>
                  <input
                    value={lead.phone}
                    onChange={(event) => update("phone", event.target.value)}
                    className="mt-2 min-h-12 w-full rounded-md border border-slate-300 px-4 py-3 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                    autoComplete="tel"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-bold text-slate-800">Adresse / Ort des Objekts</span>
                  <input
                    value={lead.objectAddress}
                    onChange={(event) => update("objectAddress", event.target.value)}
                    placeholder={lead.location || "z. B. Hannover List"}
                    className="mt-2 min-h-12 w-full rounded-md border border-slate-300 px-4 py-3 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                    autoComplete="street-address"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-bold text-slate-800">Gewünschter Starttermin optional</span>
                  <input
                    type="date"
                    value={lead.desiredStartDate}
                    onChange={(event) => update("desiredStartDate", event.target.value)}
                    className="mt-2 min-h-12 w-full rounded-md border border-slate-300 px-4 py-3 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-bold text-slate-800">Gewünschte Rückrufzeit optional</span>
                  <input
                    value={lead.preferredCallbackTime}
                    onChange={(event) => update("preferredCallbackTime", event.target.value)}
                    placeholder="z. B. werktags 10–14 Uhr"
                    className="mt-2 min-h-12 w-full rounded-md border border-slate-300 px-4 py-3 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-sm font-bold text-slate-800">Nachricht optional</span>
                  <textarea
                    value={lead.message}
                    onChange={(event) => update("message", event.target.value)}
                    rows={4}
                    className="mt-2 w-full rounded-md border border-slate-300 px-4 py-3 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                  />
                </label>
                <label className="flex gap-3 rounded-md bg-white p-4 text-sm leading-6 text-slate-700 sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={lead.privacyAccepted}
                    onChange={(event) => update("privacyAccepted", event.target.checked)}
                    className="mt-1 h-5 w-5 rounded border-slate-300 text-brand focus:ring-brand"
                  />
                  <span>
                    Ich habe die{" "}
                    <Link href="/datenschutz" className="font-bold text-brand underline">
                      Datenschutzerklärung
                    </Link>{" "}
                    gelesen und bin einverstanden, dass Hausvia meine Angaben zur Bearbeitung der Anfrage nutzt.
                  </span>
                </label>
                <label className="flex gap-3 rounded-md bg-white p-4 text-sm leading-6 text-slate-700 sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={lead.termsAccepted}
                    onChange={(event) => update("termsAccepted", event.target.checked)}
                    className="mt-1 h-5 w-5 rounded border-slate-300 text-brand focus:ring-brand"
                  />
                  <span>
                    Ich akzeptiere die{" "}
                    <Link href="/agb" className="font-bold text-brand underline">
                      AGB
                    </Link>{" "}
                    von Hausvia.
                  </span>
                </label>
              </div>

              {error ? (
                <p
                  className="mt-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800"
                  aria-live="polite"
                >
                  {error}
                </p>
              ) : null}

              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  onClick={back}
                  disabled={submitting}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-800 transition hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ArrowLeft aria-hidden="true" size={17} />
                  Zurück
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-brand px-5 py-2.5 text-sm font-bold text-white transition hover:bg-brand-dark disabled:cursor-wait disabled:opacity-70"
                >
                  {submitting ? <Loader2 aria-hidden="true" size={17} className="animate-spin" /> : null}
                  Kosteneinschätzung anfordern
                </button>
              </div>
            </div>

            <div className="mt-5 rounded-lg border border-brand/20 bg-brand-soft p-5 sm:p-6">
              <p className="text-sm font-extrabold uppercase tracking-wide text-brand">Ihre Angaben sind vollständig</p>
              <p className="mt-2 text-3xl font-extrabold leading-tight text-slate-950 sm:text-4xl">
                Einschätzung per E-Mail erhalten
              </p>
              <div className="mt-5 grid gap-2 text-sm font-semibold text-slate-750 sm:grid-cols-2">
                <span className="rounded-md bg-white px-3 py-2">Kostenspanne als Dokument</span>
                <span className="rounded-md bg-white px-3 py-2">alle Angaben aufgelistet</span>
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-700">
                Vor dem Absenden wird keine konkrete Kostenspanne angezeigt. Der genaue Richtwert wird serverseitig
                berechnet und zusammen mit Objektart, Flächen, Leistungen und Kontaktdaten als PDF versendet.
              </p>
            </div>

            <dl className="mt-5 grid gap-3 sm:grid-cols-2">
              {[
                ["Objektart", selectedObjectType?.label ?? lead.objectType],
                ["Standort", lead.outsideArea ? `Außerhalb: ${lead.location}` : lead.location],
                ["Einheiten", `${lead.unitCount || "0"} Einheit(en)`],
                ["Ø Fläche je Einheit", `${lead.averageUnitArea || "0"} m²`],
                ["Wohn-/Nutzfläche", `${computedUsableArea.toLocaleString("de-DE")} m² berechnet`],
                ["Außenfläche", `${lead.outdoorArea || "0"} m² aktiv zu betreuende Fläche`],
                ["Leistungen", selectedServiceLabels.join(", ")],
                ["Häufigkeit", selectedFrequency?.label ?? lead.frequency],
                ["Komplexität", selectedComplexity?.label ?? lead.complexity],
              ].map(([label, value]) => (
                <div key={label} className="rounded-md border border-slate-200 bg-slate-50 p-4">
                  <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</dt>
                  <dd className="mt-1 text-sm font-semibold leading-6 text-slate-900">{value}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-5 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h4 className="text-lg font-extrabold text-slate-950">Warum die Einschätzung nur ein Richtwert ist</h4>
              <p className="mt-2 text-sm leading-7 text-slate-650">
                Jedes Objekt ist anders. Zugänglichkeit, Verschmutzungsgrad, Gartenpflege, Winterdienst, Kontrollaufwand
                und saisonale Arbeiten beeinflussen den finalen Preis. Die Einschätzung hilft, schnell ein
                realistisches Budget zu bekommen, bleibt aber unverbindlich.
              </p>
            </div>

          </div>
        ) : null}

        {selectedObjectType && step < 6 ? (
          <p className="mt-5 rounded-md border border-brand/15 bg-brand-soft px-4 py-3 text-sm font-semibold leading-6 text-brand">
            {selectedObjectType.description}
          </p>
        ) : null}

        {error && step < steps.length - 1 ? (
          <p className="mt-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800" aria-live="polite">
            {error}
          </p>
        ) : null}

        {step < steps.length - 1 ? (
          <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={back}
            disabled={step === 0 || submitting}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-800 transition hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ArrowLeft aria-hidden="true" size={17} />
            Zurück
          </button>

            <button
              type="button"
              onClick={next}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-brand px-5 py-2.5 text-sm font-bold text-white transition hover:bg-brand-dark"
            >
              {nextLabel}
              <ArrowRight aria-hidden="true" size={17} />
            </button>
          </div>
        ) : null}
      </form>
    </section>
  );
}
