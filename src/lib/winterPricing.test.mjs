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
  assert.equal(winterPricingConfig.modelVersion, "2026-08-hannover-degressive-v2");
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
});

test("berechnet 100 m² Handfläche inklusive Einsatzstart und Flächenleistung", () => {
  const estimate = calculateWinterPrice(manualExample);

  assert.equal(estimate.monthlyBaseGross, 70);
  assert.equal(estimate.seasonBaseGross, 350);
  assert.equal(estimate.deploymentGross, 79);
  assert.deepEqual(estimate.pricingOptions, {
    flex: {
      monthlyBaseGross: 70,
      seasonBaseGross: 350,
      deploymentGross: 79,
    },
    plan: {
      includedDeployments: 10,
      deploymentDiscountPercent: 10,
      discountedDeploymentGross: 71.1,
      monthlyGross: 212.2,
      seasonGross: 1_061,
      additionalDeploymentGross: 71.1,
    },
  });
  assert.deepEqual(estimate.deploymentBreakdown, {
    areaSquareMeters: 100,
    appliedSurfaceProfile: "manual",
    manualShare: 1,
    machineShare: 0,
    mobilizationGross: 29,
    areaServiceGross: 50,
    minimumAdjustmentGross: 0,
    areaServiceRateGrossPerSquareMeter: 0.5,
    standardDeploymentGross: 79,
    readinessMultiplier: 1,
    readinessSurchargePercent: 0,
    readinessSurchargeGross: 0,
    effectiveDeploymentRateGrossPerSquareMeter: 0.79,
  });
});

test("weist den Mindestansatz für sehr kleine Flächen transparent aus", () => {
  const estimate = calculateWinterPrice({ ...manualExample, area: 30 });

  assert.equal(estimate.deploymentGross, 49);
  assert.equal(estimate.deploymentBreakdown.mobilizationGross, 29);
  assert.equal(estimate.deploymentBreakdown.areaServiceGross, 15);
  assert.equal(estimate.deploymentBreakdown.minimumAdjustmentGross, 5);
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

  assert.equal(at500.deploymentGross, 169);
  assert.equal(at500.deploymentBreakdown.areaServiceGross, 140);
  assert.equal(at500.pricingOptions.plan.seasonGross, 2_071);
  assert.equal(at844.deploymentGross, 220.6);
  assert.equal(at844.deploymentBreakdown.areaServiceGross, 191.6);
  assert.equal(at844.pricingOptions.plan.seasonGross, 2_710.4);
  assert.ok(at844.deploymentBreakdown.effectiveDeploymentRateGrossPerSquareMeter < 0.27);
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
  assert.equal(estimate.deploymentBreakdown.areaServiceGross, 84.4);
  assert.equal(estimate.deploymentGross, 113.4);
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
  assert.equal(difficult.deploymentGross, 206);
  assert.equal(difficult.deploymentGross, manual.deploymentGross);
});

test("verwendet im Standardmodell bei gleicher Fläche dieselben Preise je Objektart", () => {
  const estimates = ["private", "residential", "commercial"].map((objectType) =>
    calculateWinterPrice({ ...manualExample, objectType }),
  );

  for (const estimate of estimates) {
    assert.equal(estimate.monthlyBaseGross, 70);
    assert.equal(estimate.deploymentGross, 79);
  }
});

test("staffelt den monatlichen Grundbetrag nach der Fläche", () => {
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
  assert.equal(plan.discountedDeploymentGross, 152.1);
  assert.equal(plan.additionalDeploymentGross, 152.1);
  assert.equal(plan.seasonGross, estimate.seasonBaseGross + 10 * 152.1);
  assert.equal(winterSeasonTotal(estimate, 15, "plan"), plan.seasonGross + 5 * 152.1);
  assert.ok(winterSeasonTotal(estimate, 10, "plan") < winterSeasonTotal(estimate, 10, "flex"));
});

test("berechnet den 24/7 Gewerbe-Service mit 20 Prozent auf Grund- und Einsatzpreis", () => {
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

  assert.equal(aroundTheClock.monthlyBaseGross, standard.monthlyBaseGross * 1.2);
  assert.equal(aroundTheClock.deploymentGross, Math.round(standard.deploymentGross * 1.2 * 100) / 100);
  assert.equal(aroundTheClock.readinessSurchargePercent, 20);
  assert.equal(aroundTheClock.baseBreakdown.readinessSurchargeGross, 22);
  assert.equal(aroundTheClock.deploymentBreakdown.readinessSurchargeGross, 33.8);
  assert.equal(aroundTheClock.pricingOptions.plan.discountedDeploymentGross, 182.52);
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

  assert.equal(winterSeasonTotal(estimate, 0), 350);
  assert.equal(winterSeasonTotal(estimate, 5), 745);
  assert.equal(winterSeasonTotal(estimate, 10), 1_140);
  assert.equal(winterSeasonTotal(estimate, 15), 1_535);

  assert.equal(winterSeasonTotal(estimate, 5, "plan"), 1_061);
  assert.equal(winterSeasonTotal(estimate, 10, "plan"), 1_061);
  assert.equal(winterSeasonTotal(estimate, 15, "plan"), 1_416.5);
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
    [97.62, 98, 98.32, 146.9, 147, 147.22],
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

  assert.equal(estimate.monthlyBaseNet, 58.82);
  assert.equal(estimate.seasonBaseNet, 294.1);
  assert.equal(estimate.deploymentNet, 66.39);
  assert.equal(estimate.seasonBaseNet, Math.round(estimate.monthlyBaseNet * 5 * 100) / 100);
});
