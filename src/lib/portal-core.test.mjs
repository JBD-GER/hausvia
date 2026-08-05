import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateGrossCents,
  calculateTaxCents,
  calculateTimedChargeCents,
  formatBerlinDateTimeLocal,
  isDateInSeason,
  isMonthInSeason,
  parseEuroToCents,
  parseEuroToCentsStrict,
  parseBerlinDateTimeLocal,
  previousBerlinMonth,
} from "./portal/core.ts";

test("deutsche Geldbeträge werden exakt in Cent geparst", () => {
  assert.equal(parseEuroToCents("1.234,56 €"), 123456);
  assert.equal(parseEuroToCents("60,00"), 6000);
  assert.equal(parseEuroToCents("kaputt"), 0);
  assert.equal(parseEuroToCentsStrict("10.50"), 1050);
  assert.equal(parseEuroToCentsStrict("10,50"), 1050);
  assert.equal(parseEuroToCentsStrict("1.234,56 €"), 123456);
  assert.equal(parseEuroToCentsStrict("12,345"), null);
  assert.equal(parseEuroToCentsStrict("kaputt"), null);
  assert.equal(parseEuroToCentsStrict(Number.POSITIVE_INFINITY), null);
});

test("Umsatzsteuer und Brutto bleiben ganzzahlig", () => {
  assert.equal(calculateTaxCents(10_000, 1_900), 1_900);
  assert.equal(calculateGrossCents(10_000, 1_900), 11_900);
  assert.equal(calculateTimedChargeCents(90, 6_000), 9_000);
});

test("Saison über Jahreswechsel funktioniert", () => {
  assert.equal(isMonthInSeason(11, 11, 3), true);
  assert.equal(isMonthInSeason(1, 11, 3), true);
  assert.equal(isMonthInSeason(6, 11, 3), false);
  assert.equal(isDateInSeason("2026-10-15", 9, 12), true);
  assert.equal(isDateInSeason("2026-06-15", 9, 12), false);
});

test("vorheriger Berliner Kalendermonat wird korrekt bestimmt", () => {
  assert.deepEqual(previousBerlinMonth(new Date("2026-09-01T00:30:00+02:00")), {
    billingMonth: "2026-08-01",
    start: "2026-08-01",
    end: "2026-08-31",
  });
});

test("datetime-local wird unabhängig von der Server-Zeitzone als Berliner Zeit behandelt", () => {
  assert.equal(parseBerlinDateTimeLocal("2026-08-05T09:30"), "2026-08-05T07:30:00.000Z");
  assert.equal(parseBerlinDateTimeLocal("2026-01-05T09:30"), "2026-01-05T08:30:00.000Z");
  assert.equal(formatBerlinDateTimeLocal("2026-08-05T07:30:00.000Z"), "2026-08-05T09:30");
  assert.equal(parseBerlinDateTimeLocal("2026-03-29T02:30"), null);
});
