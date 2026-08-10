export const leadSources = ["offer-request", "contact-form", "cost-funnel"] as const;
export type LeadSource = (typeof leadSources)[number];

export type ValidatedLeadPayload = {
  source: LeadSource;
  submittedAt?: string;
  submissionId?: string;
  lead: Record<string, unknown>;
};

export const leadPayloadLimits = {
  maximumRequestBytes: 64_000,
  maximumEnvelopeFields: 4,
  maximumLeadFields: 32,
  maximumServices: 20,
  maximumStringListItemLength: 160,
  maximumMessageLength: 2_000,
  maximumAddressLength: 300,
  maximumWinterPolygons: 12,
  maximumWinterPointsPerPolygon: 40,
  maximumWinterPoints: 160,
} as const;

type ValidationFailure = {
  ok: false;
  status: 400 | 413;
  message: string;
};

type ValidationSuccess = {
  ok: true;
  payload: ValidatedLeadPayload;
};

export type LeadPayloadValidationResult = ValidationFailure | ValidationSuccess;

export class LeadPayloadTooLargeError extends RangeError {
  constructor() {
    super("Die Anfrage ist zu groß.");
    this.name = "LeadPayloadTooLargeError";
  }
}

const envelopeFields = new Set(["source", "submittedAt", "submissionId", "lead"]);

const contactFormFields = new Set([
  "name",
  "company",
  "objectAddress",
  "serviceInterest",
  "phone",
  "email",
  "message",
  "privacyAccepted",
  "termsAccepted",
  "services",
]);

const offerRequestFields = new Set([
  "firstName",
  "lastName",
  "name",
  "company",
  "phone",
  "email",
  "objectAddress",
  "message",
  "desiredStartDate",
  "preferredCallbackTime",
  "privacyAccepted",
  "termsAccepted",
  "services",
  "winterContactGate",
  "winterAreaSource",
  "winterPolygonPoints",
  "winterPolygons",
  "winterPricingInput",
  "winterMapArea",
  "winterArea",
]);

const costFunnelFields = new Set([
  "objectType",
  "location",
  "outsideArea",
  "unitCount",
  "averageUnitArea",
  "outdoorArea",
  "gardenArea",
  "services",
  "servicePackage",
  "frequency",
  "complexity",
  "name",
  "company",
  "email",
  "phone",
  "objectAddress",
  "message",
  "desiredStartDate",
  "preferredCallbackTime",
  "privacyAccepted",
  "termsAccepted",
  "computedUsableArea",
  "selectedServiceLabels",
  "objectTypeLabel",
  "frequencyLabel",
  "complexityLabel",
]);

const fieldsBySource: Record<LeadSource, ReadonlySet<string>> = {
  "contact-form": contactFormFields,
  "offer-request": offerRequestFields,
  "cost-funnel": costFunnelFields,
};

const singleLineStringLimits = {
  firstName: 80,
  lastName: 80,
  name: 160,
  company: 160,
  phone: 40,
  email: 180,
  objectAddress: leadPayloadLimits.maximumAddressLength,
  serviceInterest: 160,
  desiredStartDate: 40,
  preferredCallbackTime: 100,
  objectType: 64,
  location: 200,
  frequency: 64,
  complexity: 64,
  objectTypeLabel: 160,
  frequencyLabel: 160,
  complexityLabel: 160,
  winterContactGate: 40,
  winterAreaSource: 16,
} as const;

const numberLikeFields = [
  "unitCount",
  "averageUnitArea",
  "outdoorArea",
  "gardenArea",
  "computedUsableArea",
  "winterMapArea",
  "winterArea",
] as const;

const booleanFields = [
  "outsideArea",
  "servicePackage",
  "privacyAccepted",
  "termsAccepted",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isLeadSource(value: unknown): value is LeadSource {
  return leadSources.some((source) => source === value);
}

function failure(message: string, status: 400 | 413 = 400): ValidationFailure {
  return { ok: false, status, message };
}

function isValidationFailure(
  value: ValidationFailure | { points: Array<{ lat: number; lng: number }> },
): value is ValidationFailure {
  return "ok" in value && value.ok === false;
}

function hasOnlyFields(
  value: Record<string, unknown>,
  allowedFields: ReadonlySet<string>,
  maximumFields: number,
) {
  const keys = Object.keys(value);
  return keys.length <= maximumFields && keys.every((key) => allowedFields.has(key));
}

function containsUnsafeControlCharacters(value: string, allowLineBreaks: boolean) {
  return allowLineBreaks
    ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)
    : /[\u0000-\u001f\u007f]/.test(value);
}

function copyString(
  input: Record<string, unknown>,
  output: Record<string, unknown>,
  field: string,
  maximumLength: number,
  allowLineBreaks = false,
): ValidationFailure | null {
  const value = input[field];
  if (value === undefined) return null;
  if (
    typeof value !== "string" ||
    value.length > maximumLength ||
    containsUnsafeControlCharacters(value, allowLineBreaks)
  ) {
    return failure(`Das Feld „${field}“ ist ungültig oder zu lang.`);
  }
  output[field] = value.trim();
  return null;
}

function copyBoolean(
  input: Record<string, unknown>,
  output: Record<string, unknown>,
  field: string,
): ValidationFailure | null {
  const value = input[field];
  if (value === undefined) return null;
  if (typeof value !== "boolean") return failure(`Das Feld „${field}“ ist ungültig.`);
  output[field] = value;
  return null;
}

function copyNumberLike(
  input: Record<string, unknown>,
  output: Record<string, unknown>,
  field: string,
): ValidationFailure | null {
  const value = input[field];
  if (value === undefined) return null;

  if (typeof value === "number") {
    if (!Number.isFinite(value) || Math.abs(value) > 100_000_000) {
      return failure(`Das Feld „${field}“ ist ungültig.`);
    }
    output[field] = value;
    return null;
  }

  if (
    typeof value !== "string" ||
    value.length > 24 ||
    containsUnsafeControlCharacters(value, false)
  ) {
    return failure(`Das Feld „${field}“ ist ungültig oder zu lang.`);
  }
  const normalizedValue = value.trim();
  if (normalizedValue) {
    const numericValue = Number(normalizedValue.replace(",", "."));
    if (!Number.isFinite(numericValue) || Math.abs(numericValue) > 100_000_000) {
      return failure(`Das Feld „${field}“ ist ungültig.`);
    }
  }
  output[field] = normalizedValue;
  return null;
}

function copyStringList(
  input: Record<string, unknown>,
  output: Record<string, unknown>,
  field: string,
): ValidationFailure | null {
  const value = input[field];
  if (value === undefined) return null;
  if (!Array.isArray(value) || value.length > leadPayloadLimits.maximumServices) {
    return failure(`Das Feld „${field}“ enthält zu viele oder ungültige Einträge.`);
  }

  const strings: string[] = [];
  for (const item of value) {
    if (
      typeof item !== "string" ||
      item.length > leadPayloadLimits.maximumStringListItemLength ||
      containsUnsafeControlCharacters(item, false)
    ) {
      return failure(`Das Feld „${field}“ enthält einen ungültigen Eintrag.`);
    }
    strings.push(item.trim());
  }
  output[field] = strings;
  return null;
}

function sanitizeMapPoints(value: unknown): { points: Array<{ lat: number; lng: number }> } | ValidationFailure {
  if (!Array.isArray(value) || value.length > leadPayloadLimits.maximumWinterPointsPerPolygon) {
    return failure("Die markierte Winterdienstfläche enthält zu viele oder ungültige Punkte.");
  }

  const points: Array<{ lat: number; lng: number }> = [];
  for (const item of value) {
    if (
      !isRecord(item) ||
      !hasOnlyFields(item, new Set(["lat", "lng"]), 2) ||
      typeof item.lat !== "number" ||
      typeof item.lng !== "number" ||
      !Number.isFinite(item.lat) ||
      !Number.isFinite(item.lng) ||
      item.lat < -90 ||
      item.lat > 90 ||
      item.lng < -180 ||
      item.lng > 180
    ) {
      return failure("Die markierte Winterdienstfläche enthält ungültige Punkte.");
    }
    points.push({ lat: item.lat, lng: item.lng });
  }
  return { points };
}

function copyWinterPolygons(
  input: Record<string, unknown>,
  output: Record<string, unknown>,
): ValidationFailure | null {
  const legacyValue = input.winterPolygonPoints;
  if (legacyValue !== undefined) {
    const result = sanitizeMapPoints(legacyValue);
    if (isValidationFailure(result)) return result;
    output.winterPolygonPoints = result.points;
  }

  const value = input.winterPolygons;
  if (value === undefined) return null;
  if (!Array.isArray(value) || value.length > leadPayloadLimits.maximumWinterPolygons) {
    return failure("Die markierten Winterdienstflächen sind ungültig oder zu zahlreich.");
  }

  const polygons: Array<Array<{ lat: number; lng: number }>> = [];
  let totalPoints = 0;
  for (const polygon of value) {
    const result = sanitizeMapPoints(polygon);
    if (isValidationFailure(result)) return result;
    totalPoints += result.points.length;
    if (totalPoints > leadPayloadLimits.maximumWinterPoints) {
      return failure("Die markierten Winterdienstflächen enthalten zu viele Punkte.");
    }
    polygons.push(result.points);
  }
  output.winterPolygons = polygons;
  return null;
}

function copyWinterPricingInput(
  input: Record<string, unknown>,
  output: Record<string, unknown>,
): ValidationFailure | null {
  const value = input.winterPricingInput;
  if (value === undefined) return null;
  const allowedFields = new Set(["objectType", "area", "surfaceProfile", "access", "readiness"]);
  if (!isRecord(value) || !hasOnlyFields(value, allowedFields, allowedFields.size)) {
    return failure("Die Winterdienstangaben enthalten nicht unterstützte Felder.");
  }

  const sanitized: Record<string, unknown> = {};
  for (const field of ["objectType", "surfaceProfile", "access", "readiness"] as const) {
    const error = copyString(value, sanitized, field, 40);
    if (error) return error;
  }
  const areaError = copyNumberLike(value, sanitized, "area");
  if (areaError) return areaError;
  output.winterPricingInput = sanitized;
  return null;
}

function sanitizeLead(source: LeadSource, input: Record<string, unknown>) {
  if (!hasOnlyFields(input, fieldsBySource[source], leadPayloadLimits.maximumLeadFields)) {
    return failure("Die Anfrage enthält nicht unterstützte oder zu viele Felder.");
  }

  const output: Record<string, unknown> = {};
  for (const [field, maximumLength] of Object.entries(singleLineStringLimits)) {
    if (!fieldsBySource[source].has(field)) continue;
    const error = copyString(input, output, field, maximumLength);
    if (error) return error;
  }

  if (fieldsBySource[source].has("message")) {
    const messageError = copyString(
      input,
      output,
      "message",
      leadPayloadLimits.maximumMessageLength,
      true,
    );
    if (messageError) return messageError;
  }

  for (const field of booleanFields) {
    if (!fieldsBySource[source].has(field)) continue;
    const error = copyBoolean(input, output, field);
    if (error) return error;
  }

  for (const field of numberLikeFields) {
    if (!fieldsBySource[source].has(field)) continue;
    const error = copyNumberLike(input, output, field);
    if (error) return error;
  }

  if (source === "cost-funnel") {
    const costNumber = (field: string) => {
      const value = output[field];
      if (typeof value === "number") return value;
      if (typeof value === "string" && value.trim()) return Number(value.replace(",", "."));
      return 0;
    };
    const unitCount = costNumber("unitCount");
    const averageUnitArea = costNumber("averageUnitArea");
    const outdoorArea = costNumber("outdoorArea");
    const gardenArea = costNumber("gardenArea");

    if (!Number.isInteger(unitCount) || unitCount <= 0) {
      return failure("Die Anzahl der Einheiten ist ungültig.");
    }
    if (averageUnitArea < 0 || outdoorArea < 0 || gardenArea < 0) {
      return failure("Flächenangaben dürfen nicht negativ sein.");
    }
    if (Object.prototype.hasOwnProperty.call(output, "gardenArea") && gardenArea > outdoorArea) {
      return failure("Die Grün-/Gartenfläche darf nicht größer als die gesamte Außenfläche sein.");
    }
  }

  const servicesError = copyStringList(input, output, "services");
  if (servicesError) return servicesError;

  if (fieldsBySource[source].has("selectedServiceLabels")) {
    const labelsError = copyStringList(input, output, "selectedServiceLabels");
    if (labelsError) return labelsError;
  }

  if (source === "offer-request") {
    const polygonError = copyWinterPolygons(input, output);
    if (polygonError) return polygonError;
    const pricingError = copyWinterPricingInput(input, output);
    if (pricingError) return pricingError;
  }

  return { ok: true as const, lead: output };
}

export async function readBoundedLeadRequestText(request: Request) {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength && /^\d+$/.test(declaredLength)) {
    const length = Number(declaredLength);
    if (!Number.isSafeInteger(length) || length > leadPayloadLimits.maximumRequestBytes) {
      throw new LeadPayloadTooLargeError();
    }
  }

  if (!request.body) return { text: "", byteLength: 0 };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    byteLength += value.byteLength;
    if (byteLength > leadPayloadLimits.maximumRequestBytes) {
      try {
        await reader.cancel();
      } catch {
        // The byte limit has already been enforced; cancellation is best effort.
      }
      throw new LeadPayloadTooLargeError();
    }
    chunks.push(value);
  }

  const body = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return {
    text: new TextDecoder("utf-8", { fatal: true }).decode(body),
    byteLength,
  };
}

export function validateAndSanitizeLeadPayload(
  value: unknown,
  byteLength: number,
): LeadPayloadValidationResult {
  if (!isRecord(value) || !hasOnlyFields(value, envelopeFields, leadPayloadLimits.maximumEnvelopeFields)) {
    return failure("Ungültige Anfragedaten.");
  }
  if (!isLeadSource(value.source)) return failure("Ungültige Anfragequelle.");
  if (!isRecord(value.lead)) return failure("Ungültige Anfragedaten.");

  const sanitizedResult = sanitizeLead(value.source, value.lead);
  if (sanitizedResult.ok === false) return sanitizedResult;

  if (
    !Number.isSafeInteger(byteLength) ||
    byteLength < 0 ||
    byteLength > leadPayloadLimits.maximumRequestBytes
  ) {
    return failure("Die Anfrage ist zu groß.", 413);
  }

  const payload: ValidatedLeadPayload = {
    source: value.source,
    lead: sanitizedResult.lead,
  };

  if (value.submittedAt !== undefined) {
    if (
      typeof value.submittedAt !== "string" ||
      value.submittedAt.length > 64 ||
      containsUnsafeControlCharacters(value.submittedAt, false)
    ) {
      return failure("Der Absendezeitpunkt ist ungültig.");
    }
    payload.submittedAt = value.submittedAt.trim();
  }

  if (value.submissionId !== undefined) {
    if (
      typeof value.submissionId !== "string" ||
      value.submissionId.length > 100 ||
      containsUnsafeControlCharacters(value.submissionId, false)
    ) {
      return failure("Die Submission-ID ist ungültig.");
    }
    payload.submissionId = value.submissionId.trim();
  }

  return { ok: true, payload };
}
