import "server-only";

import { getOfferAcceptanceConfirmationDocument } from "@/lib/offerDocuments";
import {
  offerPdfSha256,
  offerVersionStoragePath,
  verifyOfferPdfSha256,
} from "@/lib/offerIntegrity";
import { sendPortalDocumentEmail } from "@/lib/mail";
import { formatCents } from "@/lib/portal/core";
import { SITE } from "@/lib/site";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type JsonRecord = Record<string, unknown>;

export type OfferAcceptanceDeliveryResult = {
  processed: boolean;
  status: "sent" | "processing" | "unavailable";
  jobId?: string;
  acceptanceId?: string;
  versionId?: string;
};

function record(value: unknown): JsonRecord {
  if (Array.isArray(value)) return record(value[0]);
  return value && typeof value === "object" ? value as JsonRecord : {};
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message.slice(0, 4_000);
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message ?? "Zustellung fehlgeschlagen").slice(0, 4_000);
  }
  return "Zustellung fehlgeschlagen";
}

function emailAddressFromSnapshot(snapshot: unknown) {
  const email = optionalString(record(snapshot).email);
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function personalGreetingFromSnapshot(snapshot: unknown, preferredName?: unknown) {
  const recipient = record(snapshot);
  const name = [
    preferredName,
    recipient.contact_name,
    recipient.recipient_name,
    recipient.company_name,
    [recipient.first_name, recipient.last_name]
      .filter((value) => typeof value === "string" && value.trim())
      .join(" "),
  ].find((value) => typeof value === "string" && value.trim());
  return name ? `Guten Tag ${String(name).trim()},` : "Guten Tag,";
}

function emailFooterFromIssuer(snapshot: unknown) {
  const issuer = record(snapshot);
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

async function ensureStoredPdf(path: string, pdf: Buffer, expectedSha256: string) {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.storage.from("offer-pdfs").upload(path, pdf, {
    contentType: "application/pdf",
    cacheControl: "0",
    upsert: false,
  });
  if (!error) return;
  const { data: existing, error: downloadError } = await admin.storage.from("offer-pdfs").download(path);
  if (downloadError || !existing) throw new Error("Die Annahmebestätigung konnte nicht sicher gespeichert werden.");
  const bytes = Buffer.from(await existing.arrayBuffer());
  if (!verifyOfferPdfSha256(bytes, expectedSha256)) {
    throw new Error("Am Zielpfad liegt eine abweichende Annahmebestätigung.");
  }
}

async function deliverClaimedAcceptance(acceptanceId: string, expectedVersionId?: string) {
  const admin = createSupabaseAdminClient();
  const document = await getOfferAcceptanceConfirmationDocument(admin, acceptanceId);
  const { acceptance, version, pdf, filename } = document;
  if (expectedVersionId && version.id !== expectedVersionId) {
    throw new Error("Die Annahmebestätigung gehört nicht zur erwarteten Angebotsversion.");
  }

  const sha256 = offerPdfSha256(pdf);
  const path = offerVersionStoragePath({
    offerId: version.offer_id,
    versionNumber: version.version_number,
    sha256,
    kind: "acceptance",
  });
  await ensureStoredPdf(path, pdf, sha256);
  const { error: finalizeError } = await admin.rpc("finalize_offer_acceptance_document", {
    p_acceptance_id: acceptanceId,
    p_pdf_bucket: "offer-pdfs",
    p_pdf_path: path,
    p_pdf_sha256: sha256,
  });
  if (finalizeError) throw finalizeError;

  const customerEmail = emailAddressFromSnapshot(version.recipient_snapshot);
  if (!customerEmail) throw new Error("Im Empfänger-Snapshot fehlt eine gültige Kunden-E-Mail-Adresse.");
  const issuer = record(version.issuer_snapshot);
  const adminEmail = emailAddressFromSnapshot({ email: issuer.email }) || SITE.email;
  const common = {
    subject: `Annahmebestätigung ${version.offer_number}`,
    headline: "Angebot verbindlich angenommen",
    note: `Rechnerische Vergleichssumme: ${formatCents(Number(acceptance.confirmed_gross_total_cents))}. Verbindlich sind die getrennten Abrechnungsbeträge des Angebots; die Vergleichssumme ist kein einheitlicher Zahlbetrag.`,
    attachment: { filename, content: pdf.toString("base64") },
    footer: emailFooterFromIssuer(version.issuer_snapshot),
  };
  await sendPortalDocumentEmail({
    ...common,
    to: customerEmail,
    intro: `${personalGreetingFromSnapshot(version.recipient_snapshot, version.contact_name)} Vielen Dank. Ihre Annahme von ${version.offer_number} wurde am ${new Date(acceptance.accepted_at).toLocaleString("de-DE", { timeZone: "Europe/Berlin" })} gespeichert.`,
    idempotencyKey: `hausvia-offer-acceptance-customer-${acceptanceId}`,
    action: { label: "Angebot ansehen", href: `${SITE.url}/portal/offers/${version.id}` },
  });
  await sendPortalDocumentEmail({
    ...common,
    to: adminEmail,
    intro: `${acceptance.accepted_name} hat ${version.offer_number} im Kundenportal verbindlich angenommen.`,
    idempotencyKey: `hausvia-offer-acceptance-admin-${acceptanceId}`,
    action: { label: "Angebot im Adminportal öffnen", href: `${SITE.url}/admin/offers/${version.offer_id}` },
  });
  return { versionId: version.id };
}

export async function processOfferAcceptanceDelivery({
  jobId,
  acceptanceId,
  expectedVersionId,
}: {
  jobId?: string;
  acceptanceId?: string;
  expectedVersionId?: string;
} = {}): Promise<OfferAcceptanceDeliveryResult> {
  const admin = createSupabaseAdminClient();
  let resolvedJobId = jobId;
  if (!resolvedJobId && acceptanceId) {
    const { data: job, error } = await admin
      .from("offer_acceptance_delivery_jobs")
      .select("id,status")
      .eq("acceptance_id", acceptanceId)
      .maybeSingle();
    if (error) throw error;
    if (!job) return { processed: false, status: "unavailable", acceptanceId };
    if (job.status === "sent") {
      return { processed: false, status: "sent", jobId: job.id, acceptanceId, versionId: expectedVersionId };
    }
    resolvedJobId = job.id;
  }

  const { data: claimData, error: claimError } = await admin.rpc("claim_offer_acceptance_delivery_job", {
    p_job_id: resolvedJobId || null,
  });
  if (claimError) throw claimError;
  const claim = record(claimData);
  const claimedJobId = optionalString(claim.job_id);
  const claimedAcceptanceId = optionalString(claim.acceptance_id);
  const claimedVersionId = optionalString(claim.offer_version_id);
  if (!claimedJobId || !claimedAcceptanceId || !claimedVersionId) {
    return { processed: false, status: "processing", jobId: resolvedJobId, acceptanceId };
  }

  try {
    const delivered = await deliverClaimedAcceptance(
      claimedAcceptanceId,
      expectedVersionId || claimedVersionId,
    );
    const { error: completeError } = await admin.rpc("complete_offer_acceptance_delivery_job", {
      p_job_id: claimedJobId,
      p_sent: true,
      p_error: null,
      p_retry_after_seconds: 300,
    });
    if (completeError) throw completeError;
    return {
      processed: true,
      status: "sent",
      jobId: claimedJobId,
      acceptanceId: claimedAcceptanceId,
      versionId: delivered.versionId,
    };
  } catch (error) {
    const { error: completeError } = await admin.rpc("complete_offer_acceptance_delivery_job", {
      p_job_id: claimedJobId,
      p_sent: false,
      p_error: errorMessage(error),
      p_retry_after_seconds: 300,
    });
    if (completeError) console.error("[Hausvia Offer] Acceptance outbox completion failed", completeError);
    throw error;
  }
}
