-- Keep an optional operational-report building inside the selected visit.
-- The broader relation trigger already checks that visit and building belong to
-- the property; this guard narrows the pair to the visit's concrete buildings.

create or replace function private.assert_operational_report_visit_building()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.visit_id is not null
     and new.building_id is not null
     and not exists (
       select 1
       from public.visit_buildings visit_building
       where visit_building.visit_id = new.visit_id
         and visit_building.building_id = new.building_id
     ) then
    raise exception 'Das Gebäude gehört nicht zum ausgewählten Einsatz';
  end if;
  return new;
end;
$$;

revoke all on function private.assert_operational_report_visit_building()
  from public, anon, authenticated;

drop trigger if exists operational_reports_visit_building_scope
  on public.operational_reports;
create trigger operational_reports_visit_building_scope
before insert or update of visit_id, building_id
on public.operational_reports
for each row execute function private.assert_operational_report_visit_building();
