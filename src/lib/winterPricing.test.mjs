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
  readiness: "standard",
};

test("verwendet ein regional kalibriertes und degressives Preisraster", () => {
  assert.equal(winterPricingConfig.modelVersion, "2026-08-hannover-degressive-v3");
  assert.equal(winterPricingConfig.referenceSource, "Regionaler Marktvergleich Hannover");
  assert.equal(winterPricingConfig.referenceUpdatedAt, "2026-08-04");
  assert.deepEqual(winterPricingConfig.monthlyBase, {
    minimumGross: 70,
    includedArea: 100,
    grossPerAdditionalSquareMeter: 0.1,
    roundingIncrement: 5,
  });
  assert.deepEqual(winterPricingConfig.deployment, {
    mobilizationGross: 29,
    minimumGross: 49,
    areaRateBands: [
      { upTo: 100, manualGrossPerSquareMeter: 0.5, machineGrossPerSquareMeter: 0.4 },
      { upTo: 250, manualGrossPerSquareMeter: 0.38, machineGrossPerSquareMeter: 0.3 },
      { upTo: 500, manualGrossPerSquareMeter: 0.28, machineGrossPerSquareMeter: 0.22 },
      { upTo: 1_000, manualGrossPerSquareMeter: 0.2, machineGrossPerSquareMeter: 0.15 },
    ],
    standardGritIncluded: true,
  });
  assert.equal(winterPricingConfig.flatRateIncludedDeployments, 10);
  assert.equal(winterPricingConfig.flatRateDeploymentDiscountPercent, 10);
  assert.equal(winterPricingConfig.generalPriceAdjustmentPercent, 10);
});

test("berechnet 100 m² Handfläche inklusive Einsatzstart und Flächenleistung", () => {
  const estimate = calculateWinterPrice(manualExample);

  assert.equal(estimate.monthlyBaseGross, 77);
  assert.equal(estimate.seasonBaseGross, 385);
  assert.equal(estimate.deploymentGross, 86.9);
  assert.deepEqual(estimate.pricingOptions, {
    flex: {
      monthlyBaseGross: 77,
      seasonBaseGross: 385,
      deploymentGross: 86.9,
    },
    plan: {
      includedDeployments: 10,
      deploymentDiscountPercent: 10,
      discountedDeploymentGross: 78.21,
      monthlyGross: 233.42,
      seasonGross: 1_167.1,
      additionalDeploymentGross: 78.21,
    },
  });
  assert.deepEqual(estimate.deploymentBreakdown, {
    areaSquareMeters: 100,
    appliedSurfaceProfile: "manual",
    manualShare: 1,
    machineShare: 0,
    mobilizationGross: 31.9,
    areaServiceGross: 55,
    minimumAdjustmentGross: 0,
    areaServiceRateGrossPerSquareMeter: 0.55,
    standardDeploymentGross: 86.9,
    readinessMultiplier: 1,
    readinessSurchargePercent: 0,
    readinessSurchargeGross: 0,
    effectiveDeploymentRateGrossPerSquareMeter: 0.869,
  });
});

test("weist den Mindestansatz für sehr kleine Flächen transparent aus", () => {
  const estimate = calculateWinterPrice({ ...manualExample, area: 30 });

  assert.equal(estimate.deploymentGross, 53.9);
  assert.equal(estimate.deploymentBreakdown.mobilizationGross, 31.9);
  assert.equal(estimate.deploymentBreakdown.areaServiceGross, 16.5);
  assert.equal(estimate.deploymentBreakdown.minimumAdjustmentGross, 5.5);
  assert.equal(
    estimate.deploymentBreakdown.mobilizationGross +
      estimate.deploymentBreakdown.areaServiceGross +
      estimate.deploymentBreakdown.minimumAdjustmentGross,
    estimate.deploymentGross,
  );
});

test("staffelt große maschinelle Flächen statt sie linear hochzurechnen", () => {
  const at500 = calculateWinterPrice({
    objectType: "commercial",
    area: 500,
    surfaceProfile: "machine",
    access: "standard",
    readiness: "standard",
  });
  const at844 = calculateWinterPrice({
    objectType: "commercial",
    area: 844,
    surfaceProfile: "machine",
    access: "standard",
    readiness: "standard",
  });

  assert.equal(at500.deploymentGross, 185.9);
  assert.equal(at500.deploymentBreakdown.areaServiceGross, 154);
  assert.equal(at500.pricingOptions.plan.seasonGross, 2_278.1);
  assert.equal(at844.deploymentGross, 242.66);
  assert.equal(at844.deploymentBreakdown.areaServiceGross, 210.76);
  assert.equal(at844.pricingOptions.plan.seasonGross, 2_981.4);
  assert.ok(at844.deploymentBreakdown.effectiveDeploymentRateGrossPerSquareMeter < 0.29);
});

test("gewichtet Mischflächen kontinuierlich Richtung maschineller Bearbeitung", () => {
  const estimate = calculateWinterPrice({
    objectType: "residential",
    area: 200,
    surfaceProfile: "mixed",
    access: "standard",
    readiness: "standard",
  });

  assert.equal(estimate.deploymentBreakdown.manualShare, 0.8);
  assert.equal(estimate.deploymentBreakdown.machineShare, 0.2);
  assert.equal(estimate.deploymentBreakdown.areaServiceGross, 92.84);
  assert.equal(estimate.deploymentGross, 124.74);
});

test("setzt erschwerte Ausführung als Handprofil an", () => {
  const difficult = calculateWinterPrice({
    objectType: "commercial",
    area: 500,
    surfaceProfile: "mixed",
    access: "difficult",
    readiness: "standard",
  });
  const manual = calculateWinterPrice({
    objectType: "commercial",
    area: 500,
    surfaceProfile: "manual",
    access: "standard",
    readiness: "standard",
  });

  assert.equal(difficult.deploymentBreakdown.appliedSurfaceProfile, "manual");
  assert.equal(difficult.deploymentGross, 226.6);
  assert.equal(difficult.deploymentGross, manual.deploymentGross);
});

test("verwendet im Standardmodell bei gleicher Fläche dieselben Preise je Objektart", () => {
  const estimates = ["private", "residential", "commercial"].map((objectType) =>
    calculateWinterPrice({ ...manualExample, objectType }),
  );

  for (const estimate of estimates) {
    assert.equal(estimate.monthlyBaseGross, 77);
    assert.equal(estimate.deploymentGross, 86.9);
  }
});

test("staffelt den monatlichen Grundbetrag nach der Fläche", () => {
  const cases = [
    { area: 10, monthly: 77 },
    { area: 100, monthly: 77 },
    { area: 150, monthly: 82.5 },
    { area: 200, monthly: 88 },
    { area: 275, monthly: 99 },
    { area: 500, monthly: 121 },
    { area: 1_000, monthly: 176 },
  ];

  for (const { area, monthly } of cases) {
    const estimate = calculateWinterPrice({
      objectType: "residential",
      area,
      surfaceProfile: deriveWinterSurfaceProfile(area, "standard"),
      access: "standard",
      readiness: "standard",
    });

    assert.equal(estimate.monthlyBaseGross, monthly);
    assert.equal(estimate.seasonBaseGross, monthly * 5);
  }
});

test("reduziert jeden pauschalen Einsatz einschließlich weiterer Einsätze um zehn Prozent", () => {
  const estimate = calculateWinterPrice({
    objectType: "commercial",
    area: 500,
    surfaceProfile: "machine",
    access: "standard",
    readiness: "standard",
  });
  const plan = estimate.pricingOptions.plan;

  assert.equal(plan.deploymentDiscountPercent, 10);
  assert.equal(plan.discountedDeploymentGross, 167.31);
  assert.equal(plan.additionalDeploymentGross, 167.31);
  assert.equal(plan.seasonGross, Math.round((estimate.seasonBaseGross + 10 * 167.31) * 100) / 100);
  assert.equal(
    winterSeasonTotal(estimate, 15, "plan"),
    Math.round((plan.seasonGross + 5 * 167.31) * 100) / 100,
  );
  assert.ok(winterSeasonTotal(estimate, 10, "plan") < winterSeasonTotal(estimate, 10, "flex"));
});

test("berechnet den 24/7 Gewerbe-Service mit 35 Prozent auf Grund- und Einsatzpreis", () => {
  const standard = calculateWinterPrice({
    objectType: "commercial",
    area: 500,
    surfaceProfile: "machine",
    access: "standard",
    readiness: "standard",
  });
  const aroundTheClock = calculateWinterPrice({
    objectType: "commercial",
    area: 500,
    surfaceProfile: "machine",
    access: "standard",
    readiness: "commercial24h",
  });

  assert.equal(
    aroundTheClock.monthlyBaseGross,
    Math.round(standard.monthlyBaseGross * 1.35 * 100) / 100,
  );
  assert.equal(aroundTheClock.deploymentGross, Math.round(standard.deploymentGross * 1.35 * 100) / 100);
  assert.equal(aroundTheClock.readinessSurchargePercent, 35);
  assert.equal(aroundTheClock.baseBreakdown.readinessSurchargeGross, 42.35);
  assert.equal(aroundTheClock.deploymentBreakdown.readinessSurchargeGross, 65.07);
  assert.equal(aroundTheClock.pricingOptions.plan.discountedDeploymentGross, 225.87);
});

test("weist Sonn- und Feiertage sowie Frühjahrskehrung als optionale Zusatzleistungen aus", () => {
  const estimate = calculateWinterPrice({ ...manualExample, area: 100 });

  assert.deepEqual(estimate.additionalServices, {
    sundayHoliday: {
      surchargePercent: 50,
      flexSurchargeGrossPerDeployment: 43.45,
      planSurchargeGrossPerDeployment: 39.1,
      included: false,
    },
    springCleaning: {
      grossPerSquareMeter: 1.5,
      estimatedGross: 150,
      included: false,
    },
  });
  assert.equal(
    Math.round(
      (estimate.deploymentGross +
        estimate.additionalServices.sundayHoliday.flexSurchargeGrossPerDeployment) *
        100,
    ) / 100,
    130.35,
  );
});

test("beschränkt den 24/7 Gewerbe-Service serverseitig auf Gewerbeobjekte", () => {
  assert.equal(
    parseWinterPricingInput({
      objectType: "residential",
      area: "200",
      surfaceProfile: "mixed",
      access: "standard",
      readiness: "commercial24h",
    }),
    null,
  );
  assert.throws(
    () => calculateWinterPrice({ ...manualExample, readiness: "commercial24h" }),
    /nur für Gewerbeobjekte/,
  );
});

test("weist die feste Vertragslaufzeit November bis März aus", () => {
  const estimate = calculateWinterPrice(manualExample);

  assert.equal(estimate.seasonMonths, 5);
  assert.equal(estimate.contractPeriod, "1. November bis 31. März");
  assert.equal(estimate.vatRate, 19);
});

test("berechnet Saisonbeispiele für variable und pauschale Abrechnung", () => {
  const estimate = calculateWinterPrice(manualExample);

  assert.equal(winterSeasonTotal(estimate, 0), 385);
  assert.equal(winterSeasonTotal(estimate, 5), 819.5);
  assert.equal(winterSeasonTotal(estimate, 10), 1_254);
  assert.equal(winterSeasonTotal(estimate, 15), 1_688.5);

  assert.equal(winterSeasonTotal(estimate, 5, "plan"), 1_167.1);
  assert.equal(winterSeasonTotal(estimate, 10, "plan"), 1_167.1);
  assert.equal(winterSeasonTotal(estimate, 15, "plan"), 1_558.15);
});

test("bleibt über Profilwechsel, Bereitschaften und Objektarten monoton", () => {
  for (const objectType of ["private", "residential", "commercial"]) {
    const readinessOptions = objectType === "commercial" ? ["standard", "commercial24h"] : ["standard"];
    for (const readiness of readinessOptions) {
      for (const access of ["standard", "difficult"]) {
        const estimates = Array.from({ length: 991 }, (_, index) => index + 10).map((area) =>
          calculateWinterPrice({
            objectType,
            area,
            surfaceProfile: deriveWinterSurfaceProfile(area, access),
            access,
            readiness,
          }),
        );

        for (let index = 1; index < estimates.length; index += 1) {
          assert.ok(
            estimates[index].monthlyBaseGross >= estimates[index - 1].monthlyBaseGross,
            `${objectType}/${readiness}/${access}: Grundbetrag fällt bei ${index + 10} m²`,
          );
          assert.ok(
            estimates[index].deploymentGross >= estimates[index - 1].deploymentGross,
            `${objectType}/${readiness}/${access}: Einsatzpreis fällt bei ${index + 10} m²`,
          );
        }
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
      readiness: "standard",
    }),
  );

  assert.deepEqual(
    estimates.map((estimate) => estimate.deploymentGross),
    [107.38, 107.8, 108.16, 161.59, 161.7, 161.94],
  );
});

test("hält alle Einsatzbestandteile centgenau zum Gesamtpreis konsistent", () => {
  for (let area = 10; area <= 1_000; area += 1) {
    const estimate = calculateWinterPrice({
      objectType: "commercial",
      area,
      surfaceProfile: deriveWinterSurfaceProfile(area, "standard"),
      access: "standard",
      readiness: area % 2 === 0 ? "standard" : "commercial24h",
    });
    const { mobilizationGross, areaServiceGross, minimumAdjustmentGross } = estimate.deploymentBreakdown;

    assert.ok(minimumAdjustmentGross >= 0, `Negativer Mindestansatz bei ${area} m²`);
    assert.equal(
      Math.round((mobilizationGross + areaServiceGross + minimumAdjustmentGross) * 100) / 100,
      estimate.deploymentGross,
    );
  }
});

test("lehnt Flächen außerhalb des Online-Rechners ab", () => {
  assert.throws(() => calculateWinterPrice({ ...manualExample, area: 9 }), RangeError);
  assert.throws(() => calculateWinterPrice({ ...manualExample, area: 9.6 }), RangeError);
  assert.throws(
    () =>
      calculateWinterPrice({
        objectType: "commercial",
        area: 1_001,
        surfaceProfile: "machine",
        access: "standard",
        readiness: "standard",
      }),
    RangeError,
  );
  assert.throws(() => calculateWinterPrice({ ...manualExample, area: Number.NaN }), RangeError);
  assert.throws(() => calculateWinterPrice({ ...manualExample, area: Number.POSITIVE_INFINITY }), RangeError);
  assert.throws(() => calculateWinterPrice({ ...manualExample, objectType: "unknown" }), TypeError);
});

test("parst nur vollständige und gültige Anfrageparameter", () => {
  assert.deepEqual(
    parseWinterPricingInput({
      objectType: "residential",
      area: "100",
      surfaceProfile: "manual",
      access: "standard",
      readiness: "standard",
    }),
    manualExample,
  );
  assert.equal(
    parseWinterPricingInput({
      objectType: "residential",
      area: "999999",
      surfaceProfile: "manual",
      access: "standard",
      readiness: "standard",
    }),
    null,
  );
  assert.equal(
    parseWinterPricingInput({
      objectType: "residential",
      area: "100",
      surfaceProfile: "manual",
      access: "standard",
    }),
    null,
  );
  assert.equal(
    parseWinterPricingInput({
      objectType: "unknown",
      area: "100",
      surfaceProfile: "manual",
      access: "standard",
      readiness: "standard",
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
      readiness: "standard",
    }),
    null,
  );
  assert.equal(
    parseWinterPricingInput({
      objectType: "commercial",
      area: "200",
      surfaceProfile: "machine",
      access: "difficult",
      readiness: "standard",
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
        readiness: "standard",
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

  assert.equal(estimate.monthlyBaseNet, 64.71);
  assert.equal(estimate.seasonBaseNet, 323.55);
  assert.equal(estimate.deploymentNet, 73.03);
  assert.equal(estimate.seasonBaseNet, Math.round(estimate.monthlyBaseNet * 5 * 100) / 100);
});
