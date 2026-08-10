import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const sourcePath = path.resolve("src", `${specifier.slice(2)}.ts`);
      return nextResolve(pathToFileURL(sourcePath).href, context);
    }
    return nextResolve(specifier, context);
  },
});

const { createLeadPdf } = await import("./leadPdf.ts");

const polygon = [
  { lat: 52.375, lng: 9.732 },
  { lat: 52.375, lng: 9.732147 },
  { lat: 52.37509, lng: 9.732147 },
  { lat: 52.37509, lng: 9.732 },
];

function encodedPdfText(value) {
  return Buffer.from(value, "latin1").toString("hex").toUpperCase();
}

test("erzeugt die PDF-Flächenübersicht nur als Vektorgrafik aus validierten Polygonen", () => {
  const pdf = createLeadPdf({
    source: "offer-request",
    submittedAt: "2026-08-04T09:46:00.000Z",
    lead: {
      name: "Max Mustermann",
      company: "Musterverwaltung",
      email: "max@example.com",
      phone: "+49 511 123456",
      objectAddress: "Musterstraße 1, 30159 Hannover",
      services: ["Winterdienst"],
      selectedServiceLabels: ["Winterdienst"],
      winterAreaSource: "map",
      winterAreaSourceLabel: "Auf der Satellitenkarte markiert",
      winterPolygons: [polygon],
      winterMapSnapshot: "data:image/jpeg;base64,SEFVU1ZJQS1GQUtFLU1BUktFUg==",
      privacyAccepted: true,
      termsAccepted: true,
    },
  });
  const pdfSource = pdf.toString("latin1");

  assert.match(pdfSource, /2\.25 w 1 J 1 j/);
  assert.equal((pdfSource.match(/\/Subtype \/Image/g) ?? []).length, 1);
  assert.match(pdfSource, /\/HausviaLogo 5 0 R/);
  assert.ok(
    pdfSource.includes(Buffer.from("Hausvia. Digital. Zuverlässig. Vor Ort.", "latin1").toString("hex").toUpperCase()),
  );
  assert.doesNotMatch(pdfSource, /HAUSVIA-FAKE-MARKER/);
});

test("zeigt bei Großflächen eine individuelle Prüfung statt der internen Proberechnung", () => {
  const pdf = createLeadPdf({
    source: "cost-funnel",
    submittedAt: "2026-08-10T10:00:00.000Z",
    lead: {
      name: "Max Mustermann",
      email: "max@example.com",
      phone: "+49 511 123456",
      objectAddress: "Musterstraße 1, 30159 Hannover",
      averageUnitArea: 15,
      computedUsableArea: 150,
      outdoorArea: 15_000,
      gardenArea: 10_000,
      pavedOutdoorArea: 5_000,
      estimateText: "13.260 €–20.840 € pro Monat",
      estimate: {
        lower: 13_260,
        upper: 20_840,
        requiresManualReview: true,
        manualReviewReason: "Außenfläche über 5.000 m² erfordert eine individuelle Kalkulation.",
      },
      selectedServiceLabels: ["Gartenpflege", "Außenreinigung / Hof / Müllplatz"],
    },
  });
  const pdfSource = pdf.toString("latin1");

  assert.ok(pdfSource.includes(encodedPdfText("Individuelle Kalkulation erforderlich")));
  assert.ok(pdfSource.includes(encodedPdfText("Davon Grün-/Gartenfläche")));
  assert.ok(!pdfSource.includes(encodedPdfText("13.260")));
});
