-- Pre-plan operational work as soon as a visit exists. The previous model
-- created recurring service tasks, damage tasks and carry-overs only when an
-- employee started a visit. That made the calendar incomplete and allowed
-- canceled/rescheduled visits to strand work. All helpers below are private,
-- property-serialized and idempotent.

create or replace function private.lock_property_visit_work(p_property_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_property_id is null then
    raise exception using errcode = '22023', message = 'Immobilie fehlt';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'hausvia.visit-work:' || p_property_id::text,
      0
    )
  );
end;
$$;

revoke all on function private.lock_property_visit_work(uuid)
  from public, anon, authenticated, service_role;

create or replace function private.rebuild_scheduled_service_tasks(
  p_property_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted integer := 0;
begin
  perform private.lock_property_visit_work(p_property_id);

  -- A scheduled task cannot legitimately have evidence yet. Refuse to erase
  -- unexpected evidence instead of orphaning a Storage object.
  if exists (
    select 1
    from public.visit_task_attachments attachment
    join public.visit_tasks task on task.id = attachment.visit_task_id
    join public.visits visit on visit.id = task.visit_id
    where visit.property_id = p_property_id
      and visit.status = 'scheduled'
      and visit.visit_plan_id is not null
      and task.source_type = 'service'
      and task.dedupe_key like 'service-planned:%'
  ) then
    raise exception 'Vorausgeplante Aufgaben mit Nachweisen können nicht automatisch neu geplant werden';
  end if;

  delete from public.visit_task_instructions instruction
  using public.visit_tasks task, public.visits visit
  where instruction.visit_task_id = task.id
    and visit.id = task.visit_id
    and visit.property_id = p_property_id
    and visit.status = 'scheduled'
    and visit.visit_plan_id is not null
    and task.source_type = 'service'
    and task.dedupe_key like 'service-planned:%';

  delete from public.visit_tasks task
  using public.visits visit
  where visit.id = task.visit_id
    and visit.property_id = p_property_id
    and visit.status = 'scheduled'
    and visit.visit_plan_id is not null
    and task.source_type = 'service'
    and task.dedupe_key like 'service-planned:%';

  with raw_candidates as (
    select
      visit.id as visit_id,
      visit.property_id,
      visit.scheduled_date,
      visit.scheduled_start,
      service.id as property_service_id,
      service.name,
      service.customer_description,
      service.category,
      service.photo_required,
      service.customer_visible,
      service.execution_rule,
      service.occurrences_per_period,
      service.season_start_month,
      service.season_end_month,
      scoped.building_id,
      case
        when service.execution_rule = 'every_visit'
          then 'visit:' || visit.id::text
        else private.service_period_key(
          service.execution_rule,
          visit.scheduled_date,
          service.season_start_month,
          service.season_end_month
        )
      end as due_period_key,
      case
        when service.execution_rule in ('multiple_weekly', 'multiple_monthly')
          then greatest(service.occurrences_per_period, 1)
        else 1
      end as occurrence_limit,
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', checklist.id,
            'label', checklist.label,
            'required', checklist.required
          )
          order by checklist.sort_order, checklist.created_at, checklist.id
        )
        from public.service_checklist_items checklist
        where checklist.property_service_id = service.id
      ), '[]'::jsonb) as checklist_snapshot
    from public.visits visit
    join public.property_services service
      on service.property_id = visit.property_id
    left join public.property_service_buildings scoped
      on scoped.property_service_id = service.id
    where visit.property_id = p_property_id
      and visit.status = 'scheduled'
      and visit.visit_plan_id is not null
      and service.status = 'active'
      and service.execution_rule not in ('on_demand', 'manual')
      and service.start_date <= visit.scheduled_date
      and (service.end_date is null or service.end_date >= visit.scheduled_date)
      and (
        service.seasonal = false
        or public.is_month_in_season(
          visit.scheduled_date,
          service.season_start_month,
          service.season_end_month
        )
      )
      and (
        scoped.building_id is null
        or exists (
          select 1
          from public.visit_buildings visit_building
          where visit_building.visit_id = visit.id
            and visit_building.building_id = scoped.building_id
        )
      )
  ), historical_counts as (
    select
      task.property_service_id,
      task.building_id,
      task.due_period_key,
      count(*)::integer as completed_or_started_count
    from public.visit_tasks task
    join public.visits visit on visit.id = task.visit_id
    where task.property_id = p_property_id
      and task.source_type = 'service'
      and visit.status in ('started', 'completed')
      and task.due_period_key is not null
    group by task.property_service_id, task.building_id, task.due_period_key
  ), ranked_candidates as (
    select
      candidate.*,
      coalesce(history.completed_or_started_count, 0) as historical_count,
      row_number() over (
        partition by
          candidate.property_service_id,
          candidate.building_id,
          candidate.due_period_key
        order by candidate.scheduled_start, candidate.visit_id
      )::integer as occurrence_number
    from raw_candidates candidate
    left join historical_counts history
      on history.property_service_id = candidate.property_service_id
      and history.building_id is not distinct from candidate.building_id
      and history.due_period_key = candidate.due_period_key
    where candidate.due_period_key is not null
  )
  insert into public.visit_tasks (
    visit_id,
    property_id,
    building_id,
    property_service_id,
    source_type,
    source_id,
    title,
    description,
    category,
    checklist_snapshot,
    status,
    photo_required,
    customer_visible,
    due_period_key,
    dedupe_key
  )
  select
    candidate.visit_id,
    candidate.property_id,
    candidate.building_id,
    candidate.property_service_id,
    'service',
    candidate.property_service_id,
    candidate.name,
    candidate.customer_description,
    candidate.category,
    candidate.checklist_snapshot,
    'open',
    candidate.photo_required,
    candidate.customer_visible,
    candidate.due_period_key,
    'service-planned:' || candidate.property_service_id::text
      || ':' || candidate.due_period_key
      || ':' || coalesce(candidate.building_id::text, 'property')
      || ':visit:' || candidate.visit_id::text
  from ranked_candidates candidate
  where candidate.historical_count + candidate.occurrence_number
    <= candidate.occurrence_limit
  on conflict (dedupe_key) where dedupe_key is not null do nothing;

  get diagnostics v_inserted = row_count;

  insert into public.visit_task_instructions (
    visit_task_id,
    internal_instruction
  )
  select task.id, instruction.internal_instruction
  from public.visit_tasks task
  join public.visits visit on visit.id = task.visit_id
  join public.property_service_instructions instruction
    on instruction.property_service_id = task.property_service_id
  where visit.property_id = p_property_id
    and visit.status = 'scheduled'
    and task.source_type = 'service'
    and task.dedupe_key like 'service-planned:%'
    and nullif(btrim(instruction.internal_instruction), '') is not null
  on conflict (visit_task_id) do update
    set internal_instruction = excluded.internal_instruction;

  return v_inserted;
end;
$$;

revoke all on function private.rebuild_scheduled_service_tasks(uuid)
  from public, anon, authenticated, service_role;

create or replace function private.assign_damage_to_next_visit(
  p_damage_report_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_damage public.damage_reports%rowtype;
  v_property_id uuid;
  v_visit_id uuid;
  v_task_id uuid;
begin
  -- Resolve the property first, take the property lock, then lock the report.
  -- Every helper uses this order, preventing report/property deadlocks.
  select report.property_id
  into v_property_id
  from public.damage_reports report
  where report.id = p_damage_report_id;
  if not found then
    return null;
  end if;

  perform private.lock_property_visit_work(v_property_id);

  select *
  into v_damage
  from public.damage_reports
  where id = p_damage_report_id
  for update;

  if v_damage.planned_next_visit = false
    or v_damage.status not in ('new', 'reviewed', 'scheduled')
  then
    return null;
  end if;

  select visit.id
  into v_visit_id
  from public.visits visit
  where visit.property_id = v_damage.property_id
    and visit.status = 'scheduled'
    and visit.scheduled_date >= (now() at time zone 'Europe/Berlin')::date
    and exists (
      select 1
      from public.visit_buildings visit_building
      where visit_building.visit_id = visit.id
        and visit_building.building_id = v_damage.building_id
    )
  order by visit.scheduled_start, visit.id
  limit 1;

  if v_visit_id is null then
    return null;
  end if;

  insert into public.visit_tasks (
    visit_id,
    property_id,
    building_id,
    damage_report_id,
    source_type,
    source_id,
    title,
    description,
    category,
    status,
    photo_required,
    customer_visible,
    due_period_key,
    dedupe_key
  ) values (
    v_visit_id,
    v_damage.property_id,
    v_damage.building_id,
    v_damage.id,
    'damage',
    v_damage.id,
    v_damage.title,
    v_damage.description,
    'Schaden',
    'open',
    false,
    true,
    'damage:' || v_damage.id::text,
    'damage-planned:' || v_damage.id::text || ':visit:' || v_visit_id::text
  )
  on conflict (dedupe_key) where dedupe_key is not null do nothing
  returning id into v_task_id;

  if v_task_id is null then
    select task.id
    into v_task_id
    from public.visit_tasks task
    where task.damage_report_id = v_damage.id
      and task.visit_id = v_visit_id
      and task.source_type in ('damage', 'follow_up')
    order by task.created_at, task.id
    limit 1;
  end if;

  if v_task_id is not null then
    update public.damage_reports
    set status = 'scheduled',
        planned_next_visit = false,
        linked_visit_id = v_visit_id,
        linked_visit_task_id = v_task_id
    where id = v_damage.id;
  end if;

  return v_task_id;
end;
$$;

revoke all on function private.assign_damage_to_next_visit(uuid)
  from public, anon, authenticated, service_role;

create or replace function private.assign_pending_damages(
  p_property_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_damage record;
  v_task_id uuid;
  v_assigned integer := 0;
begin
  perform private.lock_property_visit_work(p_property_id);

  for v_damage in
    select report.id
    from public.damage_reports report
    where report.property_id = p_property_id
      and report.planned_next_visit = true
      and report.status in ('new', 'reviewed', 'scheduled')
    order by
      case report.priority
        when 'urgent' then 1
        when 'high' then 2
        when 'normal' then 3
        else 4
      end,
      report.created_at,
      report.id
  loop
    v_task_id := private.assign_damage_to_next_visit(v_damage.id);
    if v_task_id is not null then
      v_assigned := v_assigned + 1;
    end if;
  end loop;

  return v_assigned;
end;
$$;

revoke all on function private.assign_pending_damages(uuid)
  from public, anon, authenticated, service_role;

create or replace function private.assign_open_followups(
  p_property_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source record;
  v_visit_id uuid;
  v_task_id uuid;
  v_assigned integer := 0;
begin
  perform private.lock_property_visit_work(p_property_id);

  for v_source in
    select
      source_task.*,
      source_visit.scheduled_start as source_scheduled_start,
      instruction.internal_instruction
    from public.visit_tasks source_task
    join public.visits source_visit on source_visit.id = source_task.visit_id
    left join public.visit_task_instructions instruction
      on instruction.visit_task_id = source_task.id
    where source_task.property_id = p_property_id
      and source_task.follow_up_required = true
      and source_visit.status = 'completed'
      and not exists (
        select 1
        from public.visit_tasks child
        join public.visits child_visit on child_visit.id = child.visit_id
        where child.carried_from_task_id = source_task.id
          and child_visit.status <> 'canceled'
      )
    order by source_task.completed_at, source_task.id
    for update of source_task skip locked
  loop
    v_visit_id := null;
    v_task_id := null;

    if v_source.damage_report_id is not null then
      update public.damage_reports
      set status = case
            when status in ('resolved', 'rejected') then status
            else 'reviewed'
          end,
          planned_next_visit = status not in ('resolved', 'rejected'),
          linked_visit_id = null,
          linked_visit_task_id = null
      where id = v_source.damage_report_id;
    end if;

    select visit.id
    into v_visit_id
    from public.visits visit
    where visit.property_id = p_property_id
      and visit.status = 'scheduled'
      and visit.scheduled_start > greatest(v_source.source_scheduled_start, now())
      and (
        v_source.building_id is null
        or exists (
          select 1
          from public.visit_buildings visit_building
          where visit_building.visit_id = visit.id
            and visit_building.building_id = v_source.building_id
        )
      )
    order by visit.scheduled_start, visit.id
    limit 1;

    if v_visit_id is null then
      continue;
    end if;

    insert into public.visit_tasks (
      visit_id,
      property_id,
      building_id,
      property_service_id,
      damage_report_id,
      source_type,
      source_id,
      title,
      description,
      category,
      checklist_snapshot,
      status,
      photo_required,
      customer_visible,
      due_period_key,
      dedupe_key,
      carried_from_task_id
    ) values (
      v_visit_id,
      p_property_id,
      v_source.building_id,
      v_source.property_service_id,
      v_source.damage_report_id,
      'follow_up',
      v_source.id,
      v_source.title,
      v_source.description,
      v_source.category,
      v_source.checklist_snapshot,
      'open',
      v_source.photo_required,
      v_source.customer_visible,
      'follow-up:' || v_source.id::text,
      'follow-up:' || v_source.id::text,
      v_source.id
    )
    on conflict (dedupe_key) where dedupe_key is not null do nothing
    returning id into v_task_id;

    if v_task_id is not null
      and nullif(btrim(v_source.internal_instruction), '') is not null
    then
      insert into public.visit_task_instructions (
        visit_task_id,
        internal_instruction
      ) values (
        v_task_id,
        v_source.internal_instruction
      )
      on conflict (visit_task_id) do nothing;
    end if;

    if v_task_id is not null and v_source.damage_report_id is not null then
      update public.damage_reports
      set status = 'scheduled',
          planned_next_visit = false,
          linked_visit_id = v_visit_id,
          linked_visit_task_id = v_task_id
      where id = v_source.damage_report_id
        and status not in ('resolved', 'rejected');
    end if;

    if v_task_id is not null then
      v_assigned := v_assigned + 1;
    end if;
  end loop;

  return v_assigned;
end;
$$;

revoke all on function private.assign_open_followups(uuid)
  from public, anon, authenticated, service_role;

create or replace function private.refresh_property_future_work(
  p_property_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_services integer := 0;
  v_followups integer := 0;
  v_damages integer := 0;
begin
  perform private.lock_property_visit_work(p_property_id);

  -- A canceled target no longer owns a damage. Keep the canceled task as
  -- audit evidence, but make the report eligible for the next live visit.
  update public.damage_reports report
  set status = case
        when report.status in ('resolved', 'rejected') then report.status
        else 'reviewed'
      end,
      planned_next_visit = report.status not in ('resolved', 'rejected'),
      linked_visit_id = null,
      linked_visit_task_id = null
  where report.property_id = p_property_id
    and report.linked_visit_id in (
      select visit.id
      from public.visits visit
      where visit.property_id = p_property_id
        and visit.status = 'canceled'
    );

  if exists (
    select 1
    from public.visit_task_attachments attachment
    join public.visit_tasks task on task.id = attachment.visit_task_id
    join public.visits visit on visit.id = task.visit_id
    where visit.property_id = p_property_id
      and (
        (
          visit.status = 'scheduled'
          and task.source_type in ('damage', 'follow_up')
        )
        or (
          visit.status = 'canceled'
          and task.source_type = 'follow_up'
        )
      )
  ) then
    raise exception 'Vorausgeplante Schäden oder Folgeaufgaben mit Nachweisen können nicht automatisch verschoben werden';
  end if;

  -- Reset damage links before deleting their scheduled task rows.
  update public.damage_reports report
  set status = case
        when report.status in ('resolved', 'rejected') then report.status
        else 'reviewed'
      end,
      planned_next_visit = report.status not in ('resolved', 'rejected'),
      linked_visit_id = null,
      linked_visit_task_id = null
  where report.property_id = p_property_id
    and report.linked_visit_id in (
      select visit.id
      from public.visits visit
      where visit.property_id = p_property_id
        and visit.status = 'scheduled'
    );

  delete from public.visit_task_instructions instruction
  using public.visit_tasks task, public.visits visit
  where instruction.visit_task_id = task.id
    and visit.id = task.visit_id
    and visit.property_id = p_property_id
    and (
      (visit.status = 'scheduled' and task.source_type in ('damage', 'follow_up'))
      or (visit.status = 'canceled' and task.source_type = 'follow_up')
    );

  delete from public.visit_tasks task
  using public.visits visit
  where visit.id = task.visit_id
    and visit.property_id = p_property_id
    and (
      (visit.status = 'scheduled' and task.source_type in ('damage', 'follow_up'))
      or (visit.status = 'canceled' and task.source_type = 'follow_up')
    );

  v_services := private.rebuild_scheduled_service_tasks(p_property_id);
  v_followups := private.assign_open_followups(p_property_id);
  v_damages := private.assign_pending_damages(p_property_id);

  return jsonb_build_object(
    'service_tasks', v_services,
    'followups', v_followups,
    'damages', v_damages
  );
end;
$$;

revoke all on function private.refresh_property_future_work(uuid)
  from public, anon, authenticated, service_role;

-- Generate one full planning year even while older application callers still
-- send the former 90-day value. Weekly intervals are anchored to ISO weeks
-- (Monday-Sunday), not to arbitrary seven-day blocks after start_date.
create or replace function private.generate_upcoming_visits_unlocked(
  p_horizon_days integer default 366,
  p_plan_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan record;
  v_date date;
  v_matches boolean;
  v_time time;
  v_start timestamptz;
  v_key text;
  v_visit_id uuid;
  v_inserted integer := 0;
  v_row_count integer;
  v_today date := (now() at time zone 'Europe/Berlin')::date;
  v_horizon date;
  v_property_ids uuid[] := array[]::uuid[];
  v_property_id uuid;
begin
  if not ((select private.is_admin()) or (select private.is_service_role())) then
    raise exception 'Nur Administratoren dürfen Termine erzeugen';
  end if;
  if p_horizon_days < 1 or p_horizon_days > 366 then
    raise exception 'Der Planungshorizont muss zwischen 1 und 366 Tagen liegen';
  end if;

  -- Compatibility: callers deployed before this migration pass 90 explicitly.
  v_horizon := v_today + greatest(p_horizon_days, 366);

  for v_plan in
    select plan.*
    from public.visit_plans plan
    join public.properties property on property.id = plan.property_id
    where plan.status = 'active'
      and property.status = 'active'
      and (p_plan_id is null or plan.id = p_plan_id)
    order by plan.id
  loop
    if not v_plan.property_id = any(v_property_ids) then
      v_property_ids := array_append(v_property_ids, v_plan.property_id);
    end if;

    update public.visits visit
    set status = 'canceled',
        canceled_at = now(),
        cancellation_reason = 'Durch Änderung des Besuchsplans ersetzt',
        schedule_key = visit.schedule_key || ':superseded:'
          || substr(md5(visit.id::text || v_plan.updated_at::text), 1, 8)
    where visit.visit_plan_id = v_plan.id
      and visit.status = 'scheduled'
      and visit.manually_adjusted = false
      and visit.scheduled_date >= v_today
      and visit.created_at < v_plan.updated_at;

    for v_date in
      select generated_date::date
      from generate_series(
        greatest(v_today, v_plan.start_date)::timestamp,
        least(v_horizon, coalesce(v_plan.end_date, v_horizon))::timestamp,
        interval '1 day'
      ) generated_date
    loop
      v_matches := false;

      if v_plan.frequency = 'individual' then
        v_matches := v_date = v_plan.start_date;
      elsif v_plan.frequency = 'weekly' then
        v_matches := mod(
          (
            date_trunc('week', v_date::timestamp)::date
            - date_trunc('week', v_plan.start_date::timestamp)::date
          ) / 7,
          v_plan.repeat_every
        ) = 0
        and case
          when cardinality(v_plan.weekdays) > 0
            then extract(isodow from v_date)::integer = any(v_plan.weekdays)
          else extract(isodow from v_date)::integer
            = extract(isodow from v_plan.start_date)::integer
        end;
      elsif v_plan.frequency = 'monthly' then
        v_matches := mod(
          (extract(year from v_date)::integer * 12
            + extract(month from v_date)::integer)
          - (extract(year from v_plan.start_date)::integer * 12
            + extract(month from v_plan.start_date)::integer),
          v_plan.repeat_every
        ) = 0
        and case
          when cardinality(v_plan.month_days) > 0
            then extract(day from v_date)::integer = any(v_plan.month_days)
          else extract(day from v_date)::integer
            = extract(day from v_plan.start_date)::integer
        end;
      elsif v_plan.frequency = 'quarterly' then
        v_matches := mod(
          (extract(year from v_date)::integer * 12
            + extract(month from v_date)::integer)
          - (extract(year from v_plan.start_date)::integer * 12
            + extract(month from v_plan.start_date)::integer),
          3 * v_plan.repeat_every
        ) = 0
        and case
          when cardinality(v_plan.month_days) > 0
            then extract(day from v_date)::integer = any(v_plan.month_days)
          else extract(day from v_date)::integer
            = extract(day from v_plan.start_date)::integer
        end;
      end if;

      if not v_matches then
        continue;
      end if;

      v_time := coalesce(v_plan.desired_time, v_plan.window_start, time '09:00');
      v_start := (v_date + v_time) at time zone v_plan.timezone;
      v_key := to_char(v_date, 'YYYY-MM-DD') || 'T'
        || to_char(v_time, 'HH24:MI:SS');
      v_visit_id := null;

      insert into public.visits (
        visit_plan_id,
        property_id,
        primary_employee_id,
        scheduled_date,
        planned_start_time,
        scheduled_start,
        window_start,
        window_end,
        status,
        schedule_key
      ) values (
        v_plan.id,
        v_plan.property_id,
        v_plan.primary_employee_id,
        v_date,
        v_plan.desired_time,
        v_start,
        v_plan.window_start,
        v_plan.window_end,
        'scheduled',
        v_key
      )
      on conflict (visit_plan_id, schedule_key)
        where visit_plan_id is not null and schedule_key is not null
      do nothing
      returning id into v_visit_id;

      if v_visit_id is null then
        continue;
      end if;
      v_inserted := v_inserted + 1;

      insert into public.visit_admin_metrics (visit_id, max_visit_minutes)
      select
        v_visit_id,
        coalesce(v_plan.max_visit_minutes, settings.max_visit_minutes)
      from public.property_admin_settings settings
      where settings.property_id = v_plan.property_id
      on conflict (visit_id) do nothing;

      insert into public.visit_buildings (visit_id, building_id)
      select v_visit_id, plan_building.building_id
      from public.visit_plan_buildings plan_building
      where plan_building.visit_plan_id = v_plan.id
      on conflict do nothing;

      get diagnostics v_row_count = row_count;
      if v_row_count = 0 then
        insert into public.visit_buildings (visit_id, building_id)
        select v_visit_id, building.id
        from public.buildings building
        where building.property_id = v_plan.property_id
          and building.status = 'active'
        on conflict do nothing;
      end if;

      with equipment_requirements as (
        select
          property_equipment.equipment_id,
          property_equipment.required_quantity,
          property_equipment.rental,
          property_equipment.provision_note
        from public.property_equipment property_equipment
        join public.equipment equipment
          on equipment.id = property_equipment.equipment_id
          and equipment.status = 'active'
        where property_equipment.property_id = v_plan.property_id
          and property_equipment.active = true
          and (
            property_equipment.seasonal = false
            or public.is_month_in_season(
              v_date,
              property_equipment.season_start_month,
              property_equipment.season_end_month
            )
          )
          and (
            property_equipment.building_id is null
            or exists (
              select 1
              from public.visit_buildings visit_building
              where visit_building.visit_id = v_visit_id
                and visit_building.building_id = property_equipment.building_id
            )
          )

        union all

        select
          service_equipment.equipment_id,
          service_equipment.required_quantity,
          false,
          null::text
        from public.service_equipment service_equipment
        join public.property_services service
          on service.id = service_equipment.property_service_id
        join public.equipment equipment
          on equipment.id = service_equipment.equipment_id
          and equipment.status = 'active'
        where service.property_id = v_plan.property_id
          and service.status = 'active'
          and service.start_date <= v_date
          and (service.end_date is null or service.end_date >= v_date)
          and (
            service.seasonal = false
            or public.is_month_in_season(
              v_date,
              service.season_start_month,
              service.season_end_month
            )
          )
          and (
            not exists (
              select 1
              from public.property_service_buildings scoped
              where scoped.property_service_id = service.id
            )
            or exists (
              select 1
              from public.property_service_buildings scoped
              join public.visit_buildings visit_building
                on visit_building.building_id = scoped.building_id
              where scoped.property_service_id = service.id
                and visit_building.visit_id = v_visit_id
            )
          )
      )
      insert into public.visit_equipment (
        visit_id,
        equipment_id,
        required_quantity,
        rental,
        provision_note
      )
      select
        v_visit_id,
        requirement.equipment_id,
        max(requirement.required_quantity),
        bool_or(requirement.rental),
        (
          array_agg(requirement.provision_note order by requirement.provision_note)
          filter (where requirement.provision_note is not null)
        )[1]
      from equipment_requirements requirement
      group by requirement.equipment_id
      on conflict (visit_id, equipment_id) do update
        set required_quantity = greatest(
              public.visit_equipment.required_quantity,
              excluded.required_quantity
            ),
            rental = public.visit_equipment.rental or excluded.rental,
            provision_note = coalesce(
              public.visit_equipment.provision_note,
              excluded.provision_note
            );
    end loop;
  end loop;

  foreach v_property_id in array v_property_ids
  loop
    perform private.refresh_property_future_work(v_property_id);
  end loop;

  return v_inserted;
end;
$$;

revoke all on function private.generate_upcoming_visits_unlocked(integer, uuid)
  from public, anon, authenticated, service_role;

create or replace function public.generate_upcoming_visits(
  p_horizon_days integer default 366,
  p_plan_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not ((select private.is_admin()) or (select private.is_service_role())) then
    raise exception 'Nur Administratoren dürfen Termine erzeugen';
  end if;
  if p_horizon_days < 1 or p_horizon_days > 366 then
    raise exception 'Der Planungshorizont muss zwischen 1 und 366 Tagen liegen';
  end if;

  perform private.lock_visit_plan_schedule();
  return private.generate_upcoming_visits_unlocked(
    greatest(p_horizon_days, 366),
    p_plan_id
  );
end;
$$;

revoke all on function public.generate_upcoming_visits(integer, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.generate_upcoming_visits(integer, uuid)
  to service_role;

-- Starting a visit now consumes the already planned snapshot. Re-running the
-- planner immediately before the state transition closes the last race with a
-- service edit, a newly reported damage or a just-canceled predecessor.
create or replace function public.start_visit(p_visit_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_visit public.visits%rowtype;
  v_employee_id uuid := (select private.current_employee_id());
  v_user_id uuid := (select auth.uid());
begin
  if v_employee_id is null then
    raise exception 'Aktives Mitarbeiterprofil erforderlich';
  end if;

  select *
  into v_visit
  from public.visits
  where id = p_visit_id
  for no key update;

  if not found then
    raise exception 'Einsatz wurde nicht gefunden';
  end if;
  if not (select private.can_work_visit(p_visit_id)) then
    raise exception 'Dieser Einsatz ist Ihnen nicht zugewiesen';
  end if;
  if v_visit.status = 'started' and v_visit.started_by = v_user_id then
    return v_visit.started_at;
  end if;
  if v_visit.status <> 'scheduled' then
    raise exception 'Der Einsatz kann in diesem Status nicht gestartet werden';
  end if;

  perform private.lock_property_visit_work(v_visit.property_id);
  perform private.refresh_property_future_work(v_visit.property_id);

  update public.visits
  set status = 'started',
      started_at = now(),
      started_by = v_user_id
  where id = p_visit_id
  returning * into v_visit;

  -- Keep equipment consistent with the services that are actually due on this
  -- visit. Generated placeholder equipment for a non-due recurring service is
  -- discarded before the immutable start snapshot is rebuilt.
  delete from public.visit_equipment equipment
  where equipment.visit_id = p_visit_id;

  with equipment_requirements as (
    select
      property_equipment.equipment_id,
      property_equipment.required_quantity,
      property_equipment.rental,
      property_equipment.provision_note
    from public.property_equipment property_equipment
    join public.equipment equipment
      on equipment.id = property_equipment.equipment_id
      and equipment.status = 'active'
    where property_equipment.property_id = v_visit.property_id
      and property_equipment.active = true
      and (
        property_equipment.seasonal = false
        or public.is_month_in_season(
          v_visit.scheduled_date,
          property_equipment.season_start_month,
          property_equipment.season_end_month
        )
      )
      and (
        property_equipment.building_id is null
        or exists (
          select 1
          from public.visit_buildings visit_building
          where visit_building.visit_id = p_visit_id
            and visit_building.building_id = property_equipment.building_id
        )
      )

    union all

    select
      service_equipment.equipment_id,
      service_equipment.required_quantity,
      false,
      null::text
    from public.visit_tasks task
    join public.service_equipment service_equipment
      on service_equipment.property_service_id = task.property_service_id
    join public.equipment equipment
      on equipment.id = service_equipment.equipment_id
      and equipment.status = 'active'
    where task.visit_id = p_visit_id
      and task.property_service_id is not null
  )
  insert into public.visit_equipment (
    visit_id,
    equipment_id,
    required_quantity,
    rental,
    provision_note
  )
  select
    p_visit_id,
    requirement.equipment_id,
    max(requirement.required_quantity),
    bool_or(requirement.rental),
    (
      array_agg(requirement.provision_note order by requirement.provision_note)
      filter (where requirement.provision_note is not null)
    )[1]
  from equipment_requirements requirement
  group by requirement.equipment_id;

  return v_visit.started_at;
exception
  when unique_violation then
    raise exception 'Sie haben bereits einen laufenden Einsatz';
end;
$$;

revoke all on function public.start_visit(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.start_visit(uuid)
  to authenticated;

-- Keep future service snapshots synchronized when an administrator changes a
-- service, its building scope, checklist or internal instruction.
create or replace function private.refresh_service_configuration_work()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_property_id uuid;
  v_service_id uuid;
begin
  if tg_table_name = 'property_services' then
    if tg_op = 'DELETE' then
      v_property_id := old.property_id;
    else
      v_property_id := new.property_id;
    end if;
  else
    if tg_op = 'DELETE' then
      v_service_id := old.property_service_id;
    else
      v_service_id := new.property_service_id;
    end if;
    select service.property_id
    into v_property_id
    from public.property_services service
    where service.id = v_service_id;
  end if;

  if v_property_id is not null then
    perform private.rebuild_scheduled_service_tasks(v_property_id);
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.refresh_service_configuration_work()
  from public, anon, authenticated, service_role;

drop trigger if exists property_services_refresh_future_tasks
  on public.property_services;
create trigger property_services_refresh_future_tasks
after insert or update or delete on public.property_services
for each row execute function private.refresh_service_configuration_work();

drop trigger if exists property_service_buildings_refresh_future_tasks
  on public.property_service_buildings;
create trigger property_service_buildings_refresh_future_tasks
after insert or update or delete on public.property_service_buildings
for each row execute function private.refresh_service_configuration_work();

drop trigger if exists service_checklist_items_refresh_future_tasks
  on public.service_checklist_items;
create trigger service_checklist_items_refresh_future_tasks
after insert or update or delete on public.service_checklist_items
for each row execute function private.refresh_service_configuration_work();

drop trigger if exists property_service_instructions_refresh_future_tasks
  on public.property_service_instructions;
create trigger property_service_instructions_refresh_future_tasks
after insert or update or delete on public.property_service_instructions
for each row execute function private.refresh_service_configuration_work();

create or replace function private.plan_damage_report_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assign_damage_to_next_visit(new.id);
  return new;
end;
$$;

revoke all on function private.plan_damage_report_after_insert()
  from public, anon, authenticated, service_role;

drop trigger if exists damage_reports_plan_after_insert
  on public.damage_reports;
create trigger damage_reports_plan_after_insert
after insert on public.damage_reports
for each row execute function private.plan_damage_report_after_insert();

-- Transition tables make bulk plan cancellation a single refresh per property
-- rather than one expensive rebuild per canceled visit.
create or replace function private.refresh_visit_work_after_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_property record;
begin
  for v_property in
    select distinct next_visit.property_id
    from new_visits next_visit
    join old_visits previous_visit on previous_visit.id = next_visit.id
    where previous_visit.status is distinct from next_visit.status
       or previous_visit.scheduled_date is distinct from next_visit.scheduled_date
       or previous_visit.scheduled_start is distinct from next_visit.scheduled_start
       or previous_visit.visit_plan_id is distinct from next_visit.visit_plan_id
  loop
    perform private.refresh_property_future_work(v_property.property_id);
  end loop;
  return null;
end;
$$;

revoke all on function private.refresh_visit_work_after_update()
  from public, anon, authenticated, service_role;

drop trigger if exists visits_refresh_future_work_after_update
  on public.visits;
create trigger visits_refresh_future_work_after_update
after update on public.visits
referencing old table as old_visits new table as new_visits
for each statement execute function private.refresh_visit_work_after_update();

-- Manual visits receive their building links in a separate API statement.
-- Refresh only those rows here; generated visits are refreshed once at the end
-- of the generator and avoid an N-times rebuild.
create or replace function private.refresh_manual_visit_work_after_building()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_visit_id uuid;
  v_property_id uuid;
  v_should_refresh boolean;
begin
  if tg_op = 'DELETE' then
    v_visit_id := old.visit_id;
  else
    v_visit_id := new.visit_id;
  end if;

  select
    visit.property_id,
    visit.status = 'scheduled'
      and (visit.visit_plan_id is null or visit.manually_adjusted = true)
  into v_property_id, v_should_refresh
  from public.visits visit
  where visit.id = v_visit_id;

  if coalesce(v_should_refresh, false) then
    perform private.refresh_property_future_work(v_property_id);
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.refresh_manual_visit_work_after_building()
  from public, anon, authenticated, service_role;

drop trigger if exists visit_buildings_refresh_manual_work
  on public.visit_buildings;
create trigger visit_buildings_refresh_manual_work
after insert or update or delete on public.visit_buildings
for each row execute function private.refresh_manual_visit_work_after_building();

-- Delete a visit-plan configuration without rewriting operational history.
-- Scheduled (therefore unstarted) rows are removed in dependency order;
-- completed/canceled rows survive but no longer reference the deleted plan.
create or replace function public.delete_visit_plan_configuration(
  p_property_id uuid,
  p_visit_plan_id uuid,
  p_expected_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_plan public.visit_plans%rowtype;
  v_delete_visit_ids uuid[] := array[]::uuid[];
  v_delete_task_ids uuid[] := array[]::uuid[];
  v_deleted_visits integer := 0;
  v_preserved_history integer := 0;
begin
  perform private.require_admin();
  perform private.lock_visit_plan_schedule();

  select *
  into v_plan
  from public.visit_plans
  where id = p_visit_plan_id
    and property_id = p_property_id
  for update;

  if not found then
    raise exception 'Besuchsplan wurde nicht gefunden';
  end if;
  if p_expected_updated_at is null
    or v_plan.updated_at <> p_expected_updated_at
  then
    raise exception using
      errcode = '40001',
      message = 'Der Besuchsplan wurde zwischenzeitlich geändert';
  end if;

  perform 1
  from public.visits visit
  where visit.visit_plan_id = p_visit_plan_id
  order by visit.id
  for no key update;

  if exists (
    select 1
    from public.visits visit
    where visit.visit_plan_id = p_visit_plan_id
      and visit.status = 'started'
  ) then
    raise exception 'Ein Besuchsplan mit laufendem Einsatz kann nicht gelöscht werden';
  end if;

  -- Match cancel/reschedule/start: lock visit rows first, then serialize the
  -- property's planning work. NO KEY UPDATE remains compatible with the FK
  -- KEY SHARE lock taken when a concurrent damage task is inserted.
  perform private.lock_property_visit_work(p_property_id);

  select coalesce(array_agg(visit.id order by visit.id), array[]::uuid[])
  into v_delete_visit_ids
  from public.visits visit
  where visit.visit_plan_id = p_visit_plan_id
    and visit.status = 'scheduled';

  v_deleted_visits := cardinality(v_delete_visit_ids);

  select count(*)::integer
  into v_preserved_history
  from public.visits visit
  where visit.visit_plan_id = p_visit_plan_id
    and visit.status in ('completed', 'canceled');

  if v_deleted_visits > 0 then
    if exists (
      select 1
      from public.visit_time_corrections correction
      where correction.visit_id = any(v_delete_visit_ids)
    ) then
      raise exception 'Ein ungestarteter Termin enthält Zeitkorrekturen und muss einzeln geprüft werden';
    end if;

    select coalesce(array_agg(task.id order by task.id), array[]::uuid[])
    into v_delete_task_ids
    from public.visit_tasks task
    where task.visit_id = any(v_delete_visit_ids);

    if cardinality(v_delete_task_ids) > 0 and exists (
      select 1
      from public.visit_task_attachments attachment
      where attachment.visit_task_id = any(v_delete_task_ids)
    ) then
      raise exception 'Ein ungestarteter Termin enthält Aufgabennachweise und muss einzeln geprüft werden';
    end if;

    if cardinality(v_delete_task_ids) > 0 and exists (
      select 1
      from public.visit_tasks child
      where child.carried_from_task_id = any(v_delete_task_ids)
        and not (child.id = any(v_delete_task_ids))
    ) then
      raise exception 'Eine Folgeaufgabe außerhalb des Plans verweist auf einen zu löschenden Termin';
    end if;

    -- Damage reports survive the plan. They become pending before the linked
    -- task/visit is removed and are reassigned after deletion.
    update public.damage_reports report
    set status = case
          when report.status in ('resolved', 'rejected') then report.status
          else 'reviewed'
        end,
        planned_next_visit = report.status not in ('resolved', 'rejected'),
        linked_visit_id = null,
        linked_visit_task_id = null
    where report.linked_visit_id = any(v_delete_visit_ids)
       or (
         cardinality(v_delete_task_ids) > 0
         and report.linked_visit_task_id = any(v_delete_task_ids)
       );

    -- Optional operational relations are evidence in their own right. Detach
    -- them rather than deleting them together with an unstarted appointment.
    update public.operational_reports report
    set visit_id = null
    where report.visit_id = any(v_delete_visit_ids);

    update public.complaints complaint
    set visit_id = null
    where complaint.visit_id = any(v_delete_visit_ids);

    update public.extra_charges charge
    set visit_id = null
    where charge.visit_id = any(v_delete_visit_ids);

    if cardinality(v_delete_task_ids) > 0 then
      delete from public.visit_task_instructions instruction
      where instruction.visit_task_id = any(v_delete_task_ids);

      delete from public.visit_tasks task
      where task.id = any(v_delete_task_ids);
    end if;

    delete from public.visit_equipment equipment
    where equipment.visit_id = any(v_delete_visit_ids);

    delete from public.visit_admin_metrics metrics
    where metrics.visit_id = any(v_delete_visit_ids);

    delete from public.notifications notification
    where notification.entity_type = 'visits'
      and notification.entity_id = any(v_delete_visit_ids);

    delete from public.visits visit
    where visit.id = any(v_delete_visit_ids);
  end if;

  update public.visits visit
  set visit_plan_id = null
  where visit.visit_plan_id = p_visit_plan_id
    and visit.status in ('completed', 'canceled');

  delete from public.visit_plans plan
  where plan.id = p_visit_plan_id
    and plan.property_id = p_property_id;

  insert into public.audit_logs (
    actor_id,
    action,
    entity_table,
    entity_id,
    metadata
  ) values (
    v_actor,
    'visit_plan.deleted',
    'visit_plans',
    p_visit_plan_id,
    jsonb_build_object(
      'property_id', p_property_id,
      'label', v_plan.label,
      'deleted_visits', v_deleted_visits,
      'preserved_history', v_preserved_history
    )
  );

  perform private.refresh_property_future_work(p_property_id);

  return jsonb_build_object(
    'visit_plan_id', p_visit_plan_id,
    'deleted_visits', v_deleted_visits,
    'preserved_history', v_preserved_history
  );
end;
$$;

revoke all on function public.delete_visit_plan_configuration(
  uuid, uuid, timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.delete_visit_plan_configuration(
  uuid, uuid, timestamptz
) to authenticated;

create index if not exists visits_property_status_start_idx
  on public.visits(property_id, status, scheduled_start, id);

create index if not exists visit_tasks_property_open_followup_idx
  on public.visit_tasks(property_id, completed_at, id)
  where follow_up_required = true;

-- The app subscribes to these operational rows. Add only missing tables to the
-- existing Supabase Realtime publication; never drop/recreate the publication.
do $$
declare
  v_table text;
begin
  if exists (
    select 1
    from pg_catalog.pg_publication publication
    where publication.pubname = 'supabase_realtime'
  ) then
    foreach v_table in array array[
      'visits',
      'visit_tasks',
      'visit_plans',
      'damage_reports',
      'property_services'
    ]
    loop
      if not exists (
        select 1
        from pg_catalog.pg_publication_tables published
        where published.pubname = 'supabase_realtime'
          and published.schemaname = 'public'
          and published.tablename = v_table
      ) then
        execute format(
          'alter publication %I add table %I.%I',
          'supabase_realtime',
          'public',
          v_table
        );
      end if;
    end loop;
  end if;
end;
$$;

-- Backfill one year of visits and all future work in the same migration. The
-- JWT setting is transaction-local and only satisfies the trusted generator's
-- existing service-role guard while migrations run as the database owner.
select set_config(
  'request.jwt.claims',
  '{"role":"service_role"}',
  true
);

select public.generate_upcoming_visits(366, null);

do $$
declare
  v_property record;
begin
  for v_property in
    select distinct visit.property_id
    from public.visits visit
    where visit.status = 'scheduled'
    order by visit.property_id
  loop
    perform private.refresh_property_future_work(v_property.property_id);
  end loop;
end;
$$;

select set_config('request.jwt.claims', '{}', true);
