import assert from "node:assert/strict";
import test from "node:test";
import {
  canRoleDownloadOffer,
  canonicalOfferContent,
  effectiveOfferStatus,
  offerContentSha256,
  offerPdfSha256,
  offerVersionStoragePath,
  verifyOfferPdfSha256,
} from "./offerIntegrity.ts";

test("kanonischer Angebotsinhalt ist unabhängig von Objektschlüssel-Reihenfolge", () => {
  const left = { title: "A", nested: { b: 2, a: 1 }, items: [{ z: 3, a: 1 }] };
  const right = { items: [{ a: 1, z: 3 }], nested: { a: 1, b: 2 }, title: "A" };
  assert.equal(canonicalOfferContent(left), canonicalOfferContent(right));
  assert.equal(offerContentSha256(left), offerContentSha256(right));
});

test("PDF-Prüfsumme und unveränderlicher Pfad sind deterministisch", () => {
  const bytes = Buffer.from("%PDF Hausvia Angebot", "utf8");
  const checksum = offerPdfSha256(bytes);
  assert.equal(verifyOfferPdfSha256(bytes, checksum), true);
  assert.equal(verifyOfferPdfSha256(Buffer.from("changed"), checksum), false);
  assert.equal(
    offerVersionStoragePath({
      offerId: "00000000-0000-4000-8000-000000000001",
      versionNumber: 2,
      sha256: checksum,
    }),
    `offers/00000000-0000-4000-8000-000000000001/v2/offer-${checksum}.pdf`,
  );
});

test("Ablaufstatus und Rollen werden eng ausgewertet", () => {
  assert.equal(effectiveOfferStatus("sent", "2026-08-04", "2026-08-05"), "expired");
  assert.equal(effectiveOfferStatus("accepted", "2026-08-04", "2026-08-05"), "accepted");
  assert.equal(canRoleDownloadOffer("admin"), true);
  assert.equal(canRoleDownloadOffer("customer"), true);
  assert.equal(canRoleDownloadOffer("employee"), false);
});
