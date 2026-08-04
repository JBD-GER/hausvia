import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateWinterPolygonArea,
  isSimpleWinterPolygon,
  sanitizeWinterMapPoints,
  sanitizeWinterObjectAddress,
  winterMapConfig,
} from "./winterMap.ts";

const hannoverSquare = [
  { lat: 52.375, lng: 9.732 },
  { lat: 52.375, lng: 9.732147 },
  { lat: 52.37509, lng: 9.732147 },
  { lat: 52.37509, lng: 9.732 },
];

test("validiert und begrenzt Kartenpunkte", () => {
  assert.deepEqual(
    sanitizeWinterMapPoints([
      { lat: 52.3758924, lng: 9.7320091 },
      { lat: 52.3758, lng: 9.7324 },
      { lat: 52.3755, lng: 9.7322 },
    ]),
    [
      { lat: 52.3758924, lng: 9.7320091 },
      { lat: 52.3758, lng: 9.7324 },
      { lat: 52.3755, lng: 9.7322 },
    ],
  );

  assert.deepEqual(sanitizeWinterMapPoints([{ lat: 91, lng: 9.7 }]), []);
  assert.deepEqual(sanitizeWinterMapPoints([{ lat: 52.3, lng: Number.NaN }]), []);
  assert.deepEqual(
    sanitizeWinterMapPoints(
      Array.from({ length: winterMapConfig.maximumPoints + 1 }, () => ({ lat: 52.3, lng: 9.7 })),
    ),
    [],
  );
});

test("normalisiert die Objektadresse und begrenzt ihre Länge", () => {
  assert.equal(sanitizeWinterObjectAddress("  Musterstraße   1, 30159 Hannover  "), "Musterstraße 1, 30159 Hannover");
  assert.equal(
    sanitizeWinterObjectAddress("x".repeat(winterMapConfig.maximumAddressLength + 20)).length,
    winterMapConfig.maximumAddressLength,
  );
  assert.equal(sanitizeWinterObjectAddress(null), "");
});

test("berechnet kleine Kartenpolygone serverseitig in Quadratmetern", () => {
  const area = calculateWinterPolygonArea(hannoverSquare);
  const reversedArea = calculateWinterPolygonArea([...hannoverSquare].reverse());

  assert.ok(area > 90 && area < 110, `Erwartete rund 100 m², erhalten: ${area}`);
  assert.ok(Math.abs(area - reversedArea) < 0.01);
  assert.equal(calculateWinterPolygonArea(hannoverSquare.slice(0, 2)), 0);
  assert.equal(calculateWinterPolygonArea([{ lat: 95, lng: 9.7 }, ...hannoverSquare]), 0);
});

test("weist selbstüberschneidende oder entartete Kartenpolygone zurück", () => {
  const bowTie = [hannoverSquare[0], hannoverSquare[2], hannoverSquare[1], hannoverSquare[3]];

  assert.equal(isSimpleWinterPolygon(hannoverSquare), true);
  assert.equal(isSimpleWinterPolygon(bowTie), false);
  assert.equal(isSimpleWinterPolygon([hannoverSquare[0], hannoverSquare[0], hannoverSquare[2]]), false);
});
