"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  buildPersistableOfferPayload,
  copyOfferVersionToRawDraft,
  rawOfferDraftSchema,
  type RawOfferDraft,
  type ServicePricingRuleRow,
} from "@/lib/offerDraftPayload";
import {
  getOfferVersionDocument,
  validateOfferIssuerSnapshot,
} from "@/lib/offerDocuments";
import { processOfferAcceptanceDelivery } from "@/lib/offerAcceptanceDelivery";
import {
  offerContentSha256,
  offerPdfSha256,
  offerVersionStoragePath,
  verifyOfferPdfSha256,
} from "@/lib/offerIntegrity";
import { sendPortalDocumentEmail } from "@/lib/mail";
import { parseEuroToCentsStrict } from "@/lib/portal/core";
import { SITE } from "@/lib/site";
import { requireProfile } from "@/lib/supabase/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type JsonRecord = Record<string, unknown>;

const uuidSchema = z.string().uuid();

function formText(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function go(path: string, key: "error" | "status", message: string): never {
  const separator = path.includes("?") ? "&" : "?";
  redirect(`${path}${separator}${key}=${encodeURIComponent(message)}`);
}

function offerDetailPath(
  offerId: string,
  versionId: string,
  view: "overview" | "content" | "history" | "decision" = "overview",
) {
  const version = uuidSchema.safeParse(versionId).success
    ? `version=${encodeURIComponent(versionId)}&`
    : "";
  return `/admin/offers/${offerId}?${version}view=${encodeURIComponent(view)}`;
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message?: unknown }).message ?? "").trim();
    if (message) return message;
  }
  return fallback;
}

function jsonRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function firstRpcObject(value: unknown) {
  if (Array.isArray(value)) return jsonRecord(value[0]);
  return jsonRecord(value);
}

async function pricingRulesForDraft(admin: ReturnType<typeof createSupabaseAdminClient>, draft: RawOfferDraft) {
  const catalogIds = [...new Set(draft.items.map((item) => item.service_catalog_id).filter(Boolean))] as string[];
  if (!catalogIds.length) return [] as ServicePricingRuleRow[];
  const { data, error } = await admin
    .from("service_pricing_rules")
    .select(
      "service_catalog_id,calculation_type,default_billing_type,base_price_cents,price_per_sqm_cents,minimum_price_cents,price_per_visit_cents,price_per_hour_cents,unit_price_cents,frequency_factor,seasonal_surcharge_bps,material_flat_fee_cents,winter_model,included_visits,additional_visit_price_cents,monthly_base_fee_cents,seasonal_flat_rate_cents,custom_formula",
    )
    .in("service_catalog_id", catalogIds)
    .eq("is_active", true);
  if (error) throw new Error("Die Kalkulationsregeln konnten nicht geladen werden.");
  return (data ?? []) as ServicePricingRuleRow[];
}

async function persistOfferDraft({
  draft,
  offerId,
  expectedUpdatedAt,
}: {
  draft: RawOfferDraft;
  offerId?: string | null;
  expectedUpdatedAt?: string | null;
}) {
  const admin = createSupabaseAdminClient();
  const rules = await pricingRulesForDraft(admin, draft);
  const payload = buildPersistableOfferPayload(draft, rules);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("save_offer_draft", {
    p_offer_id: offerId || null,
    p_expected_updated_at: expectedUpdatedAt || null,
    p_payload: payload,
  });
  if (error) throw error;
  const saved = firstRpcObject(data);
  const savedOfferId = String(saved.offer_id || "");
  const savedVersionId = String(saved.offer_version_id || "");
  if (!uuidSchema.safeParse(savedOfferId).success || !uuidSchema.safeParse(savedVersionId).success) {
    throw new Error("Das Angebot wurde nicht vollständig gespeichert.");
  }
  return { offerId: savedOfferId, versionId: savedVersionId };
}

export async function saveOfferDraftAction(formData: FormData) {
  await requireProfile(["admin"]);
  const offerId = formText(formData, "offerId") || null;
  const versionId = formText(formData, "versionId");
  const fallback = offerId
    ? offerDetailPath(offerId, versionId, "content")
    : "/admin/offers/new";
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(formText(formData, "payload"));
  } catch {
    go(fallback, "error", "Die Entwurfsdaten sind unvollständig.");
  }
  const parsed = rawOfferDraftSchema.safeParse(parsedJson);
  if (!parsed.success) {
    go(fallback, "error", parsed.error.issues[0]?.message || "Bitte prüfen Sie die Angebotsdaten.");
  }

  let saved: Awaited<ReturnType<typeof persistOfferDraft>>;
  try {
    saved = await persistOfferDraft({
      draft: parsed.data,
      offerId,
      expectedUpdatedAt: formText(formData, "expectedUpdatedAt") || null,
    });
  } catch (error) {
    go(fallback, "error", errorMessage(error, "Das Angebot konnte nicht gespeichert werden."));
  }
  revalidatePath("/admin/offers");
  revalidatePath(`/admin/offers/${saved.offerId}`);
  go(
    offerDetailPath(saved.offerId, saved.versionId, "content"),
    "status",
    "Entwurf gespeichert.",
  );
}

const pricingRuleFormSchema = z.object({
  serviceCatalogId: z.string().uuid(),
  calculationType: z.enum(["base_plus_area", "per_unit", "per_hour", "per_visit", "flat", "custom"]),
  defaultBillingType: z.enum(["one_time", "monthly", "per_visit", "per_hour", "per_sqm", "custom_flat"]),
  basePriceCents: z.number().int().min(0),
  pricePerSqmCents: z.number().int().min(0),
  minimumPriceCents: z.number().int().min(0),
  pricePerVisitCents: z.number().int().min(0),
  pricePerHourCents: z.number().int().min(0),
  unitPriceCents: z.number().int().min(0),
  frequencyFactor: z.number().min(0).max(100),
  seasonalSurchargeBps: z.number().int().min(0).max(100_000),
  materialFlatFeeCents: z.number().int().min(0),
  winterModel: z.enum(["seasonal_flat", "monthly_plus_visit", "per_visit", "custom_flat"]).nullable(),
  includedVisits: z.number().int().min(0),
  additionalVisitPriceCents: z.number().int().min(0),
  monthlyBaseFeeCents: z.number().int().min(0),
  seasonalFlatRateCents: z.number().int().min(0),
  customFormula: z.string().trim().max(1_000).nullable(),
});

function numberInput(formData: FormData, key: string, fallback = 0) {
  const value = Number(formText(formData, key).replace(",", "."));
  return Number.isFinite(value) ? value : fallback;
}

function strictEuroToCents(value: unknown) {
  return parseEuroToCentsStrict(value) ?? Number.NaN;
}

export async function saveServicePricingRuleAction(formData: FormData) {
  const profile = await requireProfile(["admin"]);
  const parsed = pricingRuleFormSchema.safeParse({
    serviceCatalogId: formText(formData, "serviceCatalogId"),
    calculationType: formText(formData, "calculationType") || "base_plus_area",
    defaultBillingType: formText(formData, "defaultBillingType") || "monthly",
    basePriceCents: strictEuroToCents(formText(formData, "basePrice")),
    pricePerSqmCents: strictEuroToCents(formText(formData, "pricePerSqm")),
    minimumPriceCents: strictEuroToCents(formText(formData, "minimumPrice")),
    pricePerVisitCents: strictEuroToCents(formText(formData, "pricePerVisit")),
    pricePerHourCents: strictEuroToCents(formText(formData, "pricePerHour")),
    unitPriceCents: strictEuroToCents(formText(formData, "unitPrice")),
    frequencyFactor: numberInput(formData, "frequencyFactor", 1),
    seasonalSurchargeBps: Math.round(numberInput(formData, "seasonalSurchargePercent") * 100),
    materialFlatFeeCents: strictEuroToCents(formText(formData, "materialFlatFee")),
    winterModel: optionalString(formData.get("winterModel")),
    includedVisits: Math.round(numberInput(formData, "includedVisits")),
    additionalVisitPriceCents: strictEuroToCents(formText(formData, "additionalVisitPrice")),
    monthlyBaseFeeCents: strictEuroToCents(formText(formData, "monthlyBaseFee")),
    seasonalFlatRateCents: strictEuroToCents(formText(formData, "seasonalFlatRate")),
    customFormula: optionalString(formData.get("customFormula")),
  });
  if (!parsed.success) {
    go("/admin/offers/pricing", "error", parsed.error.issues[0]?.message || "Ungültige Kalkulationsregel.");
  }
  const value = parsed.data;
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("service_pricing_rules").upsert(
    {
      service_catalog_id: value.serviceCatalogId,
      calculation_type: value.calculationType,
      default_billing_type: value.defaultBillingType,
      base_price_cents: value.basePriceCents,
      price_per_sqm_cents: value.pricePerSqmCents,
      minimum_price_cents: value.minimumPriceCents,
      price_per_visit_cents: value.pricePerVisitCents,
      price_per_hour_cents: value.pricePerHourCents,
      unit_price_cents: value.unitPriceCents,
      frequency_factor: value.frequencyFactor,
      seasonal_surcharge_bps: value.seasonalSurchargeBps,
      material_flat_fee_cents: value.materialFlatFeeCents,
      winter_model: value.winterModel,
      included_visits: value.includedVisits,
      additional_visit_price_cents: value.additionalVisitPriceCents,
      monthly_base_fee_cents: value.monthlyBaseFeeCents,
      seasonal_flat_rate_cents: value.seasonalFlatRateCents,
      custom_formula: value.customFormula,
      is_active: true,
      updated_by: profile.id,
    },
    { onConflict: "service_catalog_id" },
  );
  if (error) go("/admin/offers/pricing", "error", "Die Kalkulationsregel konnte nicht gespeichert werden.");
  revalidatePath("/admin/offers/pricing");
  revalidatePath("/admin/offers/new");
  go("/admin/offers/pricing", "status", "Kalkulationsregel gespeichert.");
}

async function offerContentForHash(admin: ReturnType<typeof createSupabaseAdminClient>, versionId: string) {
  const [{ data: version, error: versionError }, { data: items, error: itemsError }, { data: discounts, error: discountsError }] =
    await Promise.all([
      admin.from("offer_versions").select("*").eq("id", versionId).single(),
      admin.from("offer_version_items").select("*").eq("offer_version_id", versionId).order("sort_order"),
      admin.from("offer_discounts").select("*").eq("offer_version_id", versionId).order("sort_order"),
    ]);
  if (versionError || itemsError || discountsError || !version) {
    throw new Error("Der unveränderliche Angebotsinhalt konnte nicht geladen werden.");
  }
  const mutableVersionFields = new Set([
    "lifecycle_status",
    "frozen_at",
    "sent_at",
    "viewed_at",
    "accepted_at",
    "rejected_at",
    "withdrawn_at",
    "withdrawal_reason",
    "superseded_at",
    "original_pdf_bucket",
    "original_pdf_path",
    "original_pdf_sha256",
    "document_content_sha256",
    "last_email_sent_at",
    "last_email_error",
    "updated_at",
  ]);
  const immutableVersion = Object.fromEntries(
    Object.entries(version).filter(([key]) => !mutableVersionFields.has(key)),
  );
  return { version: immutableVersion, items: items ?? [], discounts: discounts ?? [] };
}

async function ensureStoredPdf({
  path,
  pdf,
  expectedSha256,
}: {
  path: string;
  pdf: Buffer;
  expectedSha256: string;
}) {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.storage.from("offer-pdfs").upload(path, pdf, {
    contentType: "application/pdf",
    cacheControl: "0",
    upsert: false,
  });
  if (!error) return;
  const { data: existing, error: downloadError } = await admin.storage.from("offer-pdfs").download(path);
  if (downloadError || !existing) throw new Error("Das Angebots-PDF konnte nicht sicher gespeichert werden.");
  const bytes = Buffer.from(await existing.arrayBuffer());
  if (!verifyOfferPdfSha256(bytes, expectedSha256)) {
    throw new Error("Am Zielpfad liegt ein abweichendes Angebots-PDF.");
  }
}

async function storedOfferPdf(version: JsonRecord) {
  const bucket = optionalString(version.original_pdf_bucket);
  const path = optionalString(version.original_pdf_path);
  const sha256 = optionalString(version.original_pdf_sha256);
  if (!bucket || !path || !sha256) throw new Error("Für diese Version ist kein Original-PDF gespeichert.");
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage.from(bucket).download(path);
  if (error || !data) throw new Error("Das gespeicherte Original-PDF ist nicht verfügbar.");
  const pdf = Buffer.from(await data.arrayBuffer());
  if (!verifyOfferPdfSha256(pdf, sha256)) throw new Error("Die PDF-Prüfsumme stimmt nicht überein.");
  return pdf;
}

function emailAddressFromSnapshot(snapshot: unknown) {
  const email = optionalString(jsonRecord(snapshot).email);
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function personalGreetingFromSnapshot(snapshot: unknown, preferredName?: unknown) {
  const recipient = jsonRecord(snapshot);
  const name = [
    preferredName,
    recipient.contact_name,
    recipient.recipient_name,
    recipient.company_name,
    [recipient.first_name, recipient.last_name].filter((value) => typeof value === "string" && value.trim()).join(" "),
  ].find((value) => typeof value === "string" && value.trim());
  return name ? `Guten Tag ${String(name).trim()},` : "Guten Tag,";
}

function emailFooterFromIssuer(snapshot: unknown) {
  const issuer = jsonRecord(snapshot);
  const address = [issuer.street, issuer.house_number, issuer.postal_code, issuer.city, issuer.country]
    .filter((value) => typeof value === "string" && value.trim())
    .join(" ");
  return {
    legalName: String(issuer.legal_name || SITE.legalName),
    address: address || SITE.address,
    representative: optionalString(issuer.management),
    register: optionalString(issuer.commercial_register),
    vatId: optionalString(issuer.vat_id),
    taxNumber: optionalString(issuer.tax_number),
    phone: String(issuer.phone || SITE.phone),
    email: String(issuer.email || SITE.email),
  };
}

async function sendVersionEmail({
  version,
  pdf,
  filename,
  explicitResend,
}: {
  version: JsonRecord;
  pdf: Buffer;
  filename: string;
  explicitResend: boolean;
}) {
  const email = emailAddressFromSnapshot(version.recipient_snapshot);
  if (!email) throw new Error("Im Empfänger-Snapshot fehlt eine gültige E-Mail-Adresse.");
  const number = String(version.offer_number || "Angebot");
  const title = String(version.title || "Hausvia Angebot");
  const validUntil = String(version.valid_until || "");
  await sendPortalDocumentEmail({
    to: email,
    subject: `Ihr Hausvia Angebot ${number}`,
    headline: title,
    intro: `${personalGreetingFromSnapshot(version.recipient_snapshot, version.contact_name)} Ihr persönliches Hausvia Angebot ${number} ist jetzt für Sie bereit.`,
    note: `Das Angebot ist bis ${validUntil.split("-").reverse().join(".")} gültig. Preise mit unterschiedlichen Abrechnungsarten werden getrennt ausgewiesen.`,
    idempotencyKey: explicitResend
      ? `hausvia-offer-resend-${version.id}-${version.last_email_sent_at || version.sent_at}`
      : `hausvia-offer-${version.id}-${version.original_pdf_sha256 || offerPdfSha256(pdf)}`,
    action: {
      label: "Angebot ansehen",
      href: `${SITE.url}/portal/offers/${version.id}`,
    },
    footer: emailFooterFromIssuer(version.issuer_snapshot),
    attachment: { filename, content: pdf.toString("base64") },
  });
}

async function deliverOfferVersion(versionId: string, allowFinalize: boolean) {
  const admin = createSupabaseAdminClient();
  const { data: initial, error: initialError } = await admin
    .from("offer_versions")
    .select("*")
    .eq("id", versionId)
    .single();
  if (initialError || !initial) throw new Error("Die Angebotsversion wurde nicht gefunden.");
  let version = initial as JsonRecord;
  if (!emailAddressFromSnapshot(version.recipient_snapshot)) {
    throw new Error("Vor dem Versand muss im Empfänger-Snapshot eine gültige E-Mail-Adresse hinterlegt sein.");
  }
  const issuerValidation = validateOfferIssuerSnapshot(version.issuer_snapshot);
  if (!issuerValidation.valid) {
    throw new Error(`Vor dem Versand müssen die Unternehmensdaten vollständig sein. Bitte ergänzen Sie die Einstellungen und speichern Sie den Entwurf erneut: ${issuerValidation.missing.join(", ")}.`);
  }
  let document = await getOfferVersionDocument(admin, versionId);
  let pdf = document.pdf;
  let filename = document.filename;

  if (!version.sent_at) {
    if (!allowFinalize) throw new Error("Die Angebotsversion wurde noch nicht versendet.");
    const supabase = await createSupabaseServerClient();
    if (!version.frozen_at) {
      const contentSha256 = offerContentSha256(await offerContentForHash(admin, versionId));
      const { error: freezeError } = await supabase.rpc("freeze_offer_version", {
        p_offer_version_id: versionId,
        p_expected_updated_at: version.updated_at,
        p_document_content_sha256: contentSha256,
      });
      if (freezeError) throw freezeError;
      document = await getOfferVersionDocument(admin, versionId);
      pdf = document.pdf;
      filename = document.filename;
    }
    const pdfSha256 = offerPdfSha256(pdf);
    const path = offerVersionStoragePath({
      offerId: String(version.offer_id),
      versionNumber: Number(version.version_number),
      sha256: pdfSha256,
    });
    await ensureStoredPdf({ path, pdf, expectedSha256: pdfSha256 });
    const { error: finalizeError } = await supabase.rpc("finalize_offer_send", {
      p_offer_version_id: versionId,
      p_pdf_bucket: "offer-pdfs",
      p_pdf_path: path,
      p_pdf_sha256: pdfSha256,
    });
    if (finalizeError) throw finalizeError;
    const refreshed = await admin.from("offer_versions").select("*").eq("id", versionId).single();
    if (refreshed.error || !refreshed.data) throw new Error("Der Versandstatus konnte nicht geladen werden.");
    version = refreshed.data as JsonRecord;
  } else {
    pdf = await storedOfferPdf(version);
  }

  const supabase = await createSupabaseServerClient();
  try {
    await sendVersionEmail({ version, pdf, filename, explicitResend: !allowFinalize });
    const { error: deliveryAuditError } = await supabase.rpc("record_offer_email_delivery", {
      p_offer_version_id: versionId,
      p_sent: true,
      p_error: null,
    });
    if (deliveryAuditError) throw new Error("Die E-Mail wurde übergeben, aber der Versandnachweis konnte nicht gespeichert werden.");
  } catch (error) {
    const { error: failureAuditError } = await supabase.rpc("record_offer_email_delivery", {
      p_offer_version_id: versionId,
      p_sent: false,
      p_error: errorMessage(error, "E-Mail-Versand fehlgeschlagen"),
    });
    if (failureAuditError) console.error("[Hausvia Offer] Delivery audit failed", failureAuditError);
    throw error;
  }
  return { offerId: String(version.offer_id) };
}

export async function sendOfferVersionAction(formData: FormData) {
  await requireProfile(["admin"]);
  const offerId = formText(formData, "offerId");
  const versionId = formText(formData, "versionId");
  const fallback = uuidSchema.safeParse(offerId).success
    ? offerDetailPath(offerId, versionId)
    : "/admin/offers";
  if (!uuidSchema.safeParse(versionId).success) go(fallback, "error", "Ungültige Angebotsversion.");
  let result: Awaited<ReturnType<typeof deliverOfferVersion>>;
  try {
    result = await deliverOfferVersion(versionId, true);
  } catch (error) {
    go(fallback, "error", errorMessage(error, "Das Angebot konnte nicht versendet werden."));
  }
  revalidatePath("/admin/offers");
  revalidatePath(`/admin/offers/${result.offerId}`);
  revalidatePath("/portal/offers");
  go(
    offerDetailPath(result.offerId, versionId),
    "status",
    "Angebot gespeichert, versiegelt und versendet.",
  );
}

export async function resendOfferVersionAction(formData: FormData) {
  await requireProfile(["admin"]);
  const offerId = formText(formData, "offerId");
  const versionId = formText(formData, "versionId");
  const fallback = uuidSchema.safeParse(offerId).success
    ? offerDetailPath(offerId, versionId)
    : "/admin/offers";
  if (!uuidSchema.safeParse(versionId).success) go(fallback, "error", "Ungültige Angebotsversion.");
  let result: Awaited<ReturnType<typeof deliverOfferVersion>>;
  try {
    result = await deliverOfferVersion(versionId, false);
  } catch (error) {
    go(fallback, "error", errorMessage(error, "Das Angebot konnte nicht erneut versendet werden."));
  }
  revalidatePath(`/admin/offers/${result.offerId}`);
  go(
    offerDetailPath(result.offerId, versionId),
    "status",
    "Das unveränderte Original wurde erneut versendet.",
  );
}

export async function withdrawOfferVersionAction(formData: FormData) {
  await requireProfile(["admin"]);
  const offerId = formText(formData, "offerId");
  const versionId = formText(formData, "versionId");
  const fallback = uuidSchema.safeParse(offerId).success
    ? offerDetailPath(offerId, versionId)
    : "/admin/offers";
  if (!uuidSchema.safeParse(versionId).success) go(fallback, "error", "Ungültige Angebotsversion.");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("withdraw_offer_version", {
    p_offer_version_id: versionId,
    p_reason: formText(formData, "reason"),
  });
  if (error) go(fallback, "error", error.message || "Das Angebot konnte nicht zurückgezogen werden.");
  revalidatePath("/admin/offers");
  revalidatePath(`/admin/offers/${offerId}`);
  revalidatePath("/portal/offers");
  go(fallback, "status", "Das Angebot wurde zurückgezogen.");
}

export async function duplicateOfferAction(formData: FormData) {
  await requireProfile(["admin"]);
  const offerId = formText(formData, "offerId");
  const versionId = formText(formData, "versionId");
  const fallback = uuidSchema.safeParse(offerId).success
    ? offerDetailPath(offerId, versionId)
    : "/admin/offers";
  if (!uuidSchema.safeParse(versionId).success) go(fallback, "error", "Ungültige Angebotsversion.");
  const admin = createSupabaseAdminClient();
  const [versionResult, itemsResult, discountsResult] = await Promise.all([
    admin.from("offer_versions").select("*").eq("id", versionId).single(),
    admin.from("offer_version_items").select("*").eq("offer_version_id", versionId).order("sort_order"),
    admin.from("offer_discounts").select("*").eq("offer_version_id", versionId).order("sort_order"),
  ]);
  if (versionResult.error || itemsResult.error || discountsResult.error || !versionResult.data) {
    go(fallback, "error", "Die Ausgangsversion konnte nicht vollständig geladen werden.");
  }
  const version = versionResult.data;
  if (offerId && offerId !== version.offer_id) {
    go(fallback, "error", "Angebot und Ausgangsversion stimmen nicht überein.");
  }
  const parsed = rawOfferDraftSchema.safeParse(
    copyOfferVersionToRawDraft(version, itemsResult.data ?? [], discountsResult.data ?? []),
  );
  if (!parsed.success) go(fallback, "error", "Die Angebotskopie konnte nicht vorbereitet werden.");
  let saved: Awaited<ReturnType<typeof persistOfferDraft>>;
  try {
    saved = await persistOfferDraft({ draft: parsed.data });
    const { error: sourceError } = await admin
      .from("offers")
      .update({ source_offer_id: version.offer_id })
      .eq("id", saved.offerId);
    if (sourceError) throw new Error("Die Herkunft der Angebotskopie konnte nicht gespeichert werden.");
  } catch (error) {
    go(fallback, "error", errorMessage(error, "Das Angebot konnte nicht dupliziert werden."));
  }
  revalidatePath("/admin/offers");
  go(
    offerDetailPath(saved.offerId, saved.versionId),
    "status",
    "Angebot als neuer Entwurf mit neuer Nummer dupliziert.",
  );
}

export async function linkOfferToPropertyAction(formData: FormData) {
  await requireProfile(["admin"]);
  const offerId = formText(formData, "offerId");
  const versionId = formText(formData, "versionId");
  const propertyId = formText(formData, "propertyId");
  const fallback = uuidSchema.safeParse(offerId).success
    ? offerDetailPath(offerId, versionId, "decision")
    : "/admin/offers";
  if (!uuidSchema.safeParse(versionId).success || !uuidSchema.safeParse(propertyId).success) {
    go(fallback, "error", "Bitte wählen Sie eine gültige Immobilie.");
  }
  let assignments: unknown = [];
  try {
    assignments = JSON.parse(formText(formData, "assignments") || "[]");
  } catch {
    go(fallback, "error", "Die Gebäudezuordnung ist ungültig.");
  }
  const assignmentSchema = z.array(
    z.object({
      item_id: z.string().uuid(),
      scope: z.enum(["property", "buildings"]),
      building_ids: z.array(z.string().uuid()).max(200),
    }),
  );
  const parsed = assignmentSchema.safeParse(assignments);
  if (!parsed.success) go(fallback, "error", "Die Gebäudezuordnung ist ungültig.");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("link_accepted_offer_to_property", {
    p_offer_version_id: versionId,
    p_property_id: propertyId,
    p_assignments: parsed.data,
  });
  if (error) go(fallback, "error", error.message || "Das Angebot konnte nicht verknüpft werden.");
  revalidatePath("/admin/offers");
  revalidatePath(`/admin/offers/${offerId}`);
  revalidatePath(`/admin/properties/${propertyId}`);
  revalidatePath("/portal/offers");
  go(fallback, "status", "Angebot und vereinbarte Leistungen wurden mit der Immobilie verknüpft.");
}

export async function acceptOfferVersionAction(formData: FormData) {
  await requireProfile(["customer"]);
  const versionId = formText(formData, "offerVersionId");
  if (!uuidSchema.safeParse(versionId).success) go("/portal/offers", "error", "Ungültiges Angebot.");
  const confirmedValue = formText(formData, "confirmed");
  const expectedGross = Number(formText(formData, "expectedGrossTotalCents"));
  if (!Number.isSafeInteger(expectedGross) || expectedGross < 0) {
    go(`/portal/offers/${versionId}`, "error", "Der bestätigte Betrag ist ungültig.");
  }
  const requestHeaders = await headers();
  const forwardedFor = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("accept_offer_version", {
    p_offer_version_id: versionId,
    p_accepted_name: formText(formData, "acceptedName"),
    p_confirmed: confirmedValue === "true" || confirmedValue === "on",
    p_expected_gross_total_cents: expectedGross,
    p_comment: formText(formData, "comment") || null,
    p_acceptance_ip: forwardedFor,
    p_user_agent: requestHeaders.get("user-agent"),
  });
  if (error) go(`/portal/offers/${versionId}`, "error", error.message || "Die Annahme konnte nicht gespeichert werden.");
  const acceptanceResult = firstRpcObject(data);
  if (acceptanceResult.status === "expired") {
    revalidatePath("/portal/offers");
    revalidatePath(`/portal/offers/${versionId}`);
    revalidatePath("/admin/offers");
    go(`/portal/offers/${versionId}`, "error", "Das Angebot ist abgelaufen und kann nicht mehr angenommen werden.");
  }
  const acceptanceId = String(acceptanceResult.acceptance_id || "");
  let confirmationWarning = false;
  if (uuidSchema.safeParse(acceptanceId).success) {
    try {
      const delivery = await processOfferAcceptanceDelivery({ acceptanceId, expectedVersionId: versionId });
      confirmationWarning = delivery.status !== "sent";
    } catch (confirmationError) {
      confirmationWarning = true;
      console.error("[Hausvia Offer] Acceptance confirmation delivery failed", confirmationError);
    }
  }
  revalidatePath("/portal/offers");
  revalidatePath(`/portal/offers/${versionId}`);
  revalidatePath("/admin/offers");
  go(
    `/portal/offers/${versionId}`,
    "status",
    confirmationWarning
      ? "Annahme gespeichert. Die PDF-/E-Mail-Bestätigung konnte aktuell nicht vollständig zugestellt werden; Hausvia wurde im Portal informiert."
      : "Vielen Dank. Ihre verbindliche Annahme wurde gespeichert und bestätigt.",
  );
}

export async function retryOfferAcceptanceDeliveryAction(formData: FormData) {
  await requireProfile(["admin"]);
  const offerId = formText(formData, "offerId");
  const versionId = formText(formData, "versionId");
  const jobId = formText(formData, "jobId");
  const fallback = uuidSchema.safeParse(offerId).success
    ? offerDetailPath(offerId, versionId, "decision")
    : "/admin/offers";
  if (!uuidSchema.safeParse(jobId).success) go(fallback, "error", "Ungültiger Zustellauftrag.");
  try {
    const result = await processOfferAcceptanceDelivery({ jobId });
    if (result.status !== "sent") throw new Error("Der Zustellauftrag wird bereits verarbeitet.");
  } catch (error) {
    go(fallback, "error", errorMessage(error, "Die Annahmebestätigung konnte nicht erneut zugestellt werden."));
  }
  revalidatePath(`/admin/offers/${offerId}`);
  go(fallback, "status", "Annahmebestätigung und E-Mails wurden erfolgreich zugestellt.");
}

export async function rejectOfferVersionAction(formData: FormData) {
  await requireProfile(["customer"]);
  const versionId = formText(formData, "offerVersionId");
  if (!uuidSchema.safeParse(versionId).success) go("/portal/offers", "error", "Ungültiges Angebot.");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("reject_offer_version", {
    p_offer_version_id: versionId,
    p_rejected_name: formText(formData, "rejectedName") || null,
    p_comment: formText(formData, "comment") || null,
  });
  if (error) go(`/portal/offers/${versionId}`, "error", error.message || "Die Ablehnung konnte nicht gespeichert werden.");
  revalidatePath("/portal/offers");
  revalidatePath(`/portal/offers/${versionId}`);
  revalidatePath("/admin/offers");
  go(`/portal/offers/${versionId}`, "status", "Ihre Ablehnung wurde gespeichert. Hausvia wurde informiert.");
}
