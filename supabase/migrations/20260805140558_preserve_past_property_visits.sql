-- Property archival is prospective as well: overdue visits remain historical
-- operational evidence while current and future scheduled work is canceled.

create or replace function private.set_property_status_unlocked(
  p_property_id uuid,
  p_status text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_property public.properties%rowtype;
  v_today date := (now() at time zone 'Europe/Berlin')::date;
  v_employee_count integer := 0;
  v_equipment_count integer := 0;
  v_plan_count integer := 0;
  v_visit_count integer := 0;
begin
  if v_actor is null or not (select private.is_admin()) then
    raise exception using errcode = '42501', message = 'Nur Administratoren dürfen den Immobilienstatus ändern';
  end if;
  if p_status not in ('planning', 'active', 'paused', 'archived') then
    raise exception 'Ungültiger Immobilienstatus';
  end if;

  if p_status = 'archived' then
    select *
    into v_property
    from public.properties
    where id = p_property_id;
  else
    select *
    into v_property
    from public.properties
    where id = p_property_id
    for update;
  end if;
  if not found then
    raise exception 'Immobilie wurde nicht gefunden';
  end if;
  if v_property.status = 'archived' and p_status <> 'archived' then
    raise exception 'Archivierte Immobilien bleiben aus Revisionsgründen geschlossen';
  end if;
  if v_property.status = p_status then
    return 'unchanged';
  end if;

  if p_status = 'archived' then
    perform 1
    from public.visits
    where property_id = p_property_id
      and status in ('scheduled', 'started')
    order by id
    for update;

    select *
    into v_property
    from public.properties
    where id = p_property_id
    for update;
    if not found then
      raise exception 'Immobilie wurde nicht gefunden';
    end if;
    if v_property.status = 'archived' then
      return 'unchanged';
    end if;

    perform 1
    from public.visits
    where property_id = p_property_id
      and status in ('scheduled', 'started')
    order by id
    for update;

    if exists (
      select 1
      from public.visits
      where property_id = p_property_id
        and status = 'started'
    ) then
      raise exception 'Eine Immobilie mit laufendem Einsatz kann nicht archiviert werden';
    end if;
  end if;

  update public.properties
  set status = p_status,
      archived_at = case when p_status = 'archived' then now() else null end,
      care_end_date = case
        when p_status = 'archived' then greatest(
          v_property.care_start_date,
          least(coalesce(v_property.care_end_date, v_today), v_today)
        )
        else v_property.care_end_date
      end
  where id = p_property_id;

  if p_status = 'archived' then
    update public.property_employee_assignments
    set active = false,
        ends_on = greatest(starts_on, v_today)
    where property_id = p_property_id
      and active = true;
    get diagnostics v_employee_count = row_count;

    update public.property_equipment
    set active = false
    where property_id = p_property_id
      and active = true;
    get diagnostics v_equipment_count = row_count;

    update public.visit_plans
    set status = 'archived'
    where property_id = p_property_id
      and status <> 'archived';
    get diagnostics v_plan_count = row_count;

    update public.visits
    set status = 'canceled',
        canceled_at = now(),
        cancellation_reason = 'Immobilie archiviert',
        manually_adjusted = true
    where property_id = p_property_id
      and status = 'scheduled'
      and scheduled_date >= v_today;
    get diagnostics v_visit_count = row_count;
  end if;

  insert into public.audit_logs (actor_id, action, entity_table, entity_id, metadata)
  values (
    v_actor,
    'property.status_changed',
    'properties',
    p_property_id,
    jsonb_build_object(
      'previous_status', v_property.status,
      'status', p_status,
      'ended_employee_assignments', v_employee_count,
      'ended_equipment_assignments', v_equipment_count,
      'archived_visit_plans', v_plan_count,
      'canceled_visits', v_visit_count
    )
  );
  return p_status;
end;
$$;

revoke all on function private.set_property_status_unlocked(uuid, text)
  from public, anon, authenticated, service_role;
