import Link from "next/link";
import { ArrowLeft, SlidersHorizontal } from "lucide-react";
import { OfferEditor } from "@/components/portal/offers/OfferEditor";
import { offerCatalogItems, offerCustomerOptions, offerEditorItemFromCatalog } from "@/components/portal/offers/data";
import { PageHeader } from "@/components/portal/PortalUI";
import { requireAdminContext } from "@/lib/portal/access";

function isoDate(date: Date) {
  return date.toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function queryValue(params: Awaited<SearchParams>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function validUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizedService(value: unknown) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("de").replace(/[^a-z0-9]+/g, "");
}

export default async function NewAdminOfferPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const { admin: supabase } = await requireAdminContext();
  const leadId = queryValue(params, "leadId");
  const leadRequest = validUuid(leadId)
    ? supabase.from("leads").select("id,customer_id,company_name,contact_name,email,object_address,object_type,requested_services,frequency,desired_start_date,message").eq("id", leadId).maybeSingle()
    : Promise.resolve({ data: null, error: null });
  const [{ data: customers, error: customersError }, { data: catalog, error: catalogError }, { data: lead, error: leadError }] = await Promise.all([
    supabase
      .from("customers")
      .select("id,status,company_name,contact_name,first_name,last_name,email,phone,billing_address,billing_street,billing_house_number,billing_postal_code,billing_city,billing_country")
      .neq("status", "archived")
      .order("company_name", { ascending: true }),
    supabase
      .from("service_catalog")
      .select("id,service_key,name,category,customer_description,default_execution_rule,default_occurrences_per_period,default_seasonal,default_season_start_month,default_season_end_month,sort_order,service_pricing_rules(*)")
      .eq("status", "active")
      .order("sort_order", { ascending: true }),
    leadRequest,
  ]);
  if (customersError || catalogError || leadError) throw new Error("Die Daten für ein neues Angebot konnten nicht geladen werden.");
  const customerOptions = offerCustomerOptions(customers ?? []);
  const catalogItems = offerCatalogItems(catalog ?? []);
  const requestedCustomerId = queryValue(params, "customerId") || String(lead?.customer_id ?? "");
  const selectedCustomer = customerOptions.find((customer) => customer.id === requestedCustomerId);
  const requestedServices = Array.isArray(lead?.requested_services) ? lead.requested_services.map(normalizedService).filter(Boolean) : [];
  const leadItems = catalogItems.filter((item) => {
    const key = normalizedService(item.serviceKey);
    const name = normalizedService(item.name);
    return requestedServices.some((requested) => requested === key || name.includes(requested) || requested.includes(key));
  }).map((item, index) => offerEditorItemFromCatalog(item, `lead-${leadId}-${index + 1}`));

  const today = new Date();
  const validUntil = new Date(today);
  validUntil.setDate(validUntil.getDate() + 30);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link href="/admin/offers" className="inline-flex min-h-11 items-center gap-2 text-sm font-extrabold text-brand hover:underline">
          <ArrowLeft size={18} aria-hidden="true" /> Zur Angebotsübersicht
        </Link>
        <Link href="/admin/offers/pricing" className="inline-flex min-h-11 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-extrabold text-slate-800 hover:border-brand hover:text-brand">
          <SlidersHorizontal size={17} aria-hidden="true" /> Preisregeln verwalten
        </Link>
      </div>
      <PageHeader
        eyebrow="Neues Angebot"
        title="Leistungsangebot zusammenstellen"
        text="Kunde und Angebotsrahmen erfassen, Leistungen aus dem Katalog hinzufügen und alle Abrechnungsarten transparent kalkulieren. Eine Immobilie wird erst nach der Annahme zugeordnet."
      />
      {queryValue(params, "status") ? <p role="status" className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-900">{queryValue(params, "status")}</p> : null}
      {queryValue(params, "error") ? <p role="alert" className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-900">{queryValue(params, "error")}</p> : null}
      {lead ? <p className="mb-5 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm font-bold text-blue-950">Die Funnel-Anfrage wurde vorbefüllt{leadItems.length ? `; ${leadItems.length} passende Katalogleistung${leadItems.length === 1 ? "" : "en"} wurde${leadItems.length === 1 ? "" : "n"} hinzugefügt` : ""}. Bitte Leistungsumfang, Mengen und Preise fachlich prüfen.</p> : null}
      <OfferEditor
        customers={customerOptions}
        catalog={catalogItems}
        initial={{
          customerId: selectedCustomer?.id ?? "",
          title: lead?.object_type ? `Angebot für ${lead.object_type}` : "Angebot für Objektbetreuung",
          contactName: selectedCustomer?.contactName || String(lead?.contact_name ?? ""),
          recipientSnapshot: selectedCustomer?.snapshot ?? { email: String(lead?.email ?? ""), recipient_name: String(lead?.company_name || lead?.contact_name || ""), country: "Deutschland" },
          objectLabel: "",
          objectAddress: String(lead?.object_address ?? ""),
          offerDate: isoDate(today),
          validUntil: isoDate(validUntil),
          plannedStartDate: String(lead?.desired_start_date ?? ""),
          intro: lead?.message ? `Vielen Dank für Ihre Anfrage. Gern bieten wir Ihnen die nachfolgend aufgeführten Leistungen an.\n\nIhre Anfrage: ${lead.message}` : "Vielen Dank für Ihre Anfrage. Gern bieten wir Ihnen die nachfolgend aufgeführten Leistungen an.",
          visibleNote: "Die genaue Einsatzplanung stimmen wir nach Annahme gemeinsam mit Ihnen ab.",
          internalNote: "",
          paymentTerms: "Zahlbar ohne Abzug gemäß der bei den Positionen ausgewiesenen Abrechnungsbasis.",
          contractTerms: "Das Angebot ist bis zum genannten Datum gültig. Leistungsbeginn und Objektzugang werden nach Annahme abgestimmt.",
          items: leadItems,
          overallDiscounts: [],
        }}
      />
    </>
  );
}
