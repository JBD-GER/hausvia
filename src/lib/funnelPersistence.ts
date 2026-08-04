import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createDocumentNumber } from "@/lib/commerce";

type StructuredLead = {
  source?: string;
  submittedAt?: string;
  lead: Record<string, unknown>;
};

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function asStringList(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}

function intervalUnitForFrequency(frequency: string) {
  const normalized = frequency.toLowerCase();
  if (normalized.includes("woche")) return "weekly";
  if (normalized.includes("einmal")) return "one_time";
  if (normalized.includes("monat")) return "monthly";
  if (normalized.includes("täglich") || normalized.includes("werktäglich")) return "daily";
  return "custom";
}

function billingModeForFrequency(frequency: string) {
  const unit = intervalUnitForFrequency(frequency);
  if (unit === "one_time") return "one_time";
  if (unit === "monthly") return "monthly";
  if (unit === "weekly" || unit === "daily") return "monthly";
  return "custom";
}

export async function persistFunnelLead({ source = "website", submittedAt, lead }: StructuredLead) {
  if (!isSupabaseConfigured()) return null;

  const admin = createSupabaseAdminClient();
  const companyName = asString(lead.company || lead.companyName);
  const contactName = asString(lead.name || lead.contactName);
  const email = asString(lead.email);
  const phone = asString(lead.phone);
  const objectAddress = asString(lead.objectAddress || lead.location);
  const objectType = asString(lead.objectTypeLabel || lead.objectType);
  const frequency = asString(lead.frequencyLabel || lead.frequency);
  const message = asString(lead.message);
  const requestedServices = asStringList(lead.selectedServiceLabels).length
    ? asStringList(lead.selectedServiceLabels)
    : asStringList(lead.services);
  const estimate = lead.estimate && typeof lead.estimate === "object" ? (lead.estimate as Record<string, unknown>) : null;

  const { data: customer, error: customerError } = await admin
    .from("customers")
    .insert({
      status: "lead",
      company_name: companyName,
      contact_name: contactName,
      email,
      phone,
      billing_address: objectAddress,
      notes: "Automatisch aus dem Website-Funnel erstellt.",
    })
    .select("id")
    .single();

  if (customerError || !customer?.id) throw customerError;

  const { data: leadRow } = await admin
    .from("leads")
    .insert({
      customer_id: customer.id,
      source,
      status: "new",
      company_name: companyName,
      contact_name: contactName,
      email,
      phone,
      object_address: objectAddress,
      object_type: objectType,
      requested_services: requestedServices,
      frequency,
      desired_start_date: asString(lead.desiredStartDate) || null,
      preferred_callback_time: asString(lead.preferredCallbackTime),
      message,
      estimate,
      payload: {
        submittedAt,
        ...lead,
      },
    })
    .select("id")
    .single();

  const isStandaloneWinterRequest = !estimate && requestedServices.includes("Winterdienst");
  if (estimate?.pricingModel === "winter-season-plus-deployment" || isStandaloneWinterRequest) {
    return {
      customerId: customer.id as string,
      leadId: leadRow?.id as string | undefined,
      projectId: undefined,
    };
  }

  const lower = asNumber(estimate?.lower);
  const upper = asNumber(estimate?.upper);
  const grossTotal = lower && upper ? (lower + upper) / 2 : 0;
  const netTotal = grossTotal ? grossTotal / 1.19 : 0;
  const taxTotal = grossTotal - netTotal;

  const { data: offer } = await admin
    .from("offers")
    .insert({
      customer_id: customer.id,
      project_id: null,
      status: "draft",
      offer_number: createDocumentNumber("ANG", leadRow?.id),
      title: `Angebot für ${objectType || "Hausmeisterservice und Objektbetreuung"}`,
      intro:
        "Vielen Dank für Ihre Anfrage. Auf Grundlage der übermittelten Objekt- und Leistungsdaten haben wir folgendes Angebot für die Betreuung vorbereitet.",
      closing_text:
        "Nach Annahme des Angebots stimmen wir Objektzugang, Leistungsbeginn, feste Ansprechpartner und die operative Übergabe gemeinsam ab.",
      net_total: netTotal,
      tax_rate: 19,
      tax_total: taxTotal,
      gross_total: grossTotal,
      billing_mode: billingModeForFrequency(frequency),
      billing_interval_label: frequency || "nach Vereinbarung",
      billing_in_advance: billingModeForFrequency(frequency) !== "one_time",
      payment_due_days_before_month_end: 15,
      admin_notes:
        "Aus Funnel-Anfrage vorbereitet. Vor Versand bitte Positionen, Preis, Leistungsumfang und Abrechnung final prüfen.",
    })
    .select("id")
    .single();

  if (offer?.id) {
    const servicesForOffer = requestedServices.length ? requestedServices : ["Objektbetreuung laut Funnel-Anfrage"];
    const unitNet = servicesForOffer.length ? netTotal / servicesForOffer.length : netTotal;
    const unit = billingModeForFrequency(frequency) === "one_time" ? "Pauschale" : "Monat";

    await admin.from("offer_items").insert(
      servicesForOffer.map((service, index) => ({
        offer_id: offer.id,
        title: service,
        description: `${frequency || "nach Vereinbarung"} · aus Funnel-Auswahl vorbereitet · Objekt: ${
          objectAddress || "Adresse prüfen"
        }`,
        quantity: 1,
        unit,
        unit_net: unitNet,
        total_net: unitNet,
        sort_order: index,
      })),
    );
  }

  return {
    customerId: customer.id as string,
    leadId: leadRow?.id as string | undefined,
    projectId: undefined,
  };
}
