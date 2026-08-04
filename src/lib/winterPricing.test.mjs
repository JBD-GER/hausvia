import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateWinterPrice,
  deriveWinterSurfaceProfile,
  parseWinterArea,
  parseWinterPricingInput,
  winterPricingConfig,
  winterSeasonTotal,
} from "./winterPricing.ts";

const manualExample = {
  objectType: "residential",
  area: 100,
  surfaceProfile: "manual",
  access: "standard",
};

test("leitet die MyHammer-Referenzsätze bei 80 Prozent der Spanne transparent ab", () => {
  assert.equal(winterPricingConfig.referenceSource, "MyHammer");
  assert.equal(winterPricingConfig.referenceUpdatedAt, "2026-02-05");
  assert.equal(winterPricingConfig.referencePosition, 0.8);
  assert.deepEqual(winterPricingConfig.sourceRanges, {
    manualClearing: { low: 1, high: 2.5 },
    machineClearing: { low: 1, high: 1.5 },
    grit: { low: 0.2, high: 0.5 },
  });
  assert.deepEqual(winterPricingConfig.appliedRates, {
    manualClearingGrossPerSquareMeter: 2.2,
    machineClearingGrossPerSquareMeter: 1.4,
    gritReferenceGrossPerSquareMeter: 0.44,
    gritGrossPerSquareMeter: 0.45,
  });
  assert.deepEqual(winterPricingConfig.monthlyBase, {
    minimumGross: 70,
    includedArea: 100,
    grossPerAdditionalSquareMeter: 0.1,
    roundingIncrement: 5,
  });
  assert.equal(winterPricingConfig.flatRateIncludedDeployments, 10);
});

test("berechnet Handräumung und Streugut centgenau je Quadratmeter", () => {
  const estimate = calculateWinterPrice(manualExample);

  assert.equal(estimate.monthlyBaseGross, 70);
  assert.equal(estimate.seasonBaseGross, 350);
  assert.equal(estimate.deploymentGross, 265);
  assert.deepEqual(estimate.pricingOptions, {
    flex: {
      monthlyBaseGross: 70,
      seasonBaseGross: 350,
      deploymentGross: 265,
    },
    plan: {
      includedDeployments: 10,
      monthlyGross: 600,
      seasonGross: 3_000,
      additionalDeploymentGross: 265,
    },
  });
  assert.deepEqual(estimate.deploymentBreakdown, {
    areaSquareMeters: 100,
    appliedSurfaceProfile: "manual",
    manualShare: 1,
    machineShare: 0,
    clearingRateGrossPerSquareMeter: 2.2,
    gritReferenceRateGrossPerSquareMeter: 0.44,
    gritRateGrossPerSquareMeter: 0.45,
    totalRateGrossPerSquareMeter: 2.65,
    clearingGross: 220,
    gritGross: 45,
  });
});

test("behält echte Centbeträge statt auf fünf Euro aufzurunden", () => {
  const estimate = calculateWinterPrice({ ...manualExample, area: 31 });

  assert.equal(estimate.deploymentGross, 82.15);
  assert.equal(estimate.deploymentBreakdown.clearingGross, 68.2);
  assert.equal(estimate.deploymentBreakdown.gritGross, 13.95);
});

test("berechnet maschinelle Räumung mit 1,40 Euro plus 0,45 Euro Streugut", () => {
  const estimate = calculateWinterPrice({
    objectType: "commercial",
    area: 500,
    surfaceProfile: "machine",
    access: "standard",
  });

  assert.equal(estimate.deploymentGross, 925);
  assert.deepEqual(estimate.deploymentBreakdown, {
    areaSquareMeters: 500,
    appliedSurfaceProfile: "machine",
    manualShare: 0,
    machineShare: 1,
    clearingRateGrossPerSquareMeter: 1.4,
    gritReferenceRateGrossPerSquareMeter: 0.44,
    gritRateGrossPerSquareMeter: 0.45,
    totalRateGrossPerSquareMeter: 1.85,
    clearingGross: 700,
    gritGross: 225,
  });
});

test("gewichtet Mischflächen mit wachsender Fläche transparent Richtung Maschine", () => {
  const estimateAt200 = calculateWinterPrice({
    objectType: "residential",
    area: 200,
    surfaceProfile: "mixed",
    access: "standard",
  });
  const estimateAt275 = calculateWinterPrice({
    objectType: "residential",
    area: 275,
    surfaceProfile: "mixed",
    access: "standard",
  });

  assert.deepEqual(
    {
      manualShare: estimateAt200.deploymentBreakdown.manualShare,
      machineShare: estimateAt200.deploymentBreakdown.machineShare,
      clearingRate: estimateAt200.deploymentBreakdown.clearingRateGrossPerSquareMeter,
      deploymentGross: estimateAt200.deploymentGross,
    },
    { manualShare: 0.8, machineShare: 0.2, clearingRate: 2.04, deploymentGross: 498 },
  );
  assert.deepEqual(
    {
      manualShare: estimateAt275.deploymentBreakdown.manualShare,
      machineShare: estimateAt275.deploymentBreakdown.machineShare,
      clearingRate: estimateAt275.deploymentBreakdown.clearingRateGrossPerSquareMeter,
      deploymentGross: estimateAt275.deploymentGross,
    },
    { manualShare: 0.5, machineShare: 0.5, clearingRate: 1.8, deploymentGross: 618.75 },
  );
});

test("setzt erschwerte Ausführung als Handprofil ohne freien Aufschlag an", () => {
  const estimate = calculateWinterPrice({
    objectType: "commercial",
    area: 500,
    surfaceProfile: "mixed",
    access: "difficult",
  });

  assert.equal(estimate.deploymentBreakdown.appliedSurfaceProfile, "manual");
  assert.equal(estimate.deploymentBreakdown.clearingRateGrossPerSquareMeter, 2.2);
  assert.equal(estimate.deploymentGross, 1_325);
  assert.equal(
    estimate.deploymentGross,
    calculateWinterPrice({
      objectType: "commercial",
      area: 500,
      surfaceProfile: "manual",
      access: "standard",
    }).deploymentGross,
  );
});

test("verwendet bei gleicher Fläche für jede Objektart denselben Grundbetrag und dieselben Flächensätze", () => {
  const estimates = ["private", "residential", "commercial"].map((objectType) =>
    calculateWinterPrice({ ...manualExample, objectType }),
  );

  for (const estimate of estimates) {
    assert.equal(estimate.monthlyBaseGross, 70);
    assert.equal(estimate.seasonBaseGross, 350);
    assert.equal(estimate.deploymentGross, 265);
  }
});

test("staffelt den monatlichen Grundbetrag nachvollziehbar nach der Fläche", () => {
  const cases = [
    { area: 10, monthly: 70 },
    { area: 100, monthly: 70 },
    { area: 150, monthly: 75 },
    { area: 200, monthly: 80 },
    { area: 275, monthly: 90 },
    { area: 500, monthly: 110 },
    { area: 1_000, monthly: 160 },
  ];

  for (const { area, monthly } of cases) {
    const estimate = calculateWinterPrice({
      objectType: "residential",
      area,
      surfaceProfile: deriveWinterSurfaceProfile(area, "standard"),
      access: "standard",
    });

    assert.equal(estimate.monthlyBaseGross, monthly);
    assert.equal(estimate.seasonBaseGross, monthly * 5);
  }
});

test("bildet die planbare Monatsrate aus Grundbetrag und zehn enthaltenen Einsätzen", () => {
  const estimate = calculateWinterPrice({
    objectType: "commercial",
    area: 500,
    surfaceProfile: "machine",
    access: "standard",
  });

  assert.deepEqual(estimate.pricingOptions.plan, {
    includedDeployments: 10,
    monthlyGross: 1_960,
    seasonGross: 9_800,
    additionalDeploymentGross: 925,
  });
  assert.equal(
    estimate.pricingOptions.plan.seasonGross,
    winterSeasonTotal(estimate, estimate.pricingOptions.plan.includedDeployments),
  );
});

test("weist die feste Vertragslaufzeit November bis März aus", () => {
  const estimate = calculateWinterPrice(manualExample);

  assert.equal(estimate.seasonMonths, 5);
  assert.equal(estimate.contractPeriod, "1. November bis 31. März");
  assert.equal(estimate.vatRate, 19);
});

test("berechnet Saisonbeispiele nur aus Grundbetrag und tatsächlichen Einsätzen", () => {
  const estimate = calculateWinterPrice(manualExample);

  assert.equal(winterSeasonTotal(estimate, 0), 350);
  assert.equal(winterSeasonTotal(estimate, 5), 1_675);
  assert.equal(winterSeasonTotal(estimate, 10), 3_000);
  assert.equal(winterSeasonTotal(estimate, 15), 4_325);

  const centEstimate = calculateWinterPrice({ ...manualExample, area: 31 });
  assert.equal(winterSeasonTotal(centEstimate, 3), 596.45);
});

test("berechnet Planbar-Saisonbeispiele mit zehn enthaltenen Einsätzen", () => {
  const estimate = calculateWinterPrice(manualExample);

  assert.equal(winterSeasonTotal(estimate, 5, "plan"), 3_000);
  assert.equal(winterSeasonTotal(estimate, 10, "plan"), 3_000);
  assert.equal(winterSeasonTotal(estimate, 15, "plan"), 4_325);
});

test("bleibt über automatische Profilwechsel und alle Objektarten monoton", () => {
  for (const objectType of ["private", "residential", "commercial"]) {
    for (const access of ["standard", "difficult"]) {
      const estimates = Array.from({ length: 991 }, (_, index) => index + 10).map((area) =>
        calculateWinterPrice({
          objectType,
          area,
          surfaceProfile: deriveWinterSurfaceProfile(area, access),
          access,
        }),
      );

      for (let index = 1; index < estimates.length; index += 1) {
        assert.ok(
          estimates[index].monthlyBaseGross >= estimates[index - 1].monthlyBaseGross,
          `${objectType}/${access}: Grundbetrag fällt bei ${index + 10} m²`,
        );
        assert.ok(
          estimates[index].deploymentGross >= estimates[index - 1].deploymentGross,
          `${objectType}/${access}: Preis fällt bei ${index + 10} m²`,
        );
        assert.ok(estimates[index].deploymentBreakdown.clearingRateGrossPerSquareMeter >= 1.4);
        assert.ok(estimates[index].deploymentBreakdown.clearingRateGrossPerSquareMeter <= 2.2);
        assert.equal(estimates[index].deploymentBreakdown.gritRateGrossPerSquareMeter, 0.45);
      }
    }
  }
});

test("bleibt an den automatischen Profilgrenzen ohne Preissturz", () => {
  const estimates = [149, 150, 151, 399, 400, 401].map((area) =>
    calculateWinterPrice({
      objectType: "residential",
      area,
      surfaceProfile: deriveWinterSurfaceProfile(area, "standard"),
      access: "standard",
    }),
  );

  assert.deepEqual(
    estimates.map((estimate) => estimate.deploymentGross),
    [394.85, 397.5, 399.67, 739.43, 740, 741.85],
  );
});

test("hält Räum- und Streugutanteil centgenau zum Einsatzpreis konsistent", () => {
  for (let area = 10; area <= 1_000; area += 1) {
    const estimate = calculateWinterPrice({
      objectType: "residential",
      area,
      surfaceProfile: deriveWinterSurfaceProfile(area, "standard"),
      access: "standard",
    });
    const { clearingGross, gritGross } = estimate.deploymentBreakdown;

    assert.equal(Math.round((clearingGross + gritGross) * 100) / 100, estimate.deploymentGross);
  }
});

test("lehnt Flächen außerhalb des Online-Rechners ab", () => {
  assert.throws(
    () => calculateWinterPrice({ objectType: "private", area: 9, surfaceProfile: "manual", access: "standard" }),
    RangeError,
  );
  assert.throws(
    () => calculateWinterPrice({ objectType: "private", area: 9.6, surfaceProfile: "manual", access: "standard" }),
    RangeError,
  );
  assert.throws(
    () => calculateWinterPrice({ objectType: "commercial", area: 1_001, surfaceProfile: "machine", access: "standard" }),
    RangeError,
  );
  assert.throws(
    () => calculateWinterPrice({ objectType: "commercial", area: 1_000.4, surfaceProfile: "mixed", access: "standard" }),
    RangeError,
  );
  assert.throws(
    () => calculateWinterPrice({ objectType: "private", area: Number.NaN, surfaceProfile: "manual", access: "standard" }),
    RangeError,
  );
  assert.throws(
    () =>
      calculateWinterPrice({
        objectType: "private",
        area: Number.POSITIVE_INFINITY,
        surfaceProfile: "manual",
        access: "standard",
      }),
    RangeError,
  );
  assert.throws(
    () => calculateWinterPrice({ objectType: "unknown", area: 100, surfaceProfile: "manual", access: "standard" }),
    TypeError,
  );
});

test("parst nur vollständige und gültige Anfrageparameter", () => {
  assert.deepEqual(
    parseWinterPricingInput({
      objectType: "residential",
      area: "100",
      surfaceProfile: "manual",
      access: "standard",
    }),
    { objectType: "residential", area: 100, surfaceProfile: "manual", access: "standard" },
  );
  assert.equal(
    parseWinterPricingInput({
      objectType: "residential",
      area: "999999",
      surfaceProfile: "manual",
      access: "standard",
    }),
    null,
  );
  assert.equal(
    parseWinterPricingInput({ objectType: "residential", area: "100", surfaceProfile: "manual" }),
    null,
  );
  assert.equal(
    parseWinterPricingInput({
      objectType: "unknown",
      area: "100",
      surfaceProfile: "manual",
      access: "standard",
    }),
    null,
  );
});

test("versteht deutsche Flächenangaben", () => {
  assert.equal(parseWinterArea("1.000"), 1_000);
  assert.equal(parseWinterArea("1.000,0"), 1_000);
  assert.equal(parseWinterArea("150,5"), 150.5);
  assert.equal(parseWinterArea("150.5"), 150.5);
  assert.equal(parseWinterArea(" 1 000 "), 1_000);
  assert.equal(parseWinterArea("abc"), null);
});

test("verhindert unplausible maschinelle Online-Kalkulationen", () => {
  assert.equal(
    parseWinterPricingInput({
      objectType: "commercial",
      area: "149,6",
      surfaceProfile: "machine",
      access: "standard",
    }),
    null,
  );
  assert.equal(
    parseWinterPricingInput({
      objectType: "commercial",
      area: "200",
      surfaceProfile: "machine",
      access: "difficult",
    }),
    null,
  );
  assert.throws(
    () =>
      calculateWinterPrice({
        objectType: "commercial",
        area: 200,
        surfaceProfile: "machine",
        access: "difficult",
      }),
    RangeError,
  );
});

test("normalisiert Dezimalflächen vor der Tarifberechnung", () => {
  const decimal = calculateWinterPrice({ ...manualExample, area: 48.51 });
  const rounded = calculateWinterPrice({ ...manualExample, area: 49 });

  assert.deepEqual(decimal, rounded);
});

test("hält die Netto-Saisonsumme konsistent mit fünf Monatsbeträgen", () => {
  const estimate = calculateWinterPrice(manualExample);

  assert.equal(estimate.monthlyBaseNet, 58.82);
  assert.equal(estimate.seasonBaseNet, 294.1);
  assert.equal(estimate.deploymentNet, 222.69);
  assert.equal(estimate.seasonBaseNet, Math.round(estimate.monthlyBaseNet * 5 * 100) / 100);
});
