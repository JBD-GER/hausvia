import { createHash, timingSafeEqual } from "node:crypto";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  return value;
}

export function canonicalOfferContent(value: unknown) {
  return JSON.stringify(canonicalize(value));
}

export function offerContentSha256(value: unknown) {
  return createHash("sha256").update(canonicalOfferContent(value), "utf8").digest("hex");
}

export function offerPdfSha256(value: Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

export function verifyOfferPdfSha256(value: Uint8Array, expected: unknown) {
  if (typeof expected !== "string" || !/^[0-9a-f]{64}$/.test(expected)) return false;
  return timingSafeEqual(
    Buffer.from(offerPdfSha256(value), "hex"),
    Buffer.from(expected, "hex"),
  );
}

export function canRoleDownloadOffer(role: unknown) {
  return role === "admin" || role === "customer";
}

export function effectiveOfferStatus(status: string, validUntil?: string | null, today?: string) {
  const comparisonDate = today ?? new Date().toISOString().slice(0, 10);
  if (["sent", "viewed"].includes(status) && validUntil && validUntil < comparisonDate) {
    return "expired";
  }
  return status;
}

export function offerVersionStoragePath({
  offerId,
  versionNumber,
  sha256,
  kind = "offer",
}: {
  offerId: string;
  versionNumber: number;
  sha256: string;
  kind?: "offer" | "acceptance";
}) {
  if (!/^[0-9a-f-]{36}$/i.test(offerId) || !Number.isInteger(versionNumber) || versionNumber < 1) {
    throw new Error("Ungültiger Angebotsverweis");
  }
  if (!/^[0-9a-f]{64}$/.test(sha256)) throw new Error("Ungültige PDF-Prüfsumme");
  return `offers/${offerId}/v${versionNumber}/${kind}-${sha256}.pdf`;
}
