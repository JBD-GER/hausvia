-- Open invitations must not reactivate a customer or employee after an admin
-- has explicitly deactivated that master record.

create or replace function private.revoke_customer_invitations_on_deactivation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('inactive', 'archived') and old.status is distinct from new.status then
    update public.invitations
    set status = 'revoked',
        revoked_at = coalesce(revoked_at, now()),
        expires_at = null,
        updated_at = now()
    where customer_id = new.id
      and status in ('draft', 'sent');
  end if;
  return new;
end;
$$;

drop trigger if exists customers_revoke_invitations_after_deactivation on public.customers;
create trigger customers_revoke_invitations_after_deactivation
after update of status on public.customers
for each row execute function private.revoke_customer_invitations_on_deactivation();

create or replace function private.revoke_employee_invitations_on_deactivation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'disabled' and old.status is distinct from new.status then
    update public.invitations
    set status = 'revoked',
        revoked_at = coalesce(revoked_at, now()),
        expires_at = null,
        updated_at = now()
    where employee_id = new.id
      and status in ('draft', 'sent');
  end if;
  return new;
end;
$$;

drop trigger if exists employee_profiles_revoke_invitations_after_deactivation on public.employee_profiles;
create trigger employee_profiles_revoke_invitations_after_deactivation
after update of status on public.employee_profiles
for each row execute function private.revoke_employee_invitations_on_deactivation();
