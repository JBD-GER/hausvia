-- Active operational records must never outlive the active parent property.
-- NOWAIT follows the parent-first lifecycle lock order and turns concurrent
-- archival into a retryable failure instead of allowing an invalid write.

create or replace function private.require_active_assignment_property()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_property_status text;
begin
  if not new.active then
    return new;
  end if;

  select status
  into v_property_status
  from public.properties
  where id = new.property_id
  for key share nowait;

  if not found then
    raise exception 'Immobilie wurde nicht gefunden';
  end if;
  if v_property_status = 'archived' then
    raise exception 'Archivierten Immobilien können keine Mitarbeiter zugeordnet werden';
  end if;
  return new;
end;
$$;

drop trigger if exists property_employee_assignments_require_active_property
  on public.property_employee_assignments;
create trigger property_employee_assignments_require_active_property
before insert or update of property_id, active
on public.property_employee_assignments
for each row
when (new.active)
execute function private.require_active_assignment_property();

create or replace function private.require_active_visit_plan_buildings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_property_status text;
  v_building record;
begin
  if new.status <> 'active' then
    return new;
  end if;

  select status
  into v_property_status
  from public.properties
  where id = new.property_id
  for key share nowait;

  if not found then
    raise exception 'Immobilie wurde nicht gefunden';
  end if;
  if v_property_status = 'archived' then
    raise exception 'Ein aktiver Besuchsplan benötigt eine aktive Immobilie';
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
before insert or update on public.visit_plans
for each row
when (new.status = 'active')
execute function private.require_active_visit_plan_buildings();
