import { createHash, randomUUID } from "node:crypto";
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
import { markFunnelLeadEmailDeliveryCompleted, persistFunnelLead } from "@/lib/funnelPersistence";
import {
  LeadPayloadTooLargeError,
  readBoundedLeadRequestText,
  validateAndSanitizeLeadPayload,
  type LeadSource,
  type ValidatedLeadPayload,
} from "@/lib/leadPayload";
import { sanitizeWinterObjectAddress } from "@/lib/winterMap";
import { parseWinterPolygons } from "@/lib/winterLeadSubmission";
import {
  calculateWinterPrice,
  deriveWinterSurfaceProfile,
  parseWinterPricingInput,
  winterPricingLabels,
  type WinterPricingInput,
} from "@/lib/winterPricing";

export const runtime = "nodejs";

const submissionCacheLifetimeMs = 30 * 60 * 1_000;

type SubmissionCacheEntry = {
  fingerprint: string;
  state: "processing" | "sent";
  expiresAt: number;
};

const leadSubmissionGlobal = globalThis as typeof globalThis & {
  __hausviaLeadSubmissions?: Map<string, SubmissionCacheEntry>;
};
const leadSubmissions = leadSubmissionGlobal.__hausviaLeadSubmissions ?? new Map<string, SubmissionCacheEntry>();
leadSubmissionGlobal.__hausviaLeadSubmissions = leadSubmissions;

const internalLeadEmail = process.env.HAUSVIA_INTERNAL_LEAD_EMAIL ?? "c.pfad@flaaq.com";
const resendFromEmail = process.env.RESEND_FROM_EMAIL ?? `Hausvia <${SITE.email}>`;

function isValidEmail(value: unknown) {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isValidPhone(value: string) {
  const digitCount = value.replace(/\D/g, "").length;
  return digitCount >= 6 && digitCount <= 20 && /^[+()\d\s./-]+$/.test(value);
}

function isValidContactText(value: string, maximumLength: number) {
  return Boolean(value) && value.length <= maximumLength && !/[\u0000-\u001f\u007f]/.test(value);
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

function isSubmissionId(value: string) {
  return value.length >= 16 && value.length <= 100 && /^[A-Za-z0-9._:-]+$/.test(value);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function submissionFingerprint(source: LeadSource, lead: Record<string, unknown>) {
  return createHash("sha256").update(source).update("\0").update(stableJson(lead)).digest("hex");
}

function claimSubmission(submissionId: string, fingerprint: string) {
  const now = Date.now();
  for (const [key, entry] of leadSubmissions) {
    if (entry.expiresAt <= now) leadSubmissions.delete(key);
  }

  const existing = leadSubmissions.get(submissionId);
  if (existing) {
    if (existing.fingerprint !== fingerprint) return "conflict" as const;
    return existing.state;
  }

  leadSubmissions.set(submissionId, {
    fingerprint,
    state: "processing",
    expiresAt: now + submissionCacheLifetimeMs,
  });
  return "claimed" as const;
}

function completeSubmission(submissionId: string, fingerprint: string) {
  leadSubmissions.set(submissionId, {
    fingerprint,
    state: "sent",
    expiresAt: Date.now() + submissionCacheLifetimeMs,
  });
}

function releaseSubmission(submissionId: string, fingerprint: string) {
  const existing = leadSubmissions.get(submissionId);
  if (existing?.fingerprint === fingerprint && existing.state === "processing") {
    leadSubmissions.delete(submissionId);
  }
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
  delete sanitizedLead.winterMapSnapshot;
  delete sanitizedLead.winterMapSnapshotDataUrl;
  return sanitizedLead;
}

function sanitizeWinterLeadDetails(lead: Record<string, unknown>) {
  const sanitizedLead: Record<string, unknown> = {
    firstName: asString(lead.firstName).slice(0, 80),
    lastName: asString(lead.lastName).slice(0, 80),
    name: asString(lead.name).slice(0, 160),
    company: asString(lead.company).slice(0, 160),
    phone: asString(lead.phone).slice(0, 40),
    email: asString(lead.email).slice(0, 180),
    privacyAccepted: lead.privacyAccepted === true,
    termsAccepted: lead.termsAccepted === true,
    ...(asString(lead.message) ? { message: asString(lead.message).slice(0, 2_000) } : {}),
    ...(asString(lead.desiredStartDate)
      ? { desiredStartDate: asString(lead.desiredStartDate).slice(0, 40) }
      : {}),
    ...(asString(lead.preferredCallbackTime)
      ? { preferredCallbackTime: asString(lead.preferredCallbackTime).slice(0, 100) }
      : {}),
  };

  const objectAddress = sanitizeWinterObjectAddress(lead.objectAddress);
  const polygonResult = parseWinterPolygons(lead.winterPolygons, lead.winterPolygonPoints);
  const areaSource = lead.winterAreaSource === "map" && polygonResult.status === "valid" ? "map" : "manual";

  return {
    lead: {
      ...sanitizedLead,
      services: ["Winterdienst"],
      selectedServiceLabels: ["Winterdienst"],
      ...(objectAddress ? { objectAddress } : {}),
      winterAreaSource: areaSource,
      winterAreaSourceLabel:
        areaSource === "map" ? "Auf der Satellitenkarte markiert" : "Manuell in m² eingegeben",
      ...(areaSource === "map"
        ? {
            winterMapArea: polygonResult.totalArea,
            winterPolygons: polygonResult.polygons,
            ...(polygonResult.polygons.length === 1
              ? { winterPolygonPoints: polygonResult.polygons[0] }
              : {}),
          }
        : {}),
    },
    polygonResult,
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
    winterReadinessLabel: labels.readiness,
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
      readiness: estimate.readiness,
      readinessSurchargePercent: estimate.readinessSurchargePercent,
      baseBreakdown: estimate.baseBreakdown,
      pricingOptions: estimate.pricingOptions,
      deploymentBreakdown: estimate.deploymentBreakdown,
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
  idempotencyKey,
}: {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachment: { filename: string; content: string };
  replyTo?: string;
  idempotencyKey: string;
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
      "Idempotency-Key": idempotencyKey,
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

const grossCurrencyFormatter = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function winterPricingEmailSummary(lead: Record<string, unknown>) {
  const estimate = isRecord(lead.estimate) ? lead.estimate : null;
  const options = estimate && isRecord(estimate.pricingOptions) ? estimate.pricingOptions : null;
  const baseBreakdown = estimate && isRecord(estimate.baseBreakdown) ? estimate.baseBreakdown : null;
  const flex = options && isRecord(options.flex) ? options.flex : null;
  const plan = options && isRecord(options.plan) ? options.plan : null;
  if (!flex || !plan) return "";

  const flexMonthly = asNumber(flex.monthlyBaseGross);
  const flexSeasonBase = asNumber(flex.seasonBaseGross);
  const flexDeployment = asNumber(flex.deploymentGross);
  const planMonthly = asNumber(plan.monthlyGross);
  const planSeason = asNumber(plan.seasonGross);
  const includedDeployments = asNumber(plan.includedDeployments);
  const deploymentDiscountPercent = asNumber(plan.deploymentDiscountPercent);
  const additionalDeployment = asNumber(plan.additionalDeploymentGross);
  const readinessSurchargePercent = asNumber(estimate?.readinessSurchargePercent);
  const monthlyBaseSurcharge = asNumber(baseBreakdown?.readinessSurchargeGross);
  const readinessSurchargeSummary =
    readinessSurchargePercent > 0
      ? ` Der ${readinessSurchargePercent}-%-Aufschlag ist in Grundgebühr und Einsätzen enthalten` +
        `${monthlyBaseSurcharge > 0 ? ` (${grossCurrencyFormatter.format(monthlyBaseSurcharge)} davon monatlich in der Grundgebühr)` : ""}.`
      : "";
  if (
    flexMonthly <= 0 ||
    flexSeasonBase <= 0 ||
    flexDeployment <= 0 ||
    planMonthly <= 0 ||
    planSeason <= 0 ||
    !Number.isInteger(includedDeployments) ||
    includedDeployments <= 0 ||
    deploymentDiscountPercent <= 0 ||
    additionalDeployment <= 0
  ) {
    return "";
  }

  return (
    `Variabel: ${grossCurrencyFormatter.format(flexMonthly)} Grundgebühr pro Monat plus ` +
    `${grossCurrencyFormatter.format(flexDeployment)} je tatsächlichem Einsatz ` +
    `(Saison-Grundgebühr ${grossCurrencyFormatter.format(flexSeasonBase)}). ` +
    `Pauschal: ${grossCurrencyFormatter.format(planMonthly)} monatliches 10er-Saisonpaket mit ` +
    `${includedDeployments} enthaltenen Einsätzen (Saison ${grossCurrencyFormatter.format(planSeason)}). ` +
    `Jeder enthaltene und zusätzliche Einsatz erhält ${deploymentDiscountPercent} % Preisvorteil; ` +
    `zusätzliche Einsätze kosten ${grossCurrencyFormatter.format(additionalDeployment)}. ` +
    `Einsatzbereitschaft: ${asString(lead.winterReadinessLabel) || "Standard"}.` +
    readinessSurchargeSummary
  );
}

export async function POST(request: Request) {
  let payload: ValidatedLeadPayload;

  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("application/json")) {
      return NextResponse.json({ ok: false, message: "Content-Type muss application/json sein." }, { status: 415 });
    }

    const requestBody = await readBoundedLeadRequestText(request);
    const parsedPayload: unknown = JSON.parse(requestBody.text);
    const validationResult = validateAndSanitizeLeadPayload(parsedPayload, requestBody.byteLength);
    if (validationResult.ok === false) {
      return NextResponse.json(
        { ok: false, message: validationResult.message },
        { status: validationResult.status },
      );
    }
    payload = validationResult.payload;
  } catch (error) {
    if (error instanceof LeadPayloadTooLargeError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 413 });
    }
    return NextResponse.json({ ok: false, message: "Ungültige Anfragedaten." }, { status: 400 });
  }

  const lead = payload.lead;
  const source = payload.source;
  const hasWinterPricingInput = Object.prototype.hasOwnProperty.call(lead, "winterPricingInput");
  const requestsWinterService =
    source === "offer-request" &&
    (hasWinterPricingInput ||
      (Array.isArray(lead.services) && lead.services.some((service) => service === "Winterdienst")));
  const submittedDate = typeof payload.submittedAt === "string" ? new Date(payload.submittedAt) : new Date();
  const submittedAt = Number.isNaN(submittedDate.getTime()) ? new Date().toISOString() : submittedDate.toISOString();
  const firstName = asString(lead.firstName);
  const lastName = asString(lead.lastName);
  const company = asString(lead.company);
  const email = asString(lead.email).toLowerCase();
  const phone = asString(lead.phone);
  const submittedName = asString(lead.name);
  const name = source === "offer-request" ? `${firstName} ${lastName}`.trim() : submittedName;

  if (source === "offer-request") {
    if (!isValidContactText(firstName, 80)) {
      return NextResponse.json({ ok: false, message: "Vorname ist erforderlich." }, { status: 400 });
    }

    if (!isValidContactText(lastName, 80)) {
      return NextResponse.json({ ok: false, message: "Nachname ist erforderlich." }, { status: 400 });
    }
  }

  if (!isValidContactText(name, 160)) {
    return NextResponse.json({ ok: false, message: "Name ist erforderlich." }, { status: 400 });
  }

  if (lead.winterContactGate === "direct-price-v1" && !isValidContactText(company, 160)) {
    return NextResponse.json(
      { ok: false, message: "Firma / Privatperson ist erforderlich." },
      { status: 400 },
    );
  }

  if (company.length > 160 || /[\u0000-\u001f\u007f]/.test(company)) {
    return NextResponse.json({ ok: false, message: "Firma / Privatperson ist ungültig." }, { status: 400 });
  }

  if (!isValidEmail(email) || email.length > 180) {
    return NextResponse.json({ ok: false, message: "Bitte geben Sie eine gültige E-Mail-Adresse an." }, { status: 400 });
  }

  if (!phone || phone.length > 40 || !isValidPhone(phone)) {
    return NextResponse.json({ ok: false, message: "Bitte geben Sie eine gültige Telefonnummer an." }, { status: 400 });
  }

  if (lead.privacyAccepted !== true) {
    return NextResponse.json({ ok: false, message: "Bitte stimmen Sie der Datenschutzerklärung zu." }, { status: 400 });
  }

  if (lead.termsAccepted !== true) {
    return NextResponse.json({ ok: false, message: "Bitte stimmen Sie den AGB zu." }, { status: 400 });
  }

  const sanitizedWinterDetails = requestsWinterService ? sanitizeWinterLeadDetails(lead) : null;
  const sanitizedWinterLead = sanitizedWinterDetails?.lead ?? null;
  if (
    hasWinterPricingInput &&
    lead.winterAreaSource !== "map" &&
    lead.winterAreaSource !== "manual"
  ) {
    return NextResponse.json(
      { ok: false, message: "Bitte ermitteln Sie die Winterdienstfläche erneut." },
      { status: 400 },
    );
  }
  if (
    lead.winterAreaSource === "map" &&
    sanitizedWinterDetails?.polygonResult.status !== "valid"
  ) {
    return NextResponse.json(
      { ok: false, message: "Die markierten Winterdienstflächen sind ungültig. Bitte zeichnen Sie sie erneut." },
      { status: 400 },
    );
  }

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

  enrichedLead = {
    ...enrichedLead,
    ...(source === "offer-request" ? { firstName, lastName } : {}),
    name,
    company,
    email,
    phone,
    privacyAccepted: true,
    termsAccepted: lead.termsAccepted === true,
  };

  if (hasWinterPricingInput && !sanitizeWinterObjectAddress(enrichedLead.objectAddress)) {
    return NextResponse.json(
      { ok: false, message: "Bitte geben Sie die Adresse des Winterdienstobjekts an." },
      { status: 400 },
    );
  }

  const hasWinterEstimate =
    isRecord(enrichedLead.estimate) &&
    enrichedLead.estimate.pricingModel === "winter-season-plus-deployment";
  const winterResponseEstimate = hasWinterEstimate ? enrichedLead.estimate : undefined;
  const isWinterServiceRequest = requestsWinterService || hasWinterEstimate;
  const winterEmailPricing = hasWinterEstimate ? winterPricingEmailSummary(enrichedLead) : "";
  const headerSubmissionId = asString(request.headers.get("idempotency-key"));
  const payloadSubmissionId = asString(payload.submissionId);
  if (headerSubmissionId && payloadSubmissionId && headerSubmissionId !== payloadSubmissionId) {
    return NextResponse.json({ ok: false, message: "Widersprüchliche Submission-ID." }, { status: 400 });
  }
  const requestedSubmissionId = headerSubmissionId || payloadSubmissionId;
  if (requestedSubmissionId && !isSubmissionId(requestedSubmissionId)) {
    return NextResponse.json({ ok: false, message: "Ungültige Submission-ID." }, { status: 400 });
  }
  const submissionId = requestedSubmissionId || randomUUID();
  const fingerprint = submissionFingerprint(source, enrichedLead);
  const submissionState = claimSubmission(submissionId, fingerprint);
  if (submissionState === "conflict") {
    return NextResponse.json(
      { ok: false, message: "Diese Submission-ID wurde bereits für andere Angaben verwendet." },
      { status: 409 },
    );
  }
  if (submissionState === "processing") {
    return NextResponse.json(
      { ok: false, message: "Diese Anfrage wird bereits verarbeitet.", submissionId },
      { status: 409, headers: { "Retry-After": "3" } },
    );
  }
  if (submissionState === "sent") {
    return NextResponse.json({
      ok: true,
      submissionId,
      duplicate: true,
      ...(winterResponseEstimate ? { estimate: winterResponseEstimate } : {}),
    });
  }

  const structuredLead = {
    source,
    submittedAt,
    submissionId,
    submissionFingerprint: fingerprint,
    lead: enrichedLead,
  };

  console.info("Hausvia lead received", {
    source,
    submittedAt,
    requestType: isWinterServiceRequest ? "winter-service" : "general-service",
  });

  let persistedLead: Awaited<ReturnType<typeof persistFunnelLead>> = null;
  try {
    persistedLead = await persistFunnelLead(structuredLead);
  } catch (error) {
    console.error("Hausvia Supabase lead persistence failed", error);
  }

  if (persistedLead?.submissionConflict) {
    releaseSubmission(submissionId, fingerprint);
    return NextResponse.json(
      { ok: false, message: "Diese Submission-ID wurde bereits für andere Angaben verwendet." },
      { status: 409 },
    );
  }

  if (persistedLead?.duplicate && persistedLead.emailDeliveryCompleted) {
    completeSubmission(submissionId, fingerprint);
    return NextResponse.json({
      ok: true,
      submissionId,
      duplicate: true,
      ...(winterResponseEstimate ? { estimate: winterResponseEstimate } : {}),
    });
  }

  const deliverySubmittedAt = persistedLead?.canonicalSubmittedAt || submittedAt;
  const deliveryStructuredLead = { ...structuredLead, submittedAt: deliverySubmittedAt };

  let pdf: Buffer;
  try {
    pdf = createLeadPdf(deliveryStructuredLead);
  } catch (error) {
    releaseSubmission(submissionId, fingerprint);
    console.error("Hausvia PDF creation failed", error);
    if (winterResponseEstimate) {
      return NextResponse.json(
        {
          ok: true,
          submissionId,
          emailDelivered: false,
          deliveryWarning: "Das PDF konnte gerade nicht erstellt und versendet werden.",
          estimate: winterResponseEstimate,
        },
        { status: 202 },
      );
    }
    return NextResponse.json(
      { ok: false, message: "Die Preiseinschätzung konnte gerade nicht erstellt werden." },
      { status: 500 },
    );
  }
  const documentNumber = deliverySubmittedAt.replace(/\D/g, "").slice(0, 12) || Date.now().toString();
  const filename =
    source === "cost-funnel"
      ? `hausvia-einschaetzung-${documentNumber}.pdf`
      : isWinterServiceRequest
        ? "Winterdienst Preiseinschätzung.pdf"
      : `hausvia-anfrage-${documentNumber}.pdf`;
  const attachment = {
    filename,
    content: pdf.toString("base64"),
  };
  const customerEmail = email;
  const customerName = name.replace(/[\r\n]+/g, " ").slice(0, 160);
  const replyTo = customerEmail;

  try {
    await Promise.all([
      sendResendEmail({
        to: customerEmail,
        subject:
          source === "cost-funnel"
            ? "Ihre Hausvia Einschätzung als PDF"
            : isWinterServiceRequest
              ? "Ihre Winterdienst Preiseinschätzung"
            : "Ihre Hausvia Anfrage als PDF",
        html: emailHtml({
          headline:
            source === "cost-funnel"
              ? "Ihre unverbindliche Hausvia Einschätzung"
              : isWinterServiceRequest
                ? "Ihre Winterdienst Preiseinschätzung"
              : "Ihre Anfrage bei Hausvia",
          intro:
            source === "cost-funnel"
              ? "Vielen Dank für Ihre Angaben. Ihre unverbindliche Ersteinschätzung wurde als PDF vorbereitet und ist dieser E-Mail beigefügt."
              : isWinterServiceRequest
                ? hasWinterEstimate
                  ? `Vielen Dank für Ihre Angaben. Ihre Objekt- und Flächendaten wurden serverseitig geprüft. ${winterEmailPricing}`
                  : "Vielen Dank für Ihre Winterdienst-Anfrage. Ihre Angaben wurden geprüft und im beigefügten PDF zusammengefasst."
              : "Vielen Dank für Ihre Anfrage. Die übermittelten Angaben wurden als PDF zusammengefasst und sind dieser E-Mail beigefügt.",
          note:
            source === "cost-funnel"
              ? "Das PDF enthält die Anfrage, die angegebenen Objekt- und Leistungsdaten sowie die unverbindliche Einschätzung."
              : isWinterServiceRequest
                ? hasWinterEstimate
                  ? "Diese Online-Preiseinschätzung stellt ausdrücklich kein Angebot dar. Die finale Kalkulation und ein Angebot erfolgen erst nach Prüfung durch Hausvia und, falls erforderlich, nach einem Vor-Ort-Termin. Beide Tarifvarianten finden Sie zusätzlich im beigefügten PDF."
                  : "Das PDF enthält die übermittelten Objekt- und Kontaktdaten für die persönliche Angebotserstellung."
              : "Das PDF enthält die Anfrage sowie die angegebenen Kontakt-, Objekt- und Leistungsdaten.",
        }),
        text:
          source === "cost-funnel"
              ? "Vielen Dank für Ihre Angaben. Ihre unverbindliche Hausvia Einschätzung befindet sich als PDF im Anhang."
            : isWinterServiceRequest
              ? hasWinterEstimate
                ? `Vielen Dank für Ihre Angaben. ${winterEmailPricing} Diese Online-Preiseinschätzung stellt kein Angebot dar. Die finale Kalkulation und ein Angebot erfolgen erst nach Prüfung durch Hausvia und gegebenenfalls nach einem Vor-Ort-Termin. Das PDF befindet sich im Anhang.`
                : "Vielen Dank für Ihre Winterdienst-Anfrage. Ihre Angaben befinden sich als PDF im Anhang."
              : "Vielen Dank für Ihre Anfrage. Ihre Angaben befinden sich als PDF im Anhang.",
        attachment,
        replyTo: SITE.email,
        idempotencyKey: `hausvia-lead/customer/${submissionId}`,
      }),
      sendResendEmail({
        to: internalLeadEmail,
        subject: `${isWinterServiceRequest ? "Neue Winterdienst Preiseinschätzung" : "Neue Hausvia Anfrage"} von ${customerName || "unbekannt"}`,
        html: emailHtml({
          headline: "Neue Hausvia Anfrage",
          intro:
            source === "cost-funnel"
              ? `Es ist eine neue Kostencheck-Anfrage von ${customerName || "unbekannt"} eingegangen. Das PDF mit allen Angaben und der serverseitigen Einschätzung ist beigefügt.`
              : isWinterServiceRequest
                ? hasWinterEstimate
                  ? `Es ist eine neue Winterdienst-Preiseinschätzung von ${customerName || "unbekannt"} eingegangen. ${winterEmailPricing}`
                  : `Es ist eine neue Winterdienst-Anfrage von ${customerName || "unbekannt"} eingegangen. Die übermittelten Objektangaben befinden sich im PDF.`
              : `Es ist eine neue Kontaktanfrage von ${customerName || "unbekannt"} eingegangen. Das PDF mit allen Angaben ist beigefügt.`,
          note:
            isWinterServiceRequest && hasWinterEstimate
              ? "Variable Abrechnung und Pauschalpaket wurden serverseitig neu berechnet. Die Online-Preiseinschätzung ist kein Angebot; die finale Kalkulation und ein Angebot erfolgen erst nach Hausvia-Prüfung und gegebenenfalls einem Vor-Ort-Termin."
              : "Die interne Kopie enthält alle übermittelten Daten und, falls vorhanden, die berechnete Ersteinschätzung.",
        }),
        text:
          isWinterServiceRequest && hasWinterEstimate
            ? `Neue Winterdienst-Preiseinschätzung von ${customerName || "unbekannt"}. ${winterEmailPricing} Dies ist kein Angebot. Die finale Kalkulation erfolgt nach Prüfung und gegebenenfalls einem Vor-Ort-Termin. Das PDF ist im Anhang.`
            : `Neue Hausvia Anfrage von ${customerName || "unbekannt"}. Das PDF mit allen Angaben ist im Anhang.`,
        attachment,
        replyTo,
        idempotencyKey: `hausvia-lead/admin/${submissionId}`,
      }),
    ]);
  } catch (error) {
    releaseSubmission(submissionId, fingerprint);
    console.error("Hausvia Resend delivery failed", error);
    return NextResponse.json(
      {
        ok: true,
        submissionId,
        emailDelivered: false,
        deliveryWarning:
          "Der PDF- und E-Mail-Versand ist gerade nicht möglich.",
        ...(winterResponseEstimate ? { estimate: winterResponseEstimate } : {}),
      },
      { status: 202 },
    );
  }

  try {
    await markFunnelLeadEmailDeliveryCompleted({
      ...deliveryStructuredLead,
      leadId: persistedLead?.leadId,
    });
  } catch (error) {
    console.error("Hausvia email delivery state persistence failed", error);
  }
  completeSubmission(submissionId, fingerprint);

  // TODO: Optional CRM/Webhook-Integration ergänzen, sobald Zielsystem und Datenschutzfreigabe feststehen.

  return NextResponse.json({
    ok: true,
    submissionId,
    ...(winterResponseEstimate ? { estimate: winterResponseEstimate } : {}),
  });
}
