import assert from "node:assert/strict";
import test from "node:test";
import {
  areVisitTasksResolved,
  parseVisitChecklistSnapshot,
} from "./visitTaskSnapshot.ts";

test("liest den beim Einsatzstart eingefrorenen Checklisten-Snapshot", () => {
  assert.deepEqual(
    parseVisitChecklistSnapshot([
      { id: "item-1", label: "  Eingangsbereich prüfen  ", required: true },
      { id: "item-2", label: "Beleuchtung kontrollieren", required: false },
    ]),
    [
      { id: "item-1", label: "Eingangsbereich prüfen", required: true },
      { id: "item-2", label: "Beleuchtung kontrollieren", required: false },
    ],
  );
});

test("ignoriert unlesbare Snapshot-Einträge ohne Status zu erfinden", () => {
  assert.deepEqual(
    parseVisitChecklistSnapshot([
      null,
      { id: "leer", label: "   ", required: true },
      { label: "Nur lesbarer Text", completed: true },
      " Legacy-Punkt ",
    ]),
    [
      { id: null, label: "Nur lesbarer Text", required: false },
      { id: null, label: "Legacy-Punkt", required: false },
    ],
  );
  assert.deepEqual(parseVisitChecklistSnapshot({ label: "Kein Array" }), []);
});

test("erlaubt den Einsatzabschluss auch wenn saisonbedingt keine Aufgabe fällig ist", () => {
  assert.equal(areVisitTasksResolved([]), true);
  assert.equal(
    areVisitTasksResolved([{ status: "done" }, { status: "blocked" }]),
    true,
  );
  assert.equal(areVisitTasksResolved([{ status: "open" }]), false);
});
