import assert from "node:assert/strict";
import test from "node:test";
import { visitPlanSchema } from "./portal/validation.ts";

const validPlan = {
  propertyId: "10000000-0000-4000-8000-000000000001",
  label: "Regelbetreuung",
  frequency: "weekly",
  visitsPerPeriod: 1,
  weekdays: [1],
  monthDays: [],
  desiredTime: "09:00",
  windowStart: "",
  windowEnd: "",
  startDate: "2026-08-10",
  endDate: "",
  primaryEmployeeId: "20000000-0000-4000-8000-000000000002",
  maxVisitMinutes: 120,
  buildingIds: [],
  additionalEmployeeIds: [],
};

test("Besuchspläne benötigen eine feste Uhrzeit oder ein vollständiges Zeitfenster", () => {
  assert.equal(visitPlanSchema.safeParse(validPlan).success, true);
  assert.equal(
    visitPlanSchema.safeParse({
      ...validPlan,
      desiredTime: "",
      windowStart: "08:00",
      windowEnd: "11:00",
    }).success,
    true,
  );
  assert.equal(
    visitPlanSchema.safeParse({
      ...validPlan,
      desiredTime: "",
      windowStart: "",
      windowEnd: "",
    }).success,
    false,
  );
  assert.equal(
    visitPlanSchema.safeParse({
      ...validPlan,
      desiredTime: "09:00",
      windowStart: "08:00",
      windowEnd: "11:00",
    }).success,
    false,
  );
});

test("Besuchsanzahl und ausgewählte Wochentage bleiben konsistent", () => {
  assert.equal(
    visitPlanSchema.safeParse({
      ...validPlan,
      visitsPerPeriod: 2,
      weekdays: [1, 4],
    }).success,
    true,
  );
  assert.equal(
    visitPlanSchema.safeParse({
      ...validPlan,
      visitsPerPeriod: 2,
      weekdays: [1],
    }).success,
    false,
  );
});
