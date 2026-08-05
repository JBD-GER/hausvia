import assert from "node:assert/strict";
import test from "node:test";
import {
  equipmentReminderKey,
  reconcileVisitEquipment,
} from "./equipmentReminders.ts";

test("Equipment wird je Einsatz und Gerät gebäude- sowie saisonrichtig zusammengeführt", () => {
  const visits = [
    { id: "visit-a", property_id: "property-a", scheduled_date: "2026-11-15" },
  ];
  const assignments = [
    {
      id: "assignment-a",
      property_id: "property-a",
      building_id: "building-a",
      equipment_id: "blower",
      required_quantity: 1,
      seasonal: true,
      season_start_month: 10,
      season_end_month: 3,
      rental: true,
      notification_lead_hours: 48,
      provision_note: "Am Vortag abholen",
      equipment_name: "Laubbläser",
    },
    {
      id: "assignment-b",
      property_id: "property-a",
      building_id: null,
      equipment_id: "blower",
      required_quantity: 2,
      seasonal: true,
      season_start_month: 10,
      season_end_month: 3,
      rental: true,
      notification_lead_hours: 72,
      provision_note: "Akku laden",
      equipment_name: "Laubbläser",
    },
    {
      id: "wrong-building",
      property_id: "property-a",
      building_id: "building-b",
      equipment_id: "pressure-washer",
      required_quantity: 1,
      seasonal: false,
      season_start_month: null,
      season_end_month: null,
      rental: false,
      notification_lead_hours: 0,
      provision_note: null,
      equipment_name: "Hochdruckreiniger",
    },
    {
      id: "wrong-season",
      property_id: "property-a",
      building_id: null,
      equipment_id: "summer-tool",
      required_quantity: 1,
      seasonal: true,
      season_start_month: 4,
      season_end_month: 9,
      rental: true,
      notification_lead_hours: 24,
      provision_note: null,
      equipment_name: "Sommergerät",
    },
  ];

  assert.deepEqual(
    reconcileVisitEquipment(visits, assignments, [
      { visit_id: "visit-a", building_id: "building-a" },
    ]),
    [
      {
        visitId: "visit-a",
        equipmentId: "blower",
        requiredQuantity: 2,
        rental: true,
        provisionNote: "Am Vortag abholen · Akku laden",
        equipmentName: "Laubbläser",
        reminderLeadHours: 72,
        reminderProvisionNote: "Am Vortag abholen · Akku laden",
      },
    ],
  );
});

test("Reminder-Schlüssel ist unabhängig von einzelnen Objektzuordnungen", () => {
  assert.equal(
    equipmentReminderKey("visit-a", "blower", "user-a"),
    "equipment:blower:visit:visit-a:user-a",
  );
});
