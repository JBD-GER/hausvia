import { updateCompanySettingsAction } from "@/app/actions/portalAdmin";
import { PortalTabs } from "@/components/portal/PortalTabs";
import {
  Field,
  PageHeader,
  Panel,
  buttonClass,
  inputClass,
} from "@/components/portal/PortalUI";
import { formatCents } from "@/lib/portal/core";
import { validateCompanySettings } from "@/lib/monthlyBilling";
import { requireAdminContext } from "@/lib/portal/access";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function queryValue(params: Awaited<SearchParams>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const { admin: supabase } = await requireAdminContext();
  const { data: settings } = await supabase
    .from("company_settings")
    .select("*")
    .eq("id", true)
    .maybeSingle();
  const validation = validateCompanySettings(settings);
  const hourlyRateCents = Number(settings?.default_hourly_rate_cents ?? 6000);
  const requestedView = queryValue(params, "view");
  const activeView = ["company", "billing", "automation"].includes(requestedView)
    ? requestedView
    : "company";

  return (
    <>
      <PageHeader
        eyebrow="Systemeinstellungen"
        title="Unternehmen und Abrechnung"
        text="Zentrale Pflichtangaben für Monatsrechnungen, PDF-Erstellung und Versand. Fehlende Angaben blockieren den automatischen Versand sicher."
      />

      {queryValue(params, "status") ? (
        <p
          role="status"
          className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-900"
        >
          {queryValue(params, "status")}
        </p>
      ) : null}
      {queryValue(params, "error") ? (
        <p
          role="alert"
          className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-900"
        >
          {queryValue(params, "error")}
        </p>
      ) : null}

      {!validation.valid ? (
        <div className="mb-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-extrabold">
            Automatischer Rechnungsversand noch gesperrt
          </p>
          <p className="mt-1 leading-6">
            Es fehlen: {validation.missing.join(", ")}. Rechnungsentwürfe werden
            bei unvollständigen Pflichtangaben nicht versendet; der Admin erhält
            stattdessen eine Benachrichtigung.
          </p>
        </div>
      ) : (
        <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-900">
          Die zentralen Pflichtangaben für den Rechnungsversand sind
          vollständig.
        </div>
      )}

      <PortalTabs
        activeId={activeView}
        label="Einstellungsbereiche"
        items={[
          { id: "company", label: "Unternehmen", href: "/admin/settings?view=company" },
          { id: "billing", label: "Bank & Abrechnung", href: "/admin/settings?view=billing" },
          { id: "automation", label: "Automationen", href: "/admin/settings?view=automation" },
        ]}
      />

      <form action={updateCompanySettingsAction} noValidate className="grid gap-5">
        <input type="hidden" name="returnView" value={activeView} />
        <Panel title="Rechnungsaussteller" className={activeView === "company" ? "" : "hidden"}>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Rechtlicher Firmenname">
              <input
                name="legalName"
                required
                defaultValue={settings?.legal_name ?? "Flaaq Holding GmbH"}
                className={inputClass}
              />
            </Field>
            <Field label="Markenname">
              <input
                name="brandName"
                required
                defaultValue={settings?.brand_name ?? "Hausvia"}
                className={inputClass}
              />
            </Field>
            <Field label="Geschäftsführung">
              <input
                name="management"
                defaultValue={settings?.management ?? ""}
                className={inputClass}
              />
            </Field>
            <Field label="Handelsregister">
              <input
                name="commercialRegister"
                defaultValue={settings?.commercial_register ?? ""}
                className={inputClass}
              />
            </Field>
            <Field label="Straße">
              <input
                name="street"
                defaultValue={settings?.street ?? ""}
                className={inputClass}
              />
            </Field>
            <Field label="Hausnummer">
              <input
                name="houseNumber"
                defaultValue={settings?.house_number ?? ""}
                className={inputClass}
              />
            </Field>
            <Field label="Postleitzahl">
              <input
                name="postalCode"
                defaultValue={settings?.postal_code ?? ""}
                className={inputClass}
              />
            </Field>
            <Field label="Ort">
              <input
                name="city"
                defaultValue={settings?.city ?? ""}
                className={inputClass}
              />
            </Field>
            <Field label="Land">
              <input
                name="country"
                required
                defaultValue={settings?.country ?? "Deutschland"}
                className={inputClass}
              />
            </Field>
            <Field label="Steuernummer">
              <input
                name="taxNumber"
                defaultValue={settings?.tax_number ?? ""}
                className={inputClass}
              />
            </Field>
            <Field label="Umsatzsteuer-ID">
              <input
                name="vatId"
                defaultValue={settings?.vat_id ?? ""}
                className={inputClass}
              />
            </Field>
            <Field label="Telefon">
              <input
                name="phone"
                type="tel"
                defaultValue={settings?.phone ?? ""}
                className={inputClass}
              />
            </Field>
            <Field label="Unternehmens-E-Mail">
              <input
                name="email"
                type="email"
                required
                defaultValue={settings?.email ?? "info@hausvia.de"}
                className={inputClass}
              />
            </Field>
          </div>
        </Panel>

        <Panel title="Bank und Rechnungslauf" className={activeView === "billing" ? "" : "hidden"}>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Bankname">
              <input
                name="bankName"
                defaultValue={settings?.bank_name ?? ""}
                className={inputClass}
              />
            </Field>
            <Field label="IBAN">
              <input
                name="iban"
                defaultValue={settings?.iban ?? ""}
                className={inputClass}
              />
            </Field>
            <Field label="BIC">
              <input
                name="bic"
                defaultValue={settings?.bic ?? ""}
                className={inputClass}
              />
            </Field>
            <Field label="Zahlungsziel in Tagen">
              <input
                name="paymentDueDays"
                type="number"
                min="0"
                max="365"
                required
                defaultValue={settings?.payment_due_days ?? 14}
                className={inputClass}
              />
            </Field>
            <Field label="Rechnungspräfix">
              <input
                name="invoicePrefix"
                required
                defaultValue={settings?.invoice_prefix ?? "HV"}
                className={inputClass}
              />
            </Field>
            <Field label="Standard-Umsatzsteuer in %">
              <input
                name="defaultTaxRate"
                inputMode="decimal"
                required
                defaultValue={
                  Number(settings?.default_tax_rate_bps ?? 1900) / 100
                }
                className={inputClass}
              />
            </Field>
            <Field label="Standard-Stundensatz netto">
              <input
                name="defaultHourlyRate"
                inputMode="decimal"
                required
                defaultValue={(hourlyRateCents / 100)
                  .toFixed(2)
                  .replace(".", ",")}
                className={inputClass}
              />
            </Field>
            <div className="self-end rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
              Aktuell: <strong>{formatCents(hourlyRateCents)}</strong> netto pro
              Stunde
            </div>
            <Field label="Absenderadresse Rechnungen">
              <input
                name="invoiceEmailFrom"
                type="email"
                required
                defaultValue={settings?.invoice_email_from ?? "info@hausvia.de"}
                className={inputClass}
              />
            </Field>
            <Field label="Antwortadresse Rechnungen">
              <input
                name="invoiceEmailReplyTo"
                type="email"
                required
                defaultValue={
                  settings?.invoice_email_reply_to ?? "info@hausvia.de"
                }
                className={inputClass}
              />
            </Field>
          </div>
        </Panel>

        <Panel title="Automationen und sichere Dateien" className={activeView === "automation" ? "" : "hidden"}>
          <div className="grid gap-3 text-sm leading-6 text-slate-700 md:grid-cols-3">
            <div className="rounded-lg bg-slate-50 p-4">
              <p className="font-extrabold text-slate-950">Monatsrechnung</p>
              <p>
                Täglicher Berliner Prüflauf; erstellt am Monatsersten den
                Vormonat idempotent.
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 p-4">
              <p className="font-extrabold text-slate-950">Terminbildung</p>
              <p>
                Rollierende, duplikatfreie Vorausplanung für 366 Tage –
                inklusive saisonaler Leistungen, Checklisten und offener
                Schadensmeldungen.
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 p-4">
              <p className="font-extrabold text-slate-950">Dokumente</p>
              <p>
                Rechnungsoriginale und interne Anlagen liegen privat und werden
                autorisiert abgerufen.
              </p>
            </div>
          </div>
        </Panel>

        {activeView !== "automation" ? (
          <button className={`${buttonClass} justify-self-start px-6`}>
            Einstellungen speichern
          </button>
        ) : null}
      </form>
    </>
  );
}
