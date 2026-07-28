import { NextResponse } from "next/server";
import { createLeadPdf } from "@/lib/leadPdf";
import {
  calculateEstimate,
  getServiceLabels,
  pricingConfig,
  type ComplexityId,
  type FrequencyId,
  type ObjectTypeId,
  type ServiceId,
} from "@/lib/pricing";
import { SITE } from "@/lib/site";
import { persistFunnelLead } from "@/lib/funnelPersistence";

export const runtime = "nodejs";

type LeadPayload = {
  source?: string;
  submittedAt?: string;
  lead?: Record<string, unknown>;
};

const internalLeadEmail = process.env.HAUSVIA_INTERNAL_LEAD_EMAIL ?? "c.pfad@flaaq.com";
const resendFromEmail = process.env.RESEND_FROM_EMAIL ?? `Hausvia <${SITE.email}>`;

function isValidEmail(value: unknown) {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

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

function isObjectType(value: unknown): value is ObjectTypeId {
  return pricingConfig.objectTypes.some((item) => item.id === value);
}

function isFrequency(value: unknown): value is FrequencyId {
  return pricingConfig.frequencies.some((item) => item.id === value);
}

function isComplexity(value: unknown): value is ComplexityId {
  return pricingConfig.complexity.some((item) => item.id === value);
}

function isService(value: unknown): value is ServiceId {
  return pricingConfig.services.some((item) => item.id === value);
}

function enrichCostFunnelLead(lead: Record<string, unknown>) {
  if (!isObjectType(lead.objectType) || !isFrequency(lead.frequency) || !isComplexity(lead.complexity)) {
    return lead;
  }

  const services = Array.isArray(lead.services) ? lead.services.filter(isService) : [];
  if (!services.length) return lead;

  const computedUsableArea =
    asNumber(lead.computedUsableArea) || asNumber(lead.unitCount) * asNumber(lead.averageUnitArea);
  const estimate = calculateEstimate({
    objectType: lead.objectType,
    usableArea: computedUsableArea,
    outdoorArea: asNumber(lead.outdoorArea),
    services,
    frequency: lead.frequency,
    complexity: lead.complexity,
  });
  const objectTypeLabel =
    pricingConfig.objectTypes.find((item) => item.id === lead.objectType)?.label ?? asString(lead.objectType);
  const frequencyLabel =
    pricingConfig.frequencies.find((item) => item.id === lead.frequency)?.label ?? asString(lead.frequency);
  const complexityLabel =
    pricingConfig.complexity.find((item) => item.id === lead.complexity)?.label ?? asString(lead.complexity);
  const estimateText = `${estimate.lower.toLocaleString("de-DE")} €–${estimate.upper.toLocaleString(
    "de-DE",
  )} € ${estimate.billingPeriodLabel}`;

  return {
    ...lead,
    services,
    computedUsableArea,
    selectedServiceLabels: getServiceLabels(services),
    objectTypeLabel,
    frequencyLabel,
    complexityLabel,
    estimate,
    estimateText,
  };
}

async function sendResendEmail({
  to,
  subject,
  html,
  text,
  attachment,
  replyTo,
}: {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachment: { filename: string; content: string };
  replyTo?: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: resendFromEmail,
      to,
      subject,
      html,
      text,
      reply_to: replyTo,
      attachments: [attachment],
    }),
  });

  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(`Resend failed with status ${response.status}: ${responseText}`);
  }
}

function emailHtml({ headline, intro, note }: { headline: string; intro: string; note: string }) {
  return `
    <div style="font-family:Arial,sans-serif;background:#f7f9fc;padding:24px;color:#172033">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #dfe7f2;border-radius:10px;overflow:hidden">
        <div style="background:#082b61;color:#ffffff;padding:22px 26px">
          <div style="font-size:22px;font-weight:800">Hausvia</div>
          <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#d8e4f5">Hausmeisterservice</div>
        </div>
        <div style="border-top:6px solid #f5c542;padding:26px">
          <h1 style="font-size:22px;line-height:1.25;margin:0 0 12px">${headline}</h1>
          <p style="font-size:15px;line-height:1.65;margin:0 0 18px">${intro}</p>
          <p style="font-size:14px;line-height:1.6;margin:0;color:#526071">
            ${note}
          </p>
        </div>
      </div>
    </div>
  `;
}

export async function POST(request: Request) {
  let payload: LeadPayload;

  try {
    payload = (await request.json()) as LeadPayload;
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON" }, { status: 400 });
  }

  const lead = payload.lead ?? {};
  const name = lead.name;
  const email = lead.email;
  const phone = lead.phone;
  const privacyAccepted = lead.privacyAccepted;
  const termsAccepted = lead.termsAccepted;
  const source = typeof payload.source === "string" ? payload.source : "unknown";
  const submittedAt = typeof payload.submittedAt === "string" ? payload.submittedAt : new Date().toISOString();

  if (source === "offer-request") {
    if (!asString(lead.firstName)) {
      return NextResponse.json({ ok: false, message: "Vorname ist erforderlich." }, { status: 400 });
    }

    if (!asString(lead.lastName)) {
      return NextResponse.json({ ok: false, message: "Nachname ist erforderlich." }, { status: 400 });
    }
  }

  if (typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ ok: false, message: "Name is required" }, { status: 400 });
  }

  if (!isValidEmail(email)) {
    return NextResponse.json({ ok: false, message: "Valid email is required" }, { status: 400 });
  }

  if (typeof phone !== "string" || !phone.trim()) {
    return NextResponse.json({ ok: false, message: "Phone is required" }, { status: 400 });
  }

  if (privacyAccepted !== true) {
    return NextResponse.json({ ok: false, message: "Privacy consent is required" }, { status: 400 });
  }

  if (termsAccepted !== true) {
    return NextResponse.json({ ok: false, message: "Terms consent is required" }, { status: 400 });
  }

  const enrichedLead = source === "cost-funnel" ? enrichCostFunnelLead(lead) : lead;
  const structuredLead = {
    source,
    submittedAt,
    lead: enrichedLead,
  };

  console.info("Hausvia lead received", JSON.stringify(structuredLead, null, 2));

  try {
    await persistFunnelLead(structuredLead);
  } catch (error) {
    console.error("Hausvia Supabase lead persistence failed", error);
  }

  const pdf = createLeadPdf(structuredLead);
  const documentNumber = submittedAt.replace(/\D/g, "").slice(0, 12) || Date.now().toString();
  const filename =
    source === "cost-funnel"
      ? `hausvia-einschaetzung-${documentNumber}.pdf`
      : `hausvia-anfrage-${documentNumber}.pdf`;
  const attachment = {
    filename,
    content: pdf.toString("base64"),
  };
  const customerEmail = asString(email);
  const customerName = asString(name);
  const replyTo = customerEmail;

  try {
    await Promise.all([
      sendResendEmail({
        to: customerEmail,
        subject:
          source === "cost-funnel"
            ? "Ihre Hausvia Einschätzung als PDF"
            : "Ihre Hausvia Anfrage als PDF",
        html: emailHtml({
          headline:
            source === "cost-funnel"
              ? "Ihre unverbindliche Hausvia Einschätzung"
              : "Ihre Anfrage bei Hausvia",
          intro:
            source === "cost-funnel"
              ? "Vielen Dank für Ihre Angaben. Ihre unverbindliche Ersteinschätzung wurde als PDF vorbereitet und ist dieser E-Mail beigefügt."
              : "Vielen Dank für Ihre Anfrage. Die übermittelten Angaben wurden als PDF zusammengefasst und sind dieser E-Mail beigefügt.",
          note:
            source === "cost-funnel"
              ? "Das PDF enthält die Anfrage, die angegebenen Objekt- und Leistungsdaten sowie die unverbindliche Einschätzung."
              : "Das PDF enthält die Anfrage sowie die angegebenen Kontakt-, Objekt- und Leistungsdaten.",
        }),
        text:
          source === "cost-funnel"
            ? "Vielen Dank für Ihre Angaben. Ihre unverbindliche Hausvia Einschätzung befindet sich als PDF im Anhang."
            : "Vielen Dank für Ihre Anfrage. Ihre Angaben befinden sich als PDF im Anhang.",
        attachment,
        replyTo: SITE.email,
      }),
      sendResendEmail({
        to: internalLeadEmail,
        subject: `Neue Hausvia Anfrage von ${customerName || "unbekannt"}`,
        html: emailHtml({
          headline: "Neue Hausvia Anfrage",
          intro:
            source === "cost-funnel"
              ? `Es ist eine neue Kostencheck-Anfrage von ${customerName || "unbekannt"} eingegangen. Das PDF mit allen Angaben und der serverseitigen Einschätzung ist beigefügt.`
              : `Es ist eine neue Kontaktanfrage von ${customerName || "unbekannt"} eingegangen. Das PDF mit allen Angaben ist beigefügt.`,
          note: "Die interne Kopie enthält alle übermittelten Daten und, falls vorhanden, die berechnete Ersteinschätzung.",
        }),
        text: `Neue Hausvia Anfrage von ${customerName || "unbekannt"}. Das PDF mit allen Angaben ist im Anhang.`,
        attachment,
        replyTo,
      }),
    ]);
  } catch (error) {
    console.error("Hausvia Resend delivery failed", error);
    return NextResponse.json(
      {
        ok: false,
        message:
          "Der E-Mail-Versand ist aktuell noch nicht korrekt konfiguriert. Bitte prüfen Sie die Resend-Einstellungen in Vercel.",
      },
      { status: 502 },
    );
  }

  // TODO: Optional CRM/Webhook-Integration ergänzen, sobald Zielsystem und Datenschutzfreigabe feststehen.

  return NextResponse.json({ ok: true });
}
