import assert from "node:assert/strict";
import test from "node:test";

import {
  createOfferAcceptanceConfirmationPdf,
  createOfferVersionPdf,
  offerAcceptanceFileName,
  offerBillingBuckets,
  offerDocumentFileName,
  offerOriginalStoragePath,
  offerVersionContentSha256,
  safeOfferFileToken,
  sha256Hex,
  validateOfferIssuerSnapshot,
} from "./offerDocuments.ts";

function pdfTextValues(pdf) {
  const source = pdf.toString("latin1");
  return [...source.matchAll(/<([0-9A-F]+)>/g)].map((match) =>
    Buffer.from(match[1], "hex").toString("latin1"),
  );
}

export function fixtureVersion() {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    offer_id: "22222222-2222-4222-8222-222222222222",
    customer_id: "33333333-3333-4333-8333-333333333333",
    version_number: 2,
    lifecycle_status: "sent",
    offer_number: "ANG-2026-000042",
    title: "Ganzjährige Objektbetreuung",
    contact_name: "Erika Muster",
    recipient_snapshot: {
      company_name: "Muster Hausverwaltung GmbH",
      contact_name: "Erika Muster",
      email: "erika@example.de",
      street: "Musterweg",
      house_number: "7",
      postal_code: "50667",
      city: "Köln",
      country: "Deutschland",
    },
    object_label: "Wohnanlage am Park",
    object_address: "Parkstraße 12, 50667 Köln",
    offer_date: "2026-08-05",
    valid_until: "2026-09-04",
    planned_start_date: "2026-10-01",
    intro: "Vielen Dank für Ihr Interesse an der Betreuung Ihrer Wohnanlage.",
    visible_note: "Die Kontrollgänge werden nachvollziehbar dokumentiert.",
    payment_terms: "Zahlbar innerhalb von 14 Tagen nach Rechnungserhalt.",
    contract_terms: "Die Mindestvertragslaufzeit beträgt zwölf Monate.",
    issuer_snapshot: {
      legal_name: "Hausvia Service GmbH",
      brand_name: "Hausvia",
      street: "Domstraße",
      house_number: "1",
      postal_code: "50667",
      city: "Köln",
      country: "Deutschland",
      email: "hallo@hausvia.de",
      phone: "+49 221 123456",
      tax_number: "123/456/78901",
      vat_id: "DE123456789",
      commercial_register: "HRB 12345 · Amtsgericht Köln",
      management: "Christoph Pfad",
      bank_name: "Musterbank",
      iban: "DE00123456781234567890",
      bic: "MUSTERBIC",
    },
    subtotal_cents: 27_000,
    discount_total_cents: 2_000,
    net_total_cents: 25_000,
    tax_total_cents: 4_750,
    gross_total_cents: 29_750,
    billing_totals: {
      monthly: {
        subtotal_cents: 20_000,
        discount_cents: 2_000,
        net_cents: 18_000,
        tax_cents: 3_420,
        gross_cents: 21_420,
      },
      per_visit: {
        subtotal_cents: 7_000,
        discount_cents: 0,
        net_cents: 7_000,
        tax_cents: 1_330,
        gross_cents: 8_330,
      },
    },
    calculation_snapshot: { source: "offer-pricing-v2" },
    frozen_at: "2026-08-05T10:00:00.000Z",
    sent_at: "2026-08-05T10:05:00.000Z",
    original_pdf_bucket: "offer-pdfs",
    original_pdf_path: "offers/original.pdf",
    original_pdf_sha256: "a".repeat(64),
    document_content_sha256: "b".repeat(64),
    created_at: "2026-08-05T09:00:00.000Z",
    offer_version_items: [
      {
        id: "44444444-4444-4444-8444-444444444444",
        client_key: "care",
        item_kind: "standard",
        title: "Hausmeisterliche Objektkontrolle",
        description: "Kontrolle der Gemeinschaftsflächen und Meldung sichtbarer Mängel.",
        area_sqm: 0,
        quantity: 1,
        unit: "month",
        frequency: "weekly",
        frequency_occurrences: 1,
        billing_type: "monthly",
        calculation_type: "flat",
        unit_price_cents: 20_000,
        minimum_price_cents: 0,
        automatic_total_cents: 20_000,
        total_net_cents: 20_000,
        tax_rate_bps: 1_900,
        manual_price: false,
        permanent: true,
        seasonal: false,
        season_start_month: null,
        season_end_month: null,
        visible_note: "Vier dokumentierte Kontrollgänge pro Monat.",
        winter_surface_type: null,
        winter_model: null,
        included_visits: 0,
        additional_visit_price_cents: 0,
        monthly_base_fee_cents: 0,
        seasonal_flat_rate_cents: 0,
        surcharge_cents: 0,
        price_components: [{ billing_bucket: "monthly", amount_cents: 20_000 }],
        pricing_snapshot: { source: "automatic" },
        sort_order: 0,
      },
      {
        id: "55555555-5555-4555-8555-555555555555",
        client_key: "winter",
        item_kind: "winter",
        title: "Winterdienst je Einsatz",
        description: "Räumen und Streuen nach Bedarf.",
        area_sqm: 120,
        quantity: 1,
        unit: "visit",
        frequency: "on_demand",
        frequency_occurrences: 1,
        billing_type: "per_visit",
        calculation_type: "per_visit",
        unit_price_cents: 7_000,
        minimum_price_cents: 0,
        automatic_total_cents: 7_000,
        total_net_cents: 7_000,
        tax_rate_bps: 1_900,
        manual_price: false,
        permanent: false,
        seasonal: true,
        season_start_month: 11,
        season_end_month: 3,
        visible_note: null,
        winter_surface_type: "sidewalk",
        winter_model: "per_visit",
        included_visits: 0,
        additional_visit_price_cents: 7_000,
        monthly_base_fee_cents: 0,
        seasonal_flat_rate_cents: 0,
        surcharge_cents: 0,
        price_components: [{ billingBucket: "per_visit", amountCents: 7_000 }],
        pricing_snapshot: { source: "automatic" },
        sort_order: 1,
      },
    ],
    offer_discounts: [
      {
        id: "66666666-6666-4666-8666-666666666666",
        offer_item_id: null,
        scope: "overall",
        discount_type: "fixed",
        percentage_bps: null,
        amount_cents: 2_000,
        applied_amount_cents: 2_000,
        reason: "Willkommensrabatt",
        sort_order: 0,
      },
    ],
  };
}

test("erzeugt ein versioniertes Angebot mit allen Pflichtbereichen und nur einer Positionsüberschrift", () => {
  const pdf = createOfferVersionPdf(fixtureVersion());
  const pdfSource = pdf.toString("latin1");
  const values = pdfTextValues(pdf);
  const text = values.join("\n");

  assert.equal(pdf.subarray(0, 8).toString("ascii"), "%PDF-1.4");
  assert.equal((pdfSource.match(/\/Subtype \/Image/g) ?? []).length, 1);
  assert.match(pdfSource, /\/HausviaLogo 5 0 R/);
  assert.match(text, /ANG-2026-000042/);
  assert.match(text, /Hausvia\. Digital\. Zuverlässig\. Vor Ort\./);
  assert.match(text, /Gültig bis/);
  assert.match(text, /Wohnanlage am Park/);
  assert.match(text, /Preisübersicht nach Abrechnung/);
  assert.match(text, /Willkommensrabatt/);
  assert.match(text, /Zahlungsbedingungen/);
  assert.match(text, /Vertragsbedingungen/);
  assert.match(text, /Anbieter- und Unternehmensdaten/);
  assert.match(text, /Steuernummer: 123\/456\/78901/);
  assert.match(text, /USt-IdNr.: DE123456789/);
  assert.match(text, /Geschäftsführung: Christoph Pfad/);
  assert.match(text, /IBAN DE00123456781234567890/);
  assert.match(text, /Ich nehme das vorliegende Angebot verbindlich an\./);
  assert.equal(values.filter((value) => value === "Positionen").length, 1);
  assert.match(sha256Hex(pdf), /^[0-9a-f]{64}$/);
});

test("blockiert den Versand mit unvollständigem Anbieter-Snapshot", () => {
  const complete = fixtureVersion().issuer_snapshot;
  assert.deepEqual(validateOfferIssuerSnapshot(complete), { valid: true, missing: [] });

  const incomplete = { ...complete, phone: "", iban: "", tax_number: "", vat_id: "" };
  const validation = validateOfferIssuerSnapshot(incomplete);
  assert.equal(validation.valid, false);
  assert.ok(validation.missing.includes("Telefon"));
  assert.ok(validation.missing.includes("IBAN"));
  assert.ok(validation.missing.includes("Steuernummer oder Umsatzsteuer-ID"));
});

test("weist Winter-Saisonpauschale und flexible Saisongrundgebühr nachvollziehbar aus", () => {
  const seasonal = fixtureVersion();
  seasonal.offer_version_items[1].winter_model = "seasonal_flat";
  seasonal.offer_version_items[1].quantity = 8;
  seasonal.offer_version_items[1].included_visits = 5;
  seasonal.offer_version_items[1].seasonal_flat_rate_cents = 25_000;
  seasonal.offer_version_items[1].price_components = [
    { bucket: "seasonal", net_cents: 25_000 },
    { bucket: "per_visit", net_cents: 21_000 },
  ];
  let text = pdfTextValues(createOfferVersionPdf(seasonal)).join("\n");
  assert.match(text, /Preis pro Saisonmonat: 50,00/);
  assert.match(text, /Gesamtpreis für 5 Saisonmonate: 250,00/);
  assert.match(text, /Effektiv je geplantem zusätzlichen Einsatz:\s+70,00/);

  const flexible = fixtureVersion();
  flexible.offer_version_items[1].winter_model = "monthly_plus_visit";
  flexible.offer_version_items[1].included_visits = 0;
  flexible.offer_version_items[1].monthly_base_fee_cents = 4_000;
  flexible.offer_version_items[1].price_components = [{ bucket: "monthly", net_cents: 4_000 }];
  text = pdfTextValues(createOfferVersionPdf(flexible)).join("\n");
  assert.match(text, /Monatliche Grundgebühr: 40,00/);
  assert.match(text, /Grundbetrag für 5 Saisonmonate: 200,00/);
  assert.match(text, /0 Einsätze inklusive/);
});

test("übernimmt lange Vertragsbeschreibungen, Positionshinweise und Rabatte vollständig ins PDF", () => {
  const version = fixtureVersion();
  version.offer_version_items[0].description = `${"Ausführliche Leistungsbeschreibung ".repeat(90)}BESCHREIBUNGSENDE`;
  version.offer_version_items[0].visible_note = `${"Verbindlicher Positionshinweis ".repeat(90)}POSITIONSHINWEISENDE`;
  version.offer_discounts[0].reason = `${"Lang begründeter Rabatt ".repeat(10)}RABATTENDE`;

  const values = pdfTextValues(createOfferVersionPdf(version)).join("\n");
  assert.match(values, /BESCHREIBUNGSENDE/);
  assert.match(values, /POSITIONSHINWEISENDE/);
  assert.match(values, /RABATTENDE/);
});

test("hält monatliche und einsatzbezogene Beträge getrennt", () => {
  assert.deepEqual(offerBillingBuckets(fixtureVersion().billing_totals), [
    {
      key: "monthly",
      label: "Monatlich",
      suffix: " / Monat",
      subtotalCents: 20_000,
      discountCents: 2_000,
      netCents: 18_000,
      taxCents: 3_420,
      grossCents: 21_420,
    },
    {
      key: "per_visit",
      label: "Einsatzbezogene Prognose",
      suffix: " für geplante Einsätze",
      subtotalCents: 7_000,
      discountCents: 0,
      netCents: 7_000,
      taxCents: 1_330,
      grossCents: 8_330,
    },
  ]);
});

test("erzeugt eine nachvollziehbare Annahmebestätigung aus dem versiegelten Fingerabdruck", () => {
  const pdf = createOfferAcceptanceConfirmationPdf({
    offerNumber: "ANG-2026-000042",
    versionNumber: 2,
    acceptedName: "Erika Muster",
    acceptedAt: "2026-08-12T13:14:00.000Z",
    confirmedGrossTotalCents: 29_750,
    comment: "Bitte Starttermin abstimmen.",
    issuerSnapshot: fixtureVersion().issuer_snapshot,
    recipientSnapshot: fixtureVersion().recipient_snapshot,
    contentSha256: "b".repeat(64),
  });
  const text = pdfTextValues(pdf).join("\n");

  assert.match(text, /Annahmebestätigung/);
  assert.match(text, /Erika Muster/);
  assert.match(text, /Rechnerische Vergleichssumme/);
  assert.match(text, /kein einheitlicher Zahlbetrag/);
  assert.match(text, /Bitte Starttermin abstimmen\./);
  assert.match(text, new RegExp("b{64}"));
});

test("bricht auch einen maximal langen Kommentar sicher über mehrere Seiten um", () => {
  const longComment = "x".repeat(4_000);
  const pdf = createOfferAcceptanceConfirmationPdf({
    offerNumber: "ANG-2026-000042",
    versionNumber: 2,
    acceptedName: "Erika Muster",
    acceptedAt: "2026-08-12T13:14:00.000Z",
    confirmedGrossTotalCents: 29_750,
    comment: longComment,
    issuerSnapshot: fixtureVersion().issuer_snapshot,
    recipientSnapshot: fixtureVersion().recipient_snapshot,
    contentSha256: "b".repeat(64),
  });
  const values = pdfTextValues(pdf);
  const wrappedCommentLength = values
    .filter((value) => /^x+$/.test(value))
    .reduce((length, value) => length + value.length, 0);

  assert.equal(wrappedCommentLength, longComment.length);
  assert.match(pdf.toString("latin1"), /\/Count [2-9]/);
});

test("bereinigt Dateinamen und Storage-Pfade ohne steuerbare Pfadsegmente", () => {
  assert.equal(safeOfferFileToken("../../ANG 2026/ÄÖÜ 42"), "ang-2026-aou-42");
  assert.equal(offerDocumentFileName("ANG-2026-000042", 2), "ang-2026-000042-v2-angebot-hausvia.pdf");
  assert.equal(
    offerAcceptanceFileName("ANG-2026-000042", 2),
    "ang-2026-000042-v2-annahmebestaetigung-hausvia.pdf",
  );
  const path = offerOriginalStoragePath(fixtureVersion());
  assert.doesNotMatch(path, /\.\.|\\/);
  assert.match(path, /^offers\/[0-9a-f-]+\/versions\/[0-9a-f-]+\//);
});

test("bildet den Inhaltsfingerabdruck deterministisch", () => {
  const first = fixtureVersion();
  const second = fixtureVersion();
  second.recipient_snapshot = {
    city: "Köln",
    postal_code: "50667",
    street: "Musterweg",
    company_name: "Muster Hausverwaltung GmbH",
    country: "Deutschland",
    email: "erika@example.de",
    house_number: "7",
    contact_name: "Erika Muster",
  };
  assert.equal(offerVersionContentSha256(first), offerVersionContentSha256(second));
});
