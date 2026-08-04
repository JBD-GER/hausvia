import assert from "node:assert/strict";
import test from "node:test";

import {
  googleAdsId,
  googleAdsLeadConversionLabel,
  googleAdsWinterdienstConversionLabel,
  normalizeGoogleAdsUserData,
} from "./googleAds.ts";

test("verwendet die beiden richtigen Google-Ads-Conversion-Ziele", () => {
  assert.equal(googleAdsId, "AW-18131829931");
  assert.equal(googleAdsLeadConversionLabel, "p6rgCLT7yr0cEKuJ98VD");
  assert.equal(googleAdsWinterdienstConversionLabel, "VMaTCOa13tscEKuJ98VD");
});

test("normalisiert E-Mail und deutsche Telefonnummer für Enhanced Conversions", () => {
  assert.deepEqual(
    normalizeGoogleAdsUserData({ email: "  MAX@Beispiel.de ", phone: "0511 / 123 45 67" }),
    {
      email: "max@beispiel.de",
      phone_number: "+495111234567",
    },
  );

  assert.deepEqual(
    normalizeGoogleAdsUserData({ email: "max@beispiel.de", phone: "0049 511 1234567" }),
    {
      email: "max@beispiel.de",
      phone_number: "+495111234567",
    },
  );
});

test("sendet keine leeren oder ungültigen Enhanced-Conversion-Daten", () => {
  assert.equal(normalizeGoogleAdsUserData({ email: "keine-mail", phone: "0511 123456" }), null);
  assert.deepEqual(normalizeGoogleAdsUserData({ email: "kunde@example.com", phone: "123" }), {
    email: "kunde@example.com",
  });
});
