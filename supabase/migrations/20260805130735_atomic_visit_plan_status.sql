-- Visit-plan activation is an operational lifecycle boundary. Lock the parent
-- property, plan, linked buildings, status change, visit generation and audit
-- in one transaction so property archival cannot interleave.

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
  v_property_status text;
  v_plan public.visit_plans%rowtype;
  v_building record;
  v_generated integer := 0;
begin
  perform private.require_admin();
  if p_status not in ('active', 'paused', 'archived')
    or p_expected_status not in ('active', 'paused', 'archived')
  then
    raise exception using errcode = '22023', message = 'Ungültiger Besuchsplanstatus';
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

  if p_status = 'active' then
    for v_building in
      select building.id, building.status
      from public.visit_plan_buildings as link
      join public.buildings as building on building.id = link.building_id
      where link.visit_plan_id = p_visit_plan_id
      order by building.id
      for key share of building
    loop
      if v_building.status <> 'active' then
        raise exception 'Ein Besuchsplan mit archiviertem Gebäude kann nicht aktiviert werden';
      end if;
    end loop;
  end if;

  update public.visit_plans
  set status = p_status
  where id = p_visit_plan_id;

  if p_status = 'active' then
    v_generated := public.generate_upcoming_visits(90, p_visit_plan_id);
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
      'generated_visits', v_generated
    )
  );
  return p_status;
end;
$$;

revoke all on function public.set_visit_plan_status(uuid, uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.set_visit_plan_status(uuid, uuid, text, text)
  to authenticated;
