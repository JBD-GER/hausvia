-- Serialize equipment assignments with the affected equipment/visit rows and
-- write their audit entry in the same transaction. This closes races where a
-- visit is completed or an equipment item archived between an application-side
-- preflight query and the actual mutation.

create unique index if not exists equipment_employee_one_active_uidx
  on public.equipment_employee_assignments (equipment_id, employee_id)
  where returned_at is null;

alter table public.equipment
  add constraint equipment_image_reference_complete_chk
  check (
    (image_bucket is null and image_path is null)
    or (
      image_bucket = 'equipment-images'
      and image_path is not null
      and length(btrim(image_path)) > 0
    )
  );

create unique index if not exists equipment_image_reference_uidx
  on public.equipment (image_bucket, image_path)
  where image_bucket is not null and image_path is not null;

create or replace function public.set_equipment_employee_assignment(
  p_equipment_id uuid,
  p_employee_id uuid,
  p_return boolean default false
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_equipment_status text;
  v_employee_status text;
  v_assigned_at timestamptz;
  v_affected integer;
begin
  if v_actor is null or not (select private.is_admin()) then
    raise exception using errcode = '42501', message = 'Nur Administratoren dürfen Equipment zuweisen';
  end if;

  select status
  into v_equipment_status
  from public.equipment
  where id = p_equipment_id
  for update;
  if not found then
    raise exception 'Equipment wurde nicht gefunden';
  end if;

  select status
  into v_employee_status
  from public.employee_profiles
  where id = p_employee_id
  for update;
  if not found then
    raise exception 'Mitarbeiter wurde nicht gefunden';
  end if;

  if p_return then
    update public.equipment_employee_assignments
    set returned_at = now()
    where equipment_id = p_equipment_id
      and employee_id = p_employee_id
      and returned_at is null;
    get diagnostics v_affected = row_count;
    if v_affected = 0 then
      raise exception 'Aktive Mitarbeiterzuweisung wurde nicht gefunden';
    end if;

    insert into public.audit_logs (actor_id, action, entity_table, entity_id, metadata)
    values (
      v_actor,
      'equipment.employee_returned',
      'equipment_employee_assignments',
      p_equipment_id,
      jsonb_build_object('employee_id', p_employee_id, 'assignment_count', v_affected)
    );
    return 'returned';
  end if;

  if v_equipment_status <> 'active' or v_employee_status <> 'active' then
    raise exception 'Nur aktives Equipment kann einem aktiven Mitarbeiter zugewiesen werden';
  end if;
  if exists (
    select 1
    from public.equipment_employee_assignments
    where equipment_id = p_equipment_id
      and employee_id = p_employee_id
      and returned_at is null
  ) then
    raise exception 'Dieses Equipment ist dem Mitarbeiter bereits zugewiesen';
  end if;

  insert into public.equipment_employee_assignments (
    equipment_id, employee_id, assigned_by
  ) values (
    p_equipment_id, p_employee_id, v_actor
  )
  returning assigned_at into v_assigned_at;

  insert into public.audit_logs (actor_id, action, entity_table, entity_id, metadata)
  values (
    v_actor,
    'equipment.employee_assigned',
    'equipment_employee_assignments',
    p_equipment_id,
    jsonb_build_object('employee_id', p_employee_id, 'assigned_at', v_assigned_at)
  );
  return 'assigned';
end;
$$;

revoke all on function public.set_equipment_employee_assignment(uuid, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.set_equipment_employee_assignment(uuid, uuid, boolean)
  to authenticated;

create or replace function public.set_visit_equipment_assignment(
  p_visit_id uuid,
  p_equipment_id uuid,
  p_required_quantity numeric,
  p_rental boolean,
  p_provision_note text,
  p_remove boolean default false
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_visit_status text;
  v_property_id uuid;
  v_equipment_status text;
  v_previous jsonb;
  v_action text;
begin
  if v_actor is null or not (select private.is_admin()) then
    raise exception using errcode = '42501', message = 'Nur Administratoren dürfen Einsatz-Equipment ändern';
  end if;

  select status, property_id
  into v_visit_status, v_property_id
  from public.visits
  where id = p_visit_id
  for update;
  if not found or v_visit_status not in ('scheduled', 'started') then
    raise exception 'Nur geplante oder laufende Einsätze können geändert werden';
  end if;

  select jsonb_build_object(
    'required_quantity', required_quantity,
    'rental', rental,
    'provision_note', provision_note
  )
  into v_previous
  from public.visit_equipment
  where visit_id = p_visit_id and equipment_id = p_equipment_id
  for update;

  if p_remove then
    if v_previous is null then
      raise exception 'Einsatzzuweisung wurde nicht gefunden';
    end if;
    delete from public.visit_equipment
    where visit_id = p_visit_id and equipment_id = p_equipment_id;

    insert into public.audit_logs (actor_id, action, entity_table, entity_id, metadata)
    values (
      v_actor,
      'equipment.visit_unassigned',
      'visit_equipment',
      p_equipment_id,
      jsonb_build_object(
        'visit_id', p_visit_id,
        'property_id', v_property_id,
        'previous', v_previous
      )
    );
    return 'removed';
  end if;

  if p_required_quantity is null or p_required_quantity <= 0 or p_required_quantity > 999999999.999 then
    raise exception 'Die benötigte Menge ist ungültig';
  end if;
  if length(coalesce(p_provision_note, '')) > 2000 then
    raise exception 'Der Bereitstellungshinweis ist zu lang';
  end if;

  select status
  into v_equipment_status
  from public.equipment
  where id = p_equipment_id
  for update;
  if not found or v_equipment_status <> 'active' then
    raise exception 'Nur aktives Equipment kann einem Einsatz zugeordnet werden';
  end if;

  v_action := case when v_previous is null then 'assigned' else 'updated' end;
  insert into public.visit_equipment (
    visit_id, equipment_id, required_quantity, rental, provision_note
  ) values (
    p_visit_id,
    p_equipment_id,
    p_required_quantity,
    coalesce(p_rental, false),
    nullif(btrim(coalesce(p_provision_note, '')), '')
  )
  on conflict (visit_id, equipment_id) do update
  set required_quantity = excluded.required_quantity,
      rental = excluded.rental,
      provision_note = excluded.provision_note;

  insert into public.audit_logs (actor_id, action, entity_table, entity_id, metadata)
  values (
    v_actor,
    case
      when v_action = 'assigned' then 'equipment.visit_assigned'
      else 'equipment.visit_assignment_updated'
    end,
    'visit_equipment',
    p_equipment_id,
    jsonb_build_object(
      'visit_id', p_visit_id,
      'property_id', v_property_id,
      'required_quantity', p_required_quantity,
      'rental', coalesce(p_rental, false),
      'previous', v_previous
    )
  );
  return v_action;
end;
$$;

revoke all on function public.set_visit_equipment_assignment(
  uuid, uuid, numeric, boolean, text, boolean
) from public, anon, authenticated;
grant execute on function public.set_visit_equipment_assignment(
  uuid, uuid, numeric, boolean, text, boolean
) to authenticated;

create or replace function public.set_equipment_state(
  p_equipment_id uuid,
  p_expected_updated_at timestamptz,
  p_status text,
  p_condition text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_equipment public.equipment%rowtype;
  v_property_assignment_count integer := 0;
  v_employee_assignment_count integer := 0;
begin
  if v_actor is null or not (select private.is_admin()) then
    raise exception using errcode = '42501', message = 'Nur Administratoren dürfen den Equipmentstatus ändern';
  end if;
  if p_status not in ('active', 'archived') then
    raise exception 'Ungültiger Equipmentstatus';
  end if;
  if p_condition not in ('available', 'in_use', 'empty', 'defective', 'in_repair', 'lost', 'archived') then
    raise exception 'Ungültiger Equipmentzustand';
  end if;
  if p_status = 'archived' then
    p_condition := 'archived';
  elsif p_condition = 'archived' then
    raise exception 'Aktives Equipment benötigt einen aktiven Zustand';
  end if;

  select *
  into v_equipment
  from public.equipment
  where id = p_equipment_id and updated_at = p_expected_updated_at
  for update;
  if not found then
    raise exception 'Das Equipment wurde zwischenzeitlich geändert';
  end if;
  if v_equipment.status = p_status and v_equipment.condition = p_condition then
    return 'unchanged';
  end if;

  update public.equipment
  set status = p_status, condition = p_condition
  where id = p_equipment_id;

  if p_status = 'archived' then
    update public.property_equipment
    set active = false
    where equipment_id = p_equipment_id
      and active = true;
    get diagnostics v_property_assignment_count = row_count;

    update public.equipment_employee_assignments
    set returned_at = now()
    where equipment_id = p_equipment_id
      and returned_at is null;
    get diagnostics v_employee_assignment_count = row_count;
  end if;

  insert into public.audit_logs (actor_id, action, entity_table, entity_id, metadata)
  values (
    v_actor,
    'equipment.state_changed',
    'equipment',
    p_equipment_id,
    jsonb_build_object(
      'previous_status', v_equipment.status,
      'status', p_status,
      'previous_condition', v_equipment.condition,
      'condition', p_condition,
      'ended_property_assignments', v_property_assignment_count,
      'ended_employee_assignments', v_employee_assignment_count
    )
  );
  return p_status;
end;
$$;

revoke all on function public.set_equipment_state(uuid, timestamptz, text, text)
  from public, anon, authenticated;
grant execute on function public.set_equipment_state(uuid, timestamptz, text, text)
  to authenticated;

create or replace function public.link_equipment_image(
  p_equipment_id uuid,
  p_expected_updated_at timestamptz,
  p_bucket text,
  p_path text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_equipment public.equipment%rowtype;
begin
  if v_actor is null or not (select private.is_admin()) then
    raise exception using errcode = '42501', message = 'Nur Administratoren dürfen Gerätefotos ändern';
  end if;
  if p_bucket <> 'equipment-images'
     or p_path is null
     or length(btrim(p_path)) = 0
     or split_part(p_path, '/', 1) <> v_actor::text
     or split_part(p_path, '/', 2) <> p_equipment_id::text then
    raise exception 'Ungültiger Storagepfad für das Gerätefoto';
  end if;

  select *
  into v_equipment
  from public.equipment
  where id = p_equipment_id and updated_at = p_expected_updated_at
  for update;
  if not found then
    raise exception 'Das Equipment wurde zwischenzeitlich geändert';
  end if;

  update public.equipment
  set image_bucket = p_bucket, image_path = p_path
  where id = p_equipment_id;

  insert into public.audit_logs (actor_id, action, entity_table, entity_id, metadata)
  values (
    v_actor,
    'equipment.photo_updated',
    'equipment',
    p_equipment_id,
    jsonb_build_object(
      'previous_bucket', v_equipment.image_bucket,
      'previous_path', v_equipment.image_path,
      'bucket', p_bucket,
      'path', p_path
    )
  );

  return jsonb_build_object(
    'previous_bucket', v_equipment.image_bucket,
    'previous_path', v_equipment.image_path
  );
end;
$$;

revoke all on function public.link_equipment_image(uuid, timestamptz, text, text)
  from public, anon, authenticated;
grant execute on function public.link_equipment_image(uuid, timestamptz, text, text)
  to authenticated;

create or replace function public.set_property_equipment_assignment(
  p_property_id uuid,
  p_equipment_id uuid,
  p_building_id uuid,
  p_required_quantity numeric,
  p_seasonal boolean,
  p_season_start_month integer,
  p_season_end_month integer,
  p_rental boolean,
  p_notification_lead_hours integer,
  p_provision_note text,
  p_assignment_id uuid,
  p_expected_updated_at timestamptz,
  p_deactivate boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_property_status text;
  v_equipment_status text;
  v_effective_equipment_id uuid;
  v_locked_building_id uuid;
  v_assignment public.property_equipment%rowtype;
  v_assignment_id uuid;
  v_action text;
begin
  if v_actor is null or not (select private.is_admin()) then
    raise exception using errcode = '42501', message = 'Nur Administratoren dürfen Immobilien-Equipment ändern';
  end if;

  if p_assignment_id is not null then
    select equipment_id
    into v_effective_equipment_id
    from public.property_equipment
    where id = p_assignment_id
      and property_id = p_property_id;
    if not found then
      raise exception 'Equipmentzuordnung wurde nicht gefunden';
    end if;
  else
    v_effective_equipment_id := p_equipment_id;
  end if;
  if v_effective_equipment_id is null then
    raise exception 'Equipment wurde nicht ausgewählt';
  end if;

  -- Every mutation touching active equipment takes this lock first. The state
  -- RPC uses the same order, so archive/assignment races cannot deadlock or
  -- leave a new active assignment behind an archived catalog item.
  select status
  into v_equipment_status
  from public.equipment
  where id = v_effective_equipment_id
  for update;
  if not found then
    raise exception 'Equipment wurde nicht gefunden';
  end if;

  select status
  into v_property_status
  from public.properties
  where id = p_property_id
  for update;
  if not found or (v_property_status = 'archived' and not coalesce(p_deactivate, false)) then
    raise exception 'Die Immobilie ist nicht für Equipmentzuordnungen verfügbar';
  end if;

  if p_assignment_id is not null then
    select *
    into v_assignment
    from public.property_equipment
    where id = p_assignment_id
      and property_id = p_property_id
    for update;
    if not found then
      raise exception 'Equipmentzuordnung wurde nicht gefunden';
    end if;
    if p_expected_updated_at is null or v_assignment.updated_at <> p_expected_updated_at then
      raise exception 'Die Equipmentzuordnung wurde zwischenzeitlich geändert';
    end if;
  else
    select *
    into v_assignment
    from public.property_equipment
    where property_id = p_property_id
      and equipment_id = v_effective_equipment_id
      and building_id is not distinct from p_building_id
    for update;
  end if;

  if coalesce(p_deactivate, false) then
    if p_assignment_id is null or v_assignment.id is null or not v_assignment.active then
      raise exception 'Aktive Equipmentzuordnung wurde nicht gefunden';
    end if;
    update public.property_equipment
    set active = false
    where id = v_assignment.id;

    insert into public.audit_logs (actor_id, action, entity_table, entity_id, metadata)
    values (
      v_actor,
      'property.equipment_unassigned',
      'property_equipment',
      v_assignment.id,
      jsonb_build_object(
        'property_id', p_property_id,
        'equipment_id', v_assignment.equipment_id,
        'building_id', v_assignment.building_id
      )
    );
    return v_assignment.id;
  end if;

  if v_equipment_status <> 'active' then
    raise exception 'Nur aktives Equipment kann zugeordnet werden';
  end if;
  if p_required_quantity is null
     or p_required_quantity <= 0
     or p_required_quantity > 999999999.999 then
    raise exception 'Die benötigte Menge ist ungültig';
  end if;
  if p_notification_lead_hours is null
     or p_notification_lead_hours < 0
     or p_notification_lead_hours > 87600 then
    raise exception 'Der Benachrichtigungsvorlauf ist ungültig';
  end if;
  if length(coalesce(p_provision_note, '')) > 2000 then
    raise exception 'Der Bereitstellungshinweis ist zu lang';
  end if;
  if coalesce(p_seasonal, false)
     and (
       p_season_start_month is null
       or p_season_end_month is null
       or p_season_start_month not between 1 and 12
       or p_season_end_month not between 1 and 12
     ) then
    raise exception 'Für saisonales Equipment müssen gültige Monate gewählt werden';
  end if;

  if p_building_id is not null then
    select id
    into v_locked_building_id
    from public.buildings
    where id = p_building_id
      and property_id = p_property_id
      and status = 'active'
    for update;
    if not found then
      raise exception 'Das Gebäude gehört nicht aktiv zu dieser Immobilie';
    end if;
  end if;

  if v_assignment.id is null then
    insert into public.property_equipment (
      property_id,
      building_id,
      equipment_id,
      required_quantity,
      seasonal,
      season_start_month,
      season_end_month,
      rental,
      notification_lead_hours,
      provision_note,
      active
    ) values (
      p_property_id,
      p_building_id,
      v_effective_equipment_id,
      p_required_quantity,
      coalesce(p_seasonal, false),
      case when coalesce(p_seasonal, false) then p_season_start_month end,
      case when coalesce(p_seasonal, false) then p_season_end_month end,
      coalesce(p_rental, false),
      p_notification_lead_hours,
      nullif(btrim(coalesce(p_provision_note, '')), ''),
      true
    )
    returning id into v_assignment_id;
    v_action := 'property.equipment_assigned';
  else
    update public.property_equipment
    set building_id = p_building_id,
        required_quantity = p_required_quantity,
        seasonal = coalesce(p_seasonal, false),
        season_start_month = case
          when coalesce(p_seasonal, false) then p_season_start_month
        end,
        season_end_month = case
          when coalesce(p_seasonal, false) then p_season_end_month
        end,
        rental = coalesce(p_rental, false),
        notification_lead_hours = p_notification_lead_hours,
        provision_note = nullif(btrim(coalesce(p_provision_note, '')), ''),
        active = true
    where id = v_assignment.id
    returning id into v_assignment_id;
    v_action := case
      when v_assignment.active then 'property.equipment_assignment_updated'
      else 'property.equipment_assignment_reactivated'
    end;
  end if;

  insert into public.audit_logs (actor_id, action, entity_table, entity_id, metadata)
  values (
    v_actor,
    v_action,
    'property_equipment',
    v_assignment_id,
    jsonb_build_object(
      'property_id', p_property_id,
      'equipment_id', v_effective_equipment_id,
      'building_id', p_building_id,
      'required_quantity', p_required_quantity,
      'seasonal', coalesce(p_seasonal, false),
      'rental', coalesce(p_rental, false),
      'previous', case when v_assignment.id is null then null else to_jsonb(v_assignment) end
    )
  );

  return v_assignment_id;
end;
$$;

revoke all on function public.set_property_equipment_assignment(
  uuid, uuid, uuid, numeric, boolean, integer, integer, boolean, integer,
  text, uuid, timestamptz, boolean
) from public, anon, authenticated;
grant execute on function public.set_property_equipment_assignment(
  uuid, uuid, uuid, numeric, boolean, integer, integer, boolean, integer,
  text, uuid, timestamptz, boolean
) to authenticated;
