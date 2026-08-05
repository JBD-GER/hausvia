import assert from "node:assert/strict";
import test from "node:test";
import {
  addCalendarDays,
  canCancelExtraCharge,
  calculateBillingTotals,
  calculateLineTaxCents,
  calculateTaxBreakdown,
  carePeriodOverlapsBillingPeriod,
  centsToLegacyAmount,
  isBerlinFirstOfMonth,
  previousBerlinBillingPeriod,
  selectCompensationRateForPeriod,
  validateCompanySettings,
  validatePropertyBillingProfile,
} from "./monthlyBilling.ts";

test("nur offene und noch nicht gebundene Zusatzkosten sind stornierbar", () => {
  assert.equal(canCancelExtraCharge("open", null), true);
  assert.equal(canCancelExtraCharge("open", "invoice-item"), false);
  assert.equal(canCancelExtraCharge("queued", null), false);
  assert.equal(canCancelExtraCharge("billed", null), false);
  assert.equal(canCancelExtraCharge("canceled", null), false);
});

test("Monatsabrechnung bleibt über Positionen und Steuer in ganzen Cent", () => {
  assert.deepEqual(calculateBillingTotals([]), { netCents: 0, taxCents: 0, grossCents: 0 });
  const totals = calculateBillingTotals([
    { netCents: 12_345, taxRateBps: 1_900 },
    { netCents: 6_001, taxRateBps: 1_900 },
    { netCents: 999, taxRateBps: 700 },
  ]);
  assert.deepEqual(totals, { netCents: 19_345, taxCents: 3_556, grossCents: 22_901 });
  assert.equal(calculateLineTaxCents(1, 1_900), 0);
  assert.equal(calculateLineTaxCents(3, 1_900), 1);
  assert.deepEqual(calculateTaxBreakdown([
    { netCents: 100, taxRateBps: 700 },
    { netCents: 200, taxRateBps: 1_900 },
    { netCents: 300, taxRateBps: 700 },
  ]), [
    { taxRateBps: 700, taxCents: 28 },
    { taxRateBps: 1_900, taxCents: 38 },
  ]);
  assert.equal(centsToLegacyAmount(12_345), 123.45);
  assert.throws(() => calculateLineTaxCents(1.2, 1_900), RangeError);
  assert.throws(
    () => calculateBillingTotals([{ netCents: Number.MAX_SAFE_INTEGER, taxRateBps: 10_000 }]),
    RangeError,
  );
});

test("Berliner Monatsgrenze wählt auch rund um UTC-Mitternacht den richtigen Leistungsmonat", () => {
  const instant = new Date("2026-08-31T22:30:00.000Z");
  assert.equal(isBerlinFirstOfMonth(instant), true);
  assert.deepEqual(previousBerlinBillingPeriod(instant), {
    billingMonth: "2026-08-01",
    start: "2026-08-01",
    end: "2026-08-31",
  });
  assert.equal(addCalendarDays("2026-09-01", 14), "2026-09-15");
});

test("rechtliche Pflichtangaben blockieren unvollständige Unternehmenseinstellungen", () => {
  const incomplete = validateCompanySettings({ legal_name: "Flaaq Holding GmbH" });
  assert.equal(incomplete.valid, false);
  assert.ok(incomplete.missing.includes("Steuernummer oder Umsatzsteuer-ID"));
  assert.ok(incomplete.missing.includes("IBAN"));

  const complete = validateCompanySettings({
    legal_name: "Flaaq Holding GmbH",
    address_street: "Musterstraße",
    address_house_number: "1",
    address_postal_code: "30159",
    address_city: "Hannover",
    address_country: "Deutschland",
    commercial_register: "Amtsgericht Hannover HRB 230241",
    management: "Christoph Pfad",
    tax_number: "12/345/67890",
    email: "info@hausvia.de",
    bank_name: "Musterbank",
    iban: "DE00123456780000000000",
    bic: "MUSTDEFFXXX",
    payment_due_days: 14,
    invoice_prefix: "HV",
    default_tax_rate_bps: 1_900,
  });
  assert.deepEqual(complete, { valid: true, missing: [] });
});

test("Rechnungsempfänger braucht Name, vollständige Anschrift und Rechnungs-E-Mail", () => {
  assert.equal(validatePropertyBillingProfile({ recipient_name: "WEG Musterstraße" }).valid, false);
  assert.deepEqual(
    validatePropertyBillingProfile({
      recipient_name: "WEG Musterstraße",
      billing_street: "Musterstraße",
      billing_house_number: "1-7",
      billing_postal_code: "30159",
      billing_city: "Hannover",
      billing_country: "Deutschland",
      billing_email: "rechnung@example.com",
    }),
    { valid: true, missing: [] },
  );
});

test("Vertragszeitraum und historische Grundvergütung bestimmen den Abrechnungsmonat", () => {
  const period = { billingMonth: "2026-08-01", start: "2026-08-01", end: "2026-08-31" };
  assert.equal(
    carePeriodOverlapsBillingPeriod(
      { status: "archived", care_start_date: "2026-01-01", care_end_date: "2026-08-12" },
      period,
    ),
    true,
  );
  assert.equal(
    carePeriodOverlapsBillingPeriod(
      { status: "archived", care_start_date: "2026-01-01", care_end_date: "2026-07-31" },
      period,
    ),
    false,
  );
  assert.equal(
    carePeriodOverlapsBillingPeriod(
      { status: "paused", care_start_date: "2026-01-01", care_end_date: null },
      period,
    ),
    false,
  );

  const selected = selectCompensationRateForPeriod(
    [
      { property_id: "p", net_amount_cents: 10_000, tax_rate_bps: 1_900, valid_from: "2026-01-01", valid_until: "2026-08-31" },
      { property_id: "p", net_amount_cents: 12_000, tax_rate_bps: 1_900, valid_from: "2026-09-01", valid_until: null },
    ],
    period,
  );
  assert.equal(selected?.net_amount_cents, 10_000);
});
