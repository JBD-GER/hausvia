-- Hausvia Portal security follow-up.
-- Keeps trigger/event-trigger helpers out of the exposed RPC surface and limits
-- background billing/planning RPCs to the server-side service role.

do $$
begin
  if exists (
    select 1
    from pg_extension extension
    join pg_namespace namespace on namespace.oid = extension.extnamespace
    where extension.extname = 'btree_gist'
      and namespace.nspname <> 'extensions'
  ) then
    alter extension btree_gist set schema extensions;
  end if;
end;
$$;

alter function public.touch_updated_at() set search_path = '';

do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke all on function public.rls_auto_enable() from public, anon, authenticated, service_role';
  end if;
end;
$$;

revoke execute on function public.claim_monthly_invoice(
  uuid,uuid,date,date,text,text,date,date,date,text,bigint,bigint,bigint,
  integer,jsonb,jsonb,jsonb,text
) from authenticated;

revoke execute on function public.generate_upcoming_visits(integer, uuid)
  from authenticated;

revoke execute on function public.next_invoice_number(date, text)
  from authenticated;

grant execute on function public.claim_monthly_invoice(
  uuid,uuid,date,date,text,text,date,date,date,text,bigint,bigint,bigint,
  integer,jsonb,jsonb,jsonb,text
) to service_role;

grant execute on function public.generate_upcoming_visits(integer, uuid)
  to service_role;

grant execute on function public.next_invoice_number(date, text)
  to service_role;
