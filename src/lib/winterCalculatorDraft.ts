import "client-only";

import {
  sanitizeWinterMapPoints,
  sanitizeWinterObjectAddress,
  type WinterMapPoint,
} from "@/lib/winterMap";

const storageKey = "hausvia-winter-calculator-v2";
const maximumDraftAgeMs = 30 * 60 * 1000;

export const winterRequestEventName = "hausvia:winter-request";

export type WinterCalculatorDraft = {
  version: 2;
  id: string;
  createdAt: number;
  objectAddress: string;
  areaSource: "map" | "manual";
  polygonPoints: WinterMapPoint[];
};

function createDraftId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();

  const randomValues = crypto.getRandomValues(new Uint32Array(2));
  return `${Date.now().toString(36)}-${randomValues[0].toString(36)}${randomValues[1].toString(36)}`;
}

function removeStoredDraft() {
  sessionStorage.removeItem(storageKey);
}

export function writeWinterCalculatorDraft(
  draft: Omit<WinterCalculatorDraft, "version" | "id" | "createdAt">,
) {
  try {
    const id = createDraftId();
    sessionStorage.setItem(
      storageKey,
      JSON.stringify({
        version: 2,
        id,
        createdAt: Date.now(),
        objectAddress: sanitizeWinterObjectAddress(draft.objectAddress),
        areaSource: draft.areaSource,
        polygonPoints: sanitizeWinterMapPoints(draft.polygonPoints),
      } satisfies WinterCalculatorDraft),
    );
    return id;
  } catch {
    // Der Rechner und die Anfrage bleiben auch ohne Session Storage nutzbar.
    return null;
  }
}

export function readWinterCalculatorDraft(expectedId: string): WinterCalculatorDraft | null {
  try {
    if (!expectedId || expectedId.length > 100) return null;

    const storedValue = sessionStorage.getItem(storageKey);
    if (!storedValue) return null;

    const parsed = JSON.parse(storedValue) as Record<string, unknown>;
    const objectAddress = sanitizeWinterObjectAddress(parsed.objectAddress);
    const polygonPoints = sanitizeWinterMapPoints(parsed.polygonPoints);
    const areaSource = parsed.areaSource === "map" ? "map" : parsed.areaSource === "manual" ? "manual" : null;
    const createdAt = typeof parsed.createdAt === "number" ? parsed.createdAt : Number.NaN;
    const age = Date.now() - createdAt;

    if (
      parsed.version !== 2 ||
      parsed.id !== expectedId ||
      !areaSource ||
      !Number.isFinite(createdAt) ||
      age < 0 ||
      age > maximumDraftAgeMs
    ) {
      removeStoredDraft();
      return null;
    }

    return {
      version: 2,
      id: expectedId,
      createdAt,
      objectAddress,
      areaSource,
      polygonPoints: areaSource === "map" && polygonPoints.length >= 3 ? polygonPoints : [],
    };
  } catch {
    return null;
  }
}

export function clearWinterCalculatorDraft() {
  try {
    removeStoredDraft();
  } catch {
    // Kein Fehler für Nutzer, wenn Browser-Speicher blockiert ist.
  }
}
