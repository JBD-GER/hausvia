import assert from "node:assert/strict";
import test from "node:test";

import { calculateEstimate, pricingConfig } from "./pricing.ts";

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
      lower: 2_040,
      upper: 3_410,
      estimatedMonthlyPrice: 2_727,
      basePrice: 3_029.9,
      outdoorRate: 0.54,
      serviceFactor: 1.1,
    },
  );

  assert.equal(estimate.gardenArea, 5_000);
  assert.equal(estimate.pavedOutdoorArea, 0);
  assert.equal(estimate.requiresManualReview, false);
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

  assert.equal(estimate.lower, 2_400);
  assert.equal(estimate.upper, 3_940);
  assert.equal(estimate.estimatedMonthlyPrice, 3_150);
});

test("splits one outdoor area into garden and paved components without double-counting", () => {
  const combined = calculateEstimate({
    objectType: "weg",
    usableArea: 0,
    outdoorArea: 5_000,
    gardenArea: 2_000,
    services: ["gardenCare", "outdoorCleaning"],
    frequency: "weekly",
    complexity: "normal",
  });
  const gardenOnly = calculateEstimate({
    objectType: "weg",
    usableArea: 0,
    outdoorArea: 2_000,
    gardenArea: 2_000,
    services: ["gardenCare"],
    frequency: "weekly",
    complexity: "normal",
  });
  const pavedOnly = calculateEstimate({
    objectType: "weg",
    usableArea: 0,
    outdoorArea: 3_000,
    gardenArea: 0,
    services: ["outdoorCleaning"],
    frequency: "weekly",
    complexity: "normal",
  });

  assert.equal(combined.gardenArea, 2_000);
  assert.equal(combined.pavedOutdoorArea, 3_000);
  assert.equal(combined.basePrice, gardenOnly.basePrice + pavedOnly.basePrice);
});

test("uses the whole outdoor area as garden for legacy inputs instead of billing it twice", () => {
  const legacyInput = calculateEstimate({
    objectType: "weg",
    usableArea: 0,
    outdoorArea: 5_000,
    services: ["gardenCare", "outdoorCleaning"],
    frequency: "weekly",
    complexity: "normal",
  });
  const gardenOnly = calculateEstimate({
    objectType: "weg",
    usableArea: 0,
    outdoorArea: 5_000,
    services: ["gardenCare"],
    frequency: "weekly",
    complexity: "normal",
  });

  assert.equal(legacyInput.gardenArea, 5_000);
  assert.equal(legacyInput.pavedOutdoorArea, 0);
  assert.equal(legacyInput.lower, gardenOnly.lower);
  assert.equal(legacyInput.upper, gardenOnly.upper);
});

test("clamps an explicit garden split to the available outdoor area", () => {
  const aboveTotal = calculateEstimate({
    ...pdfExample,
    gardenArea: 8_000,
  });
  const belowZero = calculateEstimate({
    ...pdfExample,
    gardenArea: -500,
  });

  assert.equal(aboveTotal.gardenArea, 5_000);
  assert.equal(aboveTotal.pavedOutdoorArea, 0);
  assert.equal(belowZero.gardenArea, 0);
  assert.equal(belowZero.pavedOutdoorArea, 5_000);
});

test("flags the reported 15,000 m² full-service case for individual calculation", () => {
  const estimate = calculateEstimate({
    objectType: "private",
    usableArea: 10 * 75,
    outdoorArea: 15_000,
    services: pricingConfig.servicePackageIds,
    frequency: "monthly",
    complexity: "normal",
  });

  assert.equal(estimate.gardenArea, 15_000);
  assert.equal(estimate.pavedOutdoorArea, 0);
  assert.equal(estimate.requiresManualReview, true);
  assert.match(estimate.manualReviewReason, /Außenfläche über 5\.000 m²/);
});

test("uses a strict 5,000 m² manual-review threshold", () => {
  const atThreshold = calculateEstimate({
    ...pdfExample,
    services: ["gardenCare"],
  });
  const aboveThreshold = calculateEstimate({
    ...pdfExample,
    outdoorArea: 5_001,
    services: ["gardenCare"],
  });

  assert.equal(atThreshold.requiresManualReview, false);
  assert.equal(aboveThreshold.requiresManualReview, true);
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
