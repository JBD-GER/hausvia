import { createHash } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";

type StructuredLead = {
  source?: string;
  submittedAt?: string;
  submissionId?: string;
  submissionFingerprint?: string;
  lead: Record<string, unknown>;
};

export type FunnelLeadPersistenceResult = {
  customerId: string;
  leadId?: string;
  projectId: undefined;
  duplicate?: boolean;
  emailDeliveryCompleted?: boolean;
  submissionConflict?: boolean;
  canonicalSubmittedAt?: string;
};

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asStringList(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}

function asRecord(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function persistedPayload({ submittedAt, submissionId, submissionFingerprint, lead }: StructuredLead) {
  return {
    ...(submissionId ? { submissionId } : {}),
    ...(submissionFingerprint ? { submissionFingerprint } : {}),
    submittedAt,
    ...lead,
  };
}

function deterministicUuid(namespace: "customer" | "lead", submissionId: string) {
  const hash = createHash("sha256").update(`hausvia:${namespace}:${submissionId}`).digest("hex");
  const versioned = `${hash.slice(0, 12)}5${hash.slice(13, 16)}`;
  const variant = ((Number.parseInt(hash[16], 16) & 0x3) | 0x8).toString(16);
  const normalized = `${versioned}${variant}${hash.slice(17, 32)}`;
  return `${normalized.slice(0, 8)}-${normalized.slice(8, 12)}-${normalized.slice(12, 16)}-${normalized.slice(16, 20)}-${normalized.slice(20, 32)}`;
}

function existingLeadResult(
  existingLead: { id?: unknown; customer_id?: unknown; payload?: unknown },
  submissionFingerprint?: string,
): FunnelLeadPersistenceResult | null {
  if (typeof existingLead.id !== "string" || typeof existingLead.customer_id !== "string") return null;
  const existingPayload = asRecord(existingLead.payload);
  return {
    customerId: existingLead.customer_id,
    leadId: existingLead.id,
    projectId: undefined,
    duplicate: true,
    emailDeliveryCompleted: Boolean(existingPayload?.emailDeliveryCompletedAt),
    submissionConflict:
      typeof existingPayload?.submissionFingerprint === "string" &&
      Boolean(submissionFingerprint) &&
      existingPayload.submissionFingerprint !== submissionFingerprint,
    canonicalSubmittedAt: asString(existingPayload?.submittedAt) || undefined,
  };
}

export async function persistFunnelLead({
  source = "website",
  submittedAt,
  submissionId,
  submissionFingerprint,
  lead,
}: StructuredLead): Promise<FunnelLeadPersistenceResult | null> {
  if (!isSupabaseConfigured()) return null;

  const admin = createSupabaseAdminClient();
  const deterministicCustomerId = submissionId ? deterministicUuid("customer", submissionId) : "";
  const deterministicLeadId = submissionId ? deterministicUuid("lead", submissionId) : "";

  if (submissionId) {
    const { data: existingLeads, error: existingLeadError } = await admin
      .from("leads")
      .select("id, customer_id, payload")
      .contains("payload", { submissionId })
      .limit(1);

    if (existingLeadError) throw existingLeadError;
    const existingLead = existingLeads?.[0];
    if (existingLead) {
      const result = existingLeadResult(existingLead, submissionFingerprint);
      if (result) return result;
    }
  }

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

  const customerValues = {
      ...(deterministicCustomerId ? { id: deterministicCustomerId } : {}),
      status: "lead",
      company_name: companyName,
      contact_name: contactName,
      email,
      phone,
      billing_address: objectAddress,
      notes: "Automatisch aus dem Website-Funnel erstellt.",
    };
  const customerQuery = admin.from("customers");
  const { data: customer, error: customerError } = deterministicCustomerId
    ? await customerQuery.upsert(customerValues, { onConflict: "id" }).select("id").single()
    : await customerQuery.insert(customerValues).select("id").single();

  if (customerError || !customer?.id) throw customerError ?? new Error("Customer persistence failed");

  const { data: leadRow, error: leadError } = await admin
    .from("leads")
    .insert({
      ...(deterministicLeadId ? { id: deterministicLeadId } : {}),
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
      payload: persistedPayload({ submittedAt, submissionId, submissionFingerprint, lead }),
    })
    .select("id")
    .single();

  if (leadError || !leadRow?.id) {
    if (deterministicLeadId && leadError?.code === "23505") {
      const { data: existingLead, error: duplicateLookupError } = await admin
        .from("leads")
        .select("id, customer_id, payload")
        .eq("id", deterministicLeadId)
        .single();
      if (duplicateLookupError) throw duplicateLookupError;
      const result = existingLeadResult(existingLead, submissionFingerprint);
      if (result) return result;
    }
    throw leadError ?? new Error("Lead persistence failed");
  }

  return {
    customerId: customer.id as string,
    leadId: leadRow?.id as string | undefined,
    projectId: undefined,
  };
}

export async function markFunnelLeadEmailDeliveryCompleted({
  leadId,
  source = "website",
  submittedAt,
  submissionId,
  submissionFingerprint,
  lead,
}: StructuredLead & { leadId?: string }) {
  if (!leadId || !isSupabaseConfigured()) return;

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("leads")
    .update({
      payload: {
        ...persistedPayload({ source, submittedAt, submissionId, submissionFingerprint, lead }),
        emailDeliveryCompletedAt: new Date().toISOString(),
      },
    })
    .eq("id", leadId);

  if (error) throw error;
}
