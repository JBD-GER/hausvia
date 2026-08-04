import assert from "node:assert/strict";
import test from "node:test";

import { calculateEstimate } from "./pricing.ts";

const pdfExample = {
  objectType: "weg",
  usableArea: 1_000,
  outdoorArea: 5_000,
  services: ["lawnMowing", "gardenCare", "binService", "leafRemoval", "hedgeCutting"],
  frequency: "weekly",
  complexity: "normal",
};

test("keeps the PDF example in a realistic range without double-counting garden work", () => {
  const estimate = calculateEstimate(pdfExample);

  assert.deepEqual(
    {
      lower: estimate.lower,
      upper: estimate.upper,
      estimatedMonthlyPrice: estimate.estimatedMonthlyPrice,
      basePrice: estimate.basePrice,
      outdoorRate: estimate.outdoorRate,
      serviceFactor: estimate.serviceFactor,
    },
    {
      lower: 2_250,
      upper: 3_750,
      estimatedMonthlyPrice: 3_000,
      basePrice: 3_000,
      outdoorRate: 0.6,
      serviceFactor: 1.1,
    },
  );
});

test("treats garden care as the umbrella for its overlapping individual tasks", () => {
  const gardenPackage = calculateEstimate(pdfExample);
  const umbrellaOnly = calculateEstimate({
    ...pdfExample,
    services: ["gardenCare", "binService"],
  });

  assert.equal(gardenPackage.lower, umbrellaOnly.lower);
  assert.equal(gardenPackage.upper, umbrellaOnly.upper);
});

test("does not charge residential floor area for an outdoor-only package", () => {
  const original = calculateEstimate(pdfExample);
  const muchLargerBuilding = calculateEstimate({ ...pdfExample, usableArea: 10_000 });

  assert.equal(original.lower, muchLargerBuilding.lower);
  assert.equal(original.upper, muchLargerBuilding.upper);
});

test("does not scale caretaker work with unrelated outdoor area", () => {
  const input = {
    objectType: "weg",
    usableArea: 1_000,
    outdoorArea: 0,
    services: ["caretaker"],
    frequency: "weekly",
    complexity: "normal",
  };

  const withoutOutdoorArea = calculateEstimate(input);
  const withOutdoorArea = calculateEstimate({ ...input, outdoorArea: 5_000 });

  assert.equal(withoutOutdoorArea.lower, 380);
  assert.equal(withoutOutdoorArea.upper, 570);
  assert.equal(withoutOutdoorArea.lower, withOutdoorArea.lower);
  assert.equal(withoutOutdoorArea.upper, withOutdoorArea.upper);
});

test("adds garden and caretaker components instead of multiplying them together", () => {
  const estimate = calculateEstimate({
    ...pdfExample,
    services: ["gardenCare", "caretaker"],
  });

  assert.equal(estimate.lower, 2_630);
  assert.equal(estimate.upper, 4_320);
  assert.equal(estimate.estimatedMonthlyPrice, 3_450);
});

test("does not scale bin service with the entire outdoor area", () => {
  const input = {
    objectType: "weg",
    usableArea: 0,
    outdoorArea: 0,
    services: ["binService"],
    frequency: "monthly",
    complexity: "normal",
  };

  const withoutOutdoorArea = calculateEstimate(input);
  const withOutdoorArea = calculateEstimate({ ...input, outdoorArea: 5_000 });

  assert.equal(withoutOutdoorArea.lower, withOutdoorArea.lower);
  assert.equal(withoutOutdoorArea.upper, withOutdoorArea.upper);
});

test("never rounds an object minimum down", () => {
  const estimate = calculateEstimate({
    objectType: "weg",
    usableArea: 0,
    outdoorArea: 0,
    services: ["binService"],
    frequency: "monthly",
    complexity: "normal",
  });

  assert.equal(estimate.lower, 299);
  assert.equal(estimate.upper, 380);
  assert.equal(estimate.estimatedMonthlyPrice, 299);
});
