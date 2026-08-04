import assert from "node:assert/strict";
import test from "node:test";

import {
  areValidWinterMapPolygons,
  calculateWinterPolygonArea,
  calculateWinterPolygonsArea,
  findWinterMapPolygonOverlaps,
  isSimpleWinterPolygon,
  sanitizeWinterMapPoints,
  sanitizeWinterMapPolygons,
  sanitizeWinterObjectAddress,
  winterMapPolygonsOverlap,
  winterMapConfig,
} from "./winterMap.ts";

const hannoverSquare = [
  { lat: 52.375, lng: 9.732 },
  { lat: 52.375, lng: 9.732147 },
  { lat: 52.37509, lng: 9.732147 },
  { lat: 52.37509, lng: 9.732 },
];

const secondHannoverSquare = hannoverSquare.map((point) => ({
  lat: point.lat + 0.0002,
  lng: point.lng + 0.0003,
}));

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

test("validiert mehrere getrennte Teilflächen und summiert ihre Quadratmeter", () => {
  const polygons = sanitizeWinterMapPolygons([hannoverSquare, secondHannoverSquare]);
  const firstArea = calculateWinterPolygonArea(hannoverSquare);
  const secondArea = calculateWinterPolygonArea(secondHannoverSquare);

  assert.equal(polygons.length, 2);
  assert.equal(areValidWinterMapPolygons(polygons), true);
  assert.ok(Math.abs(calculateWinterPolygonsArea(polygons) - firstArea - secondArea) < 0.01);
});

test("erkennt doppelte, kreuzende, berührende und ineinanderliegende Teilflächen", () => {
  const nestedPolygon = hannoverSquare.map((point) => ({
    lat: 52.375045 + (point.lat - 52.375045) * 0.4,
    lng: 9.7320735 + (point.lng - 9.7320735) * 0.4,
  }));
  const crossingPolygon = hannoverSquare.map((point) => ({ lat: point.lat, lng: point.lng + 0.00008 }));
  const touchingPolygon = hannoverSquare.map((point) => ({ lat: point.lat, lng: point.lng + 0.000147 }));

  assert.equal(winterMapPolygonsOverlap(hannoverSquare, secondHannoverSquare), false);
  assert.equal(winterMapPolygonsOverlap(hannoverSquare, hannoverSquare), true);
  assert.equal(winterMapPolygonsOverlap(hannoverSquare, nestedPolygon), true);
  assert.equal(winterMapPolygonsOverlap(hannoverSquare, crossingPolygon), true);
  assert.equal(winterMapPolygonsOverlap(hannoverSquare, touchingPolygon), true);
  assert.equal(areValidWinterMapPolygons([hannoverSquare, hannoverSquare]), false);
  assert.equal(calculateWinterPolygonsArea([hannoverSquare, hannoverSquare]), 0);
});

test("liefert alle betroffenen Polygonpaare mit stabilen Indizes", () => {
  assert.deepEqual(
    findWinterMapPolygonOverlaps([hannoverSquare, secondHannoverSquare, hannoverSquare]),
    [{ firstIndex: 0, secondIndex: 2 }],
  );
  assert.deepEqual(
    findWinterMapPolygonOverlaps([hannoverSquare, hannoverSquare, hannoverSquare]),
    [
      { firstIndex: 0, secondIndex: 1 },
      { firstIndex: 0, secondIndex: 2 },
      { firstIndex: 1, secondIndex: 2 },
    ],
  );
  assert.deepEqual(findWinterMapPolygonOverlaps([hannoverSquare, secondHannoverSquare]), []);
});

test("verwirft eine Mehrflächen-Auswahl vollständig, wenn ein Polygon ungültig ist", () => {
  const bowTie = [hannoverSquare[0], hannoverSquare[2], hannoverSquare[1], hannoverSquare[3]];

  assert.equal(areValidWinterMapPolygons([hannoverSquare, bowTie]), false);
  assert.equal(calculateWinterPolygonsArea([hannoverSquare, bowTie]), 0);
  assert.deepEqual(sanitizeWinterMapPolygons([hannoverSquare.slice(0, 2)]), []);
});

test("begrenzt Anzahl und Gesamtgröße gespeicherter Teilflächen", () => {
  assert.deepEqual(
    sanitizeWinterMapPolygons(
      Array.from({ length: winterMapConfig.maximumPolygons + 1 }, () => hannoverSquare),
    ),
    [],
  );

  const tooManyPoints = Array.from({ length: winterMapConfig.maximumPolygons }, (_, polygonIndex) =>
    Array.from({ length: winterMapConfig.maximumPoints }, (_, pointIndex) => ({
      lat: 52.3 + polygonIndex * 0.001 + pointIndex * 0.000001,
      lng: 9.7 + pointIndex * 0.000001,
    })),
  );
  assert.ok(tooManyPoints.flat().length > winterMapConfig.maximumTotalPoints);
  assert.deepEqual(sanitizeWinterMapPolygons(tooManyPoints), []);

  const exactlyAtBackendLimit = Array.from({ length: 4 }, (_, polygonIndex) =>
    Array.from({ length: winterMapConfig.maximumPoints }, (_, pointIndex) => ({
      lat: 52.3 + polygonIndex * 0.001 + pointIndex * 0.000001,
      lng: 9.7 + pointIndex * 0.000001,
    })),
  );
  assert.equal(exactlyAtBackendLimit.flat().length, winterMapConfig.maximumTotalPoints);
  assert.equal(sanitizeWinterMapPolygons(exactlyAtBackendLimit).length, 4);
});
