export type VisitChecklistSnapshotItem = {
  id: string | null;
  label: string;
  required: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseVisitChecklistSnapshot(
  value: unknown,
): VisitChecklistSnapshotItem[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    if (typeof entry === "string") {
      const label = entry.trim();
      return label ? [{ id: null, label, required: false }] : [];
    }

    if (!isRecord(entry)) return [];
    const label = typeof entry.label === "string" ? entry.label.trim() : "";
    if (!label) return [];

    const rawId = typeof entry.id === "string" ? entry.id.trim() : "";
    return [
      {
        id: rawId || null,
        label,
        required: entry.required === true,
      },
    ];
  });
}

export function areVisitTasksResolved(
  tasks: ReadonlyArray<{ status: string }>,
) {
  return tasks.every(
    (task) => task.status === "done" || task.status === "blocked",
  );
}
