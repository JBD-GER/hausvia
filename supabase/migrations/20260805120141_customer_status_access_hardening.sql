-- Deactivated or archived customer accounts must immediately lose portal access.
-- Customer membership alone is not sufficient while the owning customer record
-- is outside the active lifecycle state.

create or replace function private.is_customer_of_customer(p_customer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.customer_users cu
    join public.customers c on c.id = cu.customer_id
    join public.user_profiles up on up.id = cu.user_id
    where cu.customer_id = p_customer_id
      and cu.user_id = (select auth.uid())
      and cu.active = true
      and c.status = 'active'
      and up.status = 'active'
      and up.onboarding_completed = true
  )
$$;

create or replace function private.is_customer_of_property(p_property_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.properties p
    where p.id = p_property_id
      and p.status <> 'archived'
      and (select private.is_customer_of_customer(p.customer_id))
  )
$$;

drop policy if exists customer_users_select_own on public.customer_users;
create policy customer_users_select_own
on public.customer_users for select to authenticated
using (
  user_id = (select auth.uid())
  and active = true
  and (select private.is_active_profile())
  and exists (
    select 1
    from public.customers c
    where c.id = customer_users.customer_id
      and c.status = 'active'
  )
);
