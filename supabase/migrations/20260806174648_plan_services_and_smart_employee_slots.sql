-- Bind property services to concrete visit plans and place generated visits
-- into free employee slots. Existing plans keep their previous semantics via
-- `property_rule`; v3 plan mutations create explicit `every_plan_visit` links.

alter table public.visit_plans
  add column accepts_unplanned_tasks boolean not null default true;

-- Authenticated reads on visit_plans are column-granted rather than table-wide.
grant select (accepts_unplanned_tasks) on public.visit_plans to authenticated;

alter table public.visits
  add column planned_duration_minutes integer;

update public.visits visit
set planned_duration_minutes = least(
  1440,
  greatest(
    1,
    coalesce(
      (
        select metrics.max_visit_minutes
        from public.visit_admin_metrics metrics
        where metrics.visit_id = visit.id
      ),
      (
        select plan.max_visit_minutes
        from public.visit_plans plan
        where plan.id = visit.visit_plan_id
      ),
      (
        select settings.max_visit_minutes
        from public.property_admin_settings settings
        where settings.property_id = visit.property_id
      ),
      60
    )
  )
);

update public.visits
set planned_duration_minutes = 60
where planned_duration_minutes is null;

alter table public.visits
  alter column planned_duration_minutes set default 60,
  alter column planned_duration_minutes set not null,
  add constraint visits_planned_duration_minutes_check
    check (planned_duration_minutes between 1 and 1440);

create table public.visit_plan_services (
  visit_plan_id uuid not null
    references public.visit_plans(id) on delete cascade,
  property_service_id uuid not null
    references public.property_services(id) on delete restrict,
  execution_mode text not null default 'every_plan_visit'
    check (execution_mode in ('property_rule', 'every_plan_visit')),
  created_at timestamptz not null default now(),
  primary key (visit_plan_id, property_service_id)
);

create index visit_plan_services_service_idx
  on public.visit_plan_services(property_service_id, visit_plan_id);

alter table public.visit_plan_services enable row level security;

create policy visit_plan_services_admin_all
on public.visit_plan_services for all to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy visit_plan_services_employee_select
on public.visit_plan_services for select to authenticated
using ((select private.can_access_visit_plan(visit_plan_id)));

revoke all on table public.visit_plan_services from public, anon, authenticated;
grant select on table public.visit_plan_services to authenticated;
grant all privileges on table public.visit_plan_services to service_role;

create or replace function private.assert_visit_plan_service_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan_property_id uuid;
  v_service_property_id uuid;
begin
  select plan.property_id
  into v_plan_property_id
  from public.visit_plans plan
  where plan.id = new.visit_plan_id;

  select service.property_id
  into v_service_property_id
  from public.property_services service
  where service.id = new.property_service_id;

  if v_plan_property_id is null
    or v_service_property_id is null
    or v_plan_property_id <> v_service_property_id
  then
    raise exception using
      errcode = '23514',
      message = 'Besuchsplan und Leistung gehören nicht zur selben Immobilie';
  end if;

  return new;
end;
$$;

revoke all on function private.assert_visit_plan_service_scope()
  from public, anon, authenticated, service_role;

create trigger visit_plan_services_same_property
before insert or update on public.visit_plan_services
for each row execute function private.assert_visit_plan_service_scope();

-- Preserve the old behavior exactly: every service configured on the property
-- remains eligible for every existing plan and keeps its property-level rule.
insert into public.visit_plan_services (
  visit_plan_id,
  property_service_id,
  execution_mode
)
select
  plan.id,
  service.id,
  'property_rule'
from public.visit_plans plan
join public.property_services service
  on service.property_id = plan.property_id
on conflict (visit_plan_id, property_service_id) do nothing;

create or replace function private.normalize_visit_plan_service_ids(
  p_property_id uuid,
  p_property_service_ids uuid[]
)
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[] := coalesce(p_property_service_ids, array[]::uuid[]);
  v_normalized uuid[];
  v_count integer;
begin
  if coalesce(array_ndims(v_ids), 1) <> 1
    or array_position(v_ids, null) is not null
  then
    raise exception using
      errcode = '22023',
      message = 'Die Leistungsauswahl ist ungültig';
  end if;

  if cardinality(v_ids) = 0 then
    raise exception using
      errcode = '22023',
      message = 'Bitte mindestens eine Leistung für den Besuchsplan auswählen';
  end if;

  if cardinality(v_ids) <> (
    select count(distinct selected.id)::integer
    from unnest(v_ids) selected(id)
  ) then
    raise exception using
      errcode = '22023',
      message = 'Leistungen dürfen nicht mehrfach ausgewählt werden';
  end if;

  -- Follow the established mutation order (global schedule -> property ->
  -- child rows) so a concurrent service update cannot form a lock cycle.
  perform property.id
  from public.properties property
  where property.id = p_property_id
  for update of property;

  -- Keep the selected service configuration stable until the surrounding v3
  -- transaction has created/replaced the junction rows. FOR SHARE (rather
  -- than only FOR KEY SHARE) also blocks concurrent status/property updates.
  perform service.id
  from public.property_services service
  where service.id = any(v_ids)
  order by service.id
  for share of service;

  select
    coalesce(array_agg(service.id order by service.id), array[]::uuid[]),
    count(*)::integer
  into v_normalized, v_count
  from public.property_services service
  where service.id = any(v_ids)
    and service.property_id = p_property_id
    and service.status = 'active'
    and service.execution_rule not in ('on_demand', 'manual');

  if v_count <> cardinality(v_ids) then
    raise exception using
      errcode = '22023',
      message = 'Mindestens eine ausgewählte Leistung ist nicht planbar, nicht aktiv oder gehört nicht zur Immobilie';
  end if;

  return v_normalized;
end;
$$;

revoke all on function private.normalize_visit_plan_service_ids(uuid, uuid[])
  from public, anon, authenticated, service_role;

-- v3 wrappers pass their additional configuration through transaction-local
-- settings. The existing, thoroughly validated v2 RPCs still own the mutation;
-- these triggers only inject the new fields before v2 starts its generator.
create or replace function private.apply_visit_plan_v3_context()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_accepts text := nullif(
    current_setting('hausvia.visit_plan_accepts_unplanned_tasks', true),
    ''
  );
  v_target text := nullif(
    current_setting('hausvia.visit_plan_v3_target_id', true),
    ''
  );
begin
  if v_accepts is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and v_target is distinct from new.id::text then
    return new;
  end if;

  new.accepts_unplanned_tasks := v_accepts::boolean;
  return new;
end;
$$;

revoke all on function private.apply_visit_plan_v3_context()
  from public, anon, authenticated, service_role;

create trigger visit_plans_apply_v3_context
before insert or update on public.visit_plans
for each row execute function private.apply_visit_plan_v3_context();

create or replace function private.initialize_visit_plan_services()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_raw_ids text := nullif(
    current_setting('hausvia.visit_plan_service_ids', true),
    ''
  );
  v_target text := nullif(
    current_setting('hausvia.visit_plan_v3_target_id', true),
    ''
  );
begin
  if tg_op = 'UPDATE' then
    if v_raw_ids is null or v_target is distinct from new.id::text then
      return new;
    end if;

    delete from public.visit_plan_services link
    where link.visit_plan_id = new.id;
  end if;

  if v_raw_ids is null then
    if tg_op = 'INSERT' then
      insert into public.visit_plan_services (
        visit_plan_id,
        property_service_id,
        execution_mode
      )
      select new.id, service.id, 'property_rule'
      from public.property_services service
      where service.property_id = new.property_id
      on conflict (visit_plan_id, property_service_id) do nothing;
    end if;
    return new;
  end if;

  insert into public.visit_plan_services (
    visit_plan_id,
    property_service_id,
    execution_mode
  )
  select
    new.id,
    selected.value::uuid,
    'every_plan_visit'
  from jsonb_array_elements_text(v_raw_ids::jsonb) selected(value)
  on conflict (visit_plan_id, property_service_id) do update
    set execution_mode = excluded.execution_mode;

  return new;
end;
$$;

revoke all on function private.initialize_visit_plan_services()
  from public, anon, authenticated, service_role;

create trigger visit_plans_initialize_services
after insert or update on public.visit_plans
for each row execute function private.initialize_visit_plan_services();

-- A service created later remains part of legacy/property-rule plans. Explicit
-- v3 plans contain at least one every_plan_visit link and are left untouched.
create or replace function private.attach_new_service_to_legacy_plans()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.visit_plan_services (
    visit_plan_id,
    property_service_id,
    execution_mode
  )
  select plan.id, new.id, 'property_rule'
  from public.visit_plans plan
  where plan.property_id = new.property_id
    and not exists (
      select 1
      from public.visit_plan_services explicit_link
      where explicit_link.visit_plan_id = plan.id
        and explicit_link.execution_mode = 'every_plan_visit'
    )
  on conflict (visit_plan_id, property_service_id) do nothing;

  return new;
end;
$$;

revoke all on function private.attach_new_service_to_legacy_plans()
  from public, anon, authenticated, service_role;

create trigger property_services_attach_legacy_plans
after insert on public.property_services
for each row execute function private.attach_new_service_to_legacy_plans();

-- Materialize only the services selected for a plan. An explicit v3 link is
-- due on every occurrence of that plan; a legacy link keeps the service's
-- weekly/monthly/seasonal occurrence rule.
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

  with scoped_candidates as (
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
      case
        when plan_service.execution_mode = 'every_plan_visit'
          then 'every_visit'
        else service.execution_rule
      end as effective_execution_rule,
      service.occurrences_per_period,
      service.season_start_month,
      service.season_end_month,
      scoped.building_id,
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
    join public.visit_plan_services plan_service
      on plan_service.visit_plan_id = visit.visit_plan_id
    join public.property_services service
      on service.id = plan_service.property_service_id
      and service.property_id = visit.property_id
    left join public.property_service_buildings scoped
      on scoped.property_service_id = service.id
    where visit.property_id = p_property_id
      and visit.status = 'scheduled'
      and visit.visit_plan_id is not null
      and service.status = 'active'
      and (
        plan_service.execution_mode = 'every_plan_visit'
        or service.execution_rule not in ('on_demand', 'manual')
      )
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
  ), raw_candidates as (
    select
      candidate.*,
      case
        when candidate.effective_execution_rule = 'every_visit'
          then 'visit:' || candidate.visit_id::text
        else private.service_period_key(
          candidate.effective_execution_rule,
          candidate.scheduled_date,
          candidate.season_start_month,
          candidate.season_end_month
        )
      end as due_period_key,
      case
        when candidate.effective_execution_rule in (
          'multiple_weekly',
          'multiple_monthly'
        ) then greatest(candidate.occurrences_per_period, 1)
        else 1
      end as occurrence_limit
    from scoped_candidates candidate
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

create or replace function private.rebuild_scheduled_visit_equipment(
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

  -- Scheduled plan visits are mutable planning snapshots. Started/completed
  -- visits and manually created one-off visits remain untouched.
  delete from public.visit_equipment assignment
  using public.visits visit
  where visit.id = assignment.visit_id
    and visit.property_id = p_property_id
    and visit.status = 'scheduled'
    and visit.visit_plan_id is not null;

  with target_visits as (
    select visit.id, visit.property_id, visit.scheduled_date
    from public.visits visit
    where visit.property_id = p_property_id
      and visit.status = 'scheduled'
      and visit.visit_plan_id is not null
  ), equipment_requirements as (
    select
      visit.id as visit_id,
      property_equipment.equipment_id,
      property_equipment.required_quantity,
      property_equipment.rental,
      property_equipment.provision_note
    from target_visits visit
    join public.property_equipment property_equipment
      on property_equipment.property_id = visit.property_id
      and property_equipment.active = true
    join public.equipment equipment
      on equipment.id = property_equipment.equipment_id
      and equipment.status = 'active'
    where (
        property_equipment.seasonal = false
        or public.is_month_in_season(
          visit.scheduled_date,
          property_equipment.season_start_month,
          property_equipment.season_end_month
        )
      )
      and (
        property_equipment.building_id is null
        or exists (
          select 1
          from public.visit_buildings visit_building
          where visit_building.visit_id = visit.id
            and visit_building.building_id = property_equipment.building_id
        )
      )

    union all

    select
      visit.id,
      service_equipment.equipment_id,
      service_equipment.required_quantity,
      false,
      null::text
    from target_visits visit
    join public.visit_tasks task
      on task.visit_id = visit.id
      and task.property_service_id is not null
      and task.source_type in ('service', 'follow_up')
    join public.service_equipment service_equipment
      on service_equipment.property_service_id = task.property_service_id
    join public.equipment equipment
      on equipment.id = service_equipment.equipment_id
      and equipment.status = 'active'
  )
  insert into public.visit_equipment (
    visit_id,
    equipment_id,
    required_quantity,
    rental,
    provision_note
  )
  select
    requirement.visit_id,
    requirement.equipment_id,
    max(requirement.required_quantity),
    bool_or(requirement.rental),
    (
      array_agg(requirement.provision_note order by requirement.provision_note)
      filter (where requirement.provision_note is not null)
    )[1]
  from equipment_requirements requirement
  group by requirement.visit_id, requirement.equipment_id;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

revoke all on function private.rebuild_scheduled_visit_equipment(uuid)
  from public, anon, authenticated, service_role;

-- Existing property-service triggers call this helper. Extending it here keeps
-- task and equipment snapshots in lockstep after a service edit.
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
    perform private.rebuild_scheduled_visit_equipment(v_property_id);
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.refresh_service_configuration_work()
  from public, anon, authenticated, service_role;

drop trigger if exists service_equipment_refresh_future_work
  on public.service_equipment;
create trigger service_equipment_refresh_future_work
after insert or update or delete on public.service_equipment
for each row execute function private.refresh_service_configuration_work();

create or replace function private.refresh_plan_service_scope_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_property record;
begin
  if current_setting('hausvia.defer_plan_service_refresh', true) = 'true' then
    return null;
  end if;

  for v_property in
    select distinct service.property_id
    from new_plan_services link
    join public.property_services service
      on service.id = link.property_service_id
    order by service.property_id
  loop
    perform private.refresh_property_future_work(v_property.property_id);
    perform private.rebuild_scheduled_visit_equipment(v_property.property_id);
  end loop;
  return null;
end;
$$;

revoke all on function private.refresh_plan_service_scope_after_insert()
  from public, anon, authenticated, service_role;

create trigger visit_plan_services_refresh_after_insert
after insert on public.visit_plan_services
referencing new table as new_plan_services
for each statement execute function private.refresh_plan_service_scope_after_insert();

create or replace function private.refresh_plan_service_scope_after_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_property record;
begin
  if current_setting('hausvia.defer_plan_service_refresh', true) = 'true' then
    return null;
  end if;

  for v_property in
    select distinct service.property_id
    from old_plan_services link
    join public.property_services service
      on service.id = link.property_service_id
    order by service.property_id
  loop
    perform private.refresh_property_future_work(v_property.property_id);
    perform private.rebuild_scheduled_visit_equipment(v_property.property_id);
  end loop;
  return null;
end;
$$;

revoke all on function private.refresh_plan_service_scope_after_delete()
  from public, anon, authenticated, service_role;

create trigger visit_plan_services_refresh_after_delete
after delete on public.visit_plan_services
referencing old table as old_plan_services
for each statement execute function private.refresh_plan_service_scope_after_delete();

-- Keep the established generator implementation. The small public wrapper now
-- corrects its broad equipment placeholder after task materialization chose
-- the exact services due for each plan occurrence.
create or replace function public.generate_upcoming_visits(
  p_horizon_days integer default 366,
  p_plan_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_generated integer;
  v_property record;
begin
  if not ((select private.is_admin()) or (select private.is_service_role())) then
    raise exception 'Nur Administratoren dürfen Termine erzeugen';
  end if;
  if p_horizon_days < 1 or p_horizon_days > 366 then
    raise exception 'Der Planungshorizont muss zwischen 1 und 366 Tagen liegen';
  end if;

  perform private.lock_visit_plan_schedule();
  v_generated := private.generate_upcoming_visits_unlocked(
    greatest(p_horizon_days, 366),
    p_plan_id
  );

  for v_property in
    select distinct plan.property_id
    from public.visit_plans plan
    where p_plan_id is null or plan.id = p_plan_id
    order by plan.property_id
  loop
    perform private.rebuild_scheduled_visit_equipment(v_property.property_id);
  end loop;

  return v_generated;
end;
$$;

revoke all on function public.generate_upcoming_visits(integer, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.generate_upcoming_visits(integer, uuid)
  to service_role;

-- Damage reports go only to visits whose plan explicitly accepts ad-hoc work.
-- Manual one-off visits retain the legacy behavior and remain eligible.
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
  left join public.visit_plans plan on plan.id = visit.visit_plan_id
  where visit.property_id = v_damage.property_id
    and visit.status = 'scheduled'
    and visit.scheduled_date >= (now() at time zone 'Europe/Berlin')::date
    and (
      visit.visit_plan_id is null
      or plan.accepts_unplanned_tasks = true
    )
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

-- Service follow-ups stay with a plan that actually contains that service.
-- Damage/manual follow-ups use the plan's ad-hoc-work flag.
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
    left join public.visit_plans plan on plan.id = visit.visit_plan_id
    where visit.property_id = p_property_id
      and visit.status = 'scheduled'
      and visit.scheduled_start > greatest(
        v_source.source_scheduled_start,
        now()
      )
      and (
        v_source.building_id is null
        or exists (
          select 1
          from public.visit_buildings visit_building
          where visit_building.visit_id = visit.id
            and visit_building.building_id = v_source.building_id
        )
      )
      and (
        (
          v_source.property_service_id is not null
          and exists (
            select 1
            from public.visit_plan_services plan_service
            where plan_service.visit_plan_id = visit.visit_plan_id
              and plan_service.property_service_id = v_source.property_service_id
          )
        )
        or (
          v_source.property_service_id is null
          and (
            visit.visit_plan_id is null
            or plan.accepts_unplanned_tasks = true
          )
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

-- Internal resource calendar. One row represents one employee occupied by one
-- open visit. The exclusion constraint covers primary and additional team
-- members equally and closes the concurrency race left by a read-only overlap
-- check.
create table private.visit_employee_schedule_slots (
  visit_id uuid not null
    references public.visits(id) on delete cascade,
  employee_id uuid not null
    references public.employee_profiles(id) on delete restrict,
  slot_start timestamptz not null,
  slot_end timestamptz not null,
  assignment_role text not null
    check (assignment_role in ('primary', 'additional')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (visit_id, employee_id),
  check (slot_end > slot_start),
  constraint visit_employee_schedule_slots_no_overlap
    exclude using gist (
      employee_id with =,
      tstzrange(slot_start, slot_end, '[)') with &&
    )
);

create index visit_employee_schedule_slots_employee_start_idx
  on private.visit_employee_schedule_slots(employee_id, slot_start);

revoke all on table private.visit_employee_schedule_slots
  from public, anon, authenticated, service_role;

create or replace function private.find_smart_visit_start(
  p_visit_plan_id uuid,
  p_primary_employee_id uuid,
  p_scheduled_date date,
  p_proposed_start timestamptz,
  p_window_start time,
  p_window_end time,
  p_duration_minutes integer,
  p_auto_place boolean,
  p_exclude_visit_id uuid default null
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_timezone text := 'Europe/Berlin';
  v_candidate timestamptz;
  v_window_begin timestamptz;
  v_window_finish timestamptz;
  v_duration interval := make_interval(
    mins => greatest(coalesce(p_duration_minutes, 60), 1)
  );
  v_conflict boolean;
begin
  if p_visit_plan_id is not null then
    select plan.timezone
    into v_timezone
    from public.visit_plans plan
    where plan.id = p_visit_plan_id;
  end if;

  if p_auto_place then
    if p_window_start is null or p_window_end is null then
      raise exception using
        errcode = '22023',
        message = 'Für die automatische Terminierung ist ein vollständiges Zeitfenster erforderlich';
    end if;

    v_window_begin := (p_scheduled_date + p_window_start) at time zone v_timezone;
    v_window_finish := (p_scheduled_date + p_window_end) at time zone v_timezone;

    if v_window_finish - v_window_begin < v_duration then
      raise exception using
        errcode = '22023',
        message = 'Das Zeitfenster ist kürzer als die geplante Einsatzdauer';
    end if;

    for v_candidate in
      select candidate
      from generate_series(
        v_window_begin,
        v_window_finish - v_duration,
        interval '5 minutes'
      ) candidate
      order by candidate
    loop
      select exists (
        with candidate_employees as (
          select p_primary_employee_id as employee_id
          where p_primary_employee_id is not null

          union

          select additional.employee_id
          from public.visit_plan_employees additional
          where additional.visit_plan_id = p_visit_plan_id
        )
        select 1
        from private.visit_employee_schedule_slots occupied
        join candidate_employees candidate_employee
          on candidate_employee.employee_id = occupied.employee_id
        where occupied.visit_id is distinct from p_exclude_visit_id
          and tstzrange(
            occupied.slot_start,
            occupied.slot_end,
            '[)'
          ) && tstzrange(
            v_candidate,
            v_candidate + v_duration,
            '[)'
          )
      ) into v_conflict;

      if not v_conflict then
        return v_candidate;
      end if;
    end loop;

    raise exception using
      errcode = '23P01',
      message = format(
        'Kein freier Mitarbeitertermin am %s zwischen %s und %s',
        to_char(p_scheduled_date, 'DD.MM.YYYY'),
        to_char(p_window_start, 'HH24:MI'),
        to_char(p_window_end, 'HH24:MI')
      );
  end if;

  v_candidate := p_proposed_start;
  if v_candidate is null then
    raise exception using
      errcode = '22023',
      message = 'Der geplante Startzeitpunkt fehlt';
  end if;

  select exists (
    with candidate_employees as (
      select p_primary_employee_id as employee_id
      where p_primary_employee_id is not null

      union

      select additional.employee_id
      from public.visit_plan_employees additional
      where additional.visit_plan_id = p_visit_plan_id
    )
    select 1
    from private.visit_employee_schedule_slots occupied
    join candidate_employees candidate_employee
      on candidate_employee.employee_id = occupied.employee_id
    where occupied.visit_id is distinct from p_exclude_visit_id
      and tstzrange(
        occupied.slot_start,
        occupied.slot_end,
        '[)'
      ) && tstzrange(
        v_candidate,
        v_candidate + v_duration,
        '[)'
      )
  ) into v_conflict;

  if v_conflict then
    raise exception using
      errcode = '23P01',
      message = 'Der Mitarbeiter ist in diesem Zeitraum bereits eingeplant';
  end if;

  return v_candidate;
end;
$$;

revoke all on function private.find_smart_visit_start(
  uuid, uuid, date, timestamptz, time, time, integer, boolean, uuid
) from public, anon, authenticated, service_role;

create or replace function private.place_visit_in_employee_calendar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_timezone text := 'Europe/Berlin';
  v_plan_duration integer;
  v_auto_place boolean;
begin
  -- The recurring generator intentionally retries the same schedule keys via
  -- INSERT ... ON CONFLICT DO NOTHING. BEFORE INSERT runs before conflict
  -- arbitration, so bypass placement when that logical visit already exists.
  if tg_op = 'INSERT'
    and new.visit_plan_id is not null
    and new.schedule_key is not null
    and exists (
      select 1
      from public.visits existing
      where existing.visit_plan_id = new.visit_plan_id
        and existing.schedule_key = new.schedule_key
    )
  then
    return new;
  end if;

  if new.status not in ('scheduled', 'started') then
    return new;
  end if;

  if new.visit_plan_id is not null then
    select
      plan.timezone,
      coalesce(plan.max_visit_minutes, new.planned_duration_minutes, 60)
    into v_timezone, v_plan_duration
    from public.visit_plans plan
    where plan.id = new.visit_plan_id;

    if tg_op = 'INSERT' then
      new.planned_duration_minutes := greatest(
        coalesce(v_plan_duration, 60),
        1
      );
    end if;
  end if;

  v_auto_place := new.visit_plan_id is not null
    and new.planned_start_time is null
    and new.window_start is not null
    and new.window_end is not null;

  new.scheduled_start := private.find_smart_visit_start(
    new.visit_plan_id,
    new.primary_employee_id,
    new.scheduled_date,
    new.scheduled_start,
    new.window_start,
    new.window_end,
    new.planned_duration_minutes,
    v_auto_place,
    case when tg_op = 'UPDATE' then new.id else null end
  );

  new.planned_start_time := (
    new.scheduled_start at time zone v_timezone
  )::time;

  return new;
end;
$$;

revoke all on function private.place_visit_in_employee_calendar()
  from public, anon, authenticated, service_role;

create trigger visits_place_in_employee_calendar_insert
before insert on public.visits
for each row execute function private.place_visit_in_employee_calendar();

create trigger visits_place_in_employee_calendar_update
before update of
  visit_plan_id,
  primary_employee_id,
  scheduled_date,
  planned_start_time,
  scheduled_start,
  window_start,
  window_end,
  planned_duration_minutes
on public.visits
for each row execute function private.place_visit_in_employee_calendar();

create or replace function private.sync_visit_employee_schedule_slots(
  p_visit_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_visit public.visits%rowtype;
begin
  select *
  into v_visit
  from public.visits visit
  where visit.id = p_visit_id;

  if not found or v_visit.status not in ('scheduled', 'started') then
    delete from private.visit_employee_schedule_slots slot
    where slot.visit_id = p_visit_id;
    return;
  end if;

  delete from private.visit_employee_schedule_slots slot
  where slot.visit_id = p_visit_id
    and not exists (
      select 1
      from (
        select v_visit.primary_employee_id as employee_id
        where v_visit.primary_employee_id is not null

        union

        select additional.employee_id
        from public.visit_plan_employees additional
        where additional.visit_plan_id = v_visit.visit_plan_id
      ) expected
      where expected.employee_id = slot.employee_id
    );

  insert into private.visit_employee_schedule_slots (
    visit_id,
    employee_id,
    slot_start,
    slot_end,
    assignment_role,
    updated_at
  )
  select
    v_visit.id,
    employee.employee_id,
    v_visit.scheduled_start,
    v_visit.scheduled_start + make_interval(
      mins => v_visit.planned_duration_minutes
    ),
    employee.assignment_role,
    now()
  from (
    select
      v_visit.primary_employee_id as employee_id,
      'primary'::text as assignment_role
    where v_visit.primary_employee_id is not null

    union

    select
      additional.employee_id,
      'additional'::text
    from public.visit_plan_employees additional
    where additional.visit_plan_id = v_visit.visit_plan_id
      and additional.employee_id is distinct from v_visit.primary_employee_id
  ) employee
  order by employee.employee_id
  on conflict (visit_id, employee_id) do update
    set slot_start = excluded.slot_start,
        slot_end = excluded.slot_end,
        assignment_role = excluded.assignment_role,
        updated_at = now();
end;
$$;

revoke all on function private.sync_visit_employee_schedule_slots(uuid)
  from public, anon, authenticated, service_role;

create or replace function private.sync_visit_employee_schedule_slots_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.sync_visit_employee_schedule_slots(new.id);
  return new;
end;
$$;

revoke all on function private.sync_visit_employee_schedule_slots_trigger()
  from public, anon, authenticated, service_role;

create trigger visits_sync_employee_schedule_slots_insert
after insert on public.visits
for each row execute function private.sync_visit_employee_schedule_slots_trigger();

create trigger visits_sync_employee_schedule_slots_update
after update of
  visit_plan_id,
  primary_employee_id,
  scheduled_start,
  planned_duration_minutes,
  status
on public.visits
for each row execute function private.sync_visit_employee_schedule_slots_trigger();

create or replace function private.sync_plan_employee_schedule_slots_deferred()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan_id uuid := case
    when tg_op = 'DELETE' then old.visit_plan_id
    else new.visit_plan_id
  end;
  v_visit record;
begin
  for v_visit in
    select visit.id
    from public.visits visit
    where visit.visit_plan_id = v_plan_id
      and visit.status in ('scheduled', 'started')
    order by visit.id
  loop
    perform private.sync_visit_employee_schedule_slots(v_visit.id);
  end loop;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.sync_plan_employee_schedule_slots_deferred()
  from public, anon, authenticated, service_role;

create constraint trigger visit_plan_employees_sync_schedule_slots
after insert or delete on public.visit_plan_employees
deferrable initially deferred
for each row execute function private.sync_plan_employee_schedule_slots_deferred();

-- Backfill the internal resource calendar in deterministic order. Any existing
-- overlap aborts the migration rather than silently preserving double booking.
do $$
declare
  v_visit record;
begin
  for v_visit in
    select visit.id
    from public.visits visit
    where visit.status in ('scheduled', 'started')
    order by visit.scheduled_start, visit.id
  loop
    perform private.sync_visit_employee_schedule_slots(v_visit.id);
  end loop;
end;
$$;

create or replace function public.create_visit_plan_configuration_v3(
  p_property_id uuid,
  p_label text,
  p_frequency text,
  p_repeat_every integer,
  p_weekdays integer[],
  p_month_days integer[],
  p_desired_time time,
  p_window_start time,
  p_window_end time,
  p_start_date date,
  p_end_date date,
  p_primary_employee_id uuid,
  p_max_visit_minutes integer,
  p_building_ids uuid[],
  p_additional_employee_ids uuid[],
  p_service_ids uuid[],
  p_accepts_unplanned_tasks boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_service_ids uuid[];
  v_result jsonb;
  v_plan_id uuid;
begin
  perform private.require_admin();
  perform private.lock_visit_plan_schedule();
  v_service_ids := private.normalize_visit_plan_service_ids(
    p_property_id,
    p_service_ids
  );

  perform set_config(
    'hausvia.visit_plan_service_ids',
    to_jsonb(v_service_ids)::text,
    true
  );
  perform set_config(
    'hausvia.visit_plan_accepts_unplanned_tasks',
    coalesce(p_accepts_unplanned_tasks, true)::text,
    true
  );
  perform set_config('hausvia.visit_plan_v3_target_id', '', true);
  perform set_config('hausvia.defer_plan_service_refresh', 'true', true);

  begin
    v_result := public.create_visit_plan_configuration_v2(
      p_property_id,
      p_label,
      p_frequency,
      p_repeat_every,
      p_weekdays,
      p_month_days,
      p_desired_time,
      p_window_start,
      p_window_end,
      p_start_date,
      p_end_date,
      p_primary_employee_id,
      p_max_visit_minutes,
      p_building_ids,
      p_additional_employee_ids
    );
  exception
    when others then
      perform set_config('hausvia.visit_plan_service_ids', '', true);
      perform set_config(
        'hausvia.visit_plan_accepts_unplanned_tasks',
        '',
        true
      );
      perform set_config('hausvia.visit_plan_v3_target_id', '', true);
      perform set_config('hausvia.defer_plan_service_refresh', '', true);
      raise;
  end;

  perform set_config('hausvia.visit_plan_service_ids', '', true);
  perform set_config(
    'hausvia.visit_plan_accepts_unplanned_tasks',
    '',
    true
  );
  perform set_config('hausvia.visit_plan_v3_target_id', '', true);
  perform set_config('hausvia.defer_plan_service_refresh', '', true);

  v_plan_id := (v_result ->> 'visit_plan_id')::uuid;

  insert into public.audit_logs (
    actor_id,
    action,
    entity_table,
    entity_id,
    metadata
  ) values (
    v_actor,
    'visit_plan.services_configured',
    'visit_plans',
    v_plan_id,
    jsonb_build_object(
      'property_id', p_property_id,
      'property_service_ids', to_jsonb(v_service_ids),
      'execution_mode', 'every_plan_visit',
      'accepts_unplanned_tasks', coalesce(
        p_accepts_unplanned_tasks,
        true
      )
    )
  );

  return v_result || jsonb_build_object(
    'property_service_ids', to_jsonb(v_service_ids),
    'accepts_unplanned_tasks', coalesce(p_accepts_unplanned_tasks, true)
  );
end;
$$;

revoke all on function public.create_visit_plan_configuration_v3(
  uuid, text, text, integer, integer[], integer[], time, time, time, date,
  date, uuid, integer, uuid[], uuid[], uuid[], boolean
) from public, anon, authenticated, service_role;
grant execute on function public.create_visit_plan_configuration_v3(
  uuid, text, text, integer, integer[], integer[], time, time, time, date,
  date, uuid, integer, uuid[], uuid[], uuid[], boolean
) to authenticated;

create or replace function public.update_visit_plan_configuration_v3(
  p_property_id uuid,
  p_visit_plan_id uuid,
  p_expected_updated_at timestamptz,
  p_label text,
  p_frequency text,
  p_repeat_every integer,
  p_weekdays integer[],
  p_month_days integer[],
  p_desired_time time,
  p_window_start time,
  p_window_end time,
  p_start_date date,
  p_end_date date,
  p_primary_employee_id uuid,
  p_max_visit_minutes integer,
  p_building_ids uuid[],
  p_additional_employee_ids uuid[],
  p_service_ids uuid[],
  p_accepts_unplanned_tasks boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_service_ids uuid[];
  v_result jsonb;
begin
  perform private.require_admin();
  perform private.lock_visit_plan_schedule();
  v_service_ids := private.normalize_visit_plan_service_ids(
    p_property_id,
    p_service_ids
  );

  perform set_config(
    'hausvia.visit_plan_service_ids',
    to_jsonb(v_service_ids)::text,
    true
  );
  perform set_config(
    'hausvia.visit_plan_accepts_unplanned_tasks',
    coalesce(p_accepts_unplanned_tasks, true)::text,
    true
  );
  perform set_config(
    'hausvia.visit_plan_v3_target_id',
    p_visit_plan_id::text,
    true
  );
  perform set_config('hausvia.defer_plan_service_refresh', 'true', true);

  begin
    v_result := public.update_visit_plan_configuration_v2(
      p_property_id,
      p_visit_plan_id,
      p_expected_updated_at,
      p_label,
      p_frequency,
      p_repeat_every,
      p_weekdays,
      p_month_days,
      p_desired_time,
      p_window_start,
      p_window_end,
      p_start_date,
      p_end_date,
      p_primary_employee_id,
      p_max_visit_minutes,
      p_building_ids,
      p_additional_employee_ids
    );
  exception
    when others then
      perform set_config('hausvia.visit_plan_service_ids', '', true);
      perform set_config(
        'hausvia.visit_plan_accepts_unplanned_tasks',
        '',
        true
      );
      perform set_config('hausvia.visit_plan_v3_target_id', '', true);
      perform set_config('hausvia.defer_plan_service_refresh', '', true);
      raise;
  end;

  perform set_config('hausvia.visit_plan_service_ids', '', true);
  perform set_config(
    'hausvia.visit_plan_accepts_unplanned_tasks',
    '',
    true
  );
  perform set_config('hausvia.visit_plan_v3_target_id', '', true);
  perform set_config('hausvia.defer_plan_service_refresh', '', true);

  insert into public.audit_logs (
    actor_id,
    action,
    entity_table,
    entity_id,
    metadata
  ) values (
    v_actor,
    'visit_plan.services_updated',
    'visit_plans',
    p_visit_plan_id,
    jsonb_build_object(
      'property_id', p_property_id,
      'property_service_ids', to_jsonb(v_service_ids),
      'execution_mode', 'every_plan_visit',
      'accepts_unplanned_tasks', coalesce(
        p_accepts_unplanned_tasks,
        true
      )
    )
  );

  return v_result || jsonb_build_object(
    'property_service_ids', to_jsonb(v_service_ids),
    'accepts_unplanned_tasks', coalesce(p_accepts_unplanned_tasks, true)
  );
end;
$$;

revoke all on function public.update_visit_plan_configuration_v3(
  uuid, uuid, timestamptz, text, text, integer, integer[], integer[], time,
  time, time, date, date, uuid, integer, uuid[], uuid[], uuid[], boolean
) from public, anon, authenticated, service_role;
grant execute on function public.update_visit_plan_configuration_v3(
  uuid, uuid, timestamptz, text, text, integer, integer[], integer[], time,
  time, time, date, date, uuid, integer, uuid[], uuid[], uuid[], boolean
) to authenticated;

-- Rebuild existing future snapshots through the new plan/service relation.
do $$
declare
  v_property record;
begin
  for v_property in
    select distinct visit.property_id
    from public.visits visit
    where visit.status = 'scheduled'
      and visit.visit_plan_id is not null
    order by visit.property_id
  loop
    perform private.refresh_property_future_work(v_property.property_id);
    perform private.rebuild_scheduled_visit_equipment(v_property.property_id);
  end loop;
end;
$$;

do $$
begin
  if exists (
    select 1
    from pg_catalog.pg_publication publication
    where publication.pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_catalog.pg_publication_tables published
    where published.pubname = 'supabase_realtime'
      and published.schemaname = 'public'
      and published.tablename = 'visit_plan_services'
  ) then
    alter publication supabase_realtime
      add table public.visit_plan_services;
  end if;
end;
$$;
