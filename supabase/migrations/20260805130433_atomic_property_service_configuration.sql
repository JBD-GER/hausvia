-- Create and update the complete property-service configuration in one
-- transaction. The instruction row's updated_at value is its optimistic
-- version; no parallel application-side rollback is required.

create or replace function private.require_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not (select private.is_admin()) then
    raise exception using
      errcode = '42501',
      message = 'Nur Administratoren dürfen diese Änderung ausführen';
  end if;
end;
$$;

revoke all on function private.require_admin()
  from public, anon, authenticated, service_role;

create or replace function public.create_property_service_configuration(
  p_property_id uuid,
  p_catalog_id uuid,
  p_service_key text,
  p_name text,
  p_category text,
  p_customer_description text,
  p_execution_rule text,
  p_occurrences_per_period integer,
  p_seasonal boolean,
  p_season_start_month integer,
  p_season_end_month integer,
  p_start_date date,
  p_end_date date,
  p_estimated_minutes integer,
  p_customer_visible boolean,
  p_photo_required boolean,
  p_sort_order integer,
  p_status text,
  p_internal_instruction text,
  p_building_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_property_status text;
  v_catalog public.service_catalog%rowtype;
  v_service_id uuid;
  v_service_updated_at timestamptz;
  v_instruction_updated_at timestamptz;
  v_building_ids uuid[] := coalesce(p_building_ids, array[]::uuid[]);
  v_building record;
  v_building_count integer := 0;
  v_service_key text := btrim(coalesce(p_service_key, ''));
  v_name text := btrim(coalesce(p_name, ''));
  v_category text := btrim(coalesce(p_category, ''));
  v_customer_description text := nullif(btrim(coalesce(p_customer_description, '')), '');
  v_execution_rule text := btrim(coalesce(p_execution_rule, ''));
  v_status text := btrim(coalesce(p_status, ''));
  v_instruction text := nullif(btrim(coalesce(p_internal_instruction, '')), '');
  v_seasonal boolean := coalesce(p_seasonal, false);
  v_customer_visible boolean := coalesce(p_customer_visible, true);
  v_photo_required boolean := coalesce(p_photo_required, false);
begin
  perform private.require_admin();

  if v_service_key = '' or length(v_service_key) > 100 then
    raise exception using errcode = '22023', message = 'Der Leistungsschlüssel ist ungültig';
  end if;
  if v_name = '' or length(v_name) > 180 then
    raise exception using errcode = '22023', message = 'Der Leistungsname ist ungültig';
  end if;
  if v_category = '' or length(v_category) > 120 then
    raise exception using errcode = '22023', message = 'Die Leistungskategorie ist ungültig';
  end if;
  if length(coalesce(v_customer_description, '')) > 4000 then
    raise exception using errcode = '22023', message = 'Die Kundenbeschreibung ist zu lang';
  end if;
  if length(coalesce(v_instruction, '')) > 8000 then
    raise exception using errcode = '22023', message = 'Die interne Arbeitsanweisung ist zu lang';
  end if;
  if v_execution_rule not in (
    'every_visit', 'once_weekly', 'multiple_weekly', 'once_monthly',
    'multiple_monthly', 'once_quarterly', 'once_yearly', 'once_season',
    'on_demand', 'manual'
  ) then
    raise exception using errcode = '22023', message = 'Die Ausführungsregel ist ungültig';
  end if;
  if p_occurrences_per_period is null or p_occurrences_per_period not between 1 and 31 then
    raise exception using errcode = '22023', message = 'Die Anzahl der Ausführungen ist ungültig';
  end if;
  if v_seasonal and (
    p_season_start_month is null
    or p_season_end_month is null
    or p_season_start_month not between 1 and 12
    or p_season_end_month not between 1 and 12
  ) then
    raise exception using errcode = '22023', message = 'Für saisonale Leistungen sind gültige Monate erforderlich';
  end if;
  if p_start_date is null or (p_end_date is not null and p_end_date < p_start_date) then
    raise exception using errcode = '22023', message = 'Der Leistungszeitraum ist ungültig';
  end if;
  if p_estimated_minutes is not null and p_estimated_minutes not between 1 and 1440 then
    raise exception using errcode = '22023', message = 'Die geschätzte Dauer ist ungültig';
  end if;
  if p_sort_order is null or p_sort_order not between 0 and 100000 then
    raise exception using errcode = '22023', message = 'Die Sortierreihenfolge ist ungültig';
  end if;
  if v_status not in ('active', 'inactive', 'archived') then
    raise exception using errcode = '22023', message = 'Der Leistungsstatus ist ungültig';
  end if;

  if coalesce(array_ndims(v_building_ids), 1) > 1
     or array_position(v_building_ids, null) is not null then
    raise exception using errcode = '22023', message = 'Die Gebäudeauswahl ist ungültig';
  end if;
  if cardinality(v_building_ids) <> (
    select count(distinct selected.building_id)::integer
    from unnest(v_building_ids) as selected(building_id)
  ) then
    raise exception using errcode = '22023', message = 'Gebäude dürfen nicht mehrfach ausgewählt werden';
  end if;
  select coalesce(
    array_agg(selected.building_id order by selected.building_id),
    array[]::uuid[]
  )
  into v_building_ids
  from unnest(v_building_ids) as selected(building_id);

  select property.status
  into v_property_status
  from public.properties as property
  where property.id = p_property_id
  for update;
  if not found then
    raise exception 'Immobilie wurde nicht gefunden';
  end if;
  if v_property_status = 'archived' then
    raise exception 'Für eine archivierte Immobilie können keine Leistungen angelegt werden';
  end if;

  if p_catalog_id is not null then
    select *
    into v_catalog
    from public.service_catalog as catalog
    where catalog.id = p_catalog_id
    for share;
    if not found or v_catalog.status <> 'active' then
      raise exception 'Die Leistungsvorlage ist nicht verfügbar';
    end if;
    if v_catalog.service_key <> v_service_key then
      raise exception using errcode = '22023', message = 'Leistungsvorlage und Leistungsschlüssel stimmen nicht überein';
    end if;
  end if;

  for v_building in
    select building.id, building.property_id, building.status
    from public.buildings as building
    where building.id = any(v_building_ids)
    order by building.id
    for update
  loop
    v_building_count := v_building_count + 1;
    if v_building.property_id <> p_property_id or v_building.status <> 'active' then
      raise exception 'Mindestens ein Gebäude gehört nicht aktiv zu dieser Immobilie';
    end if;
  end loop;
  if v_building_count <> cardinality(v_building_ids) then
    raise exception 'Mindestens ein Gebäude wurde nicht gefunden';
  end if;

  insert into public.property_services (
    property_id,
    catalog_id,
    service_key,
    name,
    category,
    customer_description,
    execution_rule,
    occurrences_per_period,
    seasonal,
    season_start_month,
    season_end_month,
    start_date,
    end_date,
    estimated_minutes,
    customer_visible,
    photo_required,
    sort_order,
    status
  ) values (
    p_property_id,
    p_catalog_id,
    v_service_key,
    v_name,
    v_category,
    v_customer_description,
    v_execution_rule,
    p_occurrences_per_period,
    v_seasonal,
    case when v_seasonal then p_season_start_month else null end,
    case when v_seasonal then p_season_end_month else null end,
    p_start_date,
    p_end_date,
    p_estimated_minutes,
    v_customer_visible,
    v_photo_required,
    p_sort_order,
    v_status
  )
  returning id, updated_at into v_service_id, v_service_updated_at;

  if v_instruction is not null then
    insert into public.property_service_instructions (
      property_service_id, internal_instruction, updated_by
    ) values (
      v_service_id, v_instruction, v_actor
    )
    returning updated_at into v_instruction_updated_at;
  end if;

  insert into public.property_service_buildings (property_service_id, building_id)
  select v_service_id, selected.building_id
  from unnest(v_building_ids) as selected(building_id);

  insert into public.audit_logs (actor_id, action, entity_table, entity_id, metadata)
  values (
    v_actor,
    'property_service.created',
    'property_services',
    v_service_id,
    jsonb_build_object(
      'property_id', p_property_id,
      'catalog_id', p_catalog_id,
      'service_key', v_service_key,
      'status', v_status,
      'instruction_present', v_instruction is not null,
      'instruction_version', v_instruction_updated_at,
      'building_ids', to_jsonb(v_building_ids)
    )
  );

  return jsonb_build_object(
    'property_service_id', v_service_id,
    'service_version', v_service_updated_at,
    'instruction_version', v_instruction_updated_at,
    'building_ids', to_jsonb(v_building_ids)
  );
end;
$$;

create or replace function public.update_property_service_configuration(
  p_property_id uuid,
  p_property_service_id uuid,
  p_expected_updated_at timestamptz,
  p_catalog_id uuid,
  p_service_key text,
  p_name text,
  p_category text,
  p_customer_description text,
  p_execution_rule text,
  p_occurrences_per_period integer,
  p_seasonal boolean,
  p_season_start_month integer,
  p_season_end_month integer,
  p_start_date date,
  p_end_date date,
  p_estimated_minutes integer,
  p_customer_visible boolean,
  p_photo_required boolean,
  p_sort_order integer,
  p_status text,
  p_internal_instruction text,
  p_expected_instruction_version timestamptz,
  p_building_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_property_status text;
  v_catalog public.service_catalog%rowtype;
  v_service public.property_services%rowtype;
  v_service_updated_at timestamptz;
  v_instruction public.property_service_instructions%rowtype;
  v_instruction_exists boolean := false;
  v_instruction_updated_at timestamptz;
  v_instruction_changed boolean;
  v_previous_building_ids uuid[];
  v_building_ids uuid[] := coalesce(p_building_ids, array[]::uuid[]);
  v_building record;
  v_building_count integer := 0;
  v_service_key text := btrim(coalesce(p_service_key, ''));
  v_name text := btrim(coalesce(p_name, ''));
  v_category text := btrim(coalesce(p_category, ''));
  v_customer_description text := nullif(btrim(coalesce(p_customer_description, '')), '');
  v_execution_rule text := btrim(coalesce(p_execution_rule, ''));
  v_status text := btrim(coalesce(p_status, ''));
  v_next_instruction text := nullif(btrim(coalesce(p_internal_instruction, '')), '');
  v_seasonal boolean := coalesce(p_seasonal, false);
  v_customer_visible boolean := coalesce(p_customer_visible, true);
  v_photo_required boolean := coalesce(p_photo_required, false);
begin
  perform private.require_admin();

  if v_service_key = '' or length(v_service_key) > 100 then
    raise exception using errcode = '22023', message = 'Der Leistungsschlüssel ist ungültig';
  end if;
  if v_name = '' or length(v_name) > 180 then
    raise exception using errcode = '22023', message = 'Der Leistungsname ist ungültig';
  end if;
  if v_category = '' or length(v_category) > 120 then
    raise exception using errcode = '22023', message = 'Die Leistungskategorie ist ungültig';
  end if;
  if length(coalesce(v_customer_description, '')) > 4000 then
    raise exception using errcode = '22023', message = 'Die Kundenbeschreibung ist zu lang';
  end if;
  if length(coalesce(v_next_instruction, '')) > 8000 then
    raise exception using errcode = '22023', message = 'Die interne Arbeitsanweisung ist zu lang';
  end if;
  if v_execution_rule not in (
    'every_visit', 'once_weekly', 'multiple_weekly', 'once_monthly',
    'multiple_monthly', 'once_quarterly', 'once_yearly', 'once_season',
    'on_demand', 'manual'
  ) then
    raise exception using errcode = '22023', message = 'Die Ausführungsregel ist ungültig';
  end if;
  if p_occurrences_per_period is null or p_occurrences_per_period not between 1 and 31 then
    raise exception using errcode = '22023', message = 'Die Anzahl der Ausführungen ist ungültig';
  end if;
  if v_seasonal and (
    p_season_start_month is null
    or p_season_end_month is null
    or p_season_start_month not between 1 and 12
    or p_season_end_month not between 1 and 12
  ) then
    raise exception using errcode = '22023', message = 'Für saisonale Leistungen sind gültige Monate erforderlich';
  end if;
  if p_start_date is null or (p_end_date is not null and p_end_date < p_start_date) then
    raise exception using errcode = '22023', message = 'Der Leistungszeitraum ist ungültig';
  end if;
  if p_estimated_minutes is not null and p_estimated_minutes not between 1 and 1440 then
    raise exception using errcode = '22023', message = 'Die geschätzte Dauer ist ungültig';
  end if;
  if p_sort_order is null or p_sort_order not between 0 and 100000 then
    raise exception using errcode = '22023', message = 'Die Sortierreihenfolge ist ungültig';
  end if;
  if v_status not in ('active', 'inactive', 'archived') then
    raise exception using errcode = '22023', message = 'Der Leistungsstatus ist ungültig';
  end if;

  if coalesce(array_ndims(v_building_ids), 1) > 1
     or array_position(v_building_ids, null) is not null then
    raise exception using errcode = '22023', message = 'Die Gebäudeauswahl ist ungültig';
  end if;
  if cardinality(v_building_ids) <> (
    select count(distinct selected.building_id)::integer
    from unnest(v_building_ids) as selected(building_id)
  ) then
    raise exception using errcode = '22023', message = 'Gebäude dürfen nicht mehrfach ausgewählt werden';
  end if;
  select coalesce(
    array_agg(selected.building_id order by selected.building_id),
    array[]::uuid[]
  )
  into v_building_ids
  from unnest(v_building_ids) as selected(building_id);

  select property.status
  into v_property_status
  from public.properties as property
  where property.id = p_property_id
  for update;
  if not found then
    raise exception 'Immobilie wurde nicht gefunden';
  end if;
  if v_property_status = 'archived' then
    raise exception 'Leistungen einer archivierten Immobilie können nicht geändert werden';
  end if;

  select *
  into v_service
  from public.property_services as service
  where service.id = p_property_service_id
    and service.property_id = p_property_id
  for update;
  if not found then
    raise exception 'Leistung wurde nicht gefunden';
  end if;
  if p_expected_updated_at is null
     or v_service.updated_at is distinct from p_expected_updated_at then
    raise exception using
      errcode = '40001',
      message = 'Die Leistung wurde zwischenzeitlich geändert';
  end if;

  if p_catalog_id is not null then
    select *
    into v_catalog
    from public.service_catalog as catalog
    where catalog.id = p_catalog_id
    for share;
    if not found then
      raise exception 'Die Leistungsvorlage wurde nicht gefunden';
    end if;
    if p_catalog_id is distinct from v_service.catalog_id
       and v_catalog.status <> 'active' then
      raise exception 'Die Leistungsvorlage ist nicht verfügbar';
    end if;
    if v_catalog.service_key <> v_service_key then
      raise exception using errcode = '22023', message = 'Leistungsvorlage und Leistungsschlüssel stimmen nicht überein';
    end if;
  end if;

  select *
  into v_instruction
  from public.property_service_instructions as instruction
  where instruction.property_service_id = p_property_service_id
  for update;
  v_instruction_exists := found;
  if v_instruction_exists then
    if p_expected_instruction_version is null
       or v_instruction.updated_at is distinct from p_expected_instruction_version then
      raise exception using
        errcode = '40001',
        message = 'Die interne Arbeitsanweisung wurde zwischenzeitlich geändert';
    end if;
  elsif p_expected_instruction_version is not null then
    raise exception using
      errcode = '40001',
      message = 'Die interne Arbeitsanweisung wurde zwischenzeitlich geändert';
  end if;

  for v_building in
    select building.id, building.property_id, building.status
    from public.buildings as building
    where building.id = any(v_building_ids)
    order by building.id
    for update
  loop
    v_building_count := v_building_count + 1;
    if v_building.property_id <> p_property_id or v_building.status <> 'active' then
      raise exception 'Mindestens ein Gebäude gehört nicht aktiv zu dieser Immobilie';
    end if;
  end loop;
  if v_building_count <> cardinality(v_building_ids) then
    raise exception 'Mindestens ein Gebäude wurde nicht gefunden';
  end if;

  perform link.building_id
  from public.property_service_buildings as link
  where link.property_service_id = p_property_service_id
  order by link.building_id
  for update;

  select coalesce(
    array_agg(link.building_id order by link.building_id),
    array[]::uuid[]
  )
  into v_previous_building_ids
  from public.property_service_buildings as link
  where link.property_service_id = p_property_service_id;

  update public.property_services
  set catalog_id = p_catalog_id,
      service_key = v_service_key,
      name = v_name,
      category = v_category,
      customer_description = v_customer_description,
      execution_rule = v_execution_rule,
      occurrences_per_period = p_occurrences_per_period,
      seasonal = v_seasonal,
      season_start_month = case when v_seasonal then p_season_start_month else null end,
      season_end_month = case when v_seasonal then p_season_end_month else null end,
      start_date = p_start_date,
      end_date = p_end_date,
      estimated_minutes = p_estimated_minutes,
      customer_visible = v_customer_visible,
      photo_required = v_photo_required,
      sort_order = p_sort_order,
      status = v_status
  where id = p_property_service_id
  returning updated_at into v_service_updated_at;

  v_instruction_changed := v_instruction.internal_instruction is distinct from v_next_instruction;
  if v_next_instruction is null then
    if v_instruction_exists then
      delete from public.property_service_instructions
      where property_service_id = p_property_service_id;
    end if;
    v_instruction_updated_at := null;
  elsif v_instruction_exists then
    update public.property_service_instructions
    set internal_instruction = v_next_instruction,
        updated_by = v_actor
    where property_service_id = p_property_service_id
    returning updated_at into v_instruction_updated_at;
  else
    insert into public.property_service_instructions (
      property_service_id, internal_instruction, updated_by
    ) values (
      p_property_service_id, v_next_instruction, v_actor
    )
    returning updated_at into v_instruction_updated_at;
  end if;

  delete from public.property_service_buildings as link
  where link.property_service_id = p_property_service_id
    and not (link.building_id = any(v_building_ids));

  insert into public.property_service_buildings (property_service_id, building_id)
  select p_property_service_id, selected.building_id
  from unnest(v_building_ids) as selected(building_id)
  on conflict (property_service_id, building_id) do nothing;

  insert into public.audit_logs (actor_id, action, entity_table, entity_id, metadata)
  values (
    v_actor,
    'property_service.updated',
    'property_services',
    p_property_service_id,
    jsonb_build_object(
      'property_id', p_property_id,
      'previous', jsonb_build_object(
        'catalog_id', v_service.catalog_id,
        'service_key', v_service.service_key,
        'name', v_service.name,
        'category', v_service.category,
        'customer_description', v_service.customer_description,
        'execution_rule', v_service.execution_rule,
        'occurrences_per_period', v_service.occurrences_per_period,
        'seasonal', v_service.seasonal,
        'season_start_month', v_service.season_start_month,
        'season_end_month', v_service.season_end_month,
        'start_date', v_service.start_date,
        'end_date', v_service.end_date,
        'estimated_minutes', v_service.estimated_minutes,
        'customer_visible', v_service.customer_visible,
        'photo_required', v_service.photo_required,
        'sort_order', v_service.sort_order,
        'status', v_service.status
      ),
      'next', jsonb_build_object(
        'catalog_id', p_catalog_id,
        'service_key', v_service_key,
        'name', v_name,
        'category', v_category,
        'customer_description', v_customer_description,
        'execution_rule', v_execution_rule,
        'occurrences_per_period', p_occurrences_per_period,
        'seasonal', v_seasonal,
        'season_start_month', case when v_seasonal then p_season_start_month else null end,
        'season_end_month', case when v_seasonal then p_season_end_month else null end,
        'start_date', p_start_date,
        'end_date', p_end_date,
        'estimated_minutes', p_estimated_minutes,
        'customer_visible', v_customer_visible,
        'photo_required', v_photo_required,
        'sort_order', p_sort_order,
        'status', v_status
      ),
      'instruction_changed', v_instruction_changed,
      'previous_instruction_version', case
        when v_instruction_exists then v_instruction.updated_at
        else null
      end,
      'instruction_version', v_instruction_updated_at,
      'previous_building_ids', to_jsonb(v_previous_building_ids),
      'building_ids', to_jsonb(v_building_ids)
    )
  );

  return jsonb_build_object(
    'property_service_id', p_property_service_id,
    'service_version', v_service_updated_at,
    'instruction_version', v_instruction_updated_at,
    'building_ids', to_jsonb(v_building_ids)
  );
end;
$$;

revoke all on function public.create_property_service_configuration(
  uuid, uuid, text, text, text, text, text, integer, boolean, integer,
  integer, date, date, integer, boolean, boolean, integer, text, text, uuid[]
) from public, anon, authenticated, service_role;
grant execute on function public.create_property_service_configuration(
  uuid, uuid, text, text, text, text, text, integer, boolean, integer,
  integer, date, date, integer, boolean, boolean, integer, text, text, uuid[]
) to authenticated;

revoke all on function public.update_property_service_configuration(
  uuid, uuid, timestamptz, uuid, text, text, text, text, text, integer,
  boolean, integer, integer, date, date, integer, boolean, boolean, integer,
  text, text, timestamptz, uuid[]
) from public, anon, authenticated, service_role;
grant execute on function public.update_property_service_configuration(
  uuid, uuid, timestamptz, uuid, text, text, text, text, text, integer,
  boolean, integer, integer, date, date, integer, boolean, boolean, integer,
  text, text, timestamptz, uuid[]
) to authenticated;
