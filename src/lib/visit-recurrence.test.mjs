import assert from "node:assert/strict";
import test from "node:test";
import {
  getVisitRecurrenceLabel,
  getVisitRecurrencePreset,
  getVisitScheduleSummary,
  normalizeVisitRecurrence,
} from "./portal/visitRecurrence.ts";

test("Wiederholungen erhalten verständliche deutsche Bezeichnungen", () => {
  assert.equal(getVisitRecurrenceLabel("weekly", 1), "Wöchentlich");
  assert.equal(getVisitRecurrenceLabel("weekly", 2), "Alle 2 Wochen");
  assert.equal(getVisitRecurrenceLabel("weekly", 5), "Alle 5 Wochen");
  assert.equal(getVisitRecurrenceLabel("monthly", 1), "Monatlich");
  assert.equal(getVisitRecurrenceLabel("monthly", 3), "Quartalsweise");
  assert.equal(getVisitRecurrenceLabel("monthly", 6), "Halbjährlich");
  assert.equal(getVisitRecurrenceLabel("monthly", 12), "Jährlich");
  assert.equal(getVisitRecurrenceLabel("individual", 8), "Einmalig");
});

test("Bestehende Quartalspläne werden verlustfrei ins Monatsmodell übernommen", () => {
  assert.deepEqual(normalizeVisitRecurrence("quarterly", 1), {
    frequency: "monthly",
    repeatEvery: 3,
  });
  assert.deepEqual(normalizeVisitRecurrence("quarterly", 2), {
    frequency: "monthly",
    repeatEvery: 6,
  });
  assert.equal(getVisitRecurrencePreset("quarterly", 1), "quarterly");
});

test("Die Zusammenfassung nutzt ohne Auswahl den Tag des Startdatums", () => {
  assert.equal(
    getVisitScheduleSummary({
      frequency: "weekly",
      repeatEvery: 2,
      startDate: "2026-08-06",
      desiredTime: "09:00",
    }),
    "Alle 2 Wochen · jeweils Donnerstag · ab 06.08.2026 · 09:00 Uhr",
  );

  assert.equal(
    getVisitScheduleSummary({
      frequency: "monthly",
      repeatEvery: 3,
      startDate: "2026-08-06",
      windowStart: "09:00",
      windowEnd: "12:00",
    }),
    "Quartalsweise · am 6. des Monats · ab 06.08.2026 · 09:00–12:00 Uhr",
  );
});

test("Mehrere Ausführungstage erscheinen sortiert in der Zusammenfassung", () => {
  assert.equal(
    getVisitScheduleSummary({
      frequency: "weekly",
      weekdays: [4, 1, 4],
      startDate: "2026-08-06",
      desiredTime: "10:30",
    }),
    "Wöchentlich · jeweils Montag und Donnerstag · ab 06.08.2026 · 10:30 Uhr",
  );

  assert.equal(
    getVisitScheduleSummary({
      frequency: "monthly",
      repeatEvery: 2,
      monthDays: [20, 5, 20],
      startDate: "2026-08-06",
      endDate: "2027-02-28",
      desiredTime: "08:15",
    }),
    "Alle 2 Monate · am 5. und 20. des Monats · ab 06.08.2026 · bis 28.02.2027 · 08:15 Uhr",
  );
});
