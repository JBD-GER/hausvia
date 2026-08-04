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
import {
  calculateWinterPolygonArea,
  isSimpleWinterPolygon,
  sanitizeWinterMapPoints,
  sanitizeWinterObjectAddress,
} from "@/lib/winterMap";
import {
  calculateWinterPrice,
  deriveWinterSurfaceProfile,
  parseWinterPricingInput,
  winterPricingLabels,
  type WinterPricingInput,
} from "@/lib/winterPricing";

export const runtime = "nodejs";

type LeadPayload = {
  source?: string;
  submittedAt?: string;
  lead?: Record<string, unknown>;
};

const allowedLeadSources = ["offer-request", "contact-form", "cost-funnel"] as const;
type LeadSource = (typeof allowedLeadSources)[number];
const maximumLeadPayloadLength = 100_000;

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return entities[character];
  });
}

function isLeadSource(value: unknown): value is LeadSource {
  return allowedLeadSources.some((source) => source === value);
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
  const sanitizedLead = withoutClientEstimate(lead);

  if (!isObjectType(lead.objectType) || !isFrequency(lead.frequency) || !isComplexity(lead.complexity)) {
    return sanitizedLead;
  }

  const services = Array.isArray(lead.services) ? lead.services.filter(isService) : [];
  if (!services.length) return sanitizedLead;

  const unitCount = asNumber(lead.unitCount);
  const averageUnitArea = asNumber(lead.averageUnitArea);
  const computedUsableArea =
    unitCount > 0 && averageUnitArea > 0
      ? unitCount * averageUnitArea
      : asNumber(lead.computedUsableArea);
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
    ...sanitizedLead,
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

function withoutClientEstimate(lead: Record<string, unknown>) {
  const sanitizedLead = { ...lead };
  delete sanitizedLead.estimate;
  delete sanitizedLead.estimateText;
  return sanitizedLead;
}

function sanitizeWinterLeadDetails(lead: Record<string, unknown>) {
  const sanitizedLead = withoutClientEstimate(lead);
  delete sanitizedLead.objectAddress;
  delete sanitizedLead.winterAreaSource;
  delete sanitizedLead.winterMapArea;
  delete sanitizedLead.winterPolygonPoints;

  const objectAddress = sanitizeWinterObjectAddress(lead.objectAddress);
  const polygonPoints = sanitizeWinterMapPoints(lead.winterPolygonPoints);
  const polygonIsValid = isSimpleWinterPolygon(polygonPoints);
  const mapArea = polygonIsValid ? Math.round(calculateWinterPolygonArea(polygonPoints)) : 0;
  const areaSource = lead.winterAreaSource === "map" && polygonIsValid && mapArea > 0 ? "map" : "manual";

  return {
    ...sanitizedLead,
    services: ["Winterdienst"],
    selectedServiceLabels: ["Winterdienst"],
    ...(objectAddress ? { objectAddress } : {}),
    winterAreaSource: areaSource,
    winterAreaSourceLabel:
      areaSource === "map" ? "Auf der Satellitenkarte markiert" : "Manuell in m² eingegeben",
    ...(areaSource === "map" ? { winterMapArea: mapArea, winterPolygonPoints: polygonPoints } : {}),
  };
}

function enrichWinterServiceLead(lead: Record<string, unknown>, input: WinterPricingInput) {
  const estimate = calculateWinterPrice(input);
  const labels = winterPricingLabels(input);

  return {
    ...withoutClientEstimate(lead),
    services: ["Winterdienst"],
    selectedServiceLabels: ["Winterdienst"],
    objectType: input.objectType,
    objectTypeLabel: labels.objectType,
    winterPricingInput: input,
    winterArea: input.area,
    winterAreaSourceLabel:
      lead.winterAreaSource === "map" ? "Auf der Satellitenkarte markiert" : "Manuell in m² eingegeben",
    winterSurfaceProfileLabel: labels.surfaceProfile,
    winterAccessLabel: labels.access,
    frequency: "weather-dependent",
    frequencyLabel: `Witterungsabhängig · ${estimate.contractPeriod}`,
    estimate: {
      pricingModel: "winter-season-plus-deployment",
      monthlyBaseGross: estimate.monthlyBaseGross,
      seasonBaseGross: estimate.seasonBaseGross,
      deploymentGross: estimate.deploymentGross,
      monthlyBaseNet: estimate.monthlyBaseNet,
      seasonBaseNet: estimate.seasonBaseNet,
      deploymentNet: estimate.deploymentNet,
      seasonMonths: estimate.seasonMonths,
      contractPeriod: estimate.contractPeriod,
      vatRate: estimate.vatRate,
    },
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
  const safeHeadline = escapeHtml(headline);
  const safeIntro = escapeHtml(intro);
  const safeNote = escapeHtml(note);

  return `
    <div style="font-family:Arial,sans-serif;background:#f7f9fc;padding:24px;color:#172033">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #dfe7f2;border-radius:10px;overflow:hidden">
        <div style="background:#082b61;color:#ffffff;padding:22px 26px">
          <div style="font-size:22px;font-weight:800">Hausvia</div>
          <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#d8e4f5">Hausmeisterservice</div>
        </div>
        <div style="border-top:6px solid #f5c542;padding:26px">
          <h1 style="font-size:22px;line-height:1.25;margin:0 0 12px">${safeHeadline}</h1>
          <p style="font-size:15px;line-height:1.65;margin:0 0 18px">${safeIntro}</p>
          <p style="font-size:14px;line-height:1.6;margin:0;color:#526071">
            ${safeNote}
          </p>
        </div>
      </div>
    </div>
  `;
}

export async function POST(request: Request) {
  let payload: LeadPayload;

  try {
    const rawPayload = await request.text();
    if (rawPayload.length > maximumLeadPayloadLength) {
      return NextResponse.json({ ok: false, message: "Payload too large" }, { status: 413 });
    }

    const parsedPayload: unknown = JSON.parse(rawPayload);
    if (!isRecord(parsedPayload) || !isRecord(parsedPayload.lead)) {
      return NextResponse.json({ ok: false, message: "Invalid lead payload" }, { status: 400 });
    }
    payload = parsedPayload as LeadPayload;
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON" }, { status: 400 });
  }

  const lead = payload.lead as Record<string, unknown>;
  const name = lead.name;
  const email = lead.email;
  const phone = lead.phone;
  const privacyAccepted = lead.privacyAccepted;
  const termsAccepted = lead.termsAccepted;
  if (!isLeadSource(payload.source)) {
    return NextResponse.json({ ok: false, message: "Invalid lead source" }, { status: 400 });
  }

  const source = payload.source;
  const submittedDate = typeof payload.submittedAt === "string" ? new Date(payload.submittedAt) : new Date();
  const submittedAt = Number.isNaN(submittedDate.getTime()) ? new Date().toISOString() : submittedDate.toISOString();

  if (source === "offer-request") {
    if (!asString(lead.firstName) || asString(lead.firstName).length > 80) {
      return NextResponse.json({ ok: false, message: "Vorname ist erforderlich." }, { status: 400 });
    }

    if (!asString(lead.lastName) || asString(lead.lastName).length > 80) {
      return NextResponse.json({ ok: false, message: "Nachname ist erforderlich." }, { status: 400 });
    }
  }

  if (typeof name !== "string" || !name.trim() || name.trim().length > 160) {
    return NextResponse.json({ ok: false, message: "Name is required" }, { status: 400 });
  }

  if (!isValidEmail(email) || asString(email).length > 180) {
    return NextResponse.json({ ok: false, message: "Valid email is required" }, { status: 400 });
  }

  if (typeof phone !== "string" || !phone.trim() || phone.trim().length > 40) {
    return NextResponse.json({ ok: false, message: "Phone is required" }, { status: 400 });
  }

  if (privacyAccepted !== true) {
    return NextResponse.json({ ok: false, message: "Privacy consent is required" }, { status: 400 });
  }

  if (termsAccepted !== true) {
    return NextResponse.json({ ok: false, message: "Terms consent is required" }, { status: 400 });
  }

  const hasWinterPricingInput = Object.prototype.hasOwnProperty.call(lead, "winterPricingInput");
  const requestsWinterService =
    source === "offer-request" &&
    (hasWinterPricingInput ||
      (Array.isArray(lead.services) && lead.services.some((service) => service === "Winterdienst")));
  const sanitizedWinterLead = requestsWinterService ? sanitizeWinterLeadDetails(lead) : null;
  let enrichedLead: Record<string, unknown>;

  if (source === "cost-funnel") {
    enrichedLead = enrichCostFunnelLead(lead);
  } else if (source === "offer-request" && hasWinterPricingInput && sanitizedWinterLead) {
    if (!isRecord(lead.winterPricingInput)) {
      return NextResponse.json(
        { ok: false, message: "Die übernommenen Winterdienstangaben sind ungültig." },
        { status: 400 },
      );
    }

    const submittedWinterInput = parseWinterPricingInput({
      ...lead.winterPricingInput,
      area:
        typeof lead.winterPricingInput.area === "number"
          ? String(lead.winterPricingInput.area)
          : lead.winterPricingInput.area,
    });
    if (!submittedWinterInput) {
      return NextResponse.json(
        { ok: false, message: "Die übernommenen Winterdienstangaben sind ungültig. Bitte berechnen Sie den Preis erneut." },
        { status: 400 },
      );
    }

    if (lead.winterAreaSource === "map" && sanitizedWinterLead.winterAreaSource !== "map") {
      return NextResponse.json(
        { ok: false, message: "Die markierte Winterdienstfläche ist ungültig. Bitte zeichnen Sie die Fläche erneut." },
        { status: 400 },
      );
    }

    const verifiedArea =
      sanitizedWinterLead.winterAreaSource === "map"
        ? asNumber(sanitizedWinterLead.winterMapArea)
        : submittedWinterInput.area;
    const verifiedWinterInput = parseWinterPricingInput({
      ...submittedWinterInput,
      area: String(verifiedArea),
      surfaceProfile: deriveWinterSurfaceProfile(verifiedArea, submittedWinterInput.access),
    });

    if (!verifiedWinterInput) {
      return NextResponse.json(
        { ok: false, message: "Die markierte Winterdienstfläche liegt außerhalb des online kalkulierbaren Bereichs." },
        { status: 400 },
      );
    }

    enrichedLead = enrichWinterServiceLead(sanitizedWinterLead, verifiedWinterInput);
  } else if (sanitizedWinterLead) {
    enrichedLead = sanitizedWinterLead;
  } else {
    enrichedLead = withoutClientEstimate(lead);
  }

  const hasWinterEstimate =
    isRecord(enrichedLead.estimate) &&
    enrichedLead.estimate.pricingModel === "winter-season-plus-deployment";
  const isWinterServiceRequest = requestsWinterService || hasWinterEstimate;
  const structuredLead = {
    source,
    submittedAt,
    lead: enrichedLead,
  };

  console.info("Hausvia lead received", {
    source,
    submittedAt,
    requestType: isWinterServiceRequest ? "winter-service" : "general-service",
  });

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
      : isWinterServiceRequest
        ? `hausvia-winterdienst-anfrage-${documentNumber}.pdf`
      : `hausvia-anfrage-${documentNumber}.pdf`;
  const attachment = {
    filename,
    content: pdf.toString("base64"),
  };
  const customerEmail = asString(email);
  const customerName = asString(name).replace(/[\r\n]+/g, " ").slice(0, 160);
  const replyTo = customerEmail;

  try {
    await Promise.all([
      sendResendEmail({
        to: customerEmail,
        subject:
          source === "cost-funnel"
            ? "Ihre Hausvia Einschätzung als PDF"
            : isWinterServiceRequest
              ? "Ihre Hausvia Winterdienst-Anfrage als PDF"
            : "Ihre Hausvia Anfrage als PDF",
        html: emailHtml({
          headline:
            source === "cost-funnel"
              ? "Ihre unverbindliche Hausvia Einschätzung"
              : isWinterServiceRequest
                ? "Ihre unverbindliche Winterdienst-Anfrage"
              : "Ihre Anfrage bei Hausvia",
          intro:
            source === "cost-funnel"
              ? "Vielen Dank für Ihre Angaben. Ihre unverbindliche Ersteinschätzung wurde als PDF vorbereitet und ist dieser E-Mail beigefügt."
              : isWinterServiceRequest
                ? hasWinterEstimate
                  ? "Vielen Dank für Ihre Winterdienst-Anfrage. Grundbetrag, Einsatzpreis und Ihre Objektangaben wurden serverseitig geprüft und im beigefügten PDF zusammengefasst."
                  : "Vielen Dank für Ihre Winterdienst-Anfrage. Ihre Angaben wurden geprüft und im beigefügten PDF zusammengefasst."
              : "Vielen Dank für Ihre Anfrage. Die übermittelten Angaben wurden als PDF zusammengefasst und sind dieser E-Mail beigefügt.",
          note:
            source === "cost-funnel"
              ? "Das PDF enthält die Anfrage, die angegebenen Objekt- und Leistungsdaten sowie die unverbindliche Einschätzung."
              : isWinterServiceRequest
                ? hasWinterEstimate
                  ? "Das PDF enthält den festen Saison-Grundbetrag und den getrennten Preis je tatsächlichem Winterdiensteinsatz."
                  : "Das PDF enthält die übermittelten Objekt- und Kontaktdaten für die persönliche Angebotserstellung."
              : "Das PDF enthält die Anfrage sowie die angegebenen Kontakt-, Objekt- und Leistungsdaten.",
        }),
        text:
          source === "cost-funnel"
            ? "Vielen Dank für Ihre Angaben. Ihre unverbindliche Hausvia Einschätzung befindet sich als PDF im Anhang."
            : isWinterServiceRequest
              ? hasWinterEstimate
                ? "Vielen Dank für Ihre Winterdienst-Anfrage. Die serverseitig geprüfte Einschätzung mit Saison-Grundbetrag und Einsatzpreis befindet sich als PDF im Anhang."
                : "Vielen Dank für Ihre Winterdienst-Anfrage. Ihre Angaben befinden sich als PDF im Anhang."
              : "Vielen Dank für Ihre Anfrage. Ihre Angaben befinden sich als PDF im Anhang.",
        attachment,
        replyTo: SITE.email,
      }),
      sendResendEmail({
        to: internalLeadEmail,
        subject: `${isWinterServiceRequest ? "Neue Hausvia Winterdienst-Anfrage" : "Neue Hausvia Anfrage"} von ${customerName || "unbekannt"}`,
        html: emailHtml({
          headline: "Neue Hausvia Anfrage",
          intro:
            source === "cost-funnel"
              ? `Es ist eine neue Kostencheck-Anfrage von ${customerName || "unbekannt"} eingegangen. Das PDF mit allen Angaben und der serverseitigen Einschätzung ist beigefügt.`
              : isWinterServiceRequest
                ? hasWinterEstimate
                  ? `Es ist eine neue Winterdienst-Anfrage von ${customerName || "unbekannt"} eingegangen. Saison-Grundbetrag und Einsatzpreis wurden aus den übernommenen Rohdaten serverseitig neu berechnet.`
                  : `Es ist eine neue Winterdienst-Anfrage von ${customerName || "unbekannt"} eingegangen. Die übermittelten Objektangaben befinden sich im PDF.`
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
