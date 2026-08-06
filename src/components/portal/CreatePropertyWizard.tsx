"use client";

import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  LoaderCircle,
  MapPin,
  UserRound,
} from "lucide-react";
import { type FormEvent, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { createPropertyAction } from "@/app/actions/portalAdmin";
import { AcceptedOfferPropertyFields } from "@/components/portal/AcceptedOfferPropertyFields";
import { Field, Panel, inputClass } from "@/components/portal/PortalUI";
import { PROPERTY_TYPE_LABELS } from "@/lib/portal/core";

export type CreatePropertyCustomerOption = {
  id: string;
  label: string;
};

export type CreatePropertyOfferOption = {
  id: string;
  customerId: string;
  number: string;
  title: string;
  objectLabel?: string | null;
  objectAddress?: string | null;
};

type WizardStep = {
  label: string;
  shortLabel: string;
  description: string;
  icon: typeof UserRound;
};

const steps: WizardStep[] = [
  {
    label: "Kunde und Angebot",
    shortLabel: "Kunde",
    description: "Kundenbezug wählen und bei Bedarf ein angenommenes Angebot übernehmen.",
    icon: UserRound,
  },
  {
    label: "Immobilie und Vertrag",
    shortLabel: "Immobilie",
    description: "Stammdaten, Status und die wichtigsten Vertragswerte festlegen.",
    icon: Building2,
  },
  {
    label: "Erstes Gebäude",
    shortLabel: "Gebäude",
    description: "Adresse und interne Hinweise für das erste Gebäude ergänzen.",
    icon: MapPin,
  },
];

type FormControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

function firstInvalidControl(container: HTMLElement | null) {
  if (!container) return null;
  return Array.from(container.querySelectorAll<FormControl>("input, select, textarea")).find(
    (control) => !control.disabled && !control.checkValidity(),
  ) ?? null;
}

function focusControl(control: FormControl) {
  window.requestAnimationFrame(() => {
    control.focus({ preventScroll: true });
    control.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "center",
    });
    control.reportValidity();
  });
}

function WizardFooter({
  step,
  onBack,
  onNext,
}: {
  step: number;
  onBack: () => void;
  onNext: () => void;
}) {
  const { pending } = useFormStatus();
  const isLastStep = step === steps.length - 1;

  return (
    <div className="sticky bottom-20 z-20 -mx-4 mt-7 border-t border-slate-200 bg-white/96 px-4 pb-2 pt-4 shadow-[0_-14px_32px_rgba(8,43,97,0.08)] backdrop-blur sm:-mx-5 sm:px-5 lg:bottom-4 lg:mx-0 lg:rounded-2xl lg:border lg:px-4 lg:shadow-[0_16px_40px_rgba(8,43,97,0.10)]">
      <div className="flex flex-col-reverse gap-2 min-[390px]:flex-row min-[390px]:items-center min-[390px]:justify-between">
        <button
          type="button"
          onClick={onBack}
          disabled={step === 0 || pending}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-extrabold text-slate-700 transition hover:border-brand/30 hover:text-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/15 disabled:pointer-events-none disabled:opacity-40 min-[390px]:w-auto"
        >
          <ArrowLeft aria-hidden="true" size={18} />
          Zurück
        </button>

        {isLastStep ? (
          <button
            type="submit"
            disabled={pending}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand to-brand-dark px-5 text-sm font-black text-white shadow-[0_12px_28px_rgba(8,43,97,0.24)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_34px_rgba(8,43,97,0.3)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/20 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-65 min-[390px]:w-auto"
          >
            {pending ? (
              <>
                <LoaderCircle className="animate-spin" aria-hidden="true" size={18} />
                Immobilie wird angelegt …
              </>
            ) : (
              <>
                <Check aria-hidden="true" size={19} />
                Immobilie anlegen
              </>
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={onNext}
            disabled={pending}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand to-brand-dark px-5 text-sm font-black text-white shadow-[0_12px_28px_rgba(8,43,97,0.22)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_34px_rgba(8,43,97,0.28)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/20 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-65 min-[390px]:w-auto"
          >
            Weiter
            <ArrowRight aria-hidden="true" size={18} />
          </button>
        )}
      </div>
      <p className="mt-2 text-center text-[11px] font-semibold leading-4 text-slate-500 min-[390px]:text-right">
        Schritt {step + 1} von {steps.length}
      </p>
    </div>
  );
}

export function CreatePropertyWizard({
  customers,
  offers,
  careStartDate,
}: {
  customers: CreatePropertyCustomerOption[];
  offers: CreatePropertyOfferOption[];
  careStartDate: string;
}) {
  const [step, setStep] = useState(0);
  const [validationMessage, setValidationMessage] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const sectionRefs = useRef<Array<HTMLFieldSetElement | null>>([]);
  const headingRefs = useRef<Array<HTMLHeadingElement | null>>([]);

  function moveToStep(nextStep: number) {
    setValidationMessage("");
    setStep(nextStep);
    window.requestAnimationFrame(() => {
      headingRefs.current[nextStep]?.focus({ preventScroll: true });
      formRef.current?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "start",
      });
    });
  }

  function validateStep(stepIndex: number) {
    const invalidControl = firstInvalidControl(sectionRefs.current[stepIndex]);
    if (!invalidControl) return true;
    setValidationMessage("Bitte füllen Sie die markierten Pflichtfelder vollständig und gültig aus.");
    focusControl(invalidControl);
    return false;
  }

  function handleNext() {
    if (validateStep(step)) moveToStep(Math.min(step + 1, steps.length - 1));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    setValidationMessage("");
    for (let stepIndex = 0; stepIndex < steps.length; stepIndex += 1) {
      const invalidControl = firstInvalidControl(sectionRefs.current[stepIndex]);
      if (!invalidControl) continue;
      event.preventDefault();
      setStep(stepIndex);
      setValidationMessage("Bitte füllen Sie die markierten Pflichtfelder vollständig und gültig aus.");
      focusControl(invalidControl);
      return;
    }
  }

  return (
    <Panel
      title="Immobilie mit erstem Gebäude anlegen"
      description="Drei kurze Schritte führen durch Kundenbezug, Vertragsdaten und Gebäudeadresse."
      contentClassName="pb-2 sm:pb-3"
    >
      <form ref={formRef} action={createPropertyAction} noValidate onSubmit={handleSubmit}>
        <ol className="grid grid-cols-3 gap-2" aria-label="Fortschritt der Immobilienanlage">
          {steps.map((item, index) => {
            const Icon = item.icon;
            const active = index === step;
            const completed = index < step;
            return (
              <li key={item.label}>
                <button
                  type="button"
                  onClick={() => index <= step && moveToStep(index)}
                  disabled={index > step}
                  aria-current={active ? "step" : undefined}
                  className={`group flex min-h-[4.65rem] w-full flex-col items-center justify-center gap-1.5 rounded-2xl border px-2 py-2 text-center transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/15 sm:min-h-[5.25rem] sm:flex-row sm:justify-start sm:gap-3 sm:px-4 sm:text-left ${
                    active
                      ? "border-[#08AEB4]/40 bg-[#E7F8F9] text-brand shadow-sm"
                      : completed
                        ? "border-emerald-200 bg-emerald-50 text-emerald-800 hover:border-emerald-300"
                        : "cursor-default border-slate-200 bg-slate-50 text-slate-400"
                  }`}
                >
                  <span
                    className={`grid size-8 shrink-0 place-items-center rounded-xl sm:size-10 ${
                      active
                        ? "bg-white text-[#087f83] shadow-sm"
                        : completed
                          ? "bg-emerald-600 text-white"
                          : "bg-white text-slate-400"
                    }`}
                  >
                    {completed ? <Check aria-hidden="true" size={18} /> : <Icon aria-hidden="true" size={18} />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[10px] font-black uppercase tracking-[0.08em] opacity-65">
                      Schritt {index + 1}
                    </span>
                    <span className="mt-0.5 block text-xs font-black leading-tight sm:text-sm">
                      <span className="sm:hidden">{item.shortLabel}</span>
                      <span className="hidden sm:inline">{item.label}</span>
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50/70 p-4 sm:p-6">
          {steps.map((item, index) => (
            <fieldset
              key={item.label}
              ref={(element) => {
                sectionRefs.current[index] = element;
              }}
              data-wizard-step={index}
              hidden={step !== index}
              className="min-w-0 border-0 p-0"
            >
              <legend className="sr-only">{item.label}</legend>
              <div className="mb-5 border-b border-slate-200 pb-4">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#087f83]">
                  Schritt {index + 1} von {steps.length}
                </p>
                <h3
                  ref={(element) => {
                    headingRefs.current[index] = element;
                  }}
                  tabIndex={-1}
                  className="mt-1 text-xl font-black tracking-[-0.025em] text-slate-950 outline-none sm:text-2xl"
                >
                  {item.label}
                </h3>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{item.description}</p>
              </div>

              {index === 0 ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <AcceptedOfferPropertyFields customers={customers} offers={offers} />
                  <div className="rounded-2xl border border-[#08AEB4]/20 bg-[#E7F8F9]/70 p-4 text-sm leading-6 text-slate-700 md:col-span-2">
                    <p className="font-black text-brand">Gut zu wissen</p>
                    <p className="mt-1">
                      Ein angenommenes Angebot ist optional. Bei Auswahl werden vorhandene Objektangaben übernommen und können in den nächsten Schritten geprüft werden.
                    </p>
                  </div>
                </div>
              ) : null}

              {index === 1 ? (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  <Field label="Immobilienname" required className="sm:col-span-2 xl:col-span-2">
                    <input
                      name="name"
                      required
                      maxLength={180}
                      placeholder="z. B. WEG Musterstraße 1–7"
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Interner Objektschlüssel" hint="Optional, z. B. HV-2026-014">
                    <input name="objectKey" maxLength={80} placeholder="optional" className={inputClass} />
                  </Field>
                  <Field label="Objektart" required>
                    <select name="propertyType" required defaultValue="multi_family" className={inputClass}>
                      {Object.entries(PROPERTY_TYPE_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Immobilienstatus" required>
                    <select name="status" required defaultValue="active" className={inputClass}>
                      <option value="planning">In Planung</option>
                      <option value="active">Aktiv</option>
                      <option value="paused">Pausiert</option>
                    </select>
                  </Field>
                  <Field label="WEG-/Eigentümerbezeichnung">
                    <input name="ownershipName" maxLength={180} className={inputClass} />
                  </Field>
                  <Field label="Monatliche Grundvergütung netto" required hint="Euro-Betrag, z. B. 650,00">
                    <input
                      name="monthlyFee"
                      required
                      inputMode="decimal"
                      pattern="[0-9]{1,9}([,.][0-9]{1,2})?"
                      title="Bitte einen gültigen Euro-Betrag mit höchstens zwei Nachkommastellen eingeben."
                      defaultValue="0,00"
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Umsatzsteuersatz in %" required>
                    <input
                      name="taxRate"
                      required
                      type="number"
                      inputMode="decimal"
                      min="0"
                      max="100"
                      step="0.01"
                      defaultValue="19"
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Maximale Einsatzdauer in Minuten" required>
                    <input
                      name="maxVisitMinutes"
                      required
                      type="number"
                      min="1"
                      max="1440"
                      step="1"
                      defaultValue="120"
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Betreuungsbeginn" required>
                    <input
                      name="careStartDate"
                      required
                      type="date"
                      defaultValue={careStartDate}
                      className={inputClass}
                    />
                  </Field>
                </div>
              ) : null}

              {index === 2 ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Bezeichnung erstes Gebäude" hint="Optional, z. B. Haus A" className="sm:col-span-2">
                    <input name="buildingLabel" maxLength={120} placeholder="z. B. Haus A" className={inputClass} />
                  </Field>
                  <Field label="Straße" required>
                    <input name="street" required maxLength={160} autoComplete="address-line1" className={inputClass} />
                  </Field>
                  <Field label="Hausnummer" required>
                    <input name="houseNumber" required maxLength={30} autoComplete="address-line2" className={inputClass} />
                  </Field>
                  <Field label="Postleitzahl" required>
                    <input
                      name="postalCode"
                      required
                      inputMode="numeric"
                      pattern="[0-9]{5}"
                      maxLength={5}
                      autoComplete="postal-code"
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Ort" required>
                    <input name="city" required maxLength={120} autoComplete="address-level2" className={inputClass} />
                  </Field>
                  <Field label="Land" required className="sm:col-span-2">
                    <input
                      name="country"
                      required
                      maxLength={80}
                      defaultValue="Deutschland"
                      autoComplete="country-name"
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Interne Zugangs- oder Objekthinweise" hint="Optional, nur intern sichtbar" className="sm:col-span-2">
                    <textarea name="accessNotes" rows={3} maxLength={4_000} className={inputClass} />
                  </Field>
                  <Field label="Internes Briefing" hint="Optional, nur intern sichtbar" className="sm:col-span-2">
                    <textarea name="internalBriefing" rows={4} maxLength={12_000} className={inputClass} />
                  </Field>
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950 sm:col-span-2">
                    <p className="font-black">Vor dem Anlegen kurz prüfen</p>
                    <p className="mt-1">
                      Der öffentliche QR-Code ist erst nutzbar, wenn sowohl die Immobilie als auch das Gebäude aktiv sind.
                    </p>
                  </div>
                </div>
              ) : null}
            </fieldset>
          ))}
        </div>

        <p className="mt-4 min-h-5 text-sm font-bold text-rose-700" role="alert" aria-live="polite">
          {validationMessage}
        </p>

        <WizardFooter
          step={step}
          onBack={() => moveToStep(Math.max(0, step - 1))}
          onNext={handleNext}
        />
      </form>
    </Panel>
  );
}
