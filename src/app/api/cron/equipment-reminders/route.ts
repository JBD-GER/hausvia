import { NextResponse } from "next/server";
import {
  equipmentReminderKey,
  reconcileVisitEquipment,
  type ReminderEquipmentAssignment,
  type ReminderVisit,
} from "@/lib/equipmentReminders";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type EquipmentRelation = { name: string; status: string };

type EquipmentAssignmentRow = Omit<
  ReminderEquipmentAssignment,
  "equipment_name"
> & {
  equipment: EquipmentRelation | EquipmentRelation[] | null;
};

type VisitRow = ReminderVisit & {
  visit_plan_id: string | null;
  scheduled_start: string;
  planned_start_time: string | null;
  primary_employee_id: string | null;
  properties: { name: string } | { name: string }[] | null;
};

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  return Boolean(
    secret && request.headers.get("authorization") === `Bearer ${secret}`,
  );
}

function first<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

function berlinIsoDate(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${read("year")}-${read("month")}-${read("day")}`;
}

function plusDays(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function displayVisit(visit: VisitRow) {
  const date = new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(`${visit.scheduled_date}T12:00:00Z`));
  return visit.planned_start_time
    ? `${date} um ${visit.planned_start_time.slice(0, 5)} Uhr`
    : date;
}

async function createEquipmentReminders(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json(
      { ok: false, message: "Unauthorized" },
      { status: 401 },
    );
  }

  const admin = createSupabaseAdminClient();
  const now = new Date();
  const today = berlinIsoDate(now);
  const horizon = plusDays(today, 90);
  const [visitsResult, adminsResult] = await Promise.all([
    admin
      .from("visits")
      .select(
        "id,property_id,visit_plan_id,scheduled_date,scheduled_start,planned_start_time,primary_employee_id,properties(name)",
      )
      .eq("status", "scheduled")
      .gte("scheduled_date", today)
      .lte("scheduled_date", horizon),
    admin
      .from("user_profiles")
      .select("id")
      .eq("role", "admin")
      .eq("status", "active")
      .eq("onboarding_completed", true),
  ]);
  if (visitsResult.error || adminsResult.error) {
    return NextResponse.json(
      {
        ok: false,
        message: "Upcoming visits or administrators could not be loaded",
      },
      { status: 500 },
    );
  }

  const visits = (visitsResult.data ?? []) as VisitRow[];
  if (!visits.length) {
    return NextResponse.json({ ok: true, created: 0, reconciled: 0 });
  }

  const visitIds = visits.map((visit) => visit.id);
  const propertyIds = Array.from(
    new Set(visits.map((visit) => visit.property_id)),
  );
  const planIds = Array.from(
    new Set(
      visits
        .map((visit) => visit.visit_plan_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );

  const [
    assignmentsResult,
    visitBuildingsResult,
    planEmployeesResult,
  ] = await Promise.all([
    admin
      .from("property_equipment")
      .select(
        "id,property_id,building_id,equipment_id,required_quantity,seasonal,season_start_month,season_end_month,rental,notification_lead_hours,provision_note,equipment!inner(name,status)",
      )
      .in("property_id", propertyIds)
      .eq("active", true)
      .eq("equipment.status", "active"),
    admin
      .from("visit_buildings")
      .select("visit_id,building_id")
      .in("visit_id", visitIds),
    planIds.length
      ? admin
          .from("visit_plan_employees")
          .select("visit_plan_id,employee_id")
          .in("visit_plan_id", planIds)
      : Promise.resolve({
          data: [] as Array<{ visit_plan_id: string; employee_id: string }>,
          error: null,
        }),
  ]);

  if (
    assignmentsResult.error ||
    visitBuildingsResult.error ||
    planEmployeesResult.error
  ) {
    return NextResponse.json(
      { ok: false, message: "Equipment assignments could not be reconciled" },
      { status: 500 },
    );
  }

  const assignments = (assignmentsResult.data ??
    []) as EquipmentAssignmentRow[];
  const normalizedAssignments: ReminderEquipmentAssignment[] = assignments.map(
    (assignment) => ({
      id: assignment.id,
      property_id: assignment.property_id,
      building_id: assignment.building_id,
      equipment_id: assignment.equipment_id,
      required_quantity: Number(assignment.required_quantity),
      seasonal: assignment.seasonal,
      season_start_month: assignment.season_start_month,
      season_end_month: assignment.season_end_month,
      rental: assignment.rental,
      notification_lead_hours: Number(assignment.notification_lead_hours),
      provision_note: assignment.provision_note,
      equipment_name: first(assignment.equipment)?.name || "Equipment",
    }),
  );
  const reconciled = reconcileVisitEquipment(
    visits,
    normalizedAssignments,
    visitBuildingsResult.data ?? [],
  );

  if (reconciled.length) {
    const { error: reconcileError } = await admin
      .from("visit_equipment")
      .upsert(
        reconciled.map((item) => ({
          visit_id: item.visitId,
          equipment_id: item.equipmentId,
          required_quantity: item.requiredQuantity,
          rental: item.rental,
          provision_note: item.provisionNote,
        })),
        { onConflict: "visit_id,equipment_id" },
      );
    if (reconcileError) {
      return NextResponse.json(
        { ok: false, message: "Visit equipment could not be updated" },
        { status: 500 },
      );
    }
  }

  // Do not delete rows that are absent from property_equipment here. Visit
  // generation also snapshots service_equipment into this table, and those
  // service requirements must survive the reminder reconciliation.

  const employeeIdsByPlan = new Map<string, Set<string>>();
  for (const row of planEmployeesResult.data ?? []) {
    const employeeIds =
      employeeIdsByPlan.get(row.visit_plan_id) ?? new Set<string>();
    employeeIds.add(row.employee_id);
    employeeIdsByPlan.set(row.visit_plan_id, employeeIds);
  }
  const employeeIds = new Set<string>();
  for (const visit of visits) {
    if (visit.primary_employee_id) employeeIds.add(visit.primary_employee_id);
    if (visit.visit_plan_id) {
      for (const employeeId of employeeIdsByPlan.get(visit.visit_plan_id) ??
        []) {
        employeeIds.add(employeeId);
      }
    }
  }

  const employeesResult = employeeIds.size
    ? await admin
        .from("employee_profiles")
        .select("id,user_id")
        .in("id", Array.from(employeeIds))
        .eq("status", "active")
    : {
        data: [] as Array<{ id: string; user_id: string | null }>,
        error: null,
      };
  if (employeesResult.error) {
    return NextResponse.json(
      { ok: false, message: "Assigned employees could not be loaded" },
      { status: 500 },
    );
  }

  const employeeRows = (employeesResult.data ?? []).filter(
    (employee): employee is { id: string; user_id: string } =>
      Boolean(employee.user_id),
  );
  const employeeUserIds = Array.from(
    new Set(employeeRows.map((employee) => employee.user_id)),
  );
  const activeEmployeeUsersResult = employeeUserIds.length
    ? await admin
        .from("user_profiles")
        .select("id")
        .in("id", employeeUserIds)
        .eq("status", "active")
        .eq("onboarding_completed", true)
    : { data: [] as Array<{ id: string }>, error: null };
  if (activeEmployeeUsersResult.error) {
    return NextResponse.json(
      { ok: false, message: "Employee accounts could not be loaded" },
      { status: 500 },
    );
  }

  const activeEmployeeUserIds = new Set(
    (activeEmployeeUsersResult.data ?? []).map((profile) => profile.id),
  );
  const employeeUserById = new Map(
    employeeRows
      .filter((employee) => activeEmployeeUserIds.has(employee.user_id))
      .map((employee) => [employee.id, employee.user_id]),
  );
  const adminIds = (adminsResult.data ?? []).map((profile) => profile.id);
  const visitById = new Map(visits.map((visit) => [visit.id, visit]));
  const notifications: Array<Record<string, unknown>> = [];

  for (const item of reconciled) {
    if (item.reminderLeadHours === null) continue;
    const visit = visitById.get(item.visitId);
    if (!visit) continue;
    const leadHours = Math.min(90 * 24, Math.max(1, item.reminderLeadHours));
    const millisecondsUntilVisit =
      new Date(visit.scheduled_start).getTime() - now.getTime();
    if (
      millisecondsUntilVisit < 0 ||
      millisecondsUntilVisit > leadHours * 60 * 60 * 1_000
    ) {
      continue;
    }

    const recipientIds = new Set(adminIds);
    const visitEmployeeIds = new Set<string>();
    if (visit.primary_employee_id) {
      visitEmployeeIds.add(visit.primary_employee_id);
    }
    if (visit.visit_plan_id) {
      for (const employeeId of employeeIdsByPlan.get(visit.visit_plan_id) ??
        []) {
        visitEmployeeIds.add(employeeId);
      }
    }
    for (const employeeId of visitEmployeeIds) {
      const userId = employeeUserById.get(employeeId);
      if (userId) recipientIds.add(userId);
    }

    const propertyName = first(visit.properties)?.name || "Immobilie";
    const body = `${item.equipmentName} wird für ${propertyName} am ${displayVisit(visit)} benötigt.${
      item.reminderProvisionNote
        ? ` Hinweis: ${item.reminderProvisionNote}`
        : ""
    }`;
    for (const recipientId of recipientIds) {
      notifications.push({
        recipient_id: recipientId,
        type: "equipment.seasonal_rental_required",
        title: "Saisonales Mietequipment bereitstellen",
        body,
        property_id: visit.property_id,
        entity_type: "visits",
        entity_id: visit.id,
        idempotency_key: equipmentReminderKey(
          visit.id,
          item.equipmentId,
          recipientId,
        ),
      });
    }
  }

  if (!notifications.length) {
    return NextResponse.json({
      ok: true,
      created: 0,
      considered: 0,
      reconciled: reconciled.length,
      removed: 0,
    });
  }

  const { data: created, error: notificationError } = await admin
    .from("notifications")
    .upsert(notifications, {
      onConflict: "recipient_id,idempotency_key",
      ignoreDuplicates: true,
    })
    .select("id");
  if (notificationError) {
    return NextResponse.json(
      { ok: false, message: "Equipment reminders could not be created" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    created: created?.length ?? 0,
    considered: notifications.length,
    reconciled: reconciled.length,
    removed: 0,
  });
}

export async function GET(request: Request) {
  return createEquipmentReminders(request);
}

export async function POST(request: Request) {
  return createEquipmentReminders(request);
}
