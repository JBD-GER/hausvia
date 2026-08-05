-- Keep master-record status, linked profile state, invitation lifecycle and
-- audit evidence within a single database transaction.

create or replace function public.set_customer_status(
  p_customer_id uuid,
  p_status public.customer_status
)
returns public.customer_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous public.customer_status;
begin
  if not (select private.is_admin()) then
    raise exception 'Nur Administratoren dürfen den Kundenstatus ändern';
  end if;
  if p_status not in ('active', 'inactive', 'archived') then
    raise exception 'Ungültiger Kundenstatus';
  end if;

  select status into v_previous
  from public.customers
  where id = p_customer_id
  for update;
  if v_previous is null then
    raise exception 'Kunde wurde nicht gefunden';
  end if;
  if v_previous = p_status then
    return v_previous;
  end if;

  update public.customers
  set status = p_status,
      archived_at = case when p_status = 'archived' then now() else null end
  where id = p_customer_id;

  insert into public.audit_logs (
    actor_id, action, entity_table, entity_id, metadata
  ) values (
    (select auth.uid()), 'customer.status_changed', 'customers', p_customer_id,
    jsonb_build_object('previous_status', v_previous, 'status', p_status)
  );
  return p_status;
end;
$$;

revoke all on function public.set_customer_status(uuid, public.customer_status)
  from public, anon;
grant execute on function public.set_customer_status(uuid, public.customer_status)
  to authenticated;

create or replace function public.set_employee_status(
  p_employee_id uuid,
  p_status public.profile_status
)
returns public.profile_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous public.profile_status;
  v_user_id uuid;
begin
  if not (select private.is_admin()) then
    raise exception 'Nur Administratoren dürfen den Mitarbeiterstatus ändern';
  end if;
  if p_status not in ('active', 'disabled') then
    raise exception 'Ungültiger Mitarbeiterstatus';
  end if;

  select status, user_id into v_previous, v_user_id
  from public.employee_profiles
  where id = p_employee_id
  for update;
  if v_previous is null then
    raise exception 'Mitarbeiter wurde nicht gefunden';
  end if;
  if v_previous = p_status then
    return v_previous;
  end if;

  update public.employee_profiles
  set status = p_status,
      archived_at = case when p_status = 'disabled' then now() else null end
  where id = p_employee_id;

  if v_user_id is not null then
    update public.user_profiles
    set status = p_status
    where id = v_user_id;
  end if;

  insert into public.audit_logs (
    actor_id, action, entity_table, entity_id, metadata
  ) values (
    (select auth.uid()), 'employee.status_changed', 'employee_profiles', p_employee_id,
    jsonb_build_object('previous_status', v_previous, 'status', p_status)
  );
  return p_status;
end;
$$;

revoke all on function public.set_employee_status(uuid, public.profile_status)
  from public, anon;
grant execute on function public.set_employee_status(uuid, public.profile_status)
  to authenticated;
