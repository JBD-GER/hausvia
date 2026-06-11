"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { Check, Loader2 } from "lucide-react";

const initialForm = {
  name: "",
  company: "",
  objectAddress: "",
  serviceInterest: "",
  phone: "",
  email: "",
  message: "",
  privacyAccepted: false,
  termsAccepted: false,
};

export function ContactForm() {
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  function update(key: keyof typeof form, value: string | boolean) {
    setForm((current) => ({ ...current, [key]: value }));
    setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.name.trim()) {
      setError("Bitte geben Sie Ihren Namen an.");
      return;
    }
    if (!form.phone.trim()) {
      setError("Bitte geben Sie eine Telefonnummer an.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setError("Bitte geben Sie eine gültige E-Mail-Adresse an.");
      return;
    }
    if (!form.message.trim()) {
      setError("Bitte beschreiben Sie kurz Ihr Anliegen.");
      return;
    }
    if (!form.privacyAccepted) {
      setError("Bitte bestätigen Sie den Datenschutz-Hinweis.");
      return;
    }
    if (!form.termsAccepted) {
      setError("Bitte bestätigen Sie die AGB.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "contact-form",
          submittedAt: new Date().toISOString(),
          lead: {
            ...form,
            services: ["Kontaktformular"],
          },
        }),
      });

      if (!response.ok) throw new Error("Contact request failed");
      setSuccess(true);
      setForm(initialForm);
    } catch {
      setError("Ihre Nachricht konnte gerade nicht gesendet werden. Bitte versuchen Sie es erneut.");
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-6 text-green-950">
        <div className="flex h-11 w-11 items-center justify-center rounded-md bg-green-700 text-white">
          <Check aria-hidden="true" size={22} />
        </div>
        <h2 className="mt-4 text-2xl font-extrabold">Danke für Ihre Nachricht.</h2>
        <p className="mt-2 text-sm leading-6">Hausvia meldet sich zeitnah bei Ihnen.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-bold text-slate-800">Name</span>
          <input
            value={form.name}
            onChange={(event) => update("name", event.target.value)}
            className="mt-2 min-h-12 w-full rounded-md border border-slate-300 px-4 py-3 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
            autoComplete="name"
          />
        </label>
        <label className="block">
          <span className="text-sm font-bold text-slate-800">Firma / Hausverwaltung optional</span>
          <input
            value={form.company}
            onChange={(event) => update("company", event.target.value)}
            className="mt-2 min-h-12 w-full rounded-md border border-slate-300 px-4 py-3 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
            autoComplete="organization"
          />
        </label>
        <label className="block">
          <span className="text-sm font-bold text-slate-800">Adresse / Ort des Objekts optional</span>
          <input
            value={form.objectAddress}
            onChange={(event) => update("objectAddress", event.target.value)}
            className="mt-2 min-h-12 w-full rounded-md border border-slate-300 px-4 py-3 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
            autoComplete="street-address"
            placeholder="z. B. Hannover List"
          />
        </label>
        <label className="block">
          <span className="text-sm font-bold text-slate-800">Gewünschte Leistung optional</span>
          <select
            value={form.serviceInterest}
            onChange={(event) => update("serviceInterest", event.target.value)}
            className="mt-2 min-h-12 w-full rounded-md border border-slate-300 bg-white px-4 py-3 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
          >
            <option value="">Bitte auswählen</option>
            <option value="Hausmeisterservice / Objektbetreuung">Hausmeisterservice / Objektbetreuung</option>
            <option value="Treppenhausreinigung / Innenreinigung">Treppenhausreinigung / Innenreinigung</option>
            <option value="Gartenpflege / Außenanlagenpflege">Gartenpflege / Außenanlagenpflege</option>
            <option value="Winterdienst">Winterdienst</option>
            <option value="Mülldienst">Mülldienst</option>
            <option value="Mehrere Leistungen">Mehrere Leistungen</option>
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-bold text-slate-800">Telefonnummer</span>
          <input
            value={form.phone}
            onChange={(event) => update("phone", event.target.value)}
            className="mt-2 min-h-12 w-full rounded-md border border-slate-300 px-4 py-3 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
            autoComplete="tel"
          />
        </label>
        <label className="block">
          <span className="text-sm font-bold text-slate-800">E-Mail</span>
          <input
            value={form.email}
            onChange={(event) => update("email", event.target.value)}
            className="mt-2 min-h-12 w-full rounded-md border border-slate-300 px-4 py-3 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
            autoComplete="email"
            inputMode="email"
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-sm font-bold text-slate-800">Nachricht</span>
          <textarea
            value={form.message}
            onChange={(event) => update("message", event.target.value)}
            rows={6}
            className="mt-2 w-full rounded-md border border-slate-300 px-4 py-3 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
            placeholder="Welche Immobilie soll betreut werden und welche Leistungen sind interessant?"
          />
        </label>
        <label className="flex gap-3 rounded-md bg-slate-50 p-4 text-sm leading-6 text-slate-700 sm:col-span-2">
          <input
            type="checkbox"
            checked={form.privacyAccepted}
            onChange={(event) => update("privacyAccepted", event.target.checked)}
            className="mt-1 h-5 w-5 rounded border-slate-300 text-brand focus:ring-brand"
          />
          <span>
            Ich habe den{" "}
            <Link href="/datenschutz" className="font-bold text-brand underline">
              Datenschutz-Hinweis
            </Link>{" "}
            gelesen und bin einverstanden, dass Hausvia meine Angaben zur Bearbeitung der Anfrage nutzt. Der finale
            Datenschutztext ist vor Veröffentlichung zu prüfen.
          </span>
        </label>
        <label className="flex gap-3 rounded-md bg-slate-50 p-4 text-sm leading-6 text-slate-700 sm:col-span-2">
          <input
            type="checkbox"
            checked={form.termsAccepted}
            onChange={(event) => update("termsAccepted", event.target.checked)}
            className="mt-1 h-5 w-5 rounded border-slate-300 text-brand focus:ring-brand"
          />
          <span>
            Ich akzeptiere die{" "}
            <Link href="/agb" className="font-bold text-brand underline">
              AGB
            </Link>{" "}
            von Hausvia. Die finalen AGB sind vor Veröffentlichung rechtlich zu prüfen.
          </span>
        </label>
      </div>

      {error ? (
        <p className="mt-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800" aria-live="polite">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-brand px-6 py-3 text-base font-bold text-white transition hover:bg-brand-dark disabled:cursor-wait disabled:opacity-70 sm:w-auto"
      >
        {submitting ? <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" /> : null}
        Anfrage senden
      </button>
    </form>
  );
}
