-- Property assignments are an operational prerequisite for visit plans and
-- open visits. Ending one must not strand future work or a running employee.

create or replace function private.require_assignable_employee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_employee_status public.profile_status;
begin
  if not new.active then
    return new;
  end if;

  select status
  into v_employee_status
  from public.employee_profiles
  where id = new.employee_id
  for update;
  if not found or v_employee_status not in ('invited', 'active') then
    raise exception 'Deaktivierte Mitarbeiter können keiner Immobilie zugeordnet werden';
  end if;
  return new;
end;
$$;

revoke all on function private.require_assignable_employee()
  from public, anon, authenticated, service_role;

drop trigger if exists property_employee_assignments_require_assignable_employee
  on public.property_employee_assignments;
create trigger property_employee_assignments_require_assignable_employee
before insert or update of employee_id, active
on public.property_employee_assignments
for each row
when (new.active)
execute function private.require_assignable_employee();

create or replace function private.prevent_employee_deactivation_with_assignments()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'disabled' or new.status <> 'disabled' then
    return new;
  end if;
  if exists (
    select 1
    from public.property_employee_assignments as assignment
    where assignment.employee_id = old.id
      and assignment.active = true
  ) then
    raise exception 'Aktive Immobilienzuordnungen müssen vor der Mitarbeiterdeaktivierung beendet werden';
  end if;
  return new;
end;
$$;

revoke all on function private.prevent_employee_deactivation_with_assignments()
  from public, anon, authenticated, service_role;

drop trigger if exists employee_profiles_protect_active_assignments
  on public.employee_profiles;
create trigger employee_profiles_protect_active_assignments
before update of status on public.employee_profiles
for each row
when (old.status <> 'disabled' and new.status = 'disabled')
execute function private.prevent_employee_deactivation_with_assignments();

create or replace function private.prevent_assignment_deactivation_with_work()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_property_status text;
  v_employee_user_id uuid;
begin
  if old.active = false or new.active = true then
    return new;
  end if;

  select status
  into v_property_status
  from public.properties
  where id = old.property_id;

  -- Property archival changes the parent first and then closes every child in
  -- the same transaction, so its coordinated cleanup remains allowed.
  if v_property_status = 'archived' then
    return new;
  end if;

  if exists (
    select 1
    from public.visit_plans as plan
    where plan.property_id = old.property_id
      and plan.status = 'active'
      and (
        plan.primary_employee_id = old.employee_id
        or exists (
          select 1
          from public.visit_plan_employees as additional
          where additional.visit_plan_id = plan.id
            and additional.employee_id = old.employee_id
        )
      )
  ) then
    raise exception 'Mitarbeiter ist noch einem aktiven Besuchsplan zugeordnet';
  end if;

  if exists (
    select 1
    from public.visits as visit
    where visit.property_id = old.property_id
      and visit.primary_employee_id = old.employee_id
      and visit.status in ('scheduled', 'started')
  ) then
    raise exception 'Mitarbeiter ist noch einem offenen Einsatz zugeordnet';
  end if;

  select user_id
  into v_employee_user_id
  from public.employee_profiles
  where id = old.employee_id;

  if v_employee_user_id is not null and exists (
    select 1
    from public.visits as visit
    where visit.property_id = old.property_id
      and visit.status = 'started'
      and visit.started_by = v_employee_user_id
  ) then
    raise exception 'Mitarbeiter hat noch einen laufenden Einsatz';
  end if;

  return new;
end;
$$;

revoke all on function private.prevent_assignment_deactivation_with_work()
  from public, anon, authenticated, service_role;

drop trigger if exists property_employee_assignments_protect_open_work
  on public.property_employee_assignments;
create trigger property_employee_assignments_protect_open_work
before update of active on public.property_employee_assignments
for each row
when (old.active and not new.active)
execute function private.prevent_assignment_deactivation_with_work();

create or replace function private.prevent_property_employee_assignment_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'Mitarbeiterzuordnungen werden beendet und nicht gelöscht';
end;
$$;

revoke all on function private.prevent_property_employee_assignment_delete()
  from public, anon, authenticated, service_role;

drop trigger if exists property_employee_assignments_prevent_delete
  on public.property_employee_assignments;
create trigger property_employee_assignments_prevent_delete
before delete on public.property_employee_assignments
for each row
execute function private.prevent_property_employee_assignment_delete();
