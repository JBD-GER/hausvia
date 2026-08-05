import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateOfferPricing,
  createOfferPricingBucketRows,
  formatBasisPoints,
  formatBillingBucketAmount,
  formatCents,
} from "./offerPricing.ts";

test("berechnet Grundpreis, Fläche und Mindestpreis centgenau", () => {
  const result = calculateOfferPricing({
    items: [
      {
        id: "cleaning",
        label: "Treppenhausreinigung",
        kind: "standard",
        billingBucket: "monthly",
        taxRateBps: 1_900,
        drivers: { areaSquareMeters: 20 },
        rule: {
          baseCents: 1_000,
          perSquareMeterCents: 50,
          minimumCents: 2_500,
        },
      },
    ],
  });

  assert.deepEqual(
    result.items[0].automaticComponents.map(({ code, billingBucket, amountCents }) => ({
      code,
      billingBucket,
      amountCents,
    })),
    [
      { code: "base", billingBucket: "monthly", amountCents: 1_000 },
      { code: "area", billingBucket: "monthly", amountCents: 1_000 },
      { code: "minimum_adjustment", billingBucket: "monthly", amountCents: 500 },
    ],
  );
  assert.equal(result.bucketTotals.monthly.netCents, 2_500);
  assert.equal(result.bucketTotals.monthly.taxCents, 475);
  assert.equal(result.bucketTotals.monthly.grossCents, 2_975);
  assert.deepEqual(result.activeBillingBuckets, ["monthly"]);
});

test("trennt beim Wintermodell Grundgebühr und Einsatz mit allen Regelkomponenten", () => {
  const result = calculateOfferPricing({
    items: [
      {
        id: "winter",
        label: "Winterdienst",
        kind: "winter",
        model: "monthly_plus_visit",
        taxRateBps: 1_900,
        drivers: { areaSquareMeters: 100, hours: 2, visits: 1 },
        rule: {
          baseCents: 10_000,
          perSquareMeterCents: 10,
          perVisitCents: 2_000,
          perHourCents: 1_000,
          materialFeeCents: 500,
          frequencyFactorBps: 11_000,
          seasonalSurchargeBps: 500,
        },
      },
    ],
  });

  assert.equal(result.bucketTotals.monthly.netCents, 12_705);
  assert.equal(result.bucketTotals.per_visit.netCents, 5_198);
  assert.equal(result.bucketTotals.seasonal.netCents, 0);
  assert.deepEqual(result.activeBillingBuckets, ["monthly", "per_visit"]);
  assert.equal(result.hasMixedBillingBuckets, true);
  assert.deepEqual(
    result.items[0].automaticComponents
      .filter(({ code }) => code === "frequency_adjustment" || code === "seasonal_surcharge")
      .map(({ code, billingBucket, amountCents }) => ({ code, billingBucket, amountCents })),
    [
      { code: "frequency_adjustment", billingBucket: "monthly", amountCents: 1_100 },
      { code: "seasonal_surcharge", billingBucket: "monthly", amountCents: 605 },
      { code: "frequency_adjustment", billingBucket: "per_visit", amountCents: 450 },
      { code: "seasonal_surcharge", billingBucket: "per_visit", amountCents: 248 },
    ],
  );
});

test("wendet prozentuale und feste Rabatte nacheinander transparent an", () => {
  const result = calculateOfferPricing({
    items: [
      {
        id: "garden",
        label: "Gartenpflege",
        kind: "custom",
        billingBucket: "monthly",
        unitPriceCents: 10_000,
        quantity: 1,
        taxRateBps: 1_900,
        discounts: [
          { id: "item-percent", type: "percent", valueBps: 1_000, reason: "Paket" },
        ],
      },
    ],
    overallDiscounts: [
      { id: "offer-fixed", type: "fixed", valueCents: 1_500, reason: "Treuebonus" },
    ],
  });

  assert.deepEqual(result.items[0].discountApplications[0], {
    id: "item-percent",
    type: "percent",
    reason: "Paket",
    baseCents: 10_000,
    requestedCents: 1_000,
    appliedCents: 1_000,
    capped: false,
    allocations: [{ itemId: "garden", billingBucket: "monthly", amountCents: 1_000 }],
  });
  assert.equal(result.overallDiscountApplications[0].baseCents, 9_000);
  assert.equal(result.overallDiscountApplications[0].appliedCents, 1_500);
  assert.equal(result.items[0].itemDiscountCents, 1_000);
  assert.equal(result.items[0].overallDiscountCents, 1_500);
  assert.equal(result.items[0].netCents, 7_500);
  assert.equal(result.items[0].taxCents, 1_425);
});

test("ignoriert null-Rabatte und deckelt feste sowie prozentuale Rabatte bei null", () => {
  const result = calculateOfferPricing({
    items: [
      {
        id: "free-after-discount",
        label: "Kulanzposition",
        kind: "custom",
        billingBucket: "one_time",
        unitPriceCents: 1_000,
        taxRateBps: 1_900,
        discounts: [
          null,
          { id: "too-high", type: "fixed", valueCents: 1_500 },
          { id: "after-zero", type: "percent", valueBps: 5_000 },
        ],
      },
      {
        id: "free",
        label: "Kostenlose Zusatzleistung",
        kind: "custom",
        billingBucket: "one_time",
        unitPriceCents: 0,
        taxRateBps: 1_900,
      },
    ],
  });

  assert.deepEqual(
    result.items[0].discountApplications.map(({ id, requestedCents, appliedCents, capped }) => ({
      id,
      requestedCents,
      appliedCents,
      capped,
    })),
    [
      { id: "too-high", requestedCents: 1_500, appliedCents: 1_000, capped: true },
      { id: "after-zero", requestedCents: 0, appliedCents: 0, capped: false },
    ],
  );
  assert.equal(result.totals.netCents, 0);
  assert.equal(result.totals.taxCents, 0);
  assert.equal(result.totals.grossCents, 0);
});

test("berechnet gemischte Steuersätze je Position und hält Billing-Buckets getrennt", () => {
  const result = calculateOfferPricing({
    items: [
      {
        id: "monthly-19",
        label: "Monatliche Leistung",
        kind: "custom",
        billingBucket: "monthly",
        unitPriceCents: 1_000,
        taxRateBps: 1_900,
      },
      {
        id: "season-7",
        label: "Saisonale Leistung",
        kind: "winter",
        model: "seasonal_flat",
        taxRateBps: 700,
        rule: { baseCents: 1_000 },
      },
    ],
  });

  assert.deepEqual(result.bucketTotals.monthly, {
    billingBucket: "monthly",
    label: "Monatlich",
    subtotalCents: 1_000,
    itemDiscountCents: 0,
    overallDiscountCents: 0,
    discountCents: 0,
    netCents: 1_000,
    taxCents: 190,
    grossCents: 1_190,
  });
  assert.equal(result.bucketTotals.seasonal.netCents, 1_000);
  assert.equal(result.bucketTotals.seasonal.taxCents, 70);
  assert.deepEqual(result.totals, {
    subtotalCents: 2_000,
    itemDiscountCents: 0,
    overallDiscountCents: 0,
    discountCents: 0,
    netCents: 2_000,
    taxCents: 260,
    grossCents: 2_260,
  });
  assert.equal(result.hasMixedBillingBuckets, true);
});

test("weist manuelle Overrides samt automatischem Vergleich eindeutig aus", () => {
  const result = calculateOfferPricing({
    items: [
      {
        id: "override",
        label: "Objektbetreuung",
        kind: "standard",
        billingBucket: "monthly",
        taxRateBps: 1_900,
        rule: { baseCents: 10_000 },
        manualOverride: {
          amountsCents: { monthly: 12_500 },
          reason: "Individuelle Objektkalkulation",
        },
      },
    ],
  });

  assert.equal(result.items[0].pricingSource, "manual");
  assert.equal(result.items[0].automaticAmountsCents.monthly, 10_000);
  assert.equal(result.items[0].amountsBeforeDiscountCents.monthly, 12_500);
  assert.deepEqual(result.items[0].manualOverrides, [
    {
      billingBucket: "monthly",
      automaticCents: 10_000,
      overriddenCents: 12_500,
      differenceCents: 2_500,
      reason: "Individuelle Objektkalkulation",
    },
  ]);
});

test("verteilt einen Gesamtrabatt deterministisch centgenau über Buckets", () => {
  const result = calculateOfferPricing({
    items: [
      {
        id: "a",
        label: "A",
        kind: "custom",
        billingBucket: "one_time",
        unitPriceCents: 1,
        taxRateBps: 0,
      },
      {
        id: "b",
        label: "B",
        kind: "custom",
        billingBucket: "monthly",
        unitPriceCents: 1,
        taxRateBps: 0,
      },
      {
        id: "c",
        label: "C",
        kind: "custom",
        billingBucket: "seasonal",
        unitPriceCents: 1,
        taxRateBps: 0,
      },
    ],
    overallDiscounts: [{ type: "fixed", valueCents: 2 }],
  });

  assert.deepEqual(result.items.map((item) => item.overallDiscountCents), [1, 1, 0]);
  assert.equal(result.totals.overallDiscountCents, 2);
  assert.equal(result.totals.netCents, 1);
});

test("liefert deutsche Labels und UI-Formatter ohne Euro-Gleitkommarechnung", () => {
  const result = calculateOfferPricing({
    items: [
      {
        label: "Leistung",
        kind: "custom",
        billingBucket: "per_visit",
        unitPriceCents: 12_345,
        taxRateBps: 1_900,
      },
    ],
  });

  assert.equal(formatCents(12_345), "123,45 €");
  assert.equal(formatBasisPoints(1_900), "19 %");
  assert.equal(formatBillingBucketAmount(12_345, "per_visit"), "123,45 € für geplante Einsätze");
  assert.deepEqual(createOfferPricingBucketRows(result).map((row) => row.label), ["Einsatzbezogene Prognose"]);
});
