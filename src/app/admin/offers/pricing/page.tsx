import Link from "next/link";
import { ArrowLeft, Calculator, Search } from "lucide-react";
import { saveServicePricingRuleAction } from "@/app/actions/offers";
import { offerCalculationTypeLabels, offerBillingTypeLabels } from "@/components/portal/offers/types";
import { CompactSection, EmptyState, Field, PageHeader, buttonClass, inputClass } from "@/components/portal/PortalUI";
import { requireAdminContext } from "@/lib/portal/access";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type UnknownRow = Record<string, unknown>;

function queryValue(params: Awaited<SearchParams>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : value == null ? fallback : String(value);
}

function relation(value: unknown): UnknownRow {
  if (Array.isArray(value)) return relation(value[0]);
  return value && typeof value === "object" ? value as UnknownRow : {};
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function euroInput(value: unknown) {
  return (numberValue(value) / 100).toFixed(2).replace(".", ",");
}

const moneyInputClass = `${inputClass} tabular-nums`;

function MoneyField({ label, name, value, help }: { label: string; name: string; value: unknown; help?: string }) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-slate-800">{label}</span>
      <div className="relative"><input name={name} required inputMode="decimal" defaultValue={euroInput(value)} className={`${moneyInputClass} pr-10`} /><span className="pointer-events-none absolute right-3 top-1/2 mt-1 -translate-y-1/2 text-sm font-bold text-slate-500">€</span></div>
      {help ? <span className="mt-1 block text-xs leading-5 text-slate-500">{help}</span> : null}
    </label>
  );
}

export default async function OfferPricingRulesPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const search = queryValue(params, "q").trim().toLocaleLowerCase("de");
  const category = queryValue(params, "category");
  const { admin: supabase } = await requireAdminContext();
  const { data: catalog, error } = await supabase
    .from("service_catalog")
    .select("id,service_key,name,category,customer_description,status,sort_order,service_pricing_rules(*)")
    .eq("status", "active")
    .order("sort_order", { ascending: true });
  if (error) throw new Error("Die Kalkulationsregeln konnten nicht geladen werden.");
  const categories = Array.from(new Set((catalog ?? []).map((item) => text(item.category, "Weitere Leistungen")))).sort((left, right) => left.localeCompare(right, "de"));
  const visible = (catalog ?? []).filter((item) => {
    const haystack = `${text(item.name)} ${text(item.category)} ${text(item.customer_description)}`.toLocaleLowerCase("de");
    return (!search || haystack.includes(search)) && (!category || text(item.category) === category);
  });

  return (
    <>
      <div className="mb-4"><Link href="/admin/offers" className="inline-flex min-h-11 items-center gap-2 text-sm font-extrabold text-brand hover:underline"><ArrowLeft size={18} aria-hidden="true" /> Zur Angebotsübersicht</Link></div>
      <PageHeader eyebrow="Kalkulation" title="Preisregeln im Leistungskatalog" text="Jede Leistung hat eine eigene, administrierbare Kalkulationsregel. Es gibt keinen universellen Festpreis; Änderungen gelten für neue oder neu berechnete Entwürfe, nicht für bereits versiegelte Angebotsversionen." />

      {queryValue(params, "status") ? <p role="status" className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-900">{queryValue(params, "status")}</p> : null}
      {queryValue(params, "error") ? <p role="alert" className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-900">{queryValue(params, "error")}</p> : null}

      <CompactSection title="Katalog durchsuchen" description="Leistung oder Kategorie eingrenzen" className="mb-5">
        <form method="get" className="grid gap-3 sm:grid-cols-[1.4fr_0.8fr_auto] sm:items-end">
          <Field label="Leistung suchen"><div className="relative"><Search size={17} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 mt-1 -translate-y-1/2 text-slate-400" /><input name="q" defaultValue={queryValue(params, "q")} placeholder="Name, Kategorie, Beschreibung …" className={`${inputClass} pl-10`} /></div></Field>
          <Field label="Kategorie"><select name="category" defaultValue={category} className={inputClass}><option value="">Alle Kategorien</option>{categories.map((entry) => <option key={entry}>{entry}</option>)}</select></Field>
          <div className="flex gap-2"><button className={buttonClass}>Anwenden</button><Link href="/admin/offers/pricing" className="inline-flex min-h-11 items-center text-sm font-bold text-brand underline">Zurücksetzen</Link></div>
        </form>
      </CompactSection>

      {visible.length ? (
        <div className="grid gap-4">
          {visible.map((catalogItem, index) => {
            const rule = relation(catalogItem.service_pricing_rules);
            const winter = text(catalogItem.service_key) === "winterdienst" || Boolean(rule.winter_model);
            return (
              <details key={catalogItem.id} className="group rounded-xl border border-slate-200 bg-white shadow-sm" open={visible.length <= 3 || index === 0}>
                <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand sm:px-5">
                  <div className="min-w-0"><p className="text-xs font-extrabold uppercase tracking-wide text-brand">{text(catalogItem.category, "Leistung")}</p><h2 className="mt-1 truncate text-lg font-extrabold text-slate-950">{text(catalogItem.name)}</h2></div>
                  <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-650 group-open:border-brand/20 group-open:bg-brand-soft group-open:text-brand">{rule.id ? "Regel bearbeiten" : "Regel einrichten"}</span>
                </summary>
                <form action={saveServicePricingRuleAction} className="border-t border-slate-200 p-4 sm:p-5">
                  <input type="hidden" name="serviceCatalogId" value={text(catalogItem.id)} />
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <label className="block"><span className="text-sm font-bold text-slate-800">Berechnungsmodell</span><select name="calculationType" defaultValue={text(rule.calculation_type, winter ? "per_visit" : "base_plus_area")} className={inputClass}>{Object.entries(offerCalculationTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                    <label className="block"><span className="text-sm font-bold text-slate-800">Standard-Abrechnungsart</span><select name="defaultBillingType" defaultValue={text(rule.default_billing_type, winter ? "per_visit" : "monthly")} className={inputClass}>{Object.entries(offerBillingTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                    <label className="block"><span className="text-sm font-bold text-slate-800">Frequenzfaktor</span><input name="frequencyFactor" required inputMode="decimal" defaultValue={text(rule.frequency_factor, "1").replace(".", ",")} className={inputClass} /><span className="mt-1 block text-xs leading-5 text-slate-500">1,00 = 100 %; beeinflusst alle Preisbestandteile.</span></label>
                    <label className="block"><span className="text-sm font-bold text-slate-800">Saisonaler Zuschlag</span><div className="relative"><input name="seasonalSurchargePercent" required inputMode="decimal" defaultValue={(numberValue(rule.seasonal_surcharge_bps) / 100).toString().replace(".", ",")} className={`${inputClass} pr-10`} /><span className="pointer-events-none absolute right-3 top-1/2 mt-1 -translate-y-1/2 text-sm font-bold text-slate-500">%</span></div></label>
                    <MoneyField label="Grundpreis" name="basePrice" value={rule.base_price_cents} />
                    <MoneyField label="Preis je m²" name="pricePerSqm" value={rule.price_per_sqm_cents} />
                    <MoneyField label="Mindestpreis" name="minimumPrice" value={rule.minimum_price_cents} />
                    <MoneyField label="Preis je Einsatz" name="pricePerVisit" value={rule.price_per_visit_cents} />
                    <MoneyField label="Preis je Stunde" name="pricePerHour" value={rule.price_per_hour_cents} />
                    <MoneyField label="Preis je Einheit" name="unitPrice" value={rule.unit_price_cents} />
                    <MoneyField label="Materialpauschale" name="materialFlatFee" value={rule.material_flat_fee_cents} />
                  </div>

                  <div className={`mt-5 rounded-xl border p-4 ${winter ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-slate-50"}`}>
                    <div className="flex items-center gap-2"><Calculator size={18} aria-hidden="true" className={winter ? "text-blue-700" : "text-slate-500"} /><h3 className="font-extrabold text-slate-950">Winterdienst-Konditionen</h3></div>
                    <p className="mt-1 text-xs leading-5 text-slate-600">Bei normalen Leistungen können diese Werte auf 0 bleiben.</p>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                      <label className="block"><span className="text-sm font-bold text-slate-800">Standard-Wintermodell</span><select name="winterModel" defaultValue={text(rule.winter_model)} className={inputClass}><option value="">Kein Wintermodell</option><option value="seasonal_flat">Saisonpauschale</option><option value="monthly_plus_visit">Monatliche Grundgebühr + Einsatz</option><option value="per_visit">Je Einsatz</option><option value="custom_flat">Individuelle Pauschale</option></select></label>
                      <label className="block"><span className="text-sm font-bold text-slate-800">Inklusive Einsätze</span><input name="includedVisits" type="number" min="0" step="1" required defaultValue={numberValue(rule.included_visits)} className={inputClass} /></label>
                      <MoneyField label="Weiterer Einsatz" name="additionalVisitPrice" value={rule.additional_visit_price_cents} />
                      <MoneyField label="Monatliche Grundgebühr" name="monthlyBaseFee" value={rule.monthly_base_fee_cents} />
                      <MoneyField label="Saisonpauschale" name="seasonalFlatRate" value={rule.seasonal_flat_rate_cents} />
                    </div>
                  </div>

                  <label className="mt-5 block"><span className="text-sm font-bold text-slate-800">Interne Formel-/Regelnotiz</span><textarea name="customFormula" rows={3} maxLength={1000} defaultValue={text(rule.custom_formula)} placeholder="Optional: fachliche Dokumentation einer individuellen Kalkulationslogik" className={inputClass} /><span className="mt-1 block text-xs leading-5 text-slate-500">Dokumentiert Sonderlogik. Die ausführbaren Parameter oben bleiben die serverseitige Preisgrundlage.</span></label>
                  <div className="mt-5 flex justify-end"><button className={buttonClass}>Preisregel speichern</button></div>
                </form>
              </details>
            );
          })}
        </div>
      ) : <EmptyState title="Keine Leistungen gefunden" text="Passen Sie Suche oder Kategorie an." />}
    </>
  );
}
