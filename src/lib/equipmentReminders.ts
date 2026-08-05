export type ReminderVisit = {
  id: string;
  property_id: string;
  scheduled_date: string;
};

export type ReminderEquipmentAssignment = {
  id: string;
  property_id: string;
  building_id: string | null;
  equipment_id: string;
  required_quantity: number;
  seasonal: boolean;
  season_start_month: number | null;
  season_end_month: number | null;
  rental: boolean;
  notification_lead_hours: number;
  provision_note: string | null;
  equipment_name: string;
};

export type ReconciledVisitEquipment = {
  visitId: string;
  equipmentId: string;
  requiredQuantity: number;
  rental: boolean;
  provisionNote: string | null;
  equipmentName: string;
  reminderLeadHours: number | null;
  reminderProvisionNote: string | null;
};

function addUniqueNote(notes: string[], value: string | null) {
  const note = value?.trim();
  if (note && !notes.includes(note)) notes.push(note);
}

function monthIsInSeason(month: number, startMonth: number, endMonth: number) {
  if (
    ![month, startMonth, endMonth].every(
      (value) => Number.isInteger(value) && value >= 1 && value <= 12,
    )
  ) {
    return false;
  }
  return startMonth <= endMonth
    ? month >= startMonth && month <= endMonth
    : month >= startMonth || month <= endMonth;
}

function appliesToVisit(
  visit: ReminderVisit,
  assignment: ReminderEquipmentAssignment,
  buildingIds: ReadonlySet<string>,
) {
  if (assignment.property_id !== visit.property_id) return false;
  if (assignment.building_id && !buildingIds.has(assignment.building_id))
    return false;
  if (!assignment.seasonal) return true;
  if (!assignment.season_start_month || !assignment.season_end_month)
    return false;

  const visitMonth = Number(visit.scheduled_date.slice(5, 7));
  return monthIsInSeason(
    visitMonth,
    assignment.season_start_month,
    assignment.season_end_month,
  );
}

export function reconcileVisitEquipment(
  visits: ReminderVisit[],
  assignments: ReminderEquipmentAssignment[],
  visitBuildings: Array<{ visit_id: string; building_id: string }>,
) {
  const buildingsByVisit = new Map<string, Set<string>>();
  for (const row of visitBuildings) {
    const buildingIds = buildingsByVisit.get(row.visit_id) ?? new Set<string>();
    buildingIds.add(row.building_id);
    buildingsByVisit.set(row.visit_id, buildingIds);
  }

  const assignmentsByProperty = new Map<
    string,
    ReminderEquipmentAssignment[]
  >();
  for (const assignment of assignments) {
    const rows = assignmentsByProperty.get(assignment.property_id) ?? [];
    rows.push(assignment);
    assignmentsByProperty.set(assignment.property_id, rows);
  }

  const reconciled: ReconciledVisitEquipment[] = [];
  for (const visit of visits) {
    const perEquipment = new Map<
      string,
      ReconciledVisitEquipment & {
        provisionNotes: string[];
        reminderProvisionNotes: string[];
      }
    >();
    const buildingIds = buildingsByVisit.get(visit.id) ?? new Set<string>();

    for (const assignment of assignmentsByProperty.get(visit.property_id) ??
      []) {
      if (!appliesToVisit(visit, assignment, buildingIds)) continue;

      const quantity = Number(assignment.required_quantity);
      const safeQuantity =
        Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
      const current = perEquipment.get(assignment.equipment_id) ?? {
        visitId: visit.id,
        equipmentId: assignment.equipment_id,
        requiredQuantity: safeQuantity,
        rental: false,
        provisionNote: null,
        equipmentName: assignment.equipment_name,
        reminderLeadHours: null,
        reminderProvisionNote: null,
        provisionNotes: [],
        reminderProvisionNotes: [],
      };

      current.requiredQuantity = Math.max(
        current.requiredQuantity,
        safeQuantity,
      );
      current.rental ||= assignment.rental;
      addUniqueNote(current.provisionNotes, assignment.provision_note);

      if (assignment.rental && assignment.seasonal) {
        const leadHours = Math.max(
          0,
          Number(assignment.notification_lead_hours) || 0,
        );
        current.reminderLeadHours = Math.max(
          current.reminderLeadHours ?? 0,
          leadHours,
        );
        addUniqueNote(
          current.reminderProvisionNotes,
          assignment.provision_note,
        );
      }

      perEquipment.set(assignment.equipment_id, current);
    }

    for (const item of perEquipment.values()) {
      item.provisionNote = item.provisionNotes.join(" · ") || null;
      item.reminderProvisionNote =
        item.reminderProvisionNotes.join(" · ") || null;
      const {
        provisionNotes: _provisionNotes,
        reminderProvisionNotes: _reminderNotes,
        ...row
      } = item;
      void _provisionNotes;
      void _reminderNotes;
      reconciled.push(row);
    }
  }

  return reconciled.sort(
    (left, right) =>
      left.visitId.localeCompare(right.visitId) ||
      left.equipmentId.localeCompare(right.equipmentId),
  );
}

export function equipmentReminderKey(
  visitId: string,
  equipmentId: string,
  recipientId: string,
) {
  return `equipment:${equipmentId}:visit:${visitId}:${recipientId}`;
}
