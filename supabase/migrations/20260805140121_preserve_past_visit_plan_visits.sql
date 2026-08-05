-- Pausing or archiving a visit plan is prospective. Historical scheduled
-- visits remain untouched so the operational record is never rewritten.

create or replace function public.set_visit_plan_status(
  p_property_id uuid,
  p_visit_plan_id uuid,
  p_status text,
  p_expected_status text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_plan_property_id uuid;
  v_property_status text;
  v_plan public.visit_plans%rowtype;
  v_today date := (now() at time zone 'Europe/Berlin')::date;
  v_generated integer := 0;
  v_canceled integer := 0;
begin
  perform private.require_admin();
  if p_status not in ('active', 'paused', 'archived')
    or p_expected_status not in ('active', 'paused', 'archived')
  then
    raise exception using errcode = '22023', message = 'Ungültiger Besuchsplanstatus';
  end if;
  perform private.lock_visit_plan_schedule();

  select property_id
  into v_plan_property_id
  from public.visit_plans
  where id = p_visit_plan_id;
  if not found or v_plan_property_id <> p_property_id then
    raise exception 'Besuchsplan wurde nicht gefunden';
  end if;

  perform 1
  from public.visits
  where visit_plan_id = p_visit_plan_id
    and status in ('scheduled', 'started')
  order by id
  for update;

  select status
  into v_property_status
  from public.properties
  where id = p_property_id
  for update;
  if not found then
    raise exception 'Immobilie wurde nicht gefunden';
  end if;
  if v_property_status = 'archived' then
    raise exception 'Besuchspläne einer archivierten Immobilie können nicht verändert werden';
  end if;

  select *
  into v_plan
  from public.visit_plans
  where id = p_visit_plan_id
    and property_id = p_property_id
  for update;
  if not found then
    raise exception 'Besuchsplan wurde nicht gefunden';
  end if;
  if v_plan.status <> p_expected_status then
    raise exception using errcode = '40001', message = 'Der Besuchsplan wurde zwischenzeitlich geändert';
  end if;
  if v_plan.status = p_status then
    return 'unchanged';
  end if;

  perform 1
  from public.visits
  where visit_plan_id = p_visit_plan_id
    and status in ('scheduled', 'started')
  order by id
  for update;

  if p_status = 'active' then
    perform private.validate_visit_plan_schedule(
      v_plan.label,
      v_plan.frequency,
      v_plan.visits_per_period,
      v_plan.weekdays,
      v_plan.month_days,
      v_plan.desired_time,
      v_plan.window_start,
      v_plan.window_end,
      v_plan.max_visit_minutes
    );
    perform private.validate_visit_plan_configuration(
      p_property_id,
      v_plan.start_date,
      v_plan.end_date,
      v_plan.primary_employee_id,
      array(
        select building_id
        from public.visit_plan_buildings
        where visit_plan_id = p_visit_plan_id
        order by building_id
      ),
      array(
        select employee_id
        from public.visit_plan_employees
        where visit_plan_id = p_visit_plan_id
        order by employee_id
      )
    );
  elsif p_status = 'archived' then
    if exists (
      select 1
      from public.visits
      where visit_plan_id = p_visit_plan_id
        and status = 'started'
    ) then
      raise exception 'Ein Besuchsplan mit laufendem Einsatz kann nicht archiviert werden';
    end if;
    if exists (
      select 1
      from public.visits
      where visit_plan_id = p_visit_plan_id
        and status = 'scheduled'
        and manually_adjusted = true
        and scheduled_date >= v_today
    ) then
      raise exception 'Manuell angepasste Termine müssen vor der Archivierung einzeln geprüft werden';
    end if;
  end if;

  update public.visit_plans
  set status = p_status
  where id = p_visit_plan_id;

  if p_status = 'active' then
    v_generated := public.generate_upcoming_visits(90, p_visit_plan_id);
  else
    update public.visits
    set status = 'canceled',
        canceled_at = now(),
        cancellation_reason = case
          when p_status = 'archived' then 'Besuchsplan archiviert'
          else 'Besuchsplan pausiert'
        end,
        schedule_key = case
          when schedule_key is null then null
          else schedule_key
            || ':plan-status:' || p_status || ':'
            || substr(md5(id::text || now()::text), 1, 12)
        end
    where visit_plan_id = p_visit_plan_id
      and status = 'scheduled'
      and manually_adjusted = false
      and scheduled_date >= v_today;
    get diagnostics v_canceled = row_count;
  end if;

  insert into public.audit_logs (actor_id, action, entity_table, entity_id, metadata)
  values (
    v_actor,
    'visit_plan.status_changed',
    'visit_plans',
    p_visit_plan_id,
    jsonb_build_object(
      'property_id', p_property_id,
      'previous_status', v_plan.status,
      'status', p_status,
      'generated_visits', v_generated,
      'canceled_visits', v_canceled
    )
  );
  return p_status;
end;
$$;

revoke all on function public.set_visit_plan_status(uuid, uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.set_visit_plan_status(uuid, uuid, text, text)
  to authenticated;
