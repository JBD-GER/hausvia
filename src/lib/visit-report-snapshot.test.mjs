import assert from "node:assert/strict";
import test from "node:test";
import {
  parseVisitOperationalReportsSnapshot,
  parseVisitReportSnapshot,
  visitReportPhotos,
} from "./visitReportSnapshot.ts";

test("liest ausschließlich den kundenfreundlichen unveränderlichen Leistungsbericht", () => {
  const report = parseVisitReportSnapshot({
    schema_version: 1,
    visit_id: "visit-1",
    property_name: "WEG Musterstraße",
    scheduled_date: "2026-10-12",
    started_at: "2026-10-12T08:00:00Z",
    completed_at: "2026-10-12T09:05:00Z",
    duration_minutes: 65,
    employee_name: "Erika Beispiel",
    internal_instruction: "darf nie ausgegeben werden",
    buildings: [{ id: "building-1", label: "Haus A", formatted_address: "Musterstraße 1, Hannover" }],
    tasks: [{
      id: "task-1",
      title: "Laub entfernen",
      status: "done",
      checklist_snapshot: [{ id: "check-1", label: "Hof prüfen", required: true }],
      internal_instruction: "intern",
      photos: [{ id: "photo-1", bucket: "visit-task-attachments", path: "safe/photo.jpg", filename: "Nachweis.jpg", mime_type: "image/jpeg" }],
    }],
    damages: [{ id: "damage-1", title: "Leuchte", status: "resolved", resolution_note: "Ersetzt" }],
  });

  assert.equal(report?.employeeName, "Erika Beispiel");
  assert.equal(report?.buildings[0].label, "Haus A");
  assert.equal(report?.tasks[0].checklist[0].label, "Hof prüfen");
  assert.equal(report?.damages[0].resolutionNote, "Ersetzt");
  assert.equal("internalInstruction" in (report?.tasks[0] ?? {}), false);
  assert.deepEqual(visitReportPhotos(report).map((photo) => photo.id), ["photo-1"]);
});

test("verwirft unvollständige oder manipulierte Snapshots", () => {
  assert.equal(parseVisitReportSnapshot(null), null);
  assert.equal(parseVisitReportSnapshot({ visit_id: "x" }), null);
  assert.equal(parseVisitReportSnapshot({
    visit_id: "x",
    started_at: "start",
    completed_at: "ende",
    duration_minutes: -1,
  }), null);
});

test("liest den getrennten internen Snapshot betrieblicher Meldungen", () => {
  const reports = parseVisitOperationalReportsSnapshot([{
    id: "report-1",
    title: "Waschmittel leer",
    description: "Vor dem nächsten Einsatz auffüllen.",
    category: "cleaning_supply_empty",
    urgency: "high",
    status_at_completion: "new",
    attachments: [{
      id: "attachment-1",
      bucket: "operational-report-attachments",
      path: "employee/report/photo.jpg",
      filename: "Regal.jpg",
      mime_type: "image/jpeg",
    }],
  }]);

  assert.equal(reports.length, 1);
  assert.equal(reports[0].title, "Waschmittel leer");
  assert.equal(reports[0].statusAtCompletion, "new");
  assert.equal(reports[0].photos[0].id, "attachment-1");
});
