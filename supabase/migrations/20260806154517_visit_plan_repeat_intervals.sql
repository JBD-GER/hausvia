-- Make visit-plan recurrence explicit without changing the legacy frequency
-- values. `repeat_every` is measured in weeks for weekly plans, in months for
-- monthly plans, and in three-month blocks for legacy quarterly plans.

alter table public.visit_plans
  add column repeat_every integer not null default 1;

alter table public.visit_plans
  add constraint visit_plans_repeat_every_range_check
    check (repeat_every between 1 and 60),
  add constraint visit_plans_individual_repeat_every_check
    check (frequency <> 'individual' or repeat_every = 1);

-- The table intentionally uses a column-level SELECT grant. Add the new field
-- explicitly or authenticated `select('*')` requests fail altogether.
grant select (repeat_every) on public.visit_plans to authenticated;

create or replace function private.validate_visit_plan_repeat_interval(
  p_frequency text,
  p_repeat_every integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_repeat_every is null or p_repeat_every < 1 or p_repeat_every > 60 then
    raise exception using
      errcode = '22023',
      message = 'Das Wiederholungsintervall muss zwischen 1 und 60 liegen';
  end if;
  if p_frequency = 'individual' and p_repeat_every <> 1 then
    raise exception using
      errcode = '22023',
      message = 'Einmalige Besuchspläne können kein Wiederholungsintervall haben';
  end if;
end;
$$;

revoke all on function private.validate_visit_plan_repeat_interval(text, integer)
  from public, anon, authenticated, service_role;

-- Preserve the established generation, snapshot and cancellation behavior;
-- only the recurrence match gains an explicit interval anchored at start_date.
create or replace function private.generate_upcoming_visits_unlocked(
  p_horizon_days integer default 90,
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
begin
  if not ((select private.is_admin()) or (select private.is_service_role())) then
    raise exception 'Nur Administratoren dürfen Termine erzeugen';
  end if;
  if p_horizon_days < 1 or p_horizon_days > 366 then
    raise exception 'Der Planungshorizont muss zwischen 1 und 366 Tagen liegen';
  end if;
  v_horizon := v_today + p_horizon_days;

  for v_plan in
    select vp.*
    from public.visit_plans vp
    join public.properties p on p.id = vp.property_id
    where vp.status = 'active'
      and p.status = 'active'
      and (p_plan_id is null or vp.id = p_plan_id)
    order by vp.id
  loop
    -- Plan changes supersede only untouched, future, not-yet-started generated visits.
    update public.visits v
    set status = 'canceled',
        canceled_at = now(),
        cancellation_reason = 'Durch Änderung des Besuchsplans ersetzt',
        schedule_key = v.schedule_key || ':superseded:' || substr(md5(v.id::text || v_plan.updated_at::text), 1, 8)
    where v.visit_plan_id = v_plan.id
      and v.status = 'scheduled'
      and v.manually_adjusted = false
      and v.scheduled_date >= v_today
      and v.created_at < v_plan.updated_at;

    for v_date in
      select gs::date
      from generate_series(
        greatest(v_today, v_plan.start_date)::timestamp,
        least(v_horizon, coalesce(v_plan.end_date, v_horizon))::timestamp,
        interval '1 day'
      ) gs
    loop
      v_matches := false;

      if v_plan.frequency = 'individual' then
        v_matches := v_date = v_plan.start_date;
      elsif v_plan.frequency = 'weekly' then
        v_matches := mod(
          (v_date - v_plan.start_date) / 7,
          v_plan.repeat_every
        ) = 0
        and case
          when cardinality(v_plan.weekdays) > 0
            then extract(isodow from v_date)::integer = any(v_plan.weekdays)
          else extract(isodow from v_date)::integer = extract(isodow from v_plan.start_date)::integer
        end;
      elsif v_plan.frequency = 'monthly' then
        v_matches := mod(
          (extract(year from v_date)::integer * 12 + extract(month from v_date)::integer)
          - (extract(year from v_plan.start_date)::integer * 12 + extract(month from v_plan.start_date)::integer),
          v_plan.repeat_every
        ) = 0
        and case
          when cardinality(v_plan.month_days) > 0
            then extract(day from v_date)::integer = any(v_plan.month_days)
          else extract(day from v_date)::integer = extract(day from v_plan.start_date)::integer
        end;
      elsif v_plan.frequency = 'quarterly' then
        v_matches := mod(
          (extract(year from v_date)::integer * 12 + extract(month from v_date)::integer)
          - (extract(year from v_plan.start_date)::integer * 12 + extract(month from v_plan.start_date)::integer),
          3 * v_plan.repeat_every
        ) = 0
        and case
          when cardinality(v_plan.month_days) > 0
            then extract(day from v_date)::integer = any(v_plan.month_days)
          else extract(day from v_date)::integer = extract(day from v_plan.start_date)::integer
        end;
      end if;

      if not v_matches then continue; end if;

      v_time := coalesce(v_plan.desired_time, v_plan.window_start, time '09:00');
      v_start := (v_date + v_time) at time zone v_plan.timezone;
      v_key := to_char(v_date, 'YYYY-MM-DD') || 'T' || to_char(v_time, 'HH24:MI:SS');
      v_visit_id := null;

      insert into public.visits (
        visit_plan_id, property_id, primary_employee_id, scheduled_date,
        planned_start_time, scheduled_start, window_start, window_end,
        status, schedule_key
      ) values (
        v_plan.id, v_plan.property_id, v_plan.primary_employee_id, v_date,
        v_plan.desired_time, v_start, v_plan.window_start, v_plan.window_end,
        'scheduled', v_key
      )
      on conflict (visit_plan_id, schedule_key)
        where visit_plan_id is not null and schedule_key is not null
      do nothing
      returning id into v_visit_id;

      if v_visit_id is null then continue; end if;
      v_inserted := v_inserted + 1;

      insert into public.visit_admin_metrics (visit_id, max_visit_minutes)
      select v_visit_id, coalesce(v_plan.max_visit_minutes, pas.max_visit_minutes)
      from public.property_admin_settings pas
      where pas.property_id = v_plan.property_id
      on conflict (visit_id) do nothing;

      insert into public.visit_buildings (visit_id, building_id)
      select v_visit_id, vpb.building_id
      from public.visit_plan_buildings vpb
      where vpb.visit_plan_id = v_plan.id
      on conflict do nothing;

      get diagnostics v_row_count = row_count;
      if v_row_count = 0 then
        insert into public.visit_buildings (visit_id, building_id)
        select v_visit_id, b.id
        from public.buildings b
        where b.property_id = v_plan.property_id and b.status = 'active'
        on conflict do nothing;
      end if;

      -- Snapshot both direct property requirements and equipment attached to an
      -- active service. Grouping first avoids a multi-hit ON CONFLICT error when
      -- the same item is required by several buildings or services.
      with equipment_requirements as (
        select pe.equipment_id, pe.required_quantity, pe.rental, pe.provision_note
        from public.property_equipment pe
        join public.equipment catalog_equipment
          on catalog_equipment.id = pe.equipment_id
          and catalog_equipment.status = 'active'
        where pe.property_id = v_plan.property_id
          and pe.active = true
          and (
            pe.seasonal = false
            or public.is_month_in_season(v_date, pe.season_start_month, pe.season_end_month)
          )
          and (
            pe.building_id is null
            or exists (
              select 1 from public.visit_buildings vb
              where vb.visit_id = v_visit_id and vb.building_id = pe.building_id
            )
          )

        union all

        select se.equipment_id, se.required_quantity, false, null::text
        from public.service_equipment se
        join public.property_services ps on ps.id = se.property_service_id
        join public.equipment catalog_equipment
          on catalog_equipment.id = se.equipment_id
          and catalog_equipment.status = 'active'
        where ps.property_id = v_plan.property_id
          and ps.status = 'active'
          and ps.start_date <= v_date
          and (ps.end_date is null or ps.end_date >= v_date)
          and (
            ps.seasonal = false
            or public.is_month_in_season(v_date, ps.season_start_month, ps.season_end_month)
          )
          and (
            not exists (
              select 1 from public.property_service_buildings scoped
              where scoped.property_service_id = ps.id
            )
            or exists (
              select 1
              from public.property_service_buildings scoped
              join public.visit_buildings vb on vb.building_id = scoped.building_id
              where scoped.property_service_id = ps.id
                and vb.visit_id = v_visit_id
            )
          )
      )
      insert into public.visit_equipment (
        visit_id, equipment_id, required_quantity, rental, provision_note
      )
      select
        v_visit_id,
        requirement.equipment_id,
        max(requirement.required_quantity),
        bool_or(requirement.rental),
        (array_agg(requirement.provision_note order by requirement.provision_note)
          filter (where requirement.provision_note is not null))[1]
      from equipment_requirements requirement
      group by requirement.equipment_id
      on conflict (visit_id, equipment_id) do update
        set required_quantity = greatest(public.visit_equipment.required_quantity, excluded.required_quantity),
            rental = public.visit_equipment.rental or excluded.rental,
            provision_note = coalesce(public.visit_equipment.provision_note, excluded.provision_note);
    end loop;
  end loop;

  return v_inserted;
end;
$$;

revoke all on function private.generate_upcoming_visits_unlocked(integer, uuid)
  from public, anon, authenticated, service_role;

create or replace function public.create_visit_plan_configuration_v2(
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
  v_weekdays integer[] := coalesce(p_weekdays, array[]::integer[]);
  v_month_days integer[] := coalesce(p_month_days, array[]::integer[]);
  v_building_ids uuid[] := coalesce(p_building_ids, array[]::uuid[]);
  v_additional_employee_ids uuid[] := coalesce(
    p_additional_employee_ids,
    array[]::uuid[]
  );
  v_visits_per_period integer;
  v_plan_id uuid := gen_random_uuid();
  v_generated integer := 0;
begin
  perform private.require_admin();
  perform private.lock_visit_plan_schedule();

  v_visits_per_period := case
    when p_frequency = 'individual' then 1
    when p_frequency = 'weekly' then greatest(cardinality(v_weekdays), 1)
    when p_frequency in ('monthly', 'quarterly')
      then greatest(cardinality(v_month_days), 1)
    else 1
  end;

  perform private.validate_visit_plan_schedule(
    p_label,
    p_frequency,
    v_visits_per_period,
    v_weekdays,
    v_month_days,
    p_desired_time,
    p_window_start,
    p_window_end,
    p_max_visit_minutes
  );
  perform private.validate_visit_plan_repeat_interval(
    p_frequency,
    p_repeat_every
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
    id, property_id, label, frequency, repeat_every, visits_per_period,
    weekdays, month_days, desired_time, window_start, window_end, start_date,
    end_date, primary_employee_id, max_visit_minutes, status, created_by
  ) values (
    v_plan_id, p_property_id, btrim(p_label), p_frequency, p_repeat_every,
    v_visits_per_period, v_weekdays, v_month_days, p_desired_time,
    p_window_start, p_window_end, p_start_date, p_end_date,
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
      'repeat_every', v_plan.repeat_every,
      'visits_per_period', v_plan.visits_per_period,
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

revoke all on function public.create_visit_plan_configuration_v2(
  uuid, text, text, integer, integer[], integer[], time, time, time, date,
  date, uuid, integer, uuid[], uuid[]
) from public, anon, authenticated, service_role;
grant execute on function public.create_visit_plan_configuration_v2(
  uuid, text, text, integer, integer[], integer[], time, time, time, date,
  date, uuid, integer, uuid[], uuid[]
) to authenticated;

create or replace function public.update_visit_plan_configuration_v2(
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
  v_weekdays integer[] := coalesce(p_weekdays, array[]::integer[]);
  v_month_days integer[] := coalesce(p_month_days, array[]::integer[]);
  v_building_ids uuid[] := coalesce(p_building_ids, array[]::uuid[]);
  v_additional_employee_ids uuid[] := coalesce(
    p_additional_employee_ids,
    array[]::uuid[]
  );
  v_visits_per_period integer;
  v_previous_building_ids uuid[];
  v_previous_employee_ids uuid[];
  v_generated integer := 0;
begin
  perform private.require_admin();
  perform private.lock_visit_plan_schedule();

  v_visits_per_period := case
    when p_frequency = 'individual' then 1
    when p_frequency = 'weekly' then greatest(cardinality(v_weekdays), 1)
    when p_frequency in ('monthly', 'quarterly')
      then greatest(cardinality(v_month_days), 1)
    else 1
  end;

  perform private.validate_visit_plan_schedule(
    p_label,
    p_frequency,
    v_visits_per_period,
    v_weekdays,
    v_month_days,
    p_desired_time,
    p_window_start,
    p_window_end,
    p_max_visit_minutes
  );
  perform private.validate_visit_plan_repeat_interval(
    p_frequency,
    p_repeat_every
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
      repeat_every = p_repeat_every,
      visits_per_period = v_visits_per_period,
      weekdays = v_weekdays,
      month_days = v_month_days,
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
        'repeat_every', v_plan.repeat_every,
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
        'repeat_every', v_updated_plan.repeat_every,
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

revoke all on function public.update_visit_plan_configuration_v2(
  uuid, uuid, timestamptz, text, text, integer, integer[], integer[], time,
  time, time, date, date, uuid, integer, uuid[], uuid[]
) from public, anon, authenticated, service_role;
grant execute on function public.update_visit_plan_configuration_v2(
  uuid, uuid, timestamptz, text, text, integer, integer[], integer[], time,
  time, time, date, date, uuid, integer, uuid[], uuid[]
) to authenticated;
