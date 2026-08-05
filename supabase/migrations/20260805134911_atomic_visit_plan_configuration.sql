-- Visit-plan configuration spans the plan, building/employee links, audit and
-- visit generation. Keep every part in one transaction and use the same
-- visit -> property lock order as property archival.

create or replace function private.lock_visit_plan_schedule()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'hausvia.visit-plan-configuration-and-generation',
      0
    )
  );
end;
$$;

revoke all on function private.lock_visit_plan_schedule()
  from public, anon, authenticated, service_role;

-- Preserve the proven generator body as a private implementation. The public
-- wrapper takes all relevant schedule locks before that implementation reads
-- a plan, so a waiting cron never resumes with a stale plan record.
alter function public.generate_upcoming_visits(integer, uuid)
  rename to generate_upcoming_visits_unlocked;
alter function public.generate_upcoming_visits_unlocked(integer, uuid)
  set schema private;
revoke all on function private.generate_upcoming_visits_unlocked(integer, uuid)
  from public, anon, authenticated, service_role;

create or replace function public.generate_upcoming_visits(
  p_horizon_days integer default 90,
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
    p_horizon_days,
    p_plan_id
  );
end;
$$;

revoke all on function public.generate_upcoming_visits(integer, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.generate_upcoming_visits(integer, uuid)
  to authenticated, service_role;

create or replace function private.validate_visit_plan_schedule(
  p_label text,
  p_frequency text,
  p_visits_per_period integer,
  p_weekdays integer[],
  p_month_days integer[],
  p_desired_time time,
  p_window_start time,
  p_window_end time,
  p_max_visit_minutes integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_weekdays integer[] := coalesce(p_weekdays, array[]::integer[]);
  v_month_days integer[] := coalesce(p_month_days, array[]::integer[]);
  v_expected_visits integer;
begin
  if p_label is null
    or btrim(p_label) = ''
    or char_length(btrim(p_label)) > 180
  then
    raise exception using errcode = '22023', message = 'Die Planbezeichnung muss zwischen 1 und 180 Zeichen lang sein';
  end if;
  if p_frequency is null
    or p_frequency not in ('weekly', 'monthly', 'quarterly', 'individual')
  then
    raise exception using errcode = '22023', message = 'Ungültige Besuchsfrequenz';
  end if;
  if p_visits_per_period is null
    or p_visits_per_period < 1
    or p_visits_per_period > 31
  then
    raise exception using errcode = '22023', message = 'Die Besuchsanzahl muss zwischen 1 und 31 liegen';
  end if;
  if p_max_visit_minutes is null
    or p_max_visit_minutes < 1
    or p_max_visit_minutes > 1440
  then
    raise exception using errcode = '22023', message = 'Die maximale Einsatzdauer muss zwischen 1 und 1440 Minuten liegen';
  end if;

  if coalesce(array_ndims(v_weekdays), 1) <> 1
    or coalesce(array_ndims(v_month_days), 1) <> 1
  then
    raise exception using errcode = '22023', message = 'Wochentage und Monatstage müssen eindimensionale Listen sein';
  end if;
  if array_position(v_weekdays, null) is not null
    or array_position(v_month_days, null) is not null
  then
    raise exception using errcode = '22023', message = 'Leere Wochentage oder Monatstage sind nicht zulässig';
  end if;
  if cardinality(v_weekdays) <> (
    select count(distinct selected.day)
    from unnest(v_weekdays) as selected(day)
  ) or cardinality(v_month_days) <> (
    select count(distinct selected.day)
    from unnest(v_month_days) as selected(day)
  ) then
    raise exception using errcode = '22023', message = 'Wochentage und Monatstage dürfen nicht doppelt vorkommen';
  end if;
  if exists (
    select 1 from unnest(v_weekdays) as selected(day)
    where selected.day not between 1 and 7
  ) or exists (
    select 1 from unnest(v_month_days) as selected(day)
    where selected.day not between 1 and 31
  ) then
    raise exception using errcode = '22023', message = 'Ungültiger Wochen- oder Monatstag';
  end if;

  if p_frequency = 'individual' then
    v_expected_visits := 1;
  elsif p_frequency = 'weekly' then
    v_expected_visits := greatest(cardinality(v_weekdays), 1);
  else
    v_expected_visits := greatest(cardinality(v_month_days), 1);
  end if;
  if p_visits_per_period <> v_expected_visits then
    raise exception using errcode = '22023', message = 'Die Besuchsanzahl passt nicht zu den ausgewählten Tagen';
  end if;

  if not (
    (p_desired_time is not null and p_window_start is null and p_window_end is null)
    or (
      p_desired_time is null
      and p_window_start is not null
      and p_window_end is not null
      and p_window_end > p_window_start
    )
  ) then
    raise exception using errcode = '22023', message = 'Bitte entweder eine feste Uhrzeit oder ein vollständiges gültiges Zeitfenster angeben';
  end if;
end;
$$;

revoke all on function private.validate_visit_plan_schedule(
  text, text, integer, integer[], integer[], time, time, time, integer
) from public, anon, authenticated, service_role;

create or replace function private.validate_visit_plan_configuration(
  p_property_id uuid,
  p_start_date date,
  p_end_date date,
  p_primary_employee_id uuid,
  p_building_ids uuid[],
  p_additional_employee_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_building_ids uuid[] := coalesce(p_building_ids, array[]::uuid[]);
  v_additional_employee_ids uuid[] := coalesce(
    p_additional_employee_ids,
    array[]::uuid[]
  );
  v_employee_ids uuid[];
  v_employee_id uuid;
  v_employee_status text;
  v_assignment public.property_employee_assignments%rowtype;
  v_building record;
  v_building_count integer := 0;
begin
  if p_primary_employee_id is null then
    raise exception 'Ein primärer Mitarbeiter ist erforderlich';
  end if;
  if p_start_date is null or (p_end_date is not null and p_end_date < p_start_date) then
    raise exception 'Der Besuchsplan benötigt einen gültigen Zeitraum';
  end if;
  if array_position(v_building_ids, null) is not null
    or array_position(v_additional_employee_ids, null) is not null
  then
    raise exception 'Leere Gebäude- oder Mitarbeiterbezüge sind nicht zulässig';
  end if;
  if coalesce(array_ndims(v_building_ids), 1) <> 1
    or coalesce(array_ndims(v_additional_employee_ids), 1) <> 1
  then
    raise exception using errcode = '22023', message = 'Gebäude- und Mitarbeiterbezüge müssen eindimensionale Listen sein';
  end if;
  if cardinality(v_building_ids) <> (
    select count(distinct selected.building_id)
    from unnest(v_building_ids) as selected(building_id)
  ) then
    raise exception 'Gebäude dürfen nicht mehrfach ausgewählt werden';
  end if;
  if cardinality(v_additional_employee_ids) <> (
    select count(distinct selected.employee_id)
    from unnest(v_additional_employee_ids) as selected(employee_id)
  ) then
    raise exception 'Weitere Mitarbeiter dürfen nicht mehrfach ausgewählt werden';
  end if;
  if p_primary_employee_id = any(v_additional_employee_ids) then
    raise exception 'Der primäre Mitarbeiter darf nicht zusätzlich ausgewählt werden';
  end if;

  v_employee_ids := array[p_primary_employee_id] || v_additional_employee_ids;
  for v_employee_id in
    select selected.employee_id
    from unnest(v_employee_ids) as selected(employee_id)
    order by selected.employee_id
  loop
    select status
    into v_employee_status
    from public.employee_profiles
    where id = v_employee_id
    for update;
    if not found or v_employee_status <> 'active' then
      raise exception 'Mindestens ein ausgewählter Mitarbeiter ist nicht aktiv';
    end if;

    select *
    into v_assignment
    from public.property_employee_assignments
    where property_id = p_property_id
      and employee_id = v_employee_id
    for update;
    if not found
      or not v_assignment.active
      or v_assignment.starts_on > p_start_date
      or (
        p_end_date is null
        and v_assignment.ends_on is not null
      )
      or (
        p_end_date is not null
        and v_assignment.ends_on is not null
        and v_assignment.ends_on < p_end_date
      )
    then
      raise exception 'Alle Mitarbeiter müssen für den vollständigen Planzeitraum aktiv zugeordnet sein';
    end if;
  end loop;

  for v_building in
    select building.id, building.property_id, building.status
    from public.buildings as building
    where building.id = any(v_building_ids)
    order by building.id
    for update
  loop
    v_building_count := v_building_count + 1;
    if v_building.property_id <> p_property_id or v_building.status <> 'active' then
      raise exception 'Mindestens ein Gebäude ist nicht aktiv oder gehört nicht zur Immobilie';
    end if;
  end loop;
  if v_building_count <> cardinality(v_building_ids) then
    raise exception 'Mindestens ein Gebäude wurde nicht gefunden';
  end if;
end;
$$;

revoke all on function private.validate_visit_plan_configuration(
  uuid, date, date, uuid, uuid[], uuid[]
) from public, anon, authenticated, service_role;

create or replace function public.create_visit_plan_configuration(
  p_property_id uuid,
  p_label text,
  p_frequency text,
  p_visits_per_period integer,
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
  p_additional_employee_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_property_status text;
  v_plan public.visit_plans%rowtype;
  v_building_ids uuid[] := coalesce(p_building_ids, array[]::uuid[]);
  v_additional_employee_ids uuid[] := coalesce(
    p_additional_employee_ids,
    array[]::uuid[]
  );
  v_plan_id uuid := gen_random_uuid();
  v_generated integer := 0;
begin
  perform private.require_admin();
  perform private.lock_visit_plan_schedule();
  perform private.validate_visit_plan_schedule(
    p_label,
    p_frequency,
    p_visits_per_period,
    p_weekdays,
    p_month_days,
    p_desired_time,
    p_window_start,
    p_window_end,
    p_max_visit_minutes
  );

  select status
  into v_property_status
  from public.properties
  where id = p_property_id
  for update;
  if not found then
    raise exception 'Immobilie wurde nicht gefunden';
  end if;
  if v_property_status = 'archived' then
    raise exception 'Archivierte Immobilien können keine Besuchspläne erhalten';
  end if;

  perform private.validate_visit_plan_configuration(
    p_property_id,
    p_start_date,
    p_end_date,
    p_primary_employee_id,
    v_building_ids,
    v_additional_employee_ids
  );
  select coalesce(
    array_agg(selected.building_id order by selected.building_id),
    array[]::uuid[]
  )
  into v_building_ids
  from unnest(v_building_ids) as selected(building_id);
  select coalesce(
    array_agg(selected.employee_id order by selected.employee_id),
    array[]::uuid[]
  )
  into v_additional_employee_ids
  from unnest(v_additional_employee_ids) as selected(employee_id);

  insert into public.visit_plans (
    id, property_id, label, frequency, visits_per_period, weekdays, month_days,
    desired_time, window_start, window_end, start_date, end_date,
    primary_employee_id, max_visit_minutes, status, created_by
  ) values (
    v_plan_id, p_property_id, btrim(p_label), p_frequency, p_visits_per_period,
    coalesce(p_weekdays, array[]::integer[]),
    coalesce(p_month_days, array[]::integer[]),
    p_desired_time, p_window_start, p_window_end, p_start_date, p_end_date,
    p_primary_employee_id, p_max_visit_minutes, 'active', v_actor
  )
  returning * into v_plan;

  insert into public.visit_plan_buildings (visit_plan_id, building_id)
  select v_plan.id, selected.building_id
  from unnest(v_building_ids) as selected(building_id);

  insert into public.visit_plan_employees (visit_plan_id, employee_id)
  select v_plan.id, selected.employee_id
  from unnest(v_additional_employee_ids) as selected(employee_id);

  v_generated := public.generate_upcoming_visits(90, v_plan.id);

  insert into public.audit_logs (actor_id, action, entity_table, entity_id, metadata)
  values (
    v_actor,
    'visit_plan.created',
    'visit_plans',
    v_plan.id,
    jsonb_build_object(
      'property_id', p_property_id,
      'building_ids', to_jsonb(v_building_ids),
      'additional_employee_ids', to_jsonb(v_additional_employee_ids),
      'generated_visits', v_generated
    )
  );

  return jsonb_build_object(
    'visit_plan_id', v_plan.id,
    'updated_at', v_plan.updated_at,
    'generated_visits', v_generated
  );
end;
$$;

revoke all on function public.create_visit_plan_configuration(
  uuid, text, text, integer, integer[], integer[], time, time, time, date,
  date, uuid, integer, uuid[], uuid[]
) from public, anon, authenticated, service_role;
grant execute on function public.create_visit_plan_configuration(
  uuid, text, text, integer, integer[], integer[], time, time, time, date,
  date, uuid, integer, uuid[], uuid[]
) to authenticated;

create or replace function public.update_visit_plan_configuration(
  p_property_id uuid,
  p_visit_plan_id uuid,
  p_expected_updated_at timestamptz,
  p_label text,
  p_frequency text,
  p_visits_per_period integer,
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
  p_additional_employee_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_plan_property_id uuid;
  v_property_status text;
  v_plan public.visit_plans%rowtype;
  v_updated_plan public.visit_plans%rowtype;
  v_building_ids uuid[] := coalesce(p_building_ids, array[]::uuid[]);
  v_additional_employee_ids uuid[] := coalesce(
    p_additional_employee_ids,
    array[]::uuid[]
  );
  v_previous_building_ids uuid[];
  v_previous_employee_ids uuid[];
  v_generated integer := 0;
begin
  perform private.require_admin();
  perform private.lock_visit_plan_schedule();
  perform private.validate_visit_plan_schedule(
    p_label,
    p_frequency,
    p_visits_per_period,
    p_weekdays,
    p_month_days,
    p_desired_time,
    p_window_start,
    p_window_end,
    p_max_visit_minutes
  );

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
    raise exception 'Besuchspläne einer archivierten Immobilie können nicht geändert werden';
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
  if p_expected_updated_at is null or v_plan.updated_at <> p_expected_updated_at then
    raise exception using errcode = '40001', message = 'Der Besuchsplan wurde zwischenzeitlich geändert';
  end if;

  perform 1
  from public.visits
  where visit_plan_id = p_visit_plan_id
    and status in ('scheduled', 'started')
  order by id
  for update;

  perform private.validate_visit_plan_configuration(
    p_property_id,
    p_start_date,
    p_end_date,
    p_primary_employee_id,
    v_building_ids,
    v_additional_employee_ids
  );
  select coalesce(
    array_agg(selected.building_id order by selected.building_id),
    array[]::uuid[]
  )
  into v_building_ids
  from unnest(v_building_ids) as selected(building_id);
  select coalesce(
    array_agg(selected.employee_id order by selected.employee_id),
    array[]::uuid[]
  )
  into v_additional_employee_ids
  from unnest(v_additional_employee_ids) as selected(employee_id);

  perform 1
  from public.visit_plan_buildings
  where visit_plan_id = p_visit_plan_id
  order by building_id
  for update;
  perform 1
  from public.visit_plan_employees
  where visit_plan_id = p_visit_plan_id
  order by employee_id
  for update;

  select coalesce(array_agg(building_id order by building_id), array[]::uuid[])
  into v_previous_building_ids
  from public.visit_plan_buildings
  where visit_plan_id = p_visit_plan_id;

  select coalesce(array_agg(employee_id order by employee_id), array[]::uuid[])
  into v_previous_employee_ids
  from public.visit_plan_employees
  where visit_plan_id = p_visit_plan_id;

  update public.visit_plans
  set label = btrim(p_label),
      frequency = p_frequency,
      visits_per_period = p_visits_per_period,
      weekdays = coalesce(p_weekdays, array[]::integer[]),
      month_days = coalesce(p_month_days, array[]::integer[]),
      desired_time = p_desired_time,
      window_start = p_window_start,
      window_end = p_window_end,
      start_date = p_start_date,
      end_date = p_end_date,
      primary_employee_id = p_primary_employee_id,
      max_visit_minutes = p_max_visit_minutes
  where id = p_visit_plan_id
  returning * into v_updated_plan;

  delete from public.visit_plan_buildings
  where visit_plan_id = p_visit_plan_id
    and not (building_id = any(v_building_ids));
  insert into public.visit_plan_buildings (visit_plan_id, building_id)
  select p_visit_plan_id, selected.building_id
  from unnest(v_building_ids) as selected(building_id)
  on conflict (visit_plan_id, building_id) do nothing;

  delete from public.visit_plan_employees
  where visit_plan_id = p_visit_plan_id
    and not (employee_id = any(v_additional_employee_ids));
  insert into public.visit_plan_employees (visit_plan_id, employee_id)
  select p_visit_plan_id, selected.employee_id
  from unnest(v_additional_employee_ids) as selected(employee_id)
  on conflict (visit_plan_id, employee_id) do nothing;

  if v_plan.status = 'active' then
    v_generated := public.generate_upcoming_visits(90, p_visit_plan_id);
  end if;

  insert into public.audit_logs (actor_id, action, entity_table, entity_id, metadata)
  values (
    v_actor,
    'visit_plan.updated',
    'visit_plans',
    p_visit_plan_id,
    jsonb_build_object(
      'property_id', p_property_id,
      'previous', jsonb_build_object(
        'label', v_plan.label,
        'frequency', v_plan.frequency,
        'visits_per_period', v_plan.visits_per_period,
        'weekdays', to_jsonb(v_plan.weekdays),
        'month_days', to_jsonb(v_plan.month_days),
        'desired_time', v_plan.desired_time,
        'window_start', v_plan.window_start,
        'window_end', v_plan.window_end,
        'start_date', v_plan.start_date,
        'end_date', v_plan.end_date,
        'primary_employee_id', v_plan.primary_employee_id,
        'max_visit_minutes', v_plan.max_visit_minutes,
        'building_ids', to_jsonb(v_previous_building_ids),
        'additional_employee_ids', to_jsonb(v_previous_employee_ids)
      ),
      'next', jsonb_build_object(
        'label', v_updated_plan.label,
        'frequency', v_updated_plan.frequency,
        'visits_per_period', v_updated_plan.visits_per_period,
        'weekdays', to_jsonb(v_updated_plan.weekdays),
        'month_days', to_jsonb(v_updated_plan.month_days),
        'desired_time', v_updated_plan.desired_time,
        'window_start', v_updated_plan.window_start,
        'window_end', v_updated_plan.window_end,
        'start_date', v_updated_plan.start_date,
        'end_date', v_updated_plan.end_date,
        'primary_employee_id', v_updated_plan.primary_employee_id,
        'max_visit_minutes', v_updated_plan.max_visit_minutes,
        'building_ids', to_jsonb(v_building_ids),
        'additional_employee_ids', to_jsonb(v_additional_employee_ids)
      ),
      'generated_visits', v_generated
    )
  );

  return jsonb_build_object(
    'visit_plan_id', v_updated_plan.id,
    'updated_at', v_updated_plan.updated_at,
    'generated_visits', v_generated
  );
end;
$$;

revoke all on function public.update_visit_plan_configuration(
  uuid, uuid, timestamptz, text, text, integer, integer[], integer[], time,
  time, time, date, date, uuid, integer, uuid[], uuid[]
) from public, anon, authenticated, service_role;
grant execute on function public.update_visit_plan_configuration(
  uuid, uuid, timestamptz, text, text, integer, integer[], integer[], time,
  time, time, date, date, uuid, integer, uuid[], uuid[]
) to authenticated;

-- Align activation with property archival: both lock open visits first and the
-- parent property second before changing state or generating more visits.
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
      and (p_status = 'archived' or scheduled_date >= v_today);
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
