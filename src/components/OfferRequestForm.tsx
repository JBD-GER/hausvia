"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { ArrowRight, Loader2, ShieldCheck, Snowflake } from "lucide-react";
import { markLeadConversionPending } from "@/components/LeadConversionTracker";
import type { WinterPricingEstimate, WinterPricingInput } from "@/lib/winterPricing";

export type WinterOfferRequestContext = {
  service: "winterdienst";
  input?: WinterPricingInput;
  estimate?: WinterPricingEstimate;
  labels?: {
    objectType: string;
    surfaceProfile: string;
    access: string;
  };
};

const initialForm = {
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  privacyAccepted: false,
  termsAccepted: false,
};

const currencyFormatter = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

function formatCurrency(value: number) {
  return currencyFormatter.format(value);
}

export function OfferRequestForm({ requestContext }: { requestContext?: WinterOfferRequestContext }) {
  const router = useRouter();
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const firstName = form.firstName.trim();
    const lastName = form.lastName.trim();
    const phone = form.phone.trim();
    const email = form.email.trim();

    if (!firstName) {
      setError("Bitte geben Sie Ihren Vornamen an.");
      return;
    }
    if (!lastName) {
      setError("Bitte geben Sie Ihren Nachnamen an.");
      return;
    }
    if (!phone) {
      setError("Bitte geben Sie Ihre Telefonnummer an.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Bitte geben Sie eine gültige E-Mail-Adresse an.");
      return;
    }
    if (!form.privacyAccepted) {
      setError("Bitte bestätigen Sie die Datenschutzerklärung.");
      return;
    }
    if (!form.termsAccepted) {
      setError("Bitte bestätigen Sie die AGB.");
      return;
    }

    setSubmitting(true);
    setError("");

    const isWinterRequest = requestContext?.service === "winterdienst";

    try {
      const response = await fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "offer-request",
          submittedAt: new Date().toISOString(),
          lead: {
            firstName,
            lastName,
            name: `${firstName} ${lastName}`,
            phone,
            email,
            services: isWinterRequest ? ["Winterdienst"] : ["Angebotsanfrage"],
            ...(requestContext?.input
              ? {
                  winterPricingInput: {
                    objectType: requestContext.input.objectType,
                    area: String(requestContext.input.area),
                    surfaceProfile: requestContext.input.surfaceProfile,
                    access: requestContext.input.access,
                  },
                }
              : {}),
            privacyAccepted: form.privacyAccepted,
            termsAccepted: form.termsAccepted,
          },
        }),
      });

      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(result?.message || "Die Anfrage konnte gerade nicht gesendet werden.");
      }

      markLeadConversionPending(isWinterRequest ? "winter-service-request" : "offer-request");
      router.push("/danke?art=anfrage");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error && caughtError.message
          ? caughtError.message
          : "Die Anfrage konnte gerade nicht gesendet werden. Bitte versuchen Sie es erneut.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const inputClassName =
    "mt-2 min-h-12 w-full rounded-md border border-slate-300 bg-white px-4 py-3 text-base outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20";

  return (
    <form
      id="anfrage"
      onSubmit={submit}
      className="scroll-mt-24 rounded-xl border border-slate-200 bg-white p-5 shadow-xl shadow-slate-950/5 sm:p-7"
      aria-labelledby="offer-form-title"
    >
      <div className="flex items-start gap-4">
        <span className="flex h-12 w-12 flex-none items-center justify-center rounded-lg bg-brand-soft text-brand">
          <ShieldCheck aria-hidden="true" className="h-6 w-6" />
        </span>
        <div>
          <p className="text-sm font-bold uppercase tracking-wide text-brand">Kostenlos & unverbindlich</p>
          <h2 id="offer-form-title" className="mt-1 text-2xl font-extrabold text-slate-950">
            Kontaktdaten eintragen
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-650">
            Vier Angaben genügen. Hausvia meldet sich persönlich bei Ihnen.
          </p>
        </div>
      </div>

      {requestContext ? (
        <div className="mt-6 rounded-xl border border-brand/15 bg-brand-soft p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-brand text-white">
              <Snowflake aria-hidden="true" className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-extrabold uppercase tracking-wide text-brand">
                Winterdienst vorausgewählt
              </p>
              <p className="mt-1 text-sm font-semibold leading-6 text-slate-700">
                {requestContext.estimate && requestContext.input && requestContext.labels
                  ? `${requestContext.input.area.toLocaleString("de-DE")} m² · ${requestContext.labels.objectType} · ${requestContext.labels.surfaceProfile} · ${requestContext.labels.access}`
                  : "Ihre Anfrage wird direkt dem Winterdienst zugeordnet."}
              </p>
            </div>
          </div>

          {requestContext.estimate ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-brand/10 bg-white p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Saison-Grundbetrag</p>
                <p className="mt-1 text-xl font-extrabold text-slate-950">
                  {formatCurrency(requestContext.estimate.seasonBaseGross)}
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-600">
                  {formatCurrency(requestContext.estimate.monthlyBaseGross)} monatlich, November bis März
                </p>
              </div>
              <div className="rounded-lg bg-brand p-4 text-white">
                <p className="text-xs font-bold uppercase tracking-wide text-blue-100">Je tatsächlichem Einsatz</p>
                <p className="mt-1 text-xl font-extrabold">
                  + {formatCurrency(requestContext.estimate.deploymentGross)}
                </p>
                <p className="mt-1 text-xs leading-5 text-blue-100">Nur bei tatsächlichem Winterdiensteinsatz</p>
              </div>
            </div>
          ) : null}

          <p className="mt-3 text-xs leading-5 text-slate-600">
            Die Preiseinschätzung ist unverbindlich. Vor Vertragsschluss prüfen wir Adresse und Objektgegebenheiten.
          </p>
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-bold text-slate-800">Vorname</span>
          <input
            value={form.firstName}
            onChange={(event) => update("firstName", event.target.value)}
            className={inputClassName}
            autoComplete="given-name"
            maxLength={80}
            required
          />
        </label>
        <label className="block">
          <span className="text-sm font-bold text-slate-800">Nachname</span>
          <input
            value={form.lastName}
            onChange={(event) => update("lastName", event.target.value)}
            className={inputClassName}
            autoComplete="family-name"
            maxLength={80}
            required
          />
        </label>
        <label className="block">
          <span className="text-sm font-bold text-slate-800">Telefonnummer</span>
          <input
            type="tel"
            value={form.phone}
            onChange={(event) => update("phone", event.target.value)}
            className={inputClassName}
            autoComplete="tel"
            inputMode="tel"
            maxLength={40}
            required
          />
        </label>
        <label className="block">
          <span className="text-sm font-bold text-slate-800">E-Mail</span>
          <input
            type="email"
            value={form.email}
            onChange={(event) => update("email", event.target.value)}
            className={inputClassName}
            autoComplete="email"
            inputMode="email"
            maxLength={180}
            required
          />
        </label>
      </div>

      <div className="mt-5 grid gap-3">
        <label className="flex gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
          <input
            type="checkbox"
            checked={form.privacyAccepted}
            onChange={(event) => update("privacyAccepted", event.target.checked)}
            className="mt-1 h-5 w-5 flex-none rounded border-slate-300 text-brand focus:ring-brand"
            required
          />
          <span>
            Ich habe die{" "}
            <Link href="/datenschutz" className="font-bold text-brand underline underline-offset-2">
              Datenschutzerklärung
            </Link>{" "}
            gelesen und bin mit der Verarbeitung meiner Angaben zur Bearbeitung der Anfrage einverstanden.
          </span>
        </label>
        <label className="flex gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
          <input
            type="checkbox"
            checked={form.termsAccepted}
            onChange={(event) => update("termsAccepted", event.target.checked)}
            className="mt-1 h-5 w-5 flex-none rounded border-slate-300 text-brand focus:ring-brand"
            required
          />
          <span>
            Ich akzeptiere die{" "}
            <Link href="/agb" className="font-bold text-brand underline underline-offset-2">
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

      <button
        type="submit"
        disabled={submitting}
        className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-brand px-6 py-3 text-base font-bold text-white transition hover:bg-brand-dark disabled:cursor-wait disabled:opacity-70"
      >
        {submitting ? <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" /> : null}
        {requestContext ? "Winterdienst unverbindlich anfragen" : "Angebot kostenlos anfragen"}
        {!submitting ? <ArrowRight aria-hidden="true" className="h-5 w-5" /> : null}
      </button>

      <p className="mt-4 text-center text-xs font-semibold leading-5 text-slate-500">
        {requestContext?.input
          ? "Ihre Rechnerangaben werden übernommen. Die Anfrage ist kostenlos und unverbindlich."
          : "Keine Objektangaben nötig. Ihre Anfrage ist kostenlos und unverbindlich."}
      </p>
    </form>
  );
}
