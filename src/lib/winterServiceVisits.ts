export type WinterServiceConfiguration = {
  id: string;
  property_id: string;
  execution_rule: string;
  occurrences_per_period: number;
  seasonal: boolean;
  season_start_month: number | null;
  season_end_month: number | null;
  start_date: string;
  end_date: string | null;
  property_service_buildings:
    | ReadonlyArray<{ building_id: string }>
    | null;
};

export type WinterServiceVisit = {
  id: string;
  property_id: string;
  scheduled_date: string;
  planned_start_time: string | null;
  scheduled_start: string;
  status: string;
  completed_at: string | null;
  visit_buildings: ReadonlyArray<{ building_id: string }> | null;
  visit_tasks:
    | ReadonlyArray<{
        property_service_id: string | null;
        due_period_key: string | null;
        building_id: string | null;
      }>
    | null;
};

function scheduledSortKey(visit: WinterServiceVisit) {
  return (
    visit.scheduled_start ||
    `${visit.scheduled_date}T${visit.planned_start_time || "00:00:00"}`
  );
}

function completedSortKey(visit: WinterServiceVisit) {
  return visit.completed_at || scheduledSortKey(visit);
}

function isoWeekKey(dateValue: string) {
  const date = new Date(`${dateValue}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;

  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - weekday);
  const isoYear = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil(
    ((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );
  return `${isoYear}-${String(week).padStart(2, "0")}`;
}

function servicePeriodKey(
  service: WinterServiceConfiguration,
  visit: WinterServiceVisit,
) {
  const year = Number(visit.scheduled_date.slice(0, 4));
  const month = Number(visit.scheduled_date.slice(5, 7));
  if (!Number.isInteger(year) || month < 1 || month > 12) return null;

  switch (service.execution_rule) {
    case "every_visit":
      return `visit:${visit.id}`;
    case "once_weekly":
    case "multiple_weekly": {
      const week = isoWeekKey(visit.scheduled_date);
      return week ? `week:${week}` : null;
    }
    case "once_monthly":
    case "multiple_monthly":
      return `month:${visit.scheduled_date.slice(0, 7)}`;
    case "once_quarterly":
      return `quarter:${year}-${Math.ceil(month / 3)}`;
    case "once_yearly":
      return `year:${year}`;
    case "once_season": {
      const crossesYear =
        service.season_start_month !== null &&
        service.season_end_month !== null &&
        service.season_start_month > service.season_end_month;
      const seasonYear =
        crossesYear && month <= Number(service.season_end_month)
          ? year - 1
          : year;
      return `season:${seasonYear}`;
    }
    default:
      return null;
  }
}

function serviceIsActiveOnDate(
  service: WinterServiceConfiguration,
  date: string,
) {
  if (date < service.start_date || (service.end_date && date > service.end_date)) {
    return false;
  }
  if (!service.seasonal) return true;
  if (
    service.season_start_month === null ||
    service.season_end_month === null
  ) {
    return false;
  }

  const month = Number(date.slice(5, 7));
  if (!Number.isInteger(month) || month < 1 || month > 12) return false;
  return service.season_start_month <= service.season_end_month
    ? month >= service.season_start_month &&
        month <= service.season_end_month
    : month >= service.season_start_month || month <= service.season_end_month;
}

function hasWinterServiceTask(
  visit: WinterServiceVisit,
  winterServiceId: string,
) {
  return (visit.visit_tasks ?? []).some(
    (task) => task.property_service_id === winterServiceId,
  );
}

function wouldMaterializeWinterServiceTask(
  candidate: WinterServiceVisit,
  allVisits: ReadonlyArray<WinterServiceVisit>,
  service: WinterServiceConfiguration,
) {
  if (!serviceIsActiveOnDate(service, candidate.scheduled_date)) return false;

  const periodKey = servicePeriodKey(service, candidate);
  if (!periodKey) return false;

  const scopedBuildingIds = new Set(
    (service.property_service_buildings ?? []).map((link) => link.building_id),
  );
  const candidateBuildingIds = new Set(
    (candidate.visit_buildings ?? []).map((link) => link.building_id),
  );
  const taskBuildingIds: Array<string | null> = scopedBuildingIds.size
    ? Array.from(scopedBuildingIds).filter((id) => candidateBuildingIds.has(id))
    : [null];
  if (!taskBuildingIds.length) return false;

  const limit = ["multiple_weekly", "multiple_monthly"].includes(
    service.execution_rule,
  )
    ? Math.max(Number(service.occurrences_per_period) || 0, 1)
    : 1;

  return taskBuildingIds.some((buildingId) => {
    const existingCount = allVisits.reduce((count, visit) => {
      if (visit.status === "canceled") return count;
      return (
        count +
        (visit.visit_tasks ?? []).filter(
          (task) =>
            task.property_service_id === service.id &&
            task.due_period_key === periodKey &&
            (task.building_id ?? null) === buildingId,
        ).length
      );
    }, 0);
    return existingCount < limit;
  });
}

export function selectWinterServiceVisitSummary<T extends WinterServiceVisit>(
  visits: ReadonlyArray<T>,
  service: WinterServiceConfiguration | undefined,
  today: string,
) {
  if (!service) {
    return { nextVisit: undefined, lastVisit: undefined };
  }

  const propertyVisits = visits.filter(
    (visit) => visit.property_id === service.property_id,
  );
  const nextVisit = propertyVisits
    .filter(
      (visit) =>
        visit.status === "scheduled" && visit.scheduled_date >= today,
    )
    .sort((left, right) =>
      scheduledSortKey(left).localeCompare(scheduledSortKey(right)),
    )
    .find(
      (visit) =>
        hasWinterServiceTask(visit, service.id) ||
        wouldMaterializeWinterServiceTask(visit, propertyVisits, service),
    );

  const lastVisit = propertyVisits
    .filter(
      (visit) =>
        visit.status === "completed" &&
        hasWinterServiceTask(visit, service.id),
    )
    .sort((left, right) =>
      completedSortKey(right).localeCompare(completedSortKey(left)),
    )[0];

  return { nextVisit, lastVisit };
}
