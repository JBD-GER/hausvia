import assert from "node:assert/strict";
import test from "node:test";

import {
  parseWinterPolygons,
  winterLeadSubmissionConfig,
} from "./winterLeadSubmission.ts";

const firstPolygon = [
  { lat: 52.375, lng: 9.732 },
  { lat: 52.375, lng: 9.732147 },
  { lat: 52.37509, lng: 9.732147 },
  { lat: 52.37509, lng: 9.732 },
];
const secondPolygon = firstPolygon.map((point) => ({ lat: point.lat + 0.001, lng: point.lng }));

test("summiert mehrere gültige Winterdienstflächen serverseitig", () => {
  const result = parseWinterPolygons([firstPolygon, secondPolygon]);

  assert.equal(result.status, "valid");
  assert.equal(result.polygons.length, 2);
  assert.ok(result.totalArea > 180 && result.totalArea < 220, `Erwartete rund 200 m², erhalten: ${result.totalArea}`);
});

test("bleibt mit dem früheren Einzelflächen-Feld kompatibel", () => {
  const result = parseWinterPolygons(undefined, firstPolygon);

  assert.equal(result.status, "valid");
  assert.equal(result.polygons.length, 1);
  assert.ok(result.totalArea > 90 && result.totalArea < 110);
});

test("entfernt einen wiederholten Schlusspunkt und weist ungültige Gruppen zurück", () => {
  const closedPolygon = [...firstPolygon, firstPolygon[0]];
  const result = parseWinterPolygons([closedPolygon]);

  assert.equal(result.status, "valid");
  assert.equal(result.polygons[0].length, 4);
  assert.equal(parseWinterPolygons([]).status, "invalid");
  assert.equal(parseWinterPolygons([[firstPolygon[0], firstPolygon[1]]]).status, "invalid");
  assert.equal(
    parseWinterPolygons(Array.from({ length: winterLeadSubmissionConfig.maximumPolygons + 1 }, () => firstPolygon))
      .status,
    "invalid",
  );
});

test("verhindert doppelte, überlappende oder ineinanderliegende Teilflächen", () => {
  const nestedPolygon = firstPolygon.map((point) => ({
    lat: 52.375045 + (point.lat - 52.375045) * 0.4,
    lng: 9.7320735 + (point.lng - 9.7320735) * 0.4,
  }));
  const crossingPolygon = firstPolygon.map((point) => ({ lat: point.lat, lng: point.lng + 0.00008 }));

  assert.equal(parseWinterPolygons([firstPolygon, firstPolygon]).status, "invalid");
  assert.equal(parseWinterPolygons([firstPolygon, nestedPolygon]).status, "invalid");
  assert.equal(parseWinterPolygons([firstPolygon, crossingPolygon]).status, "invalid");
});
