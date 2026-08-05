-- Property archival and employee assignment changes are authorization
-- boundaries. Keep the domain mutation and its audit entry in one database
-- transaction and make archived properties inaccessible to employees even if
-- a stale assignment row were introduced outside the application.

create or replace function private.is_employee_of_property(p_property_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.property_employee_assignments pea
    join public.employee_profiles ep on ep.id = pea.employee_id
    join public.user_profiles up on up.id = ep.user_id
    join public.properties property on property.id = pea.property_id
    where pea.property_id = p_property_id
      and pea.employee_id = (select private.current_employee_id())
      and pea.active = true
      and pea.starts_on <= ((now() at time zone 'Europe/Berlin')::date)
      and (pea.ends_on is null or pea.ends_on >= ((now() at time zone 'Europe/Berlin')::date))
      and ep.status = 'active'
      and up.status = 'active'
      and up.onboarding_completed = true
      and property.status <> 'archived'
  )
$$;

-- A plan edit must not strand the employee who already started a visit. The
-- server-side starter remains allowed to finish that one active visit while
-- current property assignment and active-account checks still apply.
create or replace function private.can_work_visit(p_visit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.visits v
    where v.id = p_visit_id
      and (select private.is_employee_of_property(v.property_id))
      and (
        (v.status = 'started' and v.started_by = (select auth.uid()))
        or v.primary_employee_id = (select private.current_employee_id())
        or exists (
          select 1
          from public.visit_plan_employees vpe
          where vpe.visit_plan_id = v.visit_plan_id
            and vpe.employee_id = (select private.current_employee_id())
        )
        or (
          v.primary_employee_id is null
          and not exists (
            select 1
            from public.visit_plan_employees assigned
            where assigned.visit_plan_id = v.visit_plan_id
          )
          and (select private.is_employee_of_property(v.property_id))
        )
      )
  )
$$;

create or replace function public.set_property_employee_assignment(
  p_property_id uuid,
  p_employee_id uuid,
  p_active boolean,
  p_expected_updated_at timestamptz
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_property_status text;
  v_employee_status text;
  v_assignment public.property_employee_assignments%rowtype;
  v_today date := (now() at time zone 'Europe/Berlin')::date;
begin
  if v_actor is null or not (select private.is_admin()) then
    raise exception using errcode = '42501', message = 'Nur Administratoren dürfen Mitarbeiter zuordnen';
  end if;

  select status
  into v_property_status
  from public.properties
  where id = p_property_id
  for update;
  if not found then
    raise exception 'Immobilie wurde nicht gefunden';
  end if;

  select status
  into v_employee_status
  from public.employee_profiles
  where id = p_employee_id
  for update;
  if not found then
    raise exception 'Mitarbeiter wurde nicht gefunden';
  end if;

  select *
  into v_assignment
  from public.property_employee_assignments
  where property_id = p_property_id
    and employee_id = p_employee_id
  for update;

  if coalesce(p_active, false) then
    if v_property_status = 'archived' then
      raise exception 'Archivierten Immobilien können keine Mitarbeiter zugeordnet werden';
    end if;
    if v_employee_status not in ('active', 'invited') then
      raise exception 'Der Mitarbeiter ist nicht für eine Zuordnung verfügbar';
    end if;

    if v_assignment.property_id is null then
      insert into public.property_employee_assignments (
        property_id, employee_id, assigned_by, active, starts_on, ends_on
      ) values (
        p_property_id, p_employee_id, v_actor, true, v_today, null
      );
    else
      update public.property_employee_assignments
      set assigned_by = v_actor,
          active = true,
          starts_on = case when v_assignment.active then v_assignment.starts_on else v_today end,
          ends_on = null
      where property_id = p_property_id
        and employee_id = p_employee_id;
    end if;

    insert into public.audit_logs (actor_id, action, entity_table, entity_id, metadata)
    values (
      v_actor,
      case
        when v_assignment.property_id is null then 'property.employee_assigned'
        when not v_assignment.active then 'property.employee_reactivated'
        else 'property.employee_assignment_confirmed'
      end,
      'property_employee_assignments',
      p_property_id,
      jsonb_build_object(
        'employee_id', p_employee_id,
        'previous', case
          when v_assignment.property_id is null then null
          else jsonb_build_object(
            'active', v_assignment.active,
            'starts_on', v_assignment.starts_on,
            'ends_on', v_assignment.ends_on,
            'assigned_by', v_assignment.assigned_by,
            'updated_at', v_assignment.updated_at
          )
        end,
        'starts_on', case
          when v_assignment.property_id is null or not v_assignment.active then v_today
          else v_assignment.starts_on
        end,
        'ends_on', null
      )
    );
    return case when v_assignment.property_id is null then 'assigned' else 'active' end;
  end if;

  if v_assignment.property_id is null or not v_assignment.active then
    raise exception 'Aktive Mitarbeiterzuordnung wurde nicht gefunden';
  end if;
  if p_expected_updated_at is null or v_assignment.updated_at <> p_expected_updated_at then
    raise exception 'Die Mitarbeiterzuordnung wurde zwischenzeitlich geändert';
  end if;

  update public.property_employee_assignments
  set active = false,
      ends_on = greatest(v_assignment.starts_on, v_today)
  where property_id = p_property_id
    and employee_id = p_employee_id;

  insert into public.audit_logs (actor_id, action, entity_table, entity_id, metadata)
  values (
    v_actor,
    'property.employee_unassigned',
    'property_employee_assignments',
    p_property_id,
    jsonb_build_object(
      'employee_id', p_employee_id,
      'previous', jsonb_build_object(
        'active', v_assignment.active,
        'starts_on', v_assignment.starts_on,
        'ends_on', v_assignment.ends_on,
        'assigned_by', v_assignment.assigned_by,
        'updated_at', v_assignment.updated_at
      ),
      'ends_on', greatest(v_assignment.starts_on, v_today)
    )
  );
  return 'ended';
end;
$$;

revoke all on function public.set_property_employee_assignment(
  uuid, uuid, boolean, timestamptz
) from public, anon, authenticated;
grant execute on function public.set_property_employee_assignment(
  uuid, uuid, boolean, timestamptz
) to authenticated;

create or replace function public.set_building_status(
  p_property_id uuid,
  p_building_id uuid,
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
  v_property_status text;
  v_building public.buildings%rowtype;
  v_active_count integer;
begin
  if v_actor is null or not (select private.is_admin()) then
    raise exception using errcode = '42501', message = 'Nur Administratoren dürfen den Gebäudestatus ändern';
  end if;
  if p_status not in ('active', 'archived')
    or p_expected_status not in ('active', 'archived')
  then
    raise exception 'Ungültiger Gebäudestatus';
  end if;

  select status
  into v_property_status
  from public.properties
  where id = p_property_id
  for update;
  if not found then
    raise exception 'Immobilie wurde nicht gefunden';
  end if;
  if v_property_status = 'archived' then
    raise exception 'Gebäude einer archivierten Immobilie können nicht verändert werden';
  end if;

  perform 1
  from public.buildings
  where property_id = p_property_id
  order by id
  for update;

  select *
  into v_building
  from public.buildings
  where id = p_building_id
    and property_id = p_property_id;
  if not found then
    raise exception 'Gebäude wurde nicht gefunden';
  end if;
  if v_building.status <> p_expected_status then
    raise exception 'Das Gebäude wurde zwischenzeitlich geändert';
  end if;
  if v_building.status = p_status then
    return 'unchanged';
  end if;

  if p_status = 'archived' then
    select count(*)::integer
    into v_active_count
    from public.buildings
    where property_id = p_property_id
      and status = 'active';
    if v_active_count <= 1 then
      raise exception 'Das letzte aktive Gebäude einer Immobilie kann nicht archiviert werden';
    end if;

    if exists (
      select 1
      from public.property_service_buildings psb
      join public.property_services ps on ps.id = psb.property_service_id
      where psb.building_id = p_building_id
        and ps.property_id = p_property_id
        and ps.status <> 'archived'
    ) or exists (
      select 1
      from public.property_equipment pe
      where pe.property_id = p_property_id
        and pe.building_id = p_building_id
        and pe.active = true
    ) or exists (
      select 1
      from public.visit_plan_buildings vpb
      join public.visit_plans vp on vp.id = vpb.visit_plan_id
      where vpb.building_id = p_building_id
        and vp.property_id = p_property_id
        and vp.status <> 'archived'
    ) or exists (
      select 1
      from public.visit_buildings vb
      join public.visits v on v.id = vb.visit_id
      where vb.building_id = p_building_id
        and v.property_id = p_property_id
        and v.status in ('scheduled', 'started')
    ) then
      raise exception 'Gebäude ist noch in aktiven Leistungen, Equipmentzuordnungen, Besuchsplänen oder offenen Einsätzen referenziert';
    end if;
  end if;

  update public.buildings
  set status = p_status,
      archived_at = case when p_status = 'archived' then now() else null end
  where id = p_building_id
    and property_id = p_property_id;

  insert into public.audit_logs (actor_id, action, entity_table, entity_id, metadata)
  values (
    v_actor,
    'building.status_changed',
    'buildings',
    p_building_id,
    jsonb_build_object(
      'property_id', p_property_id,
      'previous_status', v_building.status,
      'status', p_status
    )
  );
  return p_status;
end;
$$;

revoke all on function public.set_building_status(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.set_building_status(uuid, uuid, text, text)
  to authenticated;

create or replace function private.require_open_building_parent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_property_status text;
begin
  select status
  into v_property_status
  from public.properties
  where id = new.property_id
  for key share nowait;
  if not found then
    raise exception 'Immobilie wurde nicht gefunden';
  end if;
  if v_property_status = 'archived' then
    raise exception 'Gebäude einer archivierten Immobilie können nicht verändert werden';
  end if;
  return new;
end;
$$;

drop trigger if exists buildings_require_open_parent on public.buildings;
create trigger buildings_require_open_parent
before insert or update on public.buildings
for each row execute function private.require_open_building_parent();

-- Every forward-looking building link must serialize with building archival.
-- Existing completed-visit links stay untouched and therefore remain valid
-- historical evidence.
create or replace function private.require_active_linked_building()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  select status
  into v_status
  from public.buildings
  where id = new.building_id
  for key share;
  if not found then
    raise exception 'Gebäude wurde nicht gefunden';
  end if;
  if v_status <> 'active' then
    raise exception 'Archivierte Gebäude können nicht neu zugeordnet werden';
  end if;
  return new;
end;
$$;

drop trigger if exists property_service_buildings_require_active
  on public.property_service_buildings;
create trigger property_service_buildings_require_active
before insert or update of building_id on public.property_service_buildings
for each row execute function private.require_active_linked_building();

drop trigger if exists visit_plan_buildings_require_active
  on public.visit_plan_buildings;
create trigger visit_plan_buildings_require_active
before insert or update of building_id on public.visit_plan_buildings
for each row execute function private.require_active_linked_building();

drop trigger if exists visit_buildings_require_active
  on public.visit_buildings;
create trigger visit_buildings_require_active
before insert or update of building_id on public.visit_buildings
for each row execute function private.require_active_linked_building();

drop trigger if exists property_equipment_require_active_building
  on public.property_equipment;
create trigger property_equipment_require_active_building
before insert or update of building_id on public.property_equipment
for each row
when (new.building_id is not null)
execute function private.require_active_linked_building();

create or replace function private.require_active_visit_plan_buildings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_building record;
begin
  if new.status <> 'active' then
    return new;
  end if;

  for v_building in
    select building.id, building.status
    from public.visit_plan_buildings as link
    join public.buildings as building on building.id = link.building_id
    where link.visit_plan_id = new.id
    order by building.id
    for key share of building
  loop
    if v_building.status <> 'active' then
      raise exception 'Ein Besuchsplan mit archiviertem Gebäude kann nicht aktiviert werden';
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists visit_plans_require_active_buildings on public.visit_plans;
create trigger visit_plans_require_active_buildings
before update of status on public.visit_plans
for each row
when (new.status = 'active')
execute function private.require_active_visit_plan_buildings();

create or replace function public.set_property_status(
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
    -- Visit mutations lock visit -> property through the trigger below. Match
    -- that order here, then lock/re-read the property and lock open visits a
    -- second time to include inserts that committed before the property lock.
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
      and status = 'scheduled';
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

revoke all on function public.set_property_status(uuid, text)
  from public, anon, authenticated;
grant execute on function public.set_property_status(uuid, text)
  to authenticated;

-- This trigger is the central invariant for every visit creation/start path,
-- including service-role writes and races with property archival. Historical
-- visits may still be completed or canceled after archival.
create or replace function private.prevent_open_visit_for_archived_property()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_property_status text;
begin
  if new.status not in ('scheduled', 'started') then
    return new;
  end if;

  select status
  into v_property_status
  from public.properties
  where id = new.property_id
  for update;
  if not found then
    raise exception 'Immobilie wurde nicht gefunden';
  end if;
  if v_property_status = 'archived' then
    raise exception 'Für eine archivierte Immobilie darf kein offener Einsatz bestehen';
  end if;
  return new;
end;
$$;

drop trigger if exists visits_prevent_open_archived_property on public.visits;
create trigger visits_prevent_open_archived_property
before insert or update of property_id, status on public.visits
for each row execute function private.prevent_open_visit_for_archived_property();
