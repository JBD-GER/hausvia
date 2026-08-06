-- A same-day visit must only receive a newly reported damage when its actual
-- start is still in the future. Comparing date-only values previously allowed
-- an evening report to be attached to a 09:00 visit from the same day.
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
    and visit.scheduled_start >= greatest(now(), v_damage.created_at)
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

-- Generated plan occurrences whose proposed start has already passed are
-- skipped instead of appearing as newly-created appointments in the past.
create or replace function private.skip_past_generated_visit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.visit_plan_id is not null
    and new.status = 'scheduled'
    and new.scheduled_start <= clock_timestamp()
  then
    return null;
  end if;
  return new;
end;
$$;

revoke all on function private.skip_past_generated_visit()
  from public, anon, authenticated, service_role;

drop trigger if exists visits_00_skip_past_generated_insert on public.visits;
create trigger visits_00_skip_past_generated_insert
before insert on public.visits
for each row execute function private.skip_past_generated_visit();

-- Repair only certainly wrong assignments: the damage was created after the
-- linked visit had already begun, the task is still open, and it has no proof.
do $repair_misdirected_damage$
declare
  v_damage record;
begin
  for v_damage in
    select
      report.id as damage_report_id,
      report.property_id,
      report.linked_visit_task_id as task_id
    from public.damage_reports report
    join public.visits visit on visit.id = report.linked_visit_id
    join public.visit_tasks task on task.id = report.linked_visit_task_id
    where report.status in ('new', 'reviewed', 'scheduled')
      and report.planned_next_visit = false
      and visit.status = 'scheduled'
      and visit.scheduled_start < report.created_at
      and task.status = 'open'
      and task.source_type = 'damage'
      and not exists (
        select 1
        from public.visit_task_attachments attachment
        where attachment.visit_task_id = task.id
      )
    order by report.created_at, report.id
  loop
    perform private.lock_property_visit_work(v_damage.property_id);
    perform 1
    from public.damage_reports report
    where report.id = v_damage.damage_report_id
    for update;
    perform 1
    from public.visit_tasks task
    where task.id = v_damage.task_id
      and task.status = 'open'
    for update;

    update public.damage_reports
    set status = 'reviewed',
        planned_next_visit = true,
        linked_visit_id = null,
        linked_visit_task_id = null
    where id = v_damage.damage_report_id;

    delete from public.visit_task_instructions instruction
    where instruction.visit_task_id = v_damage.task_id;
    delete from public.visit_tasks task
    where task.id = v_damage.task_id
      and task.status = 'open';

    perform private.assign_damage_to_next_visit(v_damage.damage_report_id);
  end loop;
end;
$repair_misdirected_damage$;

-- Clean up generated rows that were already in the past when they were
-- created and no longer contain any work after the repair above.
update public.visits visit
set status = 'canceled',
    canceled_at = now(),
    cancellation_reason = 'Automatisch verworfen: Terminzeit lag bereits bei Erstellung in der Vergangenheit'
where visit.status = 'scheduled'
  and visit.visit_plan_id is not null
  and visit.scheduled_start <= clock_timestamp()
  and visit.created_at > visit.scheduled_start
  and not exists (
    select 1
    from public.visit_tasks task
    where task.visit_id = visit.id
  );
