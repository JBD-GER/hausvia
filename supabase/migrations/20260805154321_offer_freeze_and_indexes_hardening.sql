-- Offer V2 follow-up hardening: a frozen version must always carry complete
-- provider evidence, even when the RPC is called directly. Cover the foreign
-- keys used by offer lifecycle updates while this module is still new.

create or replace function private.enforce_complete_offer_issuer_on_freeze()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_issuer jsonb := coalesce(new.issuer_snapshot, '{}'::jsonb);
  v_missing text[] := '{}'::text[];
begin
  if new.frozen_at is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.frozen_at is not null then
    return new;
  end if;

  if nullif(btrim(coalesce(v_issuer ->> 'legal_name', '')), '') is null then
    v_missing := array_append(v_missing, 'rechtlicher Firmenname');
  end if;
  if nullif(btrim(coalesce(v_issuer ->> 'brand_name', '')), '') is null then
    v_missing := array_append(v_missing, 'Markenname');
  end if;
  if nullif(btrim(coalesce(v_issuer ->> 'street', '')), '') is null then
    v_missing := array_append(v_missing, 'Straße');
  end if;
  if nullif(btrim(coalesce(v_issuer ->> 'house_number', '')), '') is null then
    v_missing := array_append(v_missing, 'Hausnummer');
  end if;
  if nullif(btrim(coalesce(v_issuer ->> 'postal_code', '')), '') is null then
    v_missing := array_append(v_missing, 'Postleitzahl');
  end if;
  if nullif(btrim(coalesce(v_issuer ->> 'city', '')), '') is null then
    v_missing := array_append(v_missing, 'Ort');
  end if;
  if nullif(btrim(coalesce(v_issuer ->> 'country', '')), '') is null then
    v_missing := array_append(v_missing, 'Land');
  end if;
  if nullif(btrim(coalesce(v_issuer ->> 'tax_number', '')), '') is null
     and nullif(btrim(coalesce(v_issuer ->> 'vat_id', '')), '') is null then
    v_missing := array_append(v_missing, 'Steuernummer oder Umsatzsteuer-ID');
  end if;
  if nullif(btrim(coalesce(v_issuer ->> 'commercial_register', '')), '') is null then
    v_missing := array_append(v_missing, 'Handelsregister');
  end if;
  if nullif(btrim(coalesce(v_issuer ->> 'management', '')), '') is null then
    v_missing := array_append(v_missing, 'Geschäftsführung');
  end if;
  if nullif(btrim(coalesce(v_issuer ->> 'email', '')), '') is null
     or v_issuer ->> 'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    v_missing := array_append(v_missing, 'gültige E-Mail');
  end if;
  if nullif(btrim(coalesce(v_issuer ->> 'phone', '')), '') is null then
    v_missing := array_append(v_missing, 'Telefon');
  end if;
  if nullif(btrim(coalesce(v_issuer ->> 'bank_name', '')), '') is null then
    v_missing := array_append(v_missing, 'Bankname');
  end if;
  if nullif(btrim(coalesce(v_issuer ->> 'iban', '')), '') is null then
    v_missing := array_append(v_missing, 'IBAN');
  end if;
  if nullif(btrim(coalesce(v_issuer ->> 'bic', '')), '') is null then
    v_missing := array_append(v_missing, 'BIC');
  end if;

  if cardinality(v_missing) > 0 then
    raise exception using
      errcode = '23514',
      message = 'Vor dem Versiegeln müssen die Unternehmensdaten vollständig sein: '
        || array_to_string(v_missing, ', ');
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_complete_offer_issuer_on_freeze()
  from public, anon, authenticated, service_role;

drop trigger if exists offer_versions_require_complete_issuer_on_freeze
  on public.offer_versions;
create trigger offer_versions_require_complete_issuer_on_freeze
before insert or update of frozen_at on public.offer_versions
for each row execute function private.enforce_complete_offer_issuer_on_freeze();

create index if not exists offer_acceptances_accepted_by_idx
  on public.offer_acceptances(accepted_by);
create index if not exists offer_acceptances_offer_id_idx
  on public.offer_acceptances(offer_id);
create index if not exists offer_property_links_linked_by_idx
  on public.offer_property_links(linked_by);
create index if not exists offer_rejections_offer_id_idx
  on public.offer_rejections(offer_id);
create index if not exists offer_rejections_rejected_by_idx
  on public.offer_rejections(rejected_by);
create index if not exists offer_versions_created_by_idx
  on public.offer_versions(created_by);
create index if not exists offers_accepted_by_idx
  on public.offers(accepted_by);
create index if not exists offers_active_version_idx
  on public.offers(active_version_id);
create index if not exists offers_current_version_idx
  on public.offers(current_version_id);
create index if not exists offers_draft_version_idx
  on public.offers(draft_version_id);
create index if not exists offers_project_id_idx
  on public.offers(project_id);
