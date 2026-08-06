-- A visit may only transition into the running state on or after its scheduled
-- Berlin calendar date. Keeping this as a table trigger makes the rule apply to
-- the employee RPC and to every other server-side write path.
create or replace function private.guard_visit_start_date()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status = 'started'
    and old.status is distinct from new.status
    and new.scheduled_date > ((pg_catalog.now() at time zone 'Europe/Berlin')::date)
  then
    raise exception 'Der Einsatz kann frühestens am geplanten Einsatztag gestartet werden';
  end if;

  return new;
end;
$$;

revoke all on function private.guard_visit_start_date() from public, anon, authenticated;
grant execute on function private.guard_visit_start_date() to service_role;

drop trigger if exists visits_guard_start_date on public.visits;
create trigger visits_guard_start_date
before update of status on public.visits
for each row
when (old.status is distinct from new.status)
execute function private.guard_visit_start_date();

comment on function private.guard_visit_start_date() is
  'Prevents a visit from starting before its scheduled Europe/Berlin calendar date.';

-- Once an active employee has personally started a visit, a later assignment
-- change must not strand the visit. The narrow started_by fallback deliberately
-- applies only while that exact visit is running. Disabling the employee profile
-- still revokes access immediately because current_employee_id() becomes null.
-- Existing task, instruction, attachment and Storage policies already call this
-- helper and therefore inherit the same constrained continuation permission.
create or replace function private.can_work_visit(p_visit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with actor as (
    select
      (select auth.uid()) as user_id,
      (select private.current_employee_id()) as employee_id
  )
  select exists (
    select 1
    from public.visits v
    cross join actor i
    where v.id = p_visit_id
      and i.employee_id is not null
      and (
        (
          v.status = 'started'
          and v.started_by = i.user_id
        )
        or (
          (select private.is_employee_of_property(v.property_id))
          and (
            v.primary_employee_id = i.employee_id
            or exists (
              select 1
              from public.visit_plan_employees vpe
              where vpe.visit_plan_id = v.visit_plan_id
                and vpe.employee_id = i.employee_id
            )
            or (
              v.primary_employee_id is null
              and not exists (
                select 1
                from public.visit_plan_employees assigned
                where assigned.visit_plan_id = v.visit_plan_id
              )
            )
          )
        )
      )
  )
$$;

revoke all on function private.can_work_visit(uuid) from public, anon;
grant execute on function private.can_work_visit(uuid) to authenticated, service_role;

comment on function private.can_work_visit(uuid) is
  'Allows assigned employees to work a visit and lets an active starter finish their own running visit after assignment changes.';
