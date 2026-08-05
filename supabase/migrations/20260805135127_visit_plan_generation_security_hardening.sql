-- Keep the low-level schedule generator callable only by trusted server jobs.
-- Property lifecycle changes share the same schedule lock as plan mutations
-- and generation, so their multi-row visit updates cannot deadlock or race.

revoke execute on function public.generate_upcoming_visits(integer, uuid)
  from public, anon, authenticated;
grant execute on function public.generate_upcoming_visits(integer, uuid)
  to service_role;

alter function public.set_property_status(uuid, text)
  rename to set_property_status_unlocked;
alter function public.set_property_status_unlocked(uuid, text)
  set schema private;
revoke all on function private.set_property_status_unlocked(uuid, text)
  from public, anon, authenticated, service_role;

create or replace function public.set_property_status(
  p_property_id uuid,
  p_status text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not (select private.is_admin()) then
    raise exception using errcode = '42501', message = 'Nur Administratoren dürfen den Immobilienstatus ändern';
  end if;

  perform private.lock_visit_plan_schedule();
  return private.set_property_status_unlocked(p_property_id, p_status);
end;
$$;

revoke all on function public.set_property_status(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.set_property_status(uuid, text)
  to authenticated;
