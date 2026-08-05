import { parseVisitChecklistSnapshot, type VisitChecklistSnapshotItem } from "./visitTaskSnapshot.ts";

export type VisitReportPhoto = {
  id: string;
  bucket: string;
  path: string;
  filename: string;
  mimeType: string | null;
};

export type VisitReportBuilding = {
  id: string;
  label: string | null;
  address: string;
};

export type VisitReportTask = {
  id: string;
  buildingId: string | null;
  title: string;
  description: string | null;
  category: string | null;
  status: "done" | "blocked";
  blockedReason: string | null;
  completedAt: string | null;
  checklist: VisitChecklistSnapshotItem[];
  photos: VisitReportPhoto[];
};

export type VisitReportDamage = {
  id: string;
  buildingId: string | null;
  title: string;
  description: string | null;
  status: string;
  resolutionNote: string | null;
  photos: VisitReportPhoto[];
};

export type VisitOperationalReportSnapshot = {
  id: string;
  buildingId: string | null;
  equipmentId: string | null;
  category: string;
  urgency: string;
  title: string;
  description: string;
  statusAtCompletion: string;
  createdAt: string | null;
  photos: VisitReportPhoto[];
};

export type VisitReportSnapshot = {
  visitId: string;
  propertyName: string | null;
  scheduledDate: string | null;
  startedAt: string;
  completedAt: string;
  durationMinutes: number;
  employeeName: string;
  buildings: VisitReportBuilding[];
  tasks: VisitReportTask[];
  damages: VisitReportDamage[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown, max = 5_000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function nullableString(value: unknown, max = 5_000) {
  return stringValue(value, max) || null;
}

function parsePhotos(value: unknown): VisitReportPhoto[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const id = stringValue(entry.id, 100);
    const bucket = stringValue(entry.bucket, 100);
    const path = stringValue(entry.path, 1_000);
    const filename = stringValue(entry.filename, 300);
    if (!id || !bucket || !path || !filename) return [];
    return [{ id, bucket, path, filename, mimeType: nullableString(entry.mime_type, 120) }];
  });
}

function parseBuildings(value: unknown): VisitReportBuilding[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const id = stringValue(entry.id, 100);
    const address = stringValue(entry.formatted_address ?? entry.address, 500);
    if (!id || !address) return [];
    return [{ id, label: nullableString(entry.label, 180), address }];
  });
}

function parseTasks(value: unknown): VisitReportTask[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const id = stringValue(entry.id, 100);
    const title = stringValue(entry.title, 300);
    const status = entry.status === "blocked" ? "blocked" : entry.status === "done" ? "done" : null;
    if (!id || !title || !status) return [];
    return [{
      id,
      buildingId: nullableString(entry.building_id, 100),
      title,
      description: nullableString(entry.description),
      category: nullableString(entry.category, 180),
      status,
      blockedReason: nullableString(entry.blocked_reason),
      completedAt: nullableString(entry.completed_at, 100),
      checklist: parseVisitChecklistSnapshot(entry.checklist_snapshot ?? entry.checklist),
      photos: parsePhotos(entry.photos),
    }];
  });
}

function parseDamages(value: unknown): VisitReportDamage[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const id = stringValue(entry.id, 100);
    const title = stringValue(entry.title, 300);
    if (!id || !title) return [];
    return [{
      id,
      buildingId: nullableString(entry.building_id, 100),
      title,
      description: nullableString(entry.description),
      status: stringValue(entry.status, 80) || "resolved",
      resolutionNote: nullableString(entry.resolution_note),
      photos: parsePhotos(entry.photos),
    }];
  });
}

export function parseVisitOperationalReportsSnapshot(
  value: unknown,
): VisitOperationalReportSnapshot[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const id = stringValue(entry.id, 100);
    const title = stringValue(entry.title, 300);
    const description = stringValue(entry.description);
    if (!id || !title || !description) return [];
    return [{
      id,
      buildingId: nullableString(entry.building_id, 100),
      equipmentId: nullableString(entry.equipment_id, 100),
      category: stringValue(entry.category, 100) || "other",
      urgency: stringValue(entry.urgency, 80) || "normal",
      title,
      description,
      statusAtCompletion:
        stringValue(entry.status_at_completion, 80) || "new",
      createdAt: nullableString(entry.created_at, 100),
      photos: parsePhotos(entry.attachments),
    }];
  });
}

export function parseVisitReportSnapshot(value: unknown): VisitReportSnapshot | null {
  if (!isRecord(value)) return null;
  const visitId = stringValue(value.visit_id, 100);
  const startedAt = stringValue(value.started_at, 100);
  const completedAt = stringValue(value.completed_at, 100);
  const durationMinutes = Number(value.duration_minutes);
  if (
    !visitId ||
    !startedAt ||
    !completedAt ||
    !Number.isSafeInteger(durationMinutes) ||
    durationMinutes < 0
  ) {
    return null;
  }
  return {
    visitId,
    propertyName: nullableString(value.property_name, 300),
    scheduledDate: nullableString(value.scheduled_date, 20),
    startedAt,
    completedAt,
    durationMinutes,
    employeeName: stringValue(value.employee_name, 300) || "Mitarbeiter",
    buildings: parseBuildings(value.buildings),
    tasks: parseTasks(value.tasks),
    damages: parseDamages(value.damages),
  };
}

export function visitReportPhotos(report: VisitReportSnapshot | null) {
  if (!report) return [];
  return [
    ...report.tasks.flatMap((task) => task.photos),
    ...report.damages.flatMap((damage) => damage.photos),
  ];
}
