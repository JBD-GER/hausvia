import assert from "node:assert/strict";
import test from "node:test";
import { selectWinterServiceVisitSummary } from "./winterServiceVisits.ts";

const winterService = (overrides = {}) => ({
  id: "winter-service",
  property_id: "property-a",
  execution_rule: "on_demand",
  occurrences_per_period: 1,
  seasonal: true,
  season_start_month: 11,
  season_end_month: 3,
  start_date: "2026-01-01",
  end_date: null,
  property_service_buildings: [],
  ...overrides,
});

const task = ({
  serviceId = "winter-service",
  duePeriodKey = null,
  buildingId = null,
  sourceType = "service",
} = {}) => ({
  property_service_id: serviceId,
  due_period_key: duePeriodKey,
  building_id: buildingId,
  source_type: sourceType,
});

const visit = ({
  id,
  propertyId = "property-a",
  scheduledDate,
  plannedStartTime = "08:00:00",
  status,
  completedAt = null,
  buildingIds = ["building-a"],
  tasks = [],
}) => ({
  id,
  property_id: propertyId,
  scheduled_date: scheduledDate,
  planned_start_time: plannedStartTime,
  scheduled_start: `${scheduledDate}T${plannedStartTime}Z`,
  status,
  completed_at: completedAt,
  visit_buildings: buildingIds.map((buildingId) => ({ building_id: buildingId })),
  visit_tasks: tasks,
});

test("ermittelt Bedarfs-Einsätze ausschließlich über die konkrete Winterdienstleistung", () => {
  const result = selectWinterServiceVisitSummary(
    [
      visit({
        id: "generic-next",
        scheduledDate: "2026-12-06",
        status: "scheduled",
        tasks: [task({ serviceId: "caretaking-service" })],
      }),
      visit({
        id: "winter-next",
        scheduledDate: "2026-12-08",
        status: "scheduled",
        tasks: [task()],
      }),
      visit({
        id: "generic-last",
        scheduledDate: "2026-12-04",
        status: "completed",
        completedAt: "2026-12-04T12:00:00Z",
        tasks: [task({ serviceId: "caretaking-service" })],
      }),
      visit({
        id: "winter-follow-up",
        scheduledDate: "2026-12-03",
        status: "completed",
        completedAt: "2026-12-03T12:00:00Z",
        tasks: [task({ sourceType: "follow_up" })],
      }),
    ],
    winterService(),
    "2026-12-05",
  );

  assert.equal(result.nextVisit?.id, "winter-next");
  assert.equal(result.lastVisit?.id, "winter-follow-up");
});

test("erkennt den nächsten noch aufgabenlosen Generator-Besuch anhand der Startlogik", () => {
  const result = selectWinterServiceVisitSummary(
    [
      visit({
        id: "already-serviced-this-week",
        scheduledDate: "2026-11-02",
        status: "completed",
        tasks: [
          task({
            duePeriodKey: "week:2026-45",
            buildingId: "building-a",
          }),
        ],
      }),
      visit({
        id: "same-period-exhausted",
        scheduledDate: "2026-11-03",
        status: "scheduled",
      }),
      visit({
        id: "wrong-building",
        scheduledDate: "2026-11-09",
        status: "scheduled",
        buildingIds: ["building-b"],
      }),
      visit({
        id: "next-generated-winter-visit",
        scheduledDate: "2026-11-10",
        status: "scheduled",
      }),
    ],
    winterService({
      execution_rule: "once_weekly",
      property_service_buildings: [{ building_id: "building-a" }],
    }),
    "2026-11-01",
  );

  assert.equal(result.nextVisit?.id, "next-generated-winter-visit");
  assert.equal(result.lastVisit?.id, "already-serviced-this-week");
});

test("leitet für Bedarfsregeln, falsche Gebäude oder Daten außerhalb der Saison nichts ab", () => {
  const visits = [
    visit({
      id: "plain-visit",
      scheduledDate: "2026-06-08",
      status: "scheduled",
    }),
  ];

  assert.equal(
    selectWinterServiceVisitSummary(
      visits,
      winterService(),
      "2026-06-01",
    ).nextVisit,
    undefined,
  );
  assert.equal(
    selectWinterServiceVisitSummary(
      visits,
      winterService({ execution_rule: "every_visit" }),
      "2026-06-01",
    ).nextVisit,
    undefined,
  );
  assert.deepEqual(
    selectWinterServiceVisitSummary(visits, undefined, "2026-06-01"),
    { nextVisit: undefined, lastVisit: undefined },
  );
});
