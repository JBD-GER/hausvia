import assert from "node:assert/strict";
import test from "node:test";
import { visitPlanSchema } from "./portal/validation.ts";

const validPlan = {
  propertyId: "10000000-0000-4000-8000-000000000001",
  label: "Regelbetreuung",
  frequency: "weekly",
  repeatEvery: 1,
  weekdays: [1],
  monthDays: [],
  desiredTime: "09:00",
  windowStart: "",
  windowEnd: "",
  startDate: "2026-08-10",
  endDate: "",
  primaryEmployeeId: "20000000-0000-4000-8000-000000000002",
  maxVisitMinutes: 120,
  serviceIds: ["30000000-0000-4000-8000-000000000003"],
  acceptsUnplannedTasks: true,
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

test("Jeder Besuchsplan benötigt mindestens eine individuelle Leistung", () => {
  assert.equal(visitPlanSchema.safeParse(validPlan).success, true);
  assert.equal(
    visitPlanSchema.safeParse({ ...validPlan, serviceIds: [] }).success,
    false,
  );

  const parsed = visitPlanSchema.parse({
    ...validPlan,
    serviceIds: [
      "30000000-0000-4000-8000-000000000004",
      "30000000-0000-4000-8000-000000000003",
      "30000000-0000-4000-8000-000000000004",
    ],
  });
  assert.deepEqual(parsed.serviceIds, [
    "30000000-0000-4000-8000-000000000003",
    "30000000-0000-4000-8000-000000000004",
  ]);
});

test("Die Einsatzdauer muss vollständig in das smarte Zeitfenster passen", () => {
  assert.equal(
    visitPlanSchema.safeParse({
      ...validPlan,
      desiredTime: "",
      windowStart: "09:00",
      windowEnd: "10:00",
      maxVisitMinutes: 60,
    }).success,
    true,
  );
  assert.equal(
    visitPlanSchema.safeParse({
      ...validPlan,
      desiredTime: "",
      windowStart: "09:00",
      windowEnd: "10:00",
      maxVisitMinutes: 61,
    }).success,
    false,
  );
});

test("Besuchszeiten werden strikt validiert", () => {
  assert.equal(
    visitPlanSchema.safeParse({ ...validPlan, desiredTime: "99:99" }).success,
    false,
  );
});

test("Das Wiederholungsintervall muss zwischen 1 und 60 liegen", () => {
  assert.equal(visitPlanSchema.safeParse({ ...validPlan, repeatEvery: 60 }).success, true);
  assert.equal(visitPlanSchema.safeParse({ ...validPlan, repeatEvery: 0 }).success, false);
  assert.equal(visitPlanSchema.safeParse({ ...validPlan, repeatEvery: 61 }).success, false);
  assert.equal(visitPlanSchema.safeParse({ ...validPlan, repeatEvery: 1.5 }).success, false);
  assert.equal(
    visitPlanSchema.safeParse({
      ...validPlan,
      frequency: "individual",
      repeatEvery: 2,
    }).success,
    false,
  );
});

test("Die Besuchsanzahl wird nicht mehr aus einem Formwert validiert", () => {
  assert.equal(
    visitPlanSchema.safeParse({
      ...validPlan,
      visitsPerPeriod: 31,
      weekdays: [1],
    }).success,
    true,
  );
});

test("Nur die zur Häufigkeit passenden Ausführungstage werden übernommen", () => {
  const weekly = visitPlanSchema.parse({
    ...validPlan,
    weekdays: [5, 1, 5],
    monthDays: [10],
  });
  assert.deepEqual(weekly.weekdays, [1, 5]);
  assert.deepEqual(weekly.monthDays, []);

  const monthly = visitPlanSchema.parse({
    ...validPlan,
    frequency: "monthly",
    repeatEvery: 2,
    weekdays: [1],
    monthDays: [20, 5, 20],
  });
  assert.deepEqual(monthly.weekdays, []);
  assert.deepEqual(monthly.monthDays, [5, 20]);

  const individual = visitPlanSchema.parse({
    ...validPlan,
    frequency: "individual",
    repeatEvery: 1,
    weekdays: [1],
    monthDays: [5],
  });
  assert.deepEqual(individual.weekdays, []);
  assert.deepEqual(individual.monthDays, []);
});

test("Bestehende quartalsweise Pläne bleiben gültig", () => {
  assert.equal(
    visitPlanSchema.safeParse({
      ...validPlan,
      frequency: "quarterly",
      repeatEvery: 1,
      weekdays: [],
      monthDays: [15],
    }).success,
    true,
  );
});
