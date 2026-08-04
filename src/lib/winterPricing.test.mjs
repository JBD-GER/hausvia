import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateWinterPrice,
  parseWinterArea,
  parseWinterPricingInput,
  winterSeasonTotal,
} from "./winterPricing.ts";

const cases = [
  {
    name: "Privathaus mit 30 m² Handarbeit",
    input: { objectType: "private", area: 30, surfaceProfile: "manual", access: "standard" },
    expected: { monthlyBaseGross: 70, seasonBaseGross: 350, deploymentGross: 90 },
  },
  {
    name: "Privathaus mit 50 m² Handarbeit",
    input: { objectType: "private", area: 50, surfaceProfile: "manual", access: "standard" },
    expected: { monthlyBaseGross: 70, seasonBaseGross: 350, deploymentGross: 95 },
  },
  {
    name: "WEG mit 100 m² Handarbeit",
    input: { objectType: "residential", area: 100, surfaceProfile: "manual", access: "standard" },
    expected: { monthlyBaseGross: 90, seasonBaseGross: 450, deploymentGross: 155 },
  },
  {
    name: "WEG mit 100 m² und erschwerter Ausführung",
    input: { objectType: "residential", area: 100, surfaceProfile: "manual", access: "difficult" },
    expected: { monthlyBaseGross: 90, seasonBaseGross: 450, deploymentGross: 185 },
  },
  {
    name: "WEG mit 200 m² gemischter Fläche",
    input: { objectType: "residential", area: 200, surfaceProfile: "mixed", access: "standard" },
    expected: { monthlyBaseGross: 90, seasonBaseGross: 450, deploymentGross: 210 },
  },
  {
    name: "Gewerbe mit 500 m² maschinell befahrbarer Fläche",
    input: { objectType: "commercial", area: 500, surfaceProfile: "machine", access: "standard" },
    expected: { monthlyBaseGross: 155, seasonBaseGross: 775, deploymentGross: 375 },
  },
];

for (const example of cases) {
  test(example.name, () => {
    const result = calculateWinterPrice(example.input);

    assert.deepEqual(
      {
        monthlyBaseGross: result.monthlyBaseGross,
        seasonBaseGross: result.seasonBaseGross,
        deploymentGross: result.deploymentGross,
      },
      example.expected,
    );
  });
}

test("berechnet Saisonbeispiele nur aus Grundbetrag und tatsächlichen Einsätzen", () => {
  const estimate = calculateWinterPrice(cases[2].input);

  assert.equal(winterSeasonTotal(estimate, 0), 450);
  assert.equal(winterSeasonTotal(estimate, 5), 1_225);
  assert.equal(winterSeasonTotal(estimate, 10), 2_000);
  assert.equal(winterSeasonTotal(estimate, 15), 2_775);
});

test("rundet alle sichtbaren Bruttopreise auf volle fünf Euro auf", () => {
  for (const example of cases) {
    const estimate = calculateWinterPrice(example.input);
    assert.equal(estimate.monthlyBaseGross % 5, 0);
    assert.equal(estimate.seasonBaseGross % 5, 0);
    assert.equal(estimate.deploymentGross % 5, 0);
  }
});

test("wachsende Fläche senkt den Preis nicht", () => {
  const estimates = [10, 50, 100, 200, 500, 1_000].map((area) =>
    calculateWinterPrice({ objectType: "residential", area, surfaceProfile: "mixed", access: "standard" }),
  );

  for (let index = 1; index < estimates.length; index += 1) {
    assert.ok(estimates[index].seasonBaseGross >= estimates[index - 1].seasonBaseGross);
    assert.ok(estimates[index].deploymentGross >= estimates[index - 1].deploymentGross);
  }
});

test("bleibt an allen Flächenstaffelgrenzen monoton", () => {
  const estimates = [49, 50, 51, 149, 150, 151, 399, 400, 401].map((area) =>
    calculateWinterPrice({ objectType: "residential", area, surfaceProfile: "mixed", access: "standard" }),
  );

  for (let index = 1; index < estimates.length; index += 1) {
    assert.ok(estimates[index].deploymentGross >= estimates[index - 1].deploymentGross);
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
    () => calculateWinterPrice({ objectType: "private", area: Number.POSITIVE_INFINITY, surfaceProfile: "manual", access: "standard" }),
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
  assert.deepEqual(
    parseWinterPricingInput({
      objectType: "residential",
      area: 200,
      surfaceProfile: "mixed",
      access: "standard",
    }),
    { objectType: "residential", area: 200, surfaceProfile: "mixed", access: "standard" },
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
  const decimal = calculateWinterPrice({
    objectType: "private",
    area: 48.51,
    surfaceProfile: "manual",
    access: "standard",
  });
  const rounded = calculateWinterPrice({
    objectType: "private",
    area: 49,
    surfaceProfile: "manual",
    access: "standard",
  });

  assert.deepEqual(decimal, rounded);
});

test("hält die Netto-Saisonsumme konsistent mit fünf Monatsbeträgen", () => {
  const estimate = calculateWinterPrice({
    objectType: "commercial",
    area: 200,
    surfaceProfile: "mixed",
    access: "standard",
  });

  assert.equal(estimate.seasonBaseNet, Math.round(estimate.monthlyBaseNet * 5 * 100) / 100);
});
