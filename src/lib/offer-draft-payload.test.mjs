import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPersistableOfferPayload,
  copyOfferVersionToRawDraft,
  rawOfferDraftSchema,
} from "./offerDraftPayload.ts";

const catalogId = "00000000-0000-4000-8000-000000000011";

function draft(overrides = {}) {
  return rawOfferDraftSchema.parse({
    customer_id: "00000000-0000-4000-8000-000000000012",
    title: "Objektbetreuung Musterweg",
    contact_name: "Erika Muster",
    recipient_snapshot: {
      email: "kunde@example.com",
      recipient_name: "Muster WEG",
      address: "Musterweg 4",
      postal_code: "30159",
      city: "Hannover",
      country: "Deutschland",
    },
    object_label: "Musterweg 4",
    object_address: "Musterweg 4, 30159 Hannover",
    offer_date: "2026-08-05",
    valid_until: "2026-09-04",
    planned_start_date: "2026-10-01",
    payment_terms: "14 Tage netto",
    contract_terms: "Mindestlaufzeit 12 Monate",
    items: [
      {
        client_key: "service-1",
        service_catalog_id: catalogId,
        item_kind: "standard",
        title: "Treppenhausreinigung",
        area_sqm: 100,
        quantity: 1,
        unit: "square_meter",
        frequency: "monthly",
        frequency_occurrences: 1,
        billing_type: "monthly",
        calculation_type: "base_plus_area",
        unit_price_cents: 999_999,
        minimum_price_cents: 0,
        manual_price: false,
        permanent: true,
        seasonal: false,
        tax_rate_bps: 1900,
      },
    ],
    discounts: [
      {
        client_key: "discount-1",
        scope: "overall",
        discount_type: "percent",
        percentage_bps: 1000,
        reason: "Neukundenrabatt",
      },
    ],
    ...overrides,
  });
}

const rule = {
  service_catalog_id: catalogId,
  calculation_type: "base_plus_area",
  default_billing_type: "monthly",
  base_price_cents: 2_000,
  price_per_sqm_cents: 50,
  minimum_price_cents: 4_000,
  price_per_visit_cents: 0,
  price_per_hour_cents: 0,
  unit_price_cents: 0,
  frequency_factor: 1,
  seasonal_surcharge_bps: 0,
  material_flat_fee_cents: 0,
  winter_model: null,
  included_visits: 0,
  additional_visit_price_cents: 0,
  monthly_base_fee_cents: 0,
  seasonal_flat_rate_cents: 0,
  custom_formula: null,
};

test("Katalogpreise werden serverseitig aus der Regel statt aus Client-Summen berechnet", () => {
  const result = buildPersistableOfferPayload(draft(), [rule]);
  assert.equal(result.subtotal_cents, 7_000);
  assert.equal(result.discount_total_cents, 700);
  assert.equal(result.net_total_cents, 6_300);
  assert.equal(result.tax_total_cents, 1_197);
  assert.equal(result.gross_total_cents, 7_497);
  assert.equal(result.billing_totals.monthly.net_cents, 6_300);
  assert.equal(result.items[0].pricing_snapshot.rule.base_price_cents, 2_000);
  assert.equal(result.items[0].pricing_snapshot.subtotal_cents, 7_000);
  assert.equal(result.items[0].pricing_snapshot.discount_cents, 700);
  assert.equal(result.items[0].pricing_snapshot.net_cents, 6_300);
  assert.equal(result.items[0].pricing_snapshot.billing_buckets.monthly.net_cents, 6_300);
});

test("manueller Override bleibt explizit und wird rabattiert", () => {
  const value = draft({
    items: [
      {
        ...draft().items[0],
        manual_price: true,
        manual_total_cents: 10_000,
        manual_price_reason: "Vor-Ort-Kalkulation",
      },
    ],
    discounts: [],
  });
  const result = buildPersistableOfferPayload(value, [rule]);
  assert.equal(result.items[0].automatic_total_cents, 7_000);
  assert.equal(result.items[0].total_net_cents, 10_000);
  assert.equal(result.items[0].manual_price, true);
  assert.equal(result.net_total_cents, 10_000);
});

test("ein fixer Positionszuschlag wird serverseitig in die Kalkulation einbezogen", () => {
  const value = draft({
    items: [
      {
        ...draft().items[0],
        surcharge_cents: 1_250,
      },
    ],
    discounts: [],
  });
  const result = buildPersistableOfferPayload(value, [rule]);
  assert.equal(result.items[0].automatic_total_cents, 8_250);
  assert.equal(result.net_total_cents, 8_250);
});

test("Winter-Grundgebühr wird einmalig und nur Einsätze oberhalb des Inklusivkontingents berechnet", () => {
  const winterRule = {
    ...rule,
    winter_model: "monthly_plus_visit",
    base_price_cents: 0,
    price_per_sqm_cents: 0,
    minimum_price_cents: 0,
    monthly_base_fee_cents: 2_000,
    additional_visit_price_cents: 300,
  };
  const value = draft({
    items: [
      {
        ...draft().items[0],
        item_kind: "winter",
        title: "Winterdienst",
        quantity: 5,
        unit: "visit",
        calculation_type: "per_visit",
        billing_type: "monthly",
        winter_model: "monthly_plus_visit",
        included_visits: 2,
        monthly_base_fee_cents: 2_000,
        additional_visit_price_cents: 300,
        permanent: false,
        seasonal: true,
        season_start_month: 11,
        season_end_month: 3,
      },
    ],
    discounts: [],
  });
  const result = buildPersistableOfferPayload(value, [winterRule]);
  assert.equal(result.billing_totals.monthly.net_cents, 2_000);
  assert.equal(result.billing_totals.per_visit.net_cents, 900);
  assert.equal(result.net_total_cents, 2_900);
});

test("monatliche Frequenz verändert den Preis und ein zentraler Faktor null bleibt null", () => {
  const weeklyValue = draft({
    items: [{
      ...draft().items[0],
      frequency: "weekly",
      area_sqm: 0,
    }],
    discounts: [],
  });
  const weeklyRule = {
    ...rule,
    base_price_cents: 1_200,
    price_per_sqm_cents: 0,
    minimum_price_cents: 0,
  };
  const weekly = buildPersistableOfferPayload(weeklyValue, [weeklyRule]);
  assert.equal(weekly.billing_totals.monthly.net_cents, 5_200);

  const disabled = buildPersistableOfferPayload(draft({ discounts: [] }), [{
    ...weeklyRule,
    frequency_factor: 0,
  }]);
  assert.equal(disabled.net_total_cents, 0);
});

test("saisonale Monatsleistung wird über alle inklusiven Saisonmonate aggregiert", () => {
  const value = draft({
    items: [{
      ...draft().items[0],
      area_sqm: 0,
      seasonal: true,
      permanent: false,
      season_start_month: 11,
      season_end_month: 3,
    }],
    discounts: [],
  });
  const seasonalRule = {
    ...rule,
    base_price_cents: 1_000,
    price_per_sqm_cents: 0,
    minimum_price_cents: 0,
  };
  const result = buildPersistableOfferPayload(value, [seasonalRule]);
  assert.equal(result.billing_totals.seasonal.net_cents, 5_000);
  assert.equal(result.billing_totals.monthly.net_cents, 0);
});

test("Entwurf benötigt eine gültige Empfänger-E-Mail", () => {
  const invalid = {
    ...draft(),
    recipient_snapshot: { email: "keine-mail" },
  };
  assert.equal(rawOfferDraftSchema.safeParse(invalid).success, false);
});

test("Entwurf benötigt eine vollständige Empfängeranschrift", () => {
  const invalid = {
    ...draft(),
    recipient_snapshot: { ...draft().recipient_snapshot, address: "", city: "" },
  };
  assert.equal(rawOfferDraftSchema.safeParse(invalid).success, false);
});

test("Winterdienst benötigt Modell und vollständigen Saisonzeitraum", () => {
  const invalid = {
    ...draft(),
    items: [{
      ...draft().items[0],
      item_kind: "winter",
      seasonal: false,
      season_start_month: null,
      season_end_month: null,
      winter_model: null,
    }],
  };
  assert.equal(rawOfferDraftSchema.safeParse(invalid).success, false);
});

test("Angebotskopie bewahrt gemischte manuelle Preis-Buckets und 0 Prozent Steuer", () => {
  const sourceDraft = draft();
  const copied = copyOfferVersionToRawDraft(
    {
      customer_id: sourceDraft.customer_id,
      title: sourceDraft.title,
      recipient_snapshot: sourceDraft.recipient_snapshot,
      planned_start_date: sourceDraft.planned_start_date,
    },
    [{
      id: "00000000-0000-4000-8000-000000000099",
      service_catalog_id: catalogId,
      item_kind: "winter",
      title: "Winterdienst flexibel",
      description: "Grundgebühr und Einsätze",
      area_sqm: 100,
      quantity: 5,
      unit: "visit",
      frequency: "on_demand",
      frequency_occurrences: 1,
      billing_type: "monthly",
      calculation_type: "per_visit",
      unit_price_cents: 0,
      minimum_price_cents: 0,
      manual_price: true,
      total_net_cents: 99_999,
      permanent: false,
      seasonal: true,
      season_start_month: 11,
      season_end_month: 3,
      winter_surface_type: "sidewalk",
      winter_model: "monthly_plus_visit",
      included_visits: 2,
      additional_visit_price_cents: 300,
      monthly_base_fee_cents: 2_000,
      seasonal_flat_rate_cents: 0,
      surcharge_cents: 0,
      tax_rate_bps: 0,
      pricing_snapshot: {
        manual_overrides: [
          { billingBucket: "monthly", overriddenCents: 2_500, reason: "Vor-Ort-Kalkulation" },
          { billingBucket: "per_visit", overriddenCents: 900, reason: "Vor-Ort-Kalkulation" },
        ],
      },
    }],
    [],
    new Date("2026-08-05T12:00:00.000Z"),
  );
  const item = copied.items[0];
  assert.deepEqual(item.manual_bucket_amounts, { monthly: 2_500, per_visit: 900 });
  assert.equal(item.manual_total_cents, null);
  assert.equal(item.manual_price_reason, "Vor-Ort-Kalkulation");
  assert.equal(item.tax_rate_bps, 0);
  assert.equal(rawOfferDraftSchema.safeParse(copied).success, true);
});
