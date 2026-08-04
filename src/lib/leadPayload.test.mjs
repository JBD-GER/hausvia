import assert from "node:assert/strict";
import test from "node:test";

import {
  LeadPayloadTooLargeError,
  leadPayloadLimits,
  readBoundedLeadRequestText,
  validateAndSanitizeLeadPayload,
} from "./leadPayload.ts";

const contactLead = {
  name: "Max Mustermann",
  company: "Musterverwaltung",
  objectAddress: "Lister Meile 1, Hannover",
  serviceInterest: "Winterdienst",
  phone: "+49 511 123456",
  email: "max@example.com",
  message: "Bitte zurückrufen.",
  privacyAccepted: true,
  termsAccepted: true,
  services: ["Kontaktformular"],
};

test("akzeptiert und kanonisiert das bestehende Kontaktformular", () => {
  const result = validateAndSanitizeLeadPayload(
    {
      source: "contact-form",
      submittedAt: "2026-08-04T09:46:00.000Z",
      lead: contactLead,
    },
    1_000,
  );

  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.payload.lead, contactLead);
});

test("akzeptiert die bestehenden Kostenfunnel- und Winterdienstfelder", () => {
  const costResult = validateAndSanitizeLeadPayload(
    {
      source: "cost-funnel",
      lead: {
        objectType: "weg",
        location: "Hannover",
        outsideArea: false,
        unitCount: "12",
        averageUnitArea: "80",
        outdoorArea: "400",
        services: ["caretaker", "gardenCare"],
        servicePackage: false,
        frequency: "weekly",
        complexity: "normal",
        name: "Max Mustermann",
        company: "Musterverwaltung",
        email: "max@example.com",
        phone: "+49 511 123456",
        objectAddress: "Lister Meile 1, Hannover",
        message: "",
        desiredStartDate: "",
        preferredCallbackTime: "",
        privacyAccepted: true,
        termsAccepted: true,
        computedUsableArea: 960,
        selectedServiceLabels: ["Hausmeisterservice", "Gartenpflege"],
        objectTypeLabel: "WEG / Mehrfamilienhaus",
        frequencyLabel: "1x pro Woche",
        complexityLabel: "normal",
      },
    },
    4_000,
  );
  assert.equal(costResult.ok, true);

  const polygon = [
    { lat: 52.375, lng: 9.732 },
    { lat: 52.375, lng: 9.733 },
    { lat: 52.376, lng: 9.733 },
  ];
  const winterResult = validateAndSanitizeLeadPayload(
    {
      source: "offer-request",
      submissionId: "winter-request-123456",
      lead: {
        firstName: "Max",
        lastName: "Mustermann",
        name: "Max Mustermann",
        company: "Privatperson",
        phone: "+49 511 123456",
        email: "max@example.com",
        services: ["Winterdienst"],
        winterContactGate: "direct-price-v1",
        objectAddress: "Lister Meile 1, Hannover",
        winterAreaSource: "map",
        winterPolygons: [polygon],
        winterPolygonPoints: polygon,
        winterPricingInput: {
          objectType: "private",
          area: "120",
          surfaceProfile: "manual",
          access: "standard",
          readiness: "standard",
        },
        privacyAccepted: true,
        termsAccepted: true,
      },
    },
    4_000,
  );
  assert.equal(winterResult.ok, true);
});

test("weist unbekannte, überlange und vervielfachte Felder zurück", () => {
  const unknown = validateAndSanitizeLeadPayload(
    { source: "contact-form", lead: { ...contactLead, arbitraryPayload: "nicht erlaubt" } },
    1_000,
  );
  assert.deepEqual(unknown.ok ? null : unknown.status, 400);

  const oversized = validateAndSanitizeLeadPayload(
    { source: "contact-form", lead: { ...contactLead, message: "x".repeat(2_001) } },
    3_000,
  );
  assert.deepEqual(oversized.ok ? null : oversized.status, 400);

  const tooManyServices = validateAndSanitizeLeadPayload(
    {
      source: "contact-form",
      lead: {
        ...contactLead,
        services: Array.from({ length: leadPayloadLimits.maximumServices + 1 }, () => "Kontaktformular"),
      },
    },
    3_000,
  );
  assert.deepEqual(tooManyServices.ok ? null : tooManyServices.status, 400);
});

test("setzt für alle Lead-Arten ein enges Body-Limit", () => {
  const generalResult = validateAndSanitizeLeadPayload(
    { source: "contact-form", lead: contactLead },
    leadPayloadLimits.maximumRequestBytes + 1,
  );
  assert.deepEqual(generalResult.ok ? null : generalResult.status, 413);

  const winterResult = validateAndSanitizeLeadPayload(
    {
      source: "offer-request",
      lead: {
        firstName: "Max",
        lastName: "Mustermann",
        name: "Max Mustermann",
        phone: "+49 511 123456",
        email: "max@example.com",
        services: ["Winterdienst"],
        privacyAccepted: true,
        termsAccepted: true,
      },
    },
    leadPayloadLimits.maximumRequestBytes + 1,
  );
  assert.deepEqual(winterResult.ok ? null : winterResult.status, 413);
});

test("bricht auch einen Request ohne vertrauenswürdige Content-Length am Byte-Limit ab", async () => {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(leadPayloadLimits.maximumRequestBytes));
      controller.enqueue(new Uint8Array(1));
      controller.close();
    },
  });
  const request = new Request("http://localhost/api/lead", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: stream,
    duplex: "half",
  });

  await assert.rejects(readBoundedLeadRequestText(request), LeadPayloadTooLargeError);
});
