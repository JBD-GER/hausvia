-- Hausvia offer module V2
--
-- Offers are long-lived containers. Every customer-visible document lives in
-- offer_versions and becomes immutable as soon as it is frozen for delivery.
-- Money is stored in cents and recurring billing bases remain separate.

create table public.offer_sequences (
  year integer primary key check (year between 2000 and 9999),
  last_value bigint not null check (last_value > 0),
  updated_at timestamptz not null default now()
);

alter table public.offers
  add column if not exists lifecycle_status text not null default 'draft',
  add column if not exists current_version_id uuid,
  add column if not exists active_version_id uuid,
  add column if not exists draft_version_id uuid,
  add column if not exists source_offer_id uuid references public.offers(id) on delete set null,
  add column if not exists last_viewed_at timestamptz,
  add column if not exists withdrawn_at timestamptz;

alter table public.offers
  add constraint offers_lifecycle_status_check
  check (lifecycle_status in (
    'draft', 'sent', 'viewed', 'accepted', 'rejected', 'expired',
    'withdrawn', 'linked'
  )) not valid;

do $offer_number_preflight$
declare
  v_duplicates text;
begin
  select string_agg(
    duplicate.offer_number || ' (' || duplicate.occurrences::text || 'x)',
    ', ' order by duplicate.offer_number
  )
  into v_duplicates
  from (
    select offer_number, count(*) as occurrences
    from public.offers
    where offer_number is not null
    group by offer_number
    having count(*) > 1
    order by offer_number
    limit 20
  ) duplicate;

  if v_duplicates is not null then
    raise exception using
      message = 'Die Eindeutigkeit der Angebotsnummern kann nicht aktiviert werden.',
      detail = 'Doppelte Angebotsnummern: ' || v_duplicates,
      hint = 'Die historischen Dubletten müssen vor dem erneuten Ausführen fachlich bereinigt werden.';
  end if;
end;
$offer_number_preflight$;

-- Historic rows without a number keep a stable migration identifier. This is
-- required so that a later draft revision never inherits a NULL number.
update public.offers
set offer_number = 'LEGACY-' || upper(replace(id::text, '-', ''))
where offer_number is null;

-- Continue behind already issued sequential numbers instead of repeatedly
-- colliding with the first historic ANG number.
insert into public.offer_sequences (year, last_value, updated_at)
select
  split_part(offer.offer_number, '-', 2)::integer,
  max(split_part(offer.offer_number, '-', 3)::bigint),
  now()
from public.offers offer
where offer.offer_number ~ '^ANG-[0-9]{4}-[0-9]{6,}$'
  and split_part(offer.offer_number, '-', 3)::bigint > 0
group by split_part(offer.offer_number, '-', 2)::integer
on conflict (year) do update
set last_value = greatest(public.offer_sequences.last_value, excluded.last_value),
    updated_at = now();

create unique index if not exists offers_offer_number_uidx
  on public.offers(offer_number)
  where offer_number is not null;
create index if not exists offers_customer_lifecycle_idx
  on public.offers(customer_id, lifecycle_status, created_at desc);
create index if not exists offers_source_offer_idx
  on public.offers(source_offer_id);
create index if not exists offer_items_offer_id_idx
  on public.offer_items(offer_id, sort_order);

create table public.offer_versions (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.offers(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  version_number integer not null check (version_number > 0),
  lifecycle_status text not null default 'draft' check (lifecycle_status in (
    'draft', 'sent', 'viewed', 'accepted', 'rejected', 'expired',
    'withdrawn', 'superseded', 'linked'
  )),
  offer_number text not null,
  title text not null,
  contact_name text,
  recipient_snapshot jsonb not null default '{}'::jsonb,
  object_label text,
  object_address text,
  offer_date date not null,
  valid_until date not null,
  planned_start_date date,
  intro text,
  visible_note text,
  internal_note text,
  payment_terms text,
  contract_terms text,
  issuer_snapshot jsonb not null default '{}'::jsonb,
  subtotal_cents bigint not null default 0 check (subtotal_cents >= 0),
  discount_total_cents bigint not null default 0 check (
    discount_total_cents >= 0 and discount_total_cents <= subtotal_cents
  ),
  net_total_cents bigint not null default 0 check (net_total_cents >= 0),
  tax_total_cents bigint not null default 0 check (tax_total_cents >= 0),
  gross_total_cents bigint not null default 0 check (gross_total_cents >= 0),
  billing_totals jsonb not null default '{}'::jsonb,
  calculation_snapshot jsonb not null default '{}'::jsonb,
  frozen_at timestamptz,
  sent_at timestamptz,
  viewed_at timestamptz,
  accepted_at timestamptz,
  rejected_at timestamptz,
  withdrawn_at timestamptz,
  withdrawal_reason text,
  superseded_at timestamptz,
  original_pdf_bucket text,
  original_pdf_path text,
  original_pdf_sha256 text,
  document_content_sha256 text,
  last_email_sent_at timestamptz,
  last_email_error text,
  created_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (offer_id, version_number),
  unique (offer_number, version_number),
  check (length(btrim(title)) between 1 and 240),
  check (valid_until >= offer_date),
  check (net_total_cents = subtotal_cents - discount_total_cents),
  check (gross_total_cents = net_total_cents + tax_total_cents),
  check (
    (original_pdf_bucket is null and original_pdf_path is null and original_pdf_sha256 is null)
    or (
      original_pdf_bucket is not null and original_pdf_path is not null
      and original_pdf_sha256 ~ '^[0-9a-f]{64}$'
    )
  ),
  check (document_content_sha256 is null or document_content_sha256 ~ '^[0-9a-f]{64}$'),
  check (sent_at is null or frozen_at is not null)
);

create index offer_versions_offer_history_idx
  on public.offer_versions(offer_id, version_number desc);
create index offer_versions_customer_status_idx
  on public.offer_versions(customer_id, lifecycle_status, created_at desc);
create index offer_versions_validity_idx
  on public.offer_versions(valid_until, lifecycle_status)
  where lifecycle_status in ('sent', 'viewed');
alter table public.offers
  add constraint offers_current_version_fk
  foreign key (current_version_id) references public.offer_versions(id) on delete restrict,
  add constraint offers_active_version_fk
  foreign key (active_version_id) references public.offer_versions(id) on delete restrict,
  add constraint offers_draft_version_fk
  foreign key (draft_version_id) references public.offer_versions(id) on delete restrict;

create table public.offer_version_items (
  id uuid primary key default gen_random_uuid(),
  offer_version_id uuid not null references public.offer_versions(id) on delete cascade,
  client_key text not null,
  service_catalog_id uuid references public.service_catalog(id) on delete set null,
  item_kind text not null check (item_kind in ('standard', 'winter', 'custom')),
  title text not null,
  description text,
  area_sqm numeric(12,2) not null default 0 check (area_sqm >= 0),
  quantity numeric(12,2) not null default 1 check (quantity > 0),
  unit text not null check (unit in (
    'square_meter', 'piece', 'hour', 'visit', 'month', 'flat'
  )),
  frequency text not null check (frequency in (
    'once', 'weekly', 'multiple_weekly', 'monthly', 'quarterly',
    'yearly', 'on_demand'
  )),
  frequency_occurrences integer not null default 1 check (frequency_occurrences between 1 and 31),
  billing_type text not null check (billing_type in (
    'one_time', 'monthly', 'per_visit', 'per_hour', 'per_sqm', 'custom_flat'
  )),
  calculation_type text not null default 'base_plus_area' check (calculation_type in (
    'base_plus_area', 'per_unit', 'per_hour', 'per_visit', 'flat', 'custom'
  )),
  unit_price_cents bigint not null default 0 check (unit_price_cents >= 0),
  minimum_price_cents bigint not null default 0 check (minimum_price_cents >= 0),
  automatic_total_cents bigint not null default 0 check (automatic_total_cents >= 0),
  total_net_cents bigint not null default 0 check (total_net_cents >= 0),
  tax_rate_bps integer not null default 1900 check (tax_rate_bps between 0 and 10000),
  manual_price boolean not null default false,
  permanent boolean not null default true,
  seasonal boolean not null default false,
  season_start_month integer check (season_start_month between 1 and 12),
  season_end_month integer check (season_end_month between 1 and 12),
  visible_note text,
  winter_surface_type text check (winter_surface_type is null or winter_surface_type in (
    'sidewalk', 'entrance', 'driveway', 'parking', 'courtyard', 'stairs', 'other'
  )),
  winter_model text check (winter_model is null or winter_model in (
    'seasonal_flat', 'monthly_plus_visit', 'per_visit', 'custom_flat'
  )),
  included_visits integer not null default 0 check (included_visits >= 0),
  additional_visit_price_cents bigint not null default 0 check (additional_visit_price_cents >= 0),
  monthly_base_fee_cents bigint not null default 0 check (monthly_base_fee_cents >= 0),
  seasonal_flat_rate_cents bigint not null default 0 check (seasonal_flat_rate_cents >= 0),
  surcharge_cents bigint not null default 0 check (surcharge_cents >= 0),
  price_components jsonb not null default '[]'::jsonb,
  pricing_snapshot jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0 check (sort_order between 0 and 100000),
  created_at timestamptz not null default now(),
  check (length(btrim(title)) between 1 and 240),
  unique (offer_version_id, client_key),
  check (
    seasonal = false
    or (season_start_month is not null and season_end_month is not null)
  ),
  check (item_kind <> 'winter' or winter_model is not null)
);

create index offer_version_items_version_idx
  on public.offer_version_items(offer_version_id, sort_order);
create index offer_version_items_catalog_idx
  on public.offer_version_items(service_catalog_id);

create table public.offer_discounts (
  id uuid primary key default gen_random_uuid(),
  offer_version_id uuid not null references public.offer_versions(id) on delete cascade,
  offer_item_id uuid references public.offer_version_items(id) on delete cascade,
  scope text not null check (scope in ('item', 'overall')),
  discount_type text not null check (discount_type in ('percent', 'fixed')),
  percentage_bps integer check (percentage_bps is null or percentage_bps between 0 and 10000),
  amount_cents bigint check (amount_cents is null or amount_cents >= 0),
  applied_amount_cents bigint not null default 0 check (applied_amount_cents >= 0),
  reason text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  check (length(btrim(reason)) between 1 and 240),
  check (
    (scope = 'item' and offer_item_id is not null)
    or (scope = 'overall' and offer_item_id is null)
  ),
  check (
    (discount_type = 'percent' and percentage_bps is not null and amount_cents is null)
    or (discount_type = 'fixed' and amount_cents is not null and percentage_bps is null)
  )
);

create index offer_discounts_version_idx
  on public.offer_discounts(offer_version_id, sort_order);
create index offer_discounts_item_idx
  on public.offer_discounts(offer_item_id)
  where offer_item_id is not null;

create table public.service_pricing_rules (
  id uuid primary key default gen_random_uuid(),
  service_catalog_id uuid not null unique references public.service_catalog(id) on delete restrict,
  calculation_type text not null default 'base_plus_area' check (calculation_type in (
    'base_plus_area', 'per_unit', 'per_hour', 'per_visit', 'flat', 'custom'
  )),
  default_billing_type text not null default 'monthly' check (default_billing_type in (
    'one_time', 'monthly', 'per_visit', 'per_hour', 'per_sqm', 'custom_flat'
  )),
  base_price_cents bigint not null default 0 check (base_price_cents >= 0),
  price_per_sqm_cents bigint not null default 0 check (price_per_sqm_cents >= 0),
  minimum_price_cents bigint not null default 0 check (minimum_price_cents >= 0),
  price_per_visit_cents bigint not null default 0 check (price_per_visit_cents >= 0),
  price_per_hour_cents bigint not null default 0 check (price_per_hour_cents >= 0),
  unit_price_cents bigint not null default 0 check (unit_price_cents >= 0),
  frequency_factor numeric(8,4) not null default 1 check (frequency_factor >= 0),
  seasonal_surcharge_bps integer not null default 0 check (seasonal_surcharge_bps between 0 and 100000),
  material_flat_fee_cents bigint not null default 0 check (material_flat_fee_cents >= 0),
  winter_model text check (winter_model is null or winter_model in (
    'seasonal_flat', 'monthly_plus_visit', 'per_visit', 'custom_flat'
  )),
  included_visits integer not null default 0 check (included_visits >= 0),
  additional_visit_price_cents bigint not null default 0 check (additional_visit_price_cents >= 0),
  monthly_base_fee_cents bigint not null default 0 check (monthly_base_fee_cents >= 0),
  seasonal_flat_rate_cents bigint not null default 0 check (seasonal_flat_rate_cents >= 0),
  custom_formula text,
  is_active boolean not null default true,
  created_by uuid references public.user_profiles(id) on delete set null,
  updated_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger service_pricing_rules_touch_updated_at
before update on public.service_pricing_rules
for each row execute function public.touch_updated_at();

insert into public.service_pricing_rules (
  service_catalog_id, calculation_type, default_billing_type, winter_model
)
select
  catalog.id,
  case when catalog.service_key = 'winterdienst' then 'per_visit' else 'base_plus_area' end,
  case when catalog.service_key = 'winterdienst' then 'per_visit' else 'monthly' end,
  case when catalog.service_key = 'winterdienst' then 'monthly_plus_visit' else null end
from public.service_catalog catalog
on conflict (service_catalog_id) do nothing;

create table public.offer_acceptances (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.offers(id) on delete restrict,
  offer_version_id uuid not null unique references public.offer_versions(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  accepted_by uuid not null references public.user_profiles(id) on delete restrict,
  accepted_name text not null,
  accepted_at timestamptz not null default now(),
  confirmed_gross_total_cents bigint not null check (confirmed_gross_total_cents >= 0),
  confirmed_totals jsonb not null default '{}'::jsonb,
  confirmed_content_sha256 text not null check (confirmed_content_sha256 ~ '^[0-9a-f]{64}$'),
  comment text,
  acceptance_ip text,
  user_agent text,
  confirmation_pdf_bucket text,
  confirmation_pdf_path text,
  confirmation_pdf_sha256 text,
  created_at timestamptz not null default now(),
  check (length(btrim(accepted_name)) between 2 and 200),
  check (comment is null or length(comment) <= 4000),
  check (
    (confirmation_pdf_bucket is null and confirmation_pdf_path is null and confirmation_pdf_sha256 is null)
    or (
      confirmation_pdf_bucket is not null and confirmation_pdf_path is not null
      and confirmation_pdf_sha256 ~ '^[0-9a-f]{64}$'
    )
  )
);

create index offer_acceptances_customer_idx
  on public.offer_acceptances(customer_id, accepted_at desc);

-- Customer acceptance is committed independently of PDF rendering and email
-- delivery. The durable outbox guarantees that a direct RPC invocation cannot
-- bypass those recoverable follow-up steps.
create table public.offer_acceptance_delivery_jobs (
  id uuid primary key default gen_random_uuid(),
  acceptance_id uuid not null unique
    references public.offer_acceptances(id) on delete restrict,
  status text not null default 'pending' check (status in (
    'pending', 'processing', 'sent', 'failed'
  )),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  processing_started_at timestamptz,
  last_attempt_at timestamptz,
  sent_at timestamptz,
  failed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (last_error is null or length(last_error) <= 4000),
  check (status <> 'sent' or sent_at is not null)
);

create index offer_acceptance_delivery_jobs_queue_idx
  on public.offer_acceptance_delivery_jobs(status, available_at, created_at)
  where status in ('pending', 'failed');

create trigger offer_acceptance_delivery_jobs_touch_updated_at
before update on public.offer_acceptance_delivery_jobs
for each row execute function public.touch_updated_at();

create table public.offer_rejections (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.offers(id) on delete restrict,
  offer_version_id uuid not null unique references public.offer_versions(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  rejected_by uuid not null references public.user_profiles(id) on delete restrict,
  rejected_name text,
  comment text,
  rejected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (comment is null or length(comment) <= 4000)
);

create index offer_rejections_customer_idx
  on public.offer_rejections(customer_id, rejected_at desc);

create table public.offer_property_links (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.offers(id) on delete restrict,
  offer_version_id uuid not null unique references public.offer_versions(id) on delete restrict,
  property_id uuid not null references public.properties(id) on delete restrict,
  linked_by uuid not null references public.user_profiles(id) on delete restrict,
  linked_at timestamptz not null default now(),
  import_completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (offer_id, property_id)
);

create index offer_property_links_property_idx
  on public.offer_property_links(property_id, linked_at desc);

create table public.offer_property_item_links (
  id uuid primary key default gen_random_uuid(),
  offer_property_link_id uuid not null references public.offer_property_links(id) on delete cascade,
  offer_item_id uuid not null references public.offer_version_items(id) on delete restrict,
  property_service_id uuid not null references public.property_services(id) on delete restrict,
  scope text not null check (scope in ('property', 'buildings')),
  agreed_price_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (offer_property_link_id, offer_item_id),
  unique (property_service_id)
);

create index offer_property_item_links_item_idx
  on public.offer_property_item_links(offer_item_id);

alter table public.property_services
  add column if not exists source_offer_version_item_id uuid
    references public.offer_version_items(id) on delete restrict;

create unique index if not exists property_services_source_offer_item_uidx
  on public.property_services(source_offer_version_item_id)
  where source_offer_version_item_id is not null;

create or replace function private.require_offer_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (
    coalesce((select private.is_admin()), false)
    or coalesce((select private.is_service_role()), false)
  ) then
    raise exception using
      errcode = '42501',
      message = 'Nur Administratoren dürfen Angebote verwalten';
  end if;
end;
$$;

revoke all on function private.require_offer_admin()
  from public, anon, authenticated, service_role;

create or replace function public.next_offer_number(
  p_offer_date date default ((now() at time zone 'Europe/Berlin')::date)
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_year integer;
  v_value bigint;
begin
  perform private.require_offer_admin();
  v_year := extract(year from coalesce(
    p_offer_date,
    (now() at time zone 'Europe/Berlin')::date
  ))::integer;

  insert into public.offer_sequences (year, last_value, updated_at)
  values (v_year, 1, now())
  on conflict (year) do update
    set last_value = public.offer_sequences.last_value + 1,
        updated_at = now()
  returning last_value into v_value;

  return 'ANG-' || v_year::text || '-' || lpad(v_value::text, 6, '0');
end;
$$;

revoke all on function public.next_offer_number(date)
  from public, anon;
grant execute on function public.next_offer_number(date)
  to authenticated, service_role;

-- Preserve every legacy offer as version 1. Legacy identifiers remain valid
-- evidence and are intentionally not rewritten to the new number format.
update public.offers
set lifecycle_status = case status::text
  when 'draft' then 'draft'
  when 'released' then 'sent'
  when 'accepted' then 'accepted'
  when 'rejected' then 'rejected'
  when 'expired' then 'expired'
  when 'archived' then 'withdrawn'
  else 'draft'
end
where current_version_id is null;

insert into public.offer_versions (
  offer_id,
  customer_id,
  version_number,
  lifecycle_status,
  offer_number,
  title,
  contact_name,
  recipient_snapshot,
  object_label,
  object_address,
  offer_date,
  valid_until,
  planned_start_date,
  intro,
  visible_note,
  internal_note,
  payment_terms,
  contract_terms,
  issuer_snapshot,
  subtotal_cents,
  discount_total_cents,
  net_total_cents,
  tax_total_cents,
  gross_total_cents,
  billing_totals,
  calculation_snapshot,
  frozen_at,
  sent_at,
  viewed_at,
  accepted_at,
  rejected_at,
  withdrawn_at,
  original_pdf_bucket,
  original_pdf_path,
  created_at,
  updated_at
)
select
  offer.id,
  offer.customer_id,
  1,
  offer.lifecycle_status,
  coalesce(offer.offer_number, 'LEGACY-' || upper(replace(offer.id::text, '-', ''))),
  left(coalesce(
    nullif(btrim(offer.title), ''),
    'Historisches Angebot ' || coalesce(
      nullif(btrim(offer.offer_number), ''),
      left(offer.id::text, 12)
    )
  ), 240),
  customer.contact_name,
  jsonb_strip_nulls(jsonb_build_object(
    'company_name', customer.company_name,
    'contact_name', customer.contact_name,
    'first_name', customer.first_name,
    'last_name', customer.last_name,
    'email', customer.email,
    'phone', customer.phone,
    'recipient_name', coalesce(
      customer.company_name,
      nullif(concat_ws(' ', customer.first_name, customer.last_name), ''),
      customer.contact_name,
      customer.email
    ),
    'address', coalesce(
      nullif(concat_ws(' ', customer.billing_street, customer.billing_house_number), ''),
      customer.billing_address
    ),
    'postal_code', customer.billing_postal_code,
    'city', customer.billing_city,
    'country', customer.billing_country
  )),
  project.name,
  project.object_address,
  (offer.created_at at time zone 'Europe/Berlin')::date,
  ((offer.created_at at time zone 'Europe/Berlin')::date + 30),
  project.care_started_at,
  offer.intro,
  offer.closing_text,
  offer.admin_notes,
  case
    when offer.billing_in_advance then
      'Abrechnung im Voraus nach vereinbartem Leistungsintervall.'
    else 'Zahlbar nach vereinbartem Leistungsintervall.'
  end,
  offer.billing_interval_label,
  jsonb_strip_nulls(jsonb_build_object(
    'legal_name', settings.legal_name,
    'brand_name', settings.brand_name,
    'street', settings.street,
    'house_number', settings.house_number,
    'postal_code', settings.postal_code,
    'city', settings.city,
    'country', settings.country,
    'tax_number', settings.tax_number,
    'vat_id', settings.vat_id,
    'commercial_register', settings.commercial_register,
    'management', settings.management,
    'email', settings.email,
    'phone', settings.phone,
    'bank_name', settings.bank_name,
    'iban', settings.iban,
    'bic', settings.bic
  )),
  legacy_money.net_cents,
  0,
  legacy_money.net_cents,
  legacy_money.tax_cents,
  legacy_money.net_cents + legacy_money.tax_cents,
  jsonb_build_object(
    case
      when offer.billing_mode = 'monthly' then 'monthly'
      when offer.billing_mode = 'one_time' then 'one_time'
      else 'seasonal'
    end,
    jsonb_build_object(
      'subtotal_cents', legacy_money.net_cents,
      'discount_cents', 0,
      'net_cents', legacy_money.net_cents,
      'tax_cents', legacy_money.tax_cents,
      'gross_cents', legacy_money.net_cents + legacy_money.tax_cents
    )
  ),
  jsonb_build_object(
    'source', 'legacy-backfill',
    'normalization_version', 1,
    'workflow_mode', case
      when offer.lifecycle_status = 'draft' then 'legacy_draft_pending_resave'
      else 'historical_read_only'
    end,
    'tax_rate_bps', legacy_money.tax_rate_bps,
    'legacy_status', offer.status::text,
    'legacy_original', jsonb_build_object(
      'title', offer.title,
      'net_total', offer.net_total,
      'tax_rate', offer.tax_rate,
      'tax_total', offer.tax_total,
      'gross_total', offer.gross_total,
      'document_path', offer.document_path,
      'released_at', offer.released_at,
      'sent_at', offer.sent_at,
      'accepted_at', offer.accepted_at,
      'accepted_by', offer.accepted_by,
      'acceptance_name', offer.acceptance_name,
      'acceptance_signature', offer.acceptance_signature,
      'acceptance_confirmed', offer.acceptance_confirmed,
      'acceptance_ip', offer.acceptance_ip
    ),
    'evidence', jsonb_build_object(
      'original_pdf_hash_available', false,
      'content_hash_available', false,
      'acceptance_evidence_migrated', false,
      'transition_note', case
        when offer.lifecycle_status = 'accepted' then
          'Historisch als angenommen übernommen; kein neuer Annahmebeleg oder Hash wurde erfunden.'
        when offer.lifecycle_status = 'sent' then
          'Historisch als versendet übernommen; für eine neue Portalannahme ist eine neue Revision erforderlich.'
        else
          'Historischer Status wurde unverändert dokumentiert; neue Kundenentscheidungen sind gesperrt.'
      end
    )
  ),
  case when offer.lifecycle_status <> 'draft' then
    coalesce(
      offer.sent_at,
      offer.released_at,
      offer.accepted_at,
      offer.updated_at,
      offer.created_at
    )
  end,
  case when offer.lifecycle_status <> 'draft' then
    coalesce(
      offer.sent_at,
      offer.released_at,
      offer.accepted_at,
      offer.updated_at,
      offer.created_at
    )
  end,
  offer.last_viewed_at,
  case when offer.lifecycle_status = 'accepted' then
    coalesce(offer.accepted_at, offer.updated_at, offer.created_at)
  else offer.accepted_at end,
  case when offer.lifecycle_status = 'rejected' then offer.updated_at end,
  case when offer.lifecycle_status = 'withdrawn' then coalesce(offer.withdrawn_at, offer.updated_at) end,
  null,
  null,
  offer.created_at,
  offer.updated_at
from public.offers offer
join public.customers customer on customer.id = offer.customer_id
left join public.projects project on project.id = offer.project_id
left join public.company_settings settings on settings.id = true
cross join lateral (
  select
    greatest(coalesce(round(offer.net_total * 100)::bigint, 0), 0) as net_cents,
    greatest(coalesce(round(offer.tax_total * 100)::bigint, 0), 0) as tax_cents,
    greatest(
      0,
      least(10000, coalesce(round(offer.tax_rate * 100)::integer, 0))
    ) as tax_rate_bps
) legacy_money
where offer.current_version_id is null
on conflict (offer_id, version_number) do nothing;

insert into public.offer_version_items (
  offer_version_id,
  client_key,
  item_kind,
  title,
  description,
  quantity,
  unit,
  frequency,
  billing_type,
  calculation_type,
  unit_price_cents,
  automatic_total_cents,
  total_net_cents,
  tax_rate_bps,
  manual_price,
  permanent,
  price_components,
  pricing_snapshot,
  sort_order,
  created_at
)
select
  version.id,
  item.id::text,
  'custom',
  left(coalesce(
    nullif(btrim(item.title), ''),
    'Historische Position ' || left(item.id::text, 12)
  ), 240),
  item.description,
  greatest(coalesce(item.quantity, 1), 0.01),
  case lower(item.unit)
    when 'quadratmeter' then 'square_meter'
    when 'm²' then 'square_meter'
    when 'stück' then 'piece'
    when 'stunde' then 'hour'
    when 'einsatz' then 'visit'
    when 'monat' then 'month'
    else 'flat'
  end,
  case
    when offer.billing_mode = 'monthly' then 'monthly'
    else 'once'
  end,
  case
    when offer.billing_mode = 'monthly' then 'monthly'
    else 'one_time'
  end,
  'custom',
  legacy_item.unit_net_cents,
  legacy_item.total_net_cents,
  legacy_item.total_net_cents,
  legacy_item.tax_rate_bps,
  true,
  offer.billing_mode = 'monthly',
  jsonb_build_array(jsonb_build_object(
    'bucket', case when offer.billing_mode = 'monthly' then 'monthly' else 'one_time' end,
    'label', left(coalesce(
      nullif(btrim(item.title), ''),
      'Historische Position ' || left(item.id::text, 12)
    ), 240),
    'net_cents', legacy_item.total_net_cents
  )),
  jsonb_build_object(
    'source', 'legacy-backfill',
    'normalization_version', 1,
    'subtotal_cents', legacy_item.total_net_cents,
    'discount_cents', 0,
    'net_cents', legacy_item.total_net_cents,
    'billing_buckets', jsonb_build_object(
      case when offer.billing_mode = 'monthly' then 'monthly' else 'one_time' end,
      jsonb_build_object(
        'subtotal_cents', legacy_item.total_net_cents,
        'discount_cents', 0,
        'net_cents', legacy_item.total_net_cents
      )
    ),
    'legacy_original', jsonb_build_object(
      'title', item.title,
      'quantity', item.quantity,
      'unit_net', item.unit_net,
      'total_net', item.total_net,
      'sort_order', item.sort_order
    )
  ),
  least(100000, greatest(0, coalesce(item.sort_order, 0))),
  item.created_at
from public.offer_items item
join public.offers offer on offer.id = item.offer_id
join public.offer_versions version
  on version.offer_id = offer.id and version.version_number = 1
cross join lateral (
  select
    greatest(coalesce(round(item.unit_net * 100)::bigint, 0), 0) as unit_net_cents,
    greatest(coalesce(round(item.total_net * 100)::bigint, 0), 0) as total_net_cents,
    greatest(
      0,
      least(10000, coalesce(round(offer.tax_rate * 100)::integer, 0))
    ) as tax_rate_bps
) legacy_item
where not exists (
  select 1
  from public.offer_version_items existing
  where existing.offer_version_id = version.id
);

update public.offers offer
set current_version_id = version.id,
    active_version_id = case when offer.lifecycle_status <> 'draft' then version.id end,
    draft_version_id = case when offer.lifecycle_status = 'draft' then version.id end
from public.offer_versions version
where version.offer_id = offer.id
  and version.version_number = 1
  and offer.current_version_id is null;

alter table public.offers validate constraint offers_lifecycle_status_check;

create unique index offer_versions_offer_id_id_uidx
  on public.offer_versions(offer_id, id);

alter table public.offers
  add constraint offers_current_version_scope_fk
    foreign key (id, current_version_id)
    references public.offer_versions(offer_id, id) on delete restrict,
  add constraint offers_active_version_scope_fk
    foreign key (id, active_version_id)
    references public.offer_versions(offer_id, id) on delete restrict,
  add constraint offers_draft_version_scope_fk
    foreign key (id, draft_version_id)
    references public.offer_versions(offer_id, id) on delete restrict;

create or replace function private.protect_frozen_offer_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_content jsonb;
  v_new_content jsonb;
begin
  if tg_op = 'DELETE' then
    if old.frozen_at is not null then
      raise exception 'Eine versiegelte Angebotsversion darf nicht gelöscht werden';
    end if;
    return old;
  end if;

  if old.frozen_at is null then
    return new;
  end if;

  v_old_content := to_jsonb(old) - array[
    'lifecycle_status', 'sent_at', 'viewed_at', 'accepted_at', 'rejected_at',
    'withdrawn_at', 'withdrawal_reason', 'superseded_at', 'original_pdf_bucket',
    'original_pdf_path', 'original_pdf_sha256', 'last_email_sent_at',
    'last_email_error', 'updated_at'
  ];
  v_new_content := to_jsonb(new) - array[
    'lifecycle_status', 'sent_at', 'viewed_at', 'accepted_at', 'rejected_at',
    'withdrawn_at', 'withdrawal_reason', 'superseded_at', 'original_pdf_bucket',
    'original_pdf_path', 'original_pdf_sha256', 'last_email_sent_at',
    'last_email_error', 'updated_at'
  ];

  if v_old_content is distinct from v_new_content then
    raise exception 'Der Inhalt einer versiegelten Angebotsversion ist unveränderlich';
  end if;

  if old.original_pdf_path is not null and (
    new.original_pdf_bucket is distinct from old.original_pdf_bucket
    or new.original_pdf_path is distinct from old.original_pdf_path
    or new.original_pdf_sha256 is distinct from old.original_pdf_sha256
  ) then
    raise exception 'Das Original-PDF einer Angebotsversion ist unveränderlich';
  end if;

  if old.sent_at is not null and new.sent_at is distinct from old.sent_at then
    raise exception 'Der erste Versandzeitpunkt ist unveränderlich';
  end if;

  if old.accepted_at is not null and new.accepted_at is distinct from old.accepted_at then
    raise exception 'Der Annahmezeitpunkt ist unveränderlich';
  end if;

  if old.rejected_at is not null and new.rejected_at is distinct from old.rejected_at then
    raise exception 'Der Ablehnungszeitpunkt ist unveränderlich';
  end if;

  if new.lifecycle_status is distinct from old.lifecycle_status and not (
    (old.lifecycle_status = 'draft' and new.lifecycle_status in ('sent', 'superseded'))
    or (old.lifecycle_status = 'sent' and new.lifecycle_status in (
      'viewed', 'accepted', 'rejected', 'expired', 'withdrawn', 'superseded'
    ))
    or (old.lifecycle_status = 'viewed' and new.lifecycle_status in (
      'accepted', 'rejected', 'expired', 'withdrawn', 'superseded'
    ))
    or (old.lifecycle_status in ('rejected', 'expired', 'withdrawn')
        and new.lifecycle_status = 'superseded')
    or (old.lifecycle_status = 'accepted' and new.lifecycle_status = 'linked')
  ) then
    raise exception 'Ungültiger Statuswechsel der Angebotsversion';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger offer_versions_protect_frozen
before update or delete on public.offer_versions
for each row execute function private.protect_frozen_offer_version();

create or replace function private.protect_frozen_offer_child()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version_id uuid;
begin
  if tg_op = 'UPDATE' then
    if exists (
      select 1
      from public.offer_versions version
      where version.id in (old.offer_version_id, new.offer_version_id)
        and version.frozen_at is not null
    ) then
      raise exception 'Positionen und Rabatte einer versiegelten Angebotsversion sind unveränderlich';
    end if;
    return new;
  end if;

  v_version_id := case when tg_op = 'DELETE' then old.offer_version_id else new.offer_version_id end;

  if exists (
    select 1
    from public.offer_versions version
    where version.id = v_version_id
      and version.frozen_at is not null
  ) then
    raise exception 'Positionen und Rabatte einer versiegelten Angebotsversion sind unveränderlich';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger offer_version_items_protect_frozen
before insert or update or delete on public.offer_version_items
for each row execute function private.protect_frozen_offer_child();

create trigger offer_discounts_protect_frozen
before insert or update or delete on public.offer_discounts
for each row execute function private.protect_frozen_offer_child();

create or replace function private.protect_offer_response()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and tg_table_name = 'offer_acceptances'
     and old.confirmation_pdf_path is null
     and new.confirmation_pdf_path is not null
     and (to_jsonb(old) - array[
       'confirmation_pdf_bucket', 'confirmation_pdf_path', 'confirmation_pdf_sha256'
     ]) = (to_jsonb(new) - array[
       'confirmation_pdf_bucket', 'confirmation_pdf_path', 'confirmation_pdf_sha256'
     ]) then
    return new;
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    raise exception 'Eine Kundenentscheidung zu einem Angebot ist unveränderlich';
  end if;
  return new;
end;
$$;

create trigger offer_acceptances_immutable
before update or delete on public.offer_acceptances
for each row execute function private.protect_offer_response();

create trigger offer_rejections_immutable
before update or delete on public.offer_rejections
for each row execute function private.protect_offer_response();

create or replace function public.save_offer_draft(
  p_offer_id uuid,
  p_expected_updated_at timestamptz,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_offer public.offers%rowtype;
  v_version public.offer_versions%rowtype;
  v_offer_id uuid := p_offer_id;
  v_version_id uuid;
  v_customer_id uuid;
  v_offer_number text;
  v_offer_date date;
  v_valid_until date;
  v_version_number integer;
  v_items jsonb;
  v_discounts jsonb;
  v_recipient_snapshot jsonb;
  v_issuer_snapshot jsonb;
  v_item_count integer;
  v_item_sum bigint;
  v_discount_sum bigint;
begin
  perform private.require_offer_admin();

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'Die Angebotsdaten fehlen';
  end if;

  v_customer_id := nullif(p_payload ->> 'customer_id', '')::uuid;
  v_offer_date := nullif(p_payload ->> 'offer_date', '')::date;
  v_valid_until := nullif(p_payload ->> 'valid_until', '')::date;
  v_items := coalesce(p_payload -> 'items', '[]'::jsonb);
  v_discounts := coalesce(p_payload -> 'discounts', '[]'::jsonb);
  v_recipient_snapshot := p_payload -> 'recipient_snapshot';

  if v_customer_id is null or not exists (
    select 1 from public.customers customer
    where customer.id = v_customer_id and customer.status <> 'archived'
  ) then
    raise exception using errcode = '22023', message = 'Der ausgewählte Kunde ist nicht verfügbar';
  end if;
  if length(btrim(coalesce(p_payload ->> 'title', ''))) not between 1 and 240 then
    raise exception using errcode = '22023', message = 'Der Angebotstitel ist ungültig';
  end if;
  if v_offer_date is null or v_valid_until is null or v_valid_until < v_offer_date then
    raise exception using errcode = '22023', message = 'Der Angebotszeitraum ist ungültig';
  end if;
  if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) not between 1 and 100 then
    raise exception using errcode = '22023', message = 'Das Angebot benötigt zwischen 1 und 100 Positionen';
  end if;
  if jsonb_typeof(v_discounts) <> 'array' or jsonb_array_length(v_discounts) > 100 then
    raise exception using errcode = '22023', message = 'Die Rabattdaten sind ungültig';
  end if;
  if jsonb_typeof(v_recipient_snapshot) <> 'object' then
    raise exception using errcode = '22023', message = 'Die Empfängerdaten fehlen';
  end if;
  if nullif(btrim(coalesce(v_recipient_snapshot ->> 'email', '')), '') is null
     or btrim(v_recipient_snapshot ->> 'email')
       !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception using
      errcode = '22023',
      message = 'Eine gültige Empfänger-E-Mail-Adresse ist erforderlich';
  end if;
  if coalesce(
       nullif(btrim(v_recipient_snapshot ->> 'recipient_name'), ''),
       nullif(btrim(v_recipient_snapshot ->> 'company_name'), ''),
       nullif(btrim(v_recipient_snapshot ->> 'contact_name'), ''),
       nullif(btrim(concat_ws(
         ' ',
         v_recipient_snapshot ->> 'first_name',
         v_recipient_snapshot ->> 'last_name'
       )), '')
     ) is null then
    raise exception using
      errcode = '22023',
      message = 'Ein Empfängername oder Firmenname ist erforderlich';
  end if;
  if nullif(btrim(coalesce(v_recipient_snapshot ->> 'address', '')), '') is null then
    raise exception using errcode = '22023', message = 'Die Empfängeranschrift ist erforderlich';
  end if;
  if nullif(btrim(coalesce(v_recipient_snapshot ->> 'postal_code', '')), '') is null
     or nullif(btrim(coalesce(v_recipient_snapshot ->> 'city', '')), '') is null
     or nullif(btrim(coalesce(v_recipient_snapshot ->> 'country', '')), '') is null then
    raise exception using
      errcode = '22023',
      message = 'Postleitzahl, Ort und Land des Empfängers sind erforderlich';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(v_items) item
    where jsonb_typeof(item) <> 'object'
  ) then
    raise exception using errcode = '22023', message = 'Eine Angebotsposition ist ungültig';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(v_items) item
    where item ->> 'item_kind' = 'winter'
      and coalesce(item -> 'seasonal', 'false'::jsonb) <> 'true'::jsonb
  ) then
    raise exception using
      errcode = '22023',
      message = 'Winterdienst muss als saisonale Leistung gespeichert werden';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(v_items) item
    where coalesce(item -> 'seasonal', 'false'::jsonb) = 'true'::jsonb
      and (
        coalesce(item ->> 'season_start_month', '') !~ '^([1-9]|1[0-2])$'
        or coalesce(item ->> 'season_end_month', '') !~ '^([1-9]|1[0-2])$'
      )
  ) then
    raise exception using
      errcode = '22023',
      message = 'Saisonale Leistungen benötigen gültige Start- und Endmonate';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(v_items) item
    where item ->> 'item_kind' = 'winter'
      and nullif(btrim(coalesce(item ->> 'winter_model', '')), '') is null
  ) then
    raise exception using
      errcode = '22023',
      message = 'Für Winterdienst ist ein Abrechnungsmodell erforderlich';
  end if;

  select jsonb_strip_nulls(jsonb_build_object(
    'legal_name', settings.legal_name,
    'brand_name', settings.brand_name,
    'street', settings.street,
    'house_number', settings.house_number,
    'postal_code', settings.postal_code,
    'city', settings.city,
    'country', settings.country,
    'tax_number', settings.tax_number,
    'vat_id', settings.vat_id,
    'commercial_register', settings.commercial_register,
    'management', settings.management,
    'email', settings.email,
    'phone', settings.phone,
    'bank_name', settings.bank_name,
    'iban', settings.iban,
    'bic', settings.bic
  ))
  into v_issuer_snapshot
  from public.company_settings settings
  where settings.id = true;

  v_issuer_snapshot := coalesce(v_issuer_snapshot, '{}'::jsonb);

  if v_offer_id is null then
    v_offer_number := public.next_offer_number(v_offer_date);
    insert into public.offers (
      customer_id,
      project_id,
      status,
      lifecycle_status,
      offer_number,
      title,
      intro,
      closing_text,
      admin_notes,
      net_total,
      tax_rate,
      tax_total,
      gross_total,
      billing_mode,
      billing_interval_label
    ) values (
      v_customer_id,
      null,
      'draft',
      'draft',
      v_offer_number,
      btrim(p_payload ->> 'title'),
      nullif(btrim(coalesce(p_payload ->> 'intro', '')), ''),
      nullif(btrim(coalesce(p_payload ->> 'visible_note', '')), ''),
      nullif(btrim(coalesce(p_payload ->> 'internal_note', '')), ''),
      ((p_payload ->> 'net_total_cents')::bigint / 100.0)::numeric,
      19,
      ((p_payload ->> 'tax_total_cents')::bigint / 100.0)::numeric,
      ((p_payload ->> 'gross_total_cents')::bigint / 100.0)::numeric,
      'mixed',
      'Getrennte Abrechnung gemäß Angebotspositionen'
    )
    returning * into v_offer;
    v_offer_id := v_offer.id;
    v_version_number := 1;
  else
    select * into v_offer
    from public.offers offer
    where offer.id = v_offer_id
    for update;
    if not found then
      raise exception 'Das Angebot wurde nicht gefunden';
    end if;
    if v_offer.customer_id <> v_customer_id then
      raise exception 'Der Kunde eines bestehenden Angebots darf nicht geändert werden';
    end if;
    if v_offer.lifecycle_status in ('accepted', 'linked') then
      raise exception 'Ein angenommenes oder verknüpftes Angebot ist gesperrt';
    end if;

    if v_offer.draft_version_id is not null then
      select * into v_version
      from public.offer_versions version
      where version.id = v_offer.draft_version_id
        and version.offer_id = v_offer_id
      for update;
      if not found or v_version.frozen_at is not null or v_version.lifecycle_status <> 'draft' then
        raise exception 'Die aktuelle Entwurfsversion ist nicht bearbeitbar';
      end if;
      if p_expected_updated_at is null then
        raise exception using errcode = '40001', message = 'Für dieses Angebot existiert bereits ein Entwurf. Bitte laden Sie die Seite neu';
      end if;
      if v_version.updated_at <> p_expected_updated_at then
        raise exception using errcode = '40001', message = 'Das Angebot wurde zwischenzeitlich geändert';
      end if;
      v_version_id := v_version.id;
      v_version_number := v_version.version_number;
      v_offer_number := v_version.offer_number;
      delete from public.offer_discounts where offer_version_id = v_version_id;
      delete from public.offer_version_items where offer_version_id = v_version_id;
    else
      select coalesce(max(version.version_number), 0) + 1
      into v_version_number
      from public.offer_versions version
      where version.offer_id = v_offer_id;
      v_offer_number := v_offer.offer_number;
    end if;
  end if;

  if v_version_id is null then
    insert into public.offer_versions (
      offer_id, customer_id, version_number, lifecycle_status, offer_number,
      title, contact_name, recipient_snapshot, object_label, object_address,
      offer_date, valid_until, planned_start_date, intro, visible_note,
      internal_note, payment_terms, contract_terms, issuer_snapshot,
      subtotal_cents, discount_total_cents, net_total_cents,
      tax_total_cents, gross_total_cents, billing_totals,
      calculation_snapshot, created_by
    ) values (
      v_offer_id,
      v_customer_id,
      v_version_number,
      'draft',
      v_offer_number,
      btrim(p_payload ->> 'title'),
      nullif(btrim(coalesce(p_payload ->> 'contact_name', '')), ''),
      coalesce(p_payload -> 'recipient_snapshot', '{}'::jsonb),
      nullif(btrim(coalesce(p_payload ->> 'object_label', '')), ''),
      nullif(btrim(coalesce(p_payload ->> 'object_address', '')), ''),
      v_offer_date,
      v_valid_until,
      nullif(p_payload ->> 'planned_start_date', '')::date,
      nullif(btrim(coalesce(p_payload ->> 'intro', '')), ''),
      nullif(btrim(coalesce(p_payload ->> 'visible_note', '')), ''),
      nullif(btrim(coalesce(p_payload ->> 'internal_note', '')), ''),
      nullif(btrim(coalesce(p_payload ->> 'payment_terms', '')), ''),
      nullif(btrim(coalesce(p_payload ->> 'contract_terms', '')), ''),
      v_issuer_snapshot,
      (p_payload ->> 'subtotal_cents')::bigint,
      (p_payload ->> 'discount_total_cents')::bigint,
      (p_payload ->> 'net_total_cents')::bigint,
      (p_payload ->> 'tax_total_cents')::bigint,
      (p_payload ->> 'gross_total_cents')::bigint,
      coalesce(p_payload -> 'billing_totals', '{}'::jsonb),
      coalesce(p_payload -> 'calculation_snapshot', '{}'::jsonb),
      v_actor
    ) returning id into v_version_id;
  else
    update public.offer_versions
    set title = btrim(p_payload ->> 'title'),
        contact_name = nullif(btrim(coalesce(p_payload ->> 'contact_name', '')), ''),
        recipient_snapshot = coalesce(p_payload -> 'recipient_snapshot', '{}'::jsonb),
        object_label = nullif(btrim(coalesce(p_payload ->> 'object_label', '')), ''),
        object_address = nullif(btrim(coalesce(p_payload ->> 'object_address', '')), ''),
        offer_date = v_offer_date,
        valid_until = v_valid_until,
        planned_start_date = nullif(p_payload ->> 'planned_start_date', '')::date,
        intro = nullif(btrim(coalesce(p_payload ->> 'intro', '')), ''),
        visible_note = nullif(btrim(coalesce(p_payload ->> 'visible_note', '')), ''),
        internal_note = nullif(btrim(coalesce(p_payload ->> 'internal_note', '')), ''),
        payment_terms = nullif(btrim(coalesce(p_payload ->> 'payment_terms', '')), ''),
        contract_terms = nullif(btrim(coalesce(p_payload ->> 'contract_terms', '')), ''),
        issuer_snapshot = v_issuer_snapshot,
        subtotal_cents = (p_payload ->> 'subtotal_cents')::bigint,
        discount_total_cents = (p_payload ->> 'discount_total_cents')::bigint,
        net_total_cents = (p_payload ->> 'net_total_cents')::bigint,
        tax_total_cents = (p_payload ->> 'tax_total_cents')::bigint,
        gross_total_cents = (p_payload ->> 'gross_total_cents')::bigint,
        billing_totals = coalesce(p_payload -> 'billing_totals', '{}'::jsonb),
        calculation_snapshot = coalesce(p_payload -> 'calculation_snapshot', '{}'::jsonb),
        updated_at = now()
    where id = v_version_id;
  end if;

  insert into public.offer_version_items (
    offer_version_id, client_key, service_catalog_id, item_kind, title,
    description, area_sqm, quantity, unit, frequency, frequency_occurrences,
    billing_type, calculation_type, unit_price_cents, minimum_price_cents,
    automatic_total_cents, total_net_cents, tax_rate_bps, manual_price,
    permanent, seasonal, season_start_month, season_end_month, visible_note,
    winter_surface_type, winter_model, included_visits,
    additional_visit_price_cents, monthly_base_fee_cents,
    seasonal_flat_rate_cents, surcharge_cents, price_components,
    pricing_snapshot, sort_order
  )
  select
    v_version_id,
    nullif(btrim(item ->> 'client_key'), ''),
    nullif(item ->> 'service_catalog_id', '')::uuid,
    item ->> 'item_kind',
    btrim(item ->> 'title'),
    nullif(btrim(coalesce(item ->> 'description', '')), ''),
    coalesce((item ->> 'area_sqm')::numeric, 0),
    coalesce((item ->> 'quantity')::numeric, 1),
    item ->> 'unit',
    item ->> 'frequency',
    coalesce((item ->> 'frequency_occurrences')::integer, 1),
    item ->> 'billing_type',
    coalesce(item ->> 'calculation_type', 'custom'),
    coalesce((item ->> 'unit_price_cents')::bigint, 0),
    coalesce((item ->> 'minimum_price_cents')::bigint, 0),
    coalesce((item ->> 'automatic_total_cents')::bigint, 0),
    coalesce((item ->> 'total_net_cents')::bigint, 0),
    coalesce((item ->> 'tax_rate_bps')::integer, 1900),
    coalesce((item ->> 'manual_price')::boolean, false),
    coalesce((item ->> 'permanent')::boolean, true),
    coalesce((item ->> 'seasonal')::boolean, false),
    nullif(item ->> 'season_start_month', '')::integer,
    nullif(item ->> 'season_end_month', '')::integer,
    nullif(btrim(coalesce(item ->> 'visible_note', '')), ''),
    nullif(item ->> 'winter_surface_type', ''),
    nullif(item ->> 'winter_model', ''),
    coalesce((item ->> 'included_visits')::integer, 0),
    coalesce((item ->> 'additional_visit_price_cents')::bigint, 0),
    coalesce((item ->> 'monthly_base_fee_cents')::bigint, 0),
    coalesce((item ->> 'seasonal_flat_rate_cents')::bigint, 0),
    coalesce((item ->> 'surcharge_cents')::bigint, 0),
    coalesce(item -> 'price_components', '[]'::jsonb),
    coalesce(item -> 'pricing_snapshot', '{}'::jsonb),
    coalesce((item ->> 'sort_order')::integer, 0)
  from jsonb_array_elements(v_items) item;

  get diagnostics v_item_count = row_count;
  if v_item_count <> jsonb_array_length(v_items) then
    raise exception 'Nicht alle Angebotspositionen konnten gespeichert werden';
  end if;

  select coalesce(sum(item.total_net_cents), 0)
  into v_item_sum
  from public.offer_version_items item
  where item.offer_version_id = v_version_id;
  if v_item_sum <> (p_payload ->> 'subtotal_cents')::bigint then
    raise exception using errcode = '22023', message = 'Die Positionssumme ist inkonsistent';
  end if;

  insert into public.offer_discounts (
    offer_version_id, offer_item_id, scope, discount_type,
    percentage_bps, amount_cents, applied_amount_cents, reason, sort_order
  )
  select
    v_version_id,
    case when discount ->> 'scope' = 'item' then item.id else null end,
    discount ->> 'scope',
    discount ->> 'discount_type',
    nullif(discount ->> 'percentage_bps', '')::integer,
    nullif(discount ->> 'amount_cents', '')::bigint,
    coalesce((discount ->> 'applied_amount_cents')::bigint, 0),
    btrim(discount ->> 'reason'),
    coalesce((discount ->> 'sort_order')::integer, 0)
  from jsonb_array_elements(v_discounts) discount
  left join public.offer_version_items item
    on item.offer_version_id = v_version_id
   and item.client_key = discount ->> 'item_client_key';

  select coalesce(sum(discount.applied_amount_cents), 0)
  into v_discount_sum
  from public.offer_discounts discount
  where discount.offer_version_id = v_version_id;
  if v_discount_sum <> (p_payload ->> 'discount_total_cents')::bigint then
    raise exception using errcode = '22023', message = 'Die Rabattsumme ist inkonsistent';
  end if;

  -- Keep the legacy offer representation usable for existing invoice and
  -- reporting flows. While an older sent version is active, its mirror stays
  -- untouched until the replacement version is actually finalized.
  if v_offer.active_version_id is null then
    delete from public.offer_items where offer_id = v_offer_id;

    insert into public.offer_items (
      offer_id, title, description, quantity, unit, unit_net, total_net, sort_order
    )
    select
      v_offer_id,
      item.title,
      item.description,
      item.quantity,
      case item.unit
        when 'square_meter' then 'm²'
        when 'piece' then 'Stück'
        when 'hour' then 'Stunde'
        when 'visit' then 'Einsatz'
        when 'month' then 'Monat'
        else 'Pauschale'
      end,
      ((item.total_net_cents / greatest(item.quantity, 1)) / 100.0)::numeric,
      (item.total_net_cents / 100.0)::numeric,
      item.sort_order
    from public.offer_version_items item
    where item.offer_version_id = v_version_id
    order by item.sort_order, item.id;

    insert into public.offer_items (
      offer_id, title, description, quantity, unit, unit_net, total_net, sort_order
    )
    select
      v_offer_id,
      coalesce(nullif(discount.reason, ''), 'Rabatt'),
      'Im Angebot berücksichtigter Nachlass',
      1,
      'Rabatt',
      -(discount.applied_amount_cents / 100.0)::numeric,
      -(discount.applied_amount_cents / 100.0)::numeric,
      100000 + discount.sort_order
    from public.offer_discounts discount
    where discount.offer_version_id = v_version_id
      and discount.applied_amount_cents > 0
    order by discount.sort_order, discount.id;
  end if;

  update public.offers
  set current_version_id = v_version_id,
      draft_version_id = v_version_id,
      title = case when active_version_id is null then btrim(p_payload ->> 'title') else title end,
      intro = case when active_version_id is null then nullif(btrim(coalesce(p_payload ->> 'intro', '')), '') else intro end,
      closing_text = case when active_version_id is null then nullif(btrim(coalesce(p_payload ->> 'visible_note', '')), '') else closing_text end,
      admin_notes = case when active_version_id is null then nullif(btrim(coalesce(p_payload ->> 'internal_note', '')), '') else admin_notes end,
      net_total = case when active_version_id is null then ((p_payload ->> 'net_total_cents')::bigint / 100.0)::numeric else net_total end,
      tax_total = case when active_version_id is null then ((p_payload ->> 'tax_total_cents')::bigint / 100.0)::numeric else tax_total end,
      gross_total = case when active_version_id is null then ((p_payload ->> 'gross_total_cents')::bigint / 100.0)::numeric else gross_total end,
      billing_mode = 'mixed',
      billing_interval_label = 'Getrennte Abrechnung gemäß Angebotspositionen',
      lifecycle_status = case when active_version_id is null then 'draft' else lifecycle_status end,
      status = case when active_version_id is null then 'draft'::public.offer_status else status end,
      updated_at = now()
  where id = v_offer_id;

  insert into public.audit_logs (actor_id, action, entity_table, entity_id, metadata)
  values (
    v_actor,
    case when v_version_number = 1 then 'offer.draft_saved' else 'offer.revision_saved' end,
    'offers',
    v_offer_id,
    jsonb_build_object('offer_version_id', v_version_id, 'version_number', v_version_number)
  );

  return jsonb_build_object(
    'offer_id', v_offer_id,
    'offer_version_id', v_version_id,
    'offer_number', v_offer_number,
    'version_number', v_version_number
  );
end;
$$;

revoke all on function public.save_offer_draft(uuid, timestamptz, jsonb)
  from public, anon;
grant execute on function public.save_offer_draft(uuid, timestamptz, jsonb)
  to authenticated, service_role;

create or replace function public.freeze_offer_version(
  p_offer_version_id uuid,
  p_expected_updated_at timestamptz,
  p_document_content_sha256 text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version public.offer_versions%rowtype;
  v_offer public.offers%rowtype;
begin
  perform private.require_offer_admin();
  if p_document_content_sha256 is null
     or p_document_content_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'Die Inhaltsprüfsumme ist ungültig';
  end if;

  select * into v_offer
  from public.offers offer
  where offer.id = (
    select version.offer_id
    from public.offer_versions version
    where version.id = p_offer_version_id
  )
  for update;
  if not found then raise exception 'Die Angebotsversion wurde nicht gefunden'; end if;

  select * into v_version
  from public.offer_versions version
  where version.id = p_offer_version_id
    and version.offer_id = v_offer.id
  for update;
  if not found then raise exception 'Die Angebotsversion wurde nicht gefunden'; end if;

  if v_offer.draft_version_id <> v_version.id
     or v_version.lifecycle_status <> 'draft'
     or v_version.frozen_at is not null
     or v_offer.lifecycle_status in ('accepted', 'linked') then
    raise exception 'Nur die aktuelle Entwurfsversion kann versiegelt werden';
  end if;
  if p_expected_updated_at is not null and v_version.updated_at <> p_expected_updated_at then
    raise exception using errcode = '40001', message = 'Das Angebot wurde zwischenzeitlich geändert';
  end if;
  if not exists (
    select 1 from public.offer_version_items item
    where item.offer_version_id = v_version.id
  ) then
    raise exception 'Ein Angebot ohne Positionen darf nicht versendet werden';
  end if;

  update public.offer_versions
  set frozen_at = now(),
      document_content_sha256 = p_document_content_sha256,
      updated_at = now()
  where id = v_version.id
  returning * into v_version;

  insert into public.audit_logs (actor_id, action, entity_table, entity_id, metadata)
  values (
    auth.uid(), 'offer.version_frozen', 'offers', v_offer.id,
    jsonb_build_object(
      'offer_version_id', v_version.id,
      'version_number', v_version.version_number,
      'content_sha256', p_document_content_sha256
    )
  );

  return jsonb_build_object(
    'offer_id', v_offer.id,
    'offer_version_id', v_version.id,
    'offer_number', v_version.offer_number,
    'version_number', v_version.version_number,
    'frozen_at', v_version.frozen_at
  );
end;
$$;

revoke all on function public.freeze_offer_version(uuid, timestamptz, text)
  from public, anon;
grant execute on function public.freeze_offer_version(uuid, timestamptz, text)
  to authenticated, service_role;

create or replace function public.finalize_offer_send(
  p_offer_version_id uuid,
  p_pdf_bucket text,
  p_pdf_path text,
  p_pdf_sha256 text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_version public.offer_versions%rowtype;
  v_offer public.offers%rowtype;
  v_sent_at timestamptz := now();
begin
  perform private.require_offer_admin();
  if p_pdf_bucket <> 'offer-pdfs'
     or p_pdf_path is null
     or p_pdf_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'Der Original-PDF-Verweis ist ungültig';
  end if;

  select * into v_offer
  from public.offers offer
  where offer.id = (
    select version.offer_id
    from public.offer_versions version
    where version.id = p_offer_version_id
  )
  for update;
  if not found then raise exception 'Die Angebotsversion wurde nicht gefunden'; end if;

  select * into v_version
  from public.offer_versions version
  where version.id = p_offer_version_id
    and version.offer_id = v_offer.id
  for update;
  if not found then raise exception 'Die Angebotsversion wurde nicht gefunden'; end if;

  if v_version.sent_at is not null then
    if v_version.original_pdf_bucket = p_pdf_bucket
       and v_version.original_pdf_path = p_pdf_path
       and v_version.original_pdf_sha256 = p_pdf_sha256 then
      return jsonb_build_object(
        'offer_id', v_offer.id,
        'offer_version_id', v_version.id,
        'already_finalized', true
      );
    end if;
    raise exception 'Die Angebotsversion wurde bereits mit einem anderen Original versendet';
  end if;

  if v_offer.draft_version_id <> v_version.id
     or v_version.lifecycle_status <> 'draft'
     or v_version.frozen_at is null
     or v_version.document_content_sha256 is null
     or v_offer.lifecycle_status in ('accepted', 'linked')
     or exists (
       select 1 from public.offer_versions active_version
       where active_version.id = v_offer.active_version_id
         and active_version.lifecycle_status in ('accepted', 'linked')
     ) then
    raise exception 'Die Angebotsversion ist nicht für den Versand vorbereitet';
  end if;

  if v_offer.active_version_id is not null then
    update public.offer_versions
    set lifecycle_status = 'superseded',
        superseded_at = v_sent_at,
        updated_at = v_sent_at
    where id = v_offer.active_version_id
      and lifecycle_status in ('sent', 'viewed', 'rejected', 'expired', 'withdrawn');
  end if;

  update public.offer_versions
  set lifecycle_status = 'sent',
      sent_at = v_sent_at,
      original_pdf_bucket = p_pdf_bucket,
      original_pdf_path = p_pdf_path,
      original_pdf_sha256 = p_pdf_sha256,
      last_email_error = null,
      updated_at = v_sent_at
  where id = v_version.id
  returning * into v_version;

  update public.offers
  set active_version_id = v_version.id,
      current_version_id = v_version.id,
      draft_version_id = null,
      lifecycle_status = 'sent',
      status = 'released',
      offer_number = v_version.offer_number,
      title = v_version.title,
      intro = v_version.intro,
      closing_text = v_version.visible_note,
      net_total = (v_version.net_total_cents / 100.0)::numeric,
      tax_total = (v_version.tax_total_cents / 100.0)::numeric,
      gross_total = (v_version.gross_total_cents / 100.0)::numeric,
      released_at = v_sent_at,
      sent_at = v_sent_at,
      document_path = p_pdf_path,
      updated_at = v_sent_at
  where id = v_offer.id;

  delete from public.offer_items where offer_id = v_offer.id;

  insert into public.offer_items (
    offer_id, title, description, quantity, unit, unit_net, total_net, sort_order
  )
  select
    v_offer.id,
    item.title,
    item.description,
    item.quantity,
    case item.unit
      when 'square_meter' then 'm²'
      when 'piece' then 'Stück'
      when 'hour' then 'Stunde'
      when 'visit' then 'Einsatz'
      when 'month' then 'Monat'
      else 'Pauschale'
    end,
    ((item.total_net_cents / greatest(item.quantity, 1)) / 100.0)::numeric,
    (item.total_net_cents / 100.0)::numeric,
    item.sort_order
  from public.offer_version_items item
  where item.offer_version_id = v_version.id
  order by item.sort_order, item.id;

  insert into public.offer_items (
    offer_id, title, description, quantity, unit, unit_net, total_net, sort_order
  )
  select
    v_offer.id,
    coalesce(nullif(discount.reason, ''), 'Rabatt'),
    'Im Angebot berücksichtigter Nachlass',
    1,
    'Rabatt',
    -(discount.applied_amount_cents / 100.0)::numeric,
    -(discount.applied_amount_cents / 100.0)::numeric,
    100000 + discount.sort_order
  from public.offer_discounts discount
  where discount.offer_version_id = v_version.id
    and discount.applied_amount_cents > 0
  order by discount.sort_order, discount.id;

  insert into public.notifications (
    recipient_id, type, title, body, entity_type, entity_id, idempotency_key
  )
  select
    customer_user.user_id,
    'offer_sent',
    'Neues Angebot von Hausvia',
    v_version.offer_number || ' · ' || v_version.title,
    'offer',
    v_offer.id,
    'offer-sent:' || v_version.id::text
  from public.customer_users customer_user
  join public.user_profiles profile on profile.id = customer_user.user_id
  where customer_user.customer_id = v_version.customer_id
    and customer_user.active = true
    and profile.status = 'active'
  on conflict (recipient_id, idempotency_key) do nothing;

  insert into public.audit_logs (actor_id, action, entity_table, entity_id, metadata)
  values (
    v_actor, 'offer.sent', 'offers', v_offer.id,
    jsonb_build_object(
      'offer_version_id', v_version.id,
      'version_number', v_version.version_number,
      'pdf_sha256', p_pdf_sha256
    )
  );

  return jsonb_build_object(
    'offer_id', v_offer.id,
    'offer_version_id', v_version.id,
    'sent_at', v_sent_at,
    'already_finalized', false
  );
end;
$$;

revoke all on function public.finalize_offer_send(uuid, text, text, text)
  from public, anon;
grant execute on function public.finalize_offer_send(uuid, text, text, text)
  to authenticated, service_role;

create or replace function public.record_offer_email_delivery(
  p_offer_version_id uuid,
  p_sent boolean,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_offer_admin();
  update public.offer_versions
  set last_email_sent_at = case when p_sent then now() else last_email_sent_at end,
      last_email_error = case
        when p_sent then null
        else left(coalesce(p_error, 'Unbekannter Versandfehler'), 2000)
      end,
      updated_at = now()
  where id = p_offer_version_id
    and sent_at is not null;
  if not found then raise exception 'Die versendete Angebotsversion wurde nicht gefunden'; end if;
end;
$$;

revoke all on function public.record_offer_email_delivery(uuid, boolean, text)
  from public, anon;
grant execute on function public.record_offer_email_delivery(uuid, boolean, text)
  to authenticated, service_role;

create or replace function public.mark_offer_viewed(p_offer_version_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version public.offer_versions%rowtype;
  v_offer public.offers%rowtype;
  v_viewed_at timestamptz := now();
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Anmeldung erforderlich';
  end if;

  select * into v_offer
  from public.offers offer
  where offer.id = (
    select version.offer_id from public.offer_versions version
    where version.id = p_offer_version_id
  )
  for update;
  if not found then raise exception using errcode = '42501', message = 'Angebot nicht verfügbar'; end if;

  select * into v_version
  from public.offer_versions version
  where version.id = p_offer_version_id and version.offer_id = v_offer.id
  for update;
  if not found or not (select private.is_customer_of_customer(v_version.customer_id)) then
    raise exception using errcode = '42501', message = 'Angebot nicht verfügbar';
  end if;
  if v_offer.active_version_id <> v_version.id then
    raise exception 'Diese Angebotsversion wurde ersetzt';
  end if;
  if v_version.calculation_snapshot ->> 'workflow_mode' = 'historical_read_only' then
    return jsonb_build_object(
      'status', v_version.lifecycle_status,
      'viewed_at', v_version.viewed_at,
      'historical_read_only', true
    );
  end if;
  if v_version.valid_until < (now() at time zone 'Europe/Berlin')::date then
    if v_version.lifecycle_status in ('sent', 'viewed') then
      update public.offer_versions
      set lifecycle_status = 'expired', updated_at = now()
      where id = v_version.id;
      update public.offers
      set lifecycle_status = 'expired', status = 'expired', updated_at = now()
      where id = v_offer.id;
    end if;
    return jsonb_build_object('status', 'expired');
  end if;

  if v_version.lifecycle_status = 'sent' then
    update public.offer_versions
    set lifecycle_status = 'viewed',
        viewed_at = coalesce(viewed_at, v_viewed_at),
        updated_at = v_viewed_at
    where id = v_version.id;
    update public.offers
    set lifecycle_status = 'viewed',
        last_viewed_at = coalesce(last_viewed_at, v_viewed_at),
        updated_at = v_viewed_at
    where id = v_offer.id;
    return jsonb_build_object('status', 'viewed', 'viewed_at', v_viewed_at);
  end if;

  return jsonb_build_object('status', v_version.lifecycle_status, 'viewed_at', v_version.viewed_at);
end;
$$;

revoke all on function public.mark_offer_viewed(uuid) from public, anon;
grant execute on function public.mark_offer_viewed(uuid) to authenticated;

create or replace function public.accept_offer_version(
  p_offer_version_id uuid,
  p_accepted_name text,
  p_confirmed boolean,
  p_expected_gross_total_cents bigint,
  p_comment text default null,
  p_acceptance_ip text default null,
  p_user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_version public.offer_versions%rowtype;
  v_offer public.offers%rowtype;
  v_acceptance_id uuid;
  v_discarded_draft_id uuid;
  v_accepted_at timestamptz := now();
begin
  if v_actor is null or not coalesce(p_confirmed, false) then
    raise exception using errcode = '42501', message = 'Die verbindliche Bestätigung fehlt';
  end if;
  if length(btrim(coalesce(p_accepted_name, ''))) not between 2 and 200 then
    raise exception using errcode = '22023', message = 'Bitte geben Sie den Namen der annehmenden Person an';
  end if;
  if length(coalesce(p_comment, '')) > 4000 then
    raise exception using errcode = '22023', message = 'Der Kommentar ist zu lang';
  end if;

  select * into v_offer
  from public.offers offer
  where offer.id = (
    select version.offer_id from public.offer_versions version
    where version.id = p_offer_version_id
  )
  for update;
  if not found then raise exception using errcode = '42501', message = 'Angebot nicht verfügbar'; end if;

  select * into v_version
  from public.offer_versions version
  where version.id = p_offer_version_id and version.offer_id = v_offer.id
  for update;
  if not found or not (select private.is_customer_of_customer(v_version.customer_id)) then
    raise exception using errcode = '42501', message = 'Angebot nicht verfügbar';
  end if;

  if v_offer.active_version_id <> v_version.id then
    raise exception 'Diese Angebotsversion wurde ersetzt';
  end if;
  if v_version.calculation_snapshot ->> 'workflow_mode' = 'historical_read_only' then
    raise exception using
      errcode = '55000',
      message = 'Historische Angebote sind schreibgeschützt; bitte erstellen und versenden Sie eine neue Revision';
  end if;
  if v_version.lifecycle_status not in ('sent', 'viewed')
     or v_version.frozen_at is null
     or v_version.original_pdf_path is null
     or v_version.document_content_sha256 is null then
    raise exception 'Dieses Angebot kann nicht angenommen werden';
  end if;
  if v_version.valid_until < (now() at time zone 'Europe/Berlin')::date then
    update public.offer_versions
    set lifecycle_status = 'expired', updated_at = now()
    where id = v_version.id;
    update public.offers
    set lifecycle_status = 'expired', status = 'expired', updated_at = now()
    where id = v_offer.id;
    return jsonb_build_object(
      'offer_id', v_offer.id,
      'offer_version_id', v_version.id,
      'status', 'expired'
    );
  end if;
  if p_expected_gross_total_cents is distinct from v_version.gross_total_cents then
    raise exception 'Der bestätigte Angebotsbetrag stimmt nicht mit der Version überein';
  end if;
  if exists (
    select 1 from public.offer_acceptances acceptance
    where acceptance.offer_version_id = v_version.id
  ) or exists (
    select 1 from public.offer_rejections rejection
    where rejection.offer_version_id = v_version.id
  ) then
    raise exception 'Für dieses Angebot wurde bereits eine Entscheidung gespeichert';
  end if;

  v_discarded_draft_id := v_offer.draft_version_id;

  insert into public.offer_acceptances (
    offer_id, offer_version_id, customer_id, accepted_by, accepted_name,
    accepted_at, confirmed_gross_total_cents, confirmed_totals,
    confirmed_content_sha256, comment, acceptance_ip, user_agent
  ) values (
    v_offer.id,
    v_version.id,
    v_version.customer_id,
    v_actor,
    btrim(p_accepted_name),
    v_accepted_at,
    v_version.gross_total_cents,
    v_version.billing_totals,
    v_version.document_content_sha256,
    nullif(btrim(coalesce(p_comment, '')), ''),
    nullif(left(coalesce(p_acceptance_ip, ''), 200), ''),
    nullif(left(coalesce(p_user_agent, ''), 1000), '')
  ) returning id into v_acceptance_id;

  insert into public.offer_acceptance_delivery_jobs (acceptance_id)
  values (v_acceptance_id);

  update public.offer_versions
  set lifecycle_status = 'accepted',
      accepted_at = v_accepted_at,
      updated_at = v_accepted_at
  where id = v_version.id;

  update public.offers
  set lifecycle_status = 'accepted',
      status = 'accepted',
      current_version_id = v_version.id,
      active_version_id = v_version.id,
      draft_version_id = null,
      accepted_at = v_accepted_at,
      accepted_by = v_actor,
      acceptance_name = btrim(p_accepted_name),
      acceptance_signature = btrim(p_accepted_name),
      acceptance_confirmed = true,
      acceptance_ip = nullif(left(coalesce(p_acceptance_ip, ''), 200), ''),
      updated_at = v_accepted_at
  where id = v_offer.id;

  if v_discarded_draft_id is not null and v_discarded_draft_id <> v_version.id then
    update public.offer_versions
    set lifecycle_status = 'superseded',
        superseded_at = v_accepted_at,
        updated_at = v_accepted_at
    where id = v_discarded_draft_id
      and offer_id = v_offer.id
      and lifecycle_status = 'draft';
  end if;

  insert into public.notifications (
    recipient_id, type, title, body, entity_type, entity_id, idempotency_key
  )
  select
    profile.id,
    'offer_accepted',
    'Angebot wurde angenommen',
    v_version.offer_number || ' wurde von ' || btrim(p_accepted_name) || ' angenommen.',
    'offer',
    v_offer.id,
    'offer-accepted:' || v_version.id::text
  from public.user_profiles profile
  where profile.role = 'admin' and profile.status = 'active'
  on conflict (recipient_id, idempotency_key) do nothing;

  insert into public.notifications (
    recipient_id, type, title, body, entity_type, entity_id, idempotency_key
  ) values (
    v_actor,
    'offer_acceptance_confirmed',
    'Annahme bestätigt',
    'Die Annahme von ' || v_version.offer_number || ' wurde verbindlich gespeichert.',
    'offer',
    v_offer.id,
    'offer-acceptance-confirmed:' || v_version.id::text
  ) on conflict (recipient_id, idempotency_key) do nothing;

  insert into public.audit_logs (actor_id, action, entity_table, entity_id, metadata)
  values (
    v_actor, 'offer.accepted', 'offers', v_offer.id,
    jsonb_build_object(
      'offer_version_id', v_version.id,
      'acceptance_id', v_acceptance_id,
      'discarded_draft_version_id', v_discarded_draft_id,
      'confirmed_gross_total_cents', v_version.gross_total_cents,
      'content_sha256', v_version.document_content_sha256
    )
  );

  return jsonb_build_object(
    'offer_id', v_offer.id,
    'offer_version_id', v_version.id,
    'acceptance_id', v_acceptance_id,
    'status', 'accepted',
    'accepted_at', v_accepted_at,
    'confirmed_gross_total_cents', v_version.gross_total_cents
  );
end;
$$;

revoke all on function public.accept_offer_version(uuid, text, boolean, bigint, text, text, text)
  from public, anon;
grant execute on function public.accept_offer_version(uuid, text, boolean, bigint, text, text, text)
  to authenticated;

create or replace function public.reject_offer_version(
  p_offer_version_id uuid,
  p_rejected_name text default null,
  p_comment text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_version public.offer_versions%rowtype;
  v_offer public.offers%rowtype;
  v_rejection_id uuid;
  v_rejected_at timestamptz := now();
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'Anmeldung erforderlich';
  end if;
  if length(coalesce(p_comment, '')) > 4000 then
    raise exception using errcode = '22023', message = 'Der Ablehnungsgrund ist zu lang';
  end if;

  select * into v_offer
  from public.offers offer
  where offer.id = (
    select version.offer_id from public.offer_versions version
    where version.id = p_offer_version_id
  )
  for update;
  if not found then raise exception using errcode = '42501', message = 'Angebot nicht verfügbar'; end if;

  select * into v_version
  from public.offer_versions version
  where version.id = p_offer_version_id and version.offer_id = v_offer.id
  for update;
  if not found or not (select private.is_customer_of_customer(v_version.customer_id)) then
    raise exception using errcode = '42501', message = 'Angebot nicht verfügbar';
  end if;

  if v_version.calculation_snapshot ->> 'workflow_mode' = 'historical_read_only' then
    raise exception using
      errcode = '55000',
      message = 'Historische Angebote sind schreibgeschützt; bitte erstellen und versenden Sie eine neue Revision';
  end if;

  if v_offer.active_version_id <> v_version.id
     or v_version.lifecycle_status not in ('sent', 'viewed')
     or v_version.valid_until < (now() at time zone 'Europe/Berlin')::date then
    raise exception 'Dieses Angebot kann nicht abgelehnt werden';
  end if;
  if exists (
    select 1 from public.offer_acceptances acceptance
    where acceptance.offer_version_id = v_version.id
  ) or exists (
    select 1 from public.offer_rejections rejection
    where rejection.offer_version_id = v_version.id
  ) then
    raise exception 'Für dieses Angebot wurde bereits eine Entscheidung gespeichert';
  end if;

  insert into public.offer_rejections (
    offer_id, offer_version_id, customer_id, rejected_by,
    rejected_name, comment, rejected_at
  ) values (
    v_offer.id,
    v_version.id,
    v_version.customer_id,
    v_actor,
    nullif(btrim(coalesce(p_rejected_name, '')), ''),
    nullif(btrim(coalesce(p_comment, '')), ''),
    v_rejected_at
  ) returning id into v_rejection_id;

  update public.offer_versions
  set lifecycle_status = 'rejected',
      rejected_at = v_rejected_at,
      updated_at = v_rejected_at
  where id = v_version.id;
  update public.offers
  set lifecycle_status = 'rejected',
      status = 'rejected',
      updated_at = v_rejected_at
  where id = v_offer.id;

  insert into public.notifications (
    recipient_id, type, title, body, entity_type, entity_id, idempotency_key
  )
  select
    profile.id,
    'offer_rejected',
    'Angebot wurde abgelehnt',
    v_version.offer_number || ' wurde im Kundenportal abgelehnt.',
    'offer',
    v_offer.id,
    'offer-rejected:' || v_version.id::text
  from public.user_profiles profile
  where profile.role = 'admin' and profile.status = 'active'
  on conflict (recipient_id, idempotency_key) do nothing;

  insert into public.audit_logs (actor_id, action, entity_table, entity_id, metadata)
  values (
    v_actor, 'offer.rejected', 'offers', v_offer.id,
    jsonb_build_object('offer_version_id', v_version.id, 'rejection_id', v_rejection_id)
  );

  return jsonb_build_object(
    'offer_id', v_offer.id,
    'offer_version_id', v_version.id,
    'rejection_id', v_rejection_id,
    'rejected_at', v_rejected_at
  );
end;
$$;

revoke all on function public.reject_offer_version(uuid, text, text)
  from public, anon;
grant execute on function public.reject_offer_version(uuid, text, text)
  to authenticated;

create or replace function public.withdraw_offer_version(
  p_offer_version_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version public.offer_versions%rowtype;
  v_offer public.offers%rowtype;
  v_withdrawn_at timestamptz := now();
begin
  perform private.require_offer_admin();
  if length(btrim(coalesce(p_reason, ''))) not between 3 and 1000 then
    raise exception using errcode = '22023', message = 'Bitte geben Sie einen Rückzugsgrund an';
  end if;

  select * into v_offer
  from public.offers offer
  where offer.id = (
    select version.offer_id from public.offer_versions version
    where version.id = p_offer_version_id
  )
  for update;
  if not found then raise exception 'Die Angebotsversion wurde nicht gefunden'; end if;
  select * into v_version
  from public.offer_versions version
  where version.id = p_offer_version_id and version.offer_id = v_offer.id
  for update;
  if not found then raise exception 'Die Angebotsversion wurde nicht gefunden'; end if;

  if v_offer.active_version_id <> v_version.id
     or v_version.lifecycle_status not in ('sent', 'viewed') then
    raise exception 'Nur ein offenes Angebot kann zurückgezogen werden';
  end if;

  update public.offer_versions
  set lifecycle_status = 'withdrawn',
      withdrawn_at = v_withdrawn_at,
      withdrawal_reason = btrim(p_reason),
      updated_at = v_withdrawn_at
  where id = v_version.id;
  update public.offers
  set lifecycle_status = 'withdrawn',
      status = 'archived',
      withdrawn_at = v_withdrawn_at,
      updated_at = v_withdrawn_at
  where id = v_offer.id;

  insert into public.notifications (
    recipient_id, type, title, body, entity_type, entity_id, idempotency_key
  )
  select
    customer_user.user_id,
    'offer_withdrawn',
    'Angebot zurückgezogen',
    v_version.offer_number || ' wurde von Hausvia zurückgezogen.',
    'offer',
    v_offer.id,
    'offer-withdrawn:' || v_version.id::text
  from public.customer_users customer_user
  where customer_user.customer_id = v_version.customer_id
    and customer_user.active = true
  on conflict (recipient_id, idempotency_key) do nothing;

  insert into public.audit_logs (actor_id, action, entity_table, entity_id, metadata)
  values (
    auth.uid(), 'offer.withdrawn', 'offers', v_offer.id,
    jsonb_build_object('offer_version_id', v_version.id, 'reason', btrim(p_reason))
  );

  return jsonb_build_object(
    'offer_id', v_offer.id,
    'offer_version_id', v_version.id,
    'withdrawn_at', v_withdrawn_at
  );
end;
$$;

revoke all on function public.withdraw_offer_version(uuid, text)
  from public, anon;
grant execute on function public.withdraw_offer_version(uuid, text)
  to authenticated, service_role;

create or replace function public.finalize_offer_acceptance_document(
  p_acceptance_id uuid,
  p_pdf_bucket text,
  p_pdf_path text,
  p_pdf_sha256 text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_acceptance public.offer_acceptances%rowtype;
begin
  if p_pdf_bucket <> 'offer-pdfs'
     or p_pdf_path is null
     or p_pdf_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'Der Bestätigungs-PDF-Verweis ist ungültig';
  end if;

  select * into v_acceptance
  from public.offer_acceptances acceptance
  where acceptance.id = p_acceptance_id
  for update;
  if not found then raise exception 'Die Annahme wurde nicht gefunden'; end if;

  perform private.require_offer_admin();

  if v_acceptance.confirmation_pdf_path is not null then
    if v_acceptance.confirmation_pdf_bucket = p_pdf_bucket
       and v_acceptance.confirmation_pdf_path = p_pdf_path
       and v_acceptance.confirmation_pdf_sha256 = p_pdf_sha256 then
      return;
    end if;
    raise exception 'Für diese Annahme existiert bereits eine andere Bestätigung';
  end if;

  update public.offer_acceptances
  set confirmation_pdf_bucket = p_pdf_bucket,
      confirmation_pdf_path = p_pdf_path,
      confirmation_pdf_sha256 = p_pdf_sha256
  where id = v_acceptance.id;
end;
$$;

revoke all on function public.finalize_offer_acceptance_document(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.finalize_offer_acceptance_document(uuid, text, text, text)
  to service_role;

create or replace function public.claim_offer_acceptance_delivery_job(
  p_job_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.offer_acceptance_delivery_jobs%rowtype;
  v_offer_version_id uuid;
begin
  if not (select private.is_service_role()) then
    raise exception using errcode = '42501', message = 'Service role required';
  end if;

  select job.*
  into v_job
  from public.offer_acceptance_delivery_jobs job
  where (p_job_id is null or job.id = p_job_id)
    and (
      (
        job.status in ('pending', 'failed')
        and (p_job_id is not null or job.available_at <= now())
      )
      or (
        job.status = 'processing'
        and job.processing_started_at < now() - interval '15 minutes'
      )
    )
  order by
    case when p_job_id is not null then 0 else 1 end,
    job.available_at,
    job.created_at,
    job.id
  for update skip locked
  limit 1;

  if not found then return null; end if;

  update public.offer_acceptance_delivery_jobs
  set status = 'processing',
      attempts = attempts + 1,
      processing_started_at = now(),
      last_attempt_at = now(),
      failed_at = null,
      updated_at = now()
  where id = v_job.id
  returning * into v_job;

  select acceptance.offer_version_id
  into v_offer_version_id
  from public.offer_acceptances acceptance
  where acceptance.id = v_job.acceptance_id;

  return jsonb_build_object(
    'job_id', v_job.id,
    'acceptance_id', v_job.acceptance_id,
    'offer_version_id', v_offer_version_id,
    'attempts', v_job.attempts
  );
end;
$$;

revoke all on function public.claim_offer_acceptance_delivery_job(uuid)
  from public, anon, authenticated;
grant execute on function public.claim_offer_acceptance_delivery_job(uuid)
  to service_role;

create or replace function public.complete_offer_acceptance_delivery_job(
  p_job_id uuid,
  p_sent boolean,
  p_error text default null,
  p_retry_after_seconds integer default 300
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.offer_acceptance_delivery_jobs%rowtype;
begin
  if not (select private.is_service_role()) then
    raise exception using errcode = '42501', message = 'Service role required';
  end if;
  if p_job_id is null or p_sent is null or p_retry_after_seconds is null
     or p_retry_after_seconds not between 1 and 86400 then
    raise exception using errcode = '22023', message = 'Ungültiger Outbox-Abschluss';
  end if;

  select * into v_job
  from public.offer_acceptance_delivery_jobs job
  where job.id = p_job_id
  for update;
  if not found then raise exception 'Der Acceptance-Outbox-Job wurde nicht gefunden'; end if;

  if v_job.status = 'sent' and p_sent then
    return jsonb_build_object(
      'job_id', v_job.id,
      'status', v_job.status,
      'attempts', v_job.attempts,
      'already_completed', true
    );
  end if;
  if v_job.status <> 'processing' then
    raise exception 'Nur ein beanspruchter Acceptance-Outbox-Job kann abgeschlossen werden';
  end if;

  update public.offer_acceptance_delivery_jobs
  set status = case when p_sent then 'sent' else 'failed' end,
      sent_at = case when p_sent then now() else null end,
      failed_at = case when p_sent then null else now() end,
      available_at = case
        when p_sent then available_at
        else now() + make_interval(secs => p_retry_after_seconds)
      end,
      processing_started_at = null,
      last_error = case
        when p_sent then null
        else left(coalesce(nullif(btrim(p_error), ''), 'Unbekannter Zustellfehler'), 4000)
      end,
      updated_at = now()
  where id = v_job.id
  returning * into v_job;

  return jsonb_build_object(
    'job_id', v_job.id,
    'status', v_job.status,
    'attempts', v_job.attempts,
    'available_at', v_job.available_at,
    'sent_at', v_job.sent_at,
    'failed_at', v_job.failed_at,
    'already_completed', false
  );
end;
$$;

revoke all on function public.complete_offer_acceptance_delivery_job(
  uuid, boolean, text, integer
) from public, anon, authenticated;
grant execute on function public.complete_offer_acceptance_delivery_job(
  uuid, boolean, text, integer
) to service_role;

create or replace function public.link_accepted_offer_to_property(
  p_offer_version_id uuid,
  p_property_id uuid,
  p_assignments jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_version public.offer_versions%rowtype;
  v_offer public.offers%rowtype;
  v_property public.properties%rowtype;
  v_link_id uuid;
  v_item public.offer_version_items%rowtype;
  v_assignment jsonb;
  v_scope text;
  v_building_ids uuid[];
  v_building_count integer;
  v_service_id uuid;
  v_service_key text;
  v_catalog public.service_catalog%rowtype;
  v_execution_rule text;
  v_contract_start_date date;
  v_contract_permanent boolean;
  v_agreed_subtotal_cents bigint;
  v_agreed_discount_cents bigint;
  v_agreed_net_cents bigint;
  v_monthly_net_cents bigint;
  v_monthly_tax_cents bigint;
  v_monthly_tax_rate_bps integer;
  v_monthly_net_text text;
  v_monthly_tax_text text;
  v_compensation_valid_from date;
  v_compensation_rate_id uuid;
begin
  perform private.require_offer_admin();
  if jsonb_typeof(coalesce(p_assignments, '[]'::jsonb)) <> 'array' then
    raise exception using errcode = '22023', message = 'Die Positionszuordnung ist ungültig';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_assignments, '[]'::jsonb)) assignment
    where jsonb_typeof(assignment) <> 'object'
       or coalesce(assignment ->> 'item_id', '')
         !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) then
    raise exception using
      errcode = '22023',
      message = 'Jede Positionszuordnung benötigt eine gültige item_id';
  end if;

  select * into v_offer
  from public.offers offer
  where offer.id = (
    select version.offer_id from public.offer_versions version
    where version.id = p_offer_version_id
  )
  for update;
  if not found then raise exception 'Die Angebotsversion wurde nicht gefunden'; end if;

  select * into v_version
  from public.offer_versions version
  where version.id = p_offer_version_id and version.offer_id = v_offer.id
  for update;
  if not found then raise exception 'Die Angebotsversion wurde nicht gefunden'; end if;
  select * into v_property
  from public.properties property
  where property.id = p_property_id
  for update;
  if not found then raise exception 'Die Immobilie wurde nicht gefunden'; end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_assignments, '[]'::jsonb)) assignment
    group by (assignment ->> 'item_id')::uuid
    having count(*) > 1
  ) then
    raise exception using
      errcode = '22023',
      message = 'Eine Angebotsposition darf nur einmal zugeordnet werden';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_assignments, '[]'::jsonb)) assignment
    where not exists (
      select 1
      from public.offer_version_items item
      where item.offer_version_id = v_version.id
        and item.id = (assignment ->> 'item_id')::uuid
    )
  ) then
    raise exception using
      errcode = '22023',
      message = 'Die Positionszuordnung enthält eine unbekannte item_id';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_assignments, '[]'::jsonb)) assignment
    where coalesce(nullif(assignment ->> 'scope', ''), 'property')
          not in ('property', 'buildings')
       or (
         coalesce(nullif(assignment ->> 'scope', ''), 'property') = 'buildings'
         and jsonb_typeof(assignment -> 'building_ids') is distinct from 'array'
       )
  ) then
    raise exception using
      errcode = '22023',
      message = 'Der Geltungsbereich oder die Gebäudezuordnung einer Position ist ungültig';
  end if;

  if v_version.calculation_snapshot ->> 'workflow_mode' = 'historical_read_only' then
    raise exception using
      errcode = '55000',
      message = 'Historisch angenommene Angebote ohne neuen Annahmebeleg dürfen nicht verknüpft werden';
  end if;
  if v_version.lifecycle_status <> 'accepted'
     or v_offer.active_version_id <> v_version.id
     or not exists (
       select 1 from public.offer_acceptances acceptance
       where acceptance.offer_version_id = v_version.id
     ) then
    raise exception 'Nur die angenommene aktive Angebotsversion kann verknüpft werden';
  end if;
  if v_property.customer_id <> v_version.customer_id then
    raise exception 'Angebot und Immobilie gehören nicht zum selben Kunden';
  end if;
  if v_property.status = 'archived' then
    raise exception 'Eine archivierte Immobilie kann nicht verknüpft werden';
  end if;
  if exists (
    select 1 from public.offer_property_links link
    where link.offer_version_id = v_version.id
  ) then
    raise exception 'Das Angebot wurde bereits mit einer Immobilie verknüpft';
  end if;

  insert into public.offer_property_links (
    offer_id, offer_version_id, property_id, linked_by
  ) values (
    v_offer.id, v_version.id, v_property.id, v_actor
  ) returning id into v_link_id;

  for v_item in
    select *
    from public.offer_version_items item
    where item.offer_version_id = v_version.id
    order by item.sort_order, item.id
  loop
    select assignment
    into v_assignment
    from jsonb_array_elements(coalesce(p_assignments, '[]'::jsonb)) assignment
    where (assignment ->> 'item_id')::uuid = v_item.id
    limit 1;

    v_scope := coalesce(nullif(v_assignment ->> 'scope', ''), 'property');
    if v_scope not in ('property', 'buildings') then
      raise exception using errcode = '22023', message = 'Der Geltungsbereich einer Position ist ungültig';
    end if;

    if v_scope = 'buildings' then
      select coalesce(array_agg(distinct building_id order by building_id), array[]::uuid[])
      into v_building_ids
      from (
        select jsonb_array_elements_text(
          coalesce(v_assignment -> 'building_ids', '[]'::jsonb)
        )::uuid as building_id
      ) selected;
      if cardinality(v_building_ids) = 0 then
        raise exception 'Für eine Gebäudezuordnung muss mindestens ein Gebäude ausgewählt werden';
      end if;
      select count(*)::integer into v_building_count
      from public.buildings building
      where building.id = any(v_building_ids)
        and building.property_id = v_property.id
        and building.status = 'active';
      if v_building_count <> cardinality(v_building_ids) then
        raise exception 'Mindestens ein ausgewähltes Gebäude gehört nicht aktiv zur Immobilie';
      end if;
    else
      v_building_ids := array[]::uuid[];
    end if;

    -- SELECT INTO clears the row variable when a free position has no
    -- catalogue reference, so values from the previous loop iteration cannot
    -- leak into the imported service.
    select * into v_catalog
    from public.service_catalog catalog
    where catalog.id = v_item.service_catalog_id;

    v_service_key := coalesce(
      v_catalog.service_key,
      case when v_item.item_kind = 'winter' then 'winterdienst' else 'individuelle-leistung' end
    );
    if exists (
      select 1 from public.property_services service
      where service.property_id = v_property.id and service.service_key = v_service_key
    ) then
      v_service_key := left(v_service_key, 78) || '-ang-' || left(replace(v_item.id::text, '-', ''), 12);
    end if;

    v_contract_start_date := coalesce(
      v_version.planned_start_date,
      v_property.care_start_date,
      (now() at time zone 'Europe/Berlin')::date
    );
    v_contract_permanent := v_item.permanent
      and v_item.billing_type <> 'one_time'
      and v_item.frequency <> 'once';
    v_execution_rule := case
      when not v_contract_permanent then 'manual'
      when v_item.frequency = 'weekly' then 'once_weekly'
      when v_item.frequency = 'multiple_weekly' then 'multiple_weekly'
      when v_item.frequency = 'monthly' then 'once_monthly'
      when v_item.frequency = 'quarterly' then 'once_quarterly'
      when v_item.frequency = 'yearly' then 'once_yearly'
      when v_item.frequency = 'on_demand' then 'on_demand'
      else 'manual'
    end;

    insert into public.property_services (
      property_id, catalog_id, service_key, name, category,
      customer_description, execution_rule, occurrences_per_period,
      seasonal, season_start_month, season_end_month, start_date, end_date,
      customer_visible, photo_required, sort_order, status,
      source_offer_version_item_id
    ) values (
      v_property.id,
      v_item.service_catalog_id,
      v_service_key,
      v_item.title,
      coalesce(v_catalog.category, case when v_item.item_kind = 'winter' then 'Winterdienst' else 'Individuell' end),
      coalesce(v_item.description, v_catalog.customer_description),
      v_execution_rule,
      v_item.frequency_occurrences,
      v_item.seasonal,
      case when v_item.seasonal then v_item.season_start_month end,
      case when v_item.seasonal then v_item.season_end_month end,
      v_contract_start_date,
      case when v_contract_permanent then null else v_contract_start_date end,
      true,
      false,
      v_item.sort_order,
      'active',
      v_item.id
    ) returning id into v_service_id;

    if v_item.visible_note is not null then
      insert into public.property_service_instructions (
        property_service_id, internal_instruction, updated_by
      ) values (
        v_service_id,
        'Vertraglicher Angebotshinweis: ' || v_item.visible_note,
        v_actor
      );
    end if;

    insert into public.property_service_buildings (property_service_id, building_id)
    select v_service_id, selected.building_id
    from unnest(v_building_ids) selected(building_id);

    v_agreed_net_cents := case
      when coalesce(v_item.pricing_snapshot ->> 'net_cents', '') ~ '^[0-9]+$'
        then (v_item.pricing_snapshot ->> 'net_cents')::bigint
      else greatest(v_item.total_net_cents, 0)
    end;
    v_agreed_discount_cents := case
      when coalesce(v_item.pricing_snapshot ->> 'discount_cents', '') ~ '^[0-9]+$'
        then (v_item.pricing_snapshot ->> 'discount_cents')::bigint
      else 0
    end;
    v_agreed_subtotal_cents := case
      when coalesce(v_item.pricing_snapshot ->> 'subtotal_cents', '') ~ '^[0-9]+$'
        then (v_item.pricing_snapshot ->> 'subtotal_cents')::bigint
      else v_agreed_net_cents + v_agreed_discount_cents
    end;
    if v_agreed_subtotal_cents < v_agreed_net_cents + v_agreed_discount_cents then
      v_agreed_subtotal_cents := v_agreed_net_cents + v_agreed_discount_cents;
    end if;

    insert into public.offer_property_item_links (
      offer_property_link_id, offer_item_id, property_service_id,
      scope, agreed_price_snapshot
    ) values (
      v_link_id,
      v_item.id,
      v_service_id,
      v_scope,
      jsonb_build_object(
        'offer_number', v_version.offer_number,
        'offer_version', v_version.version_number,
        'billing_type', v_item.billing_type,
        'tax_rate_bps', v_item.tax_rate_bps,
        'subtotal_before_discount_cents', v_agreed_subtotal_cents,
        'discount_cents', v_agreed_discount_cents,
        'net_cents', v_agreed_net_cents,
        'billing_buckets', case
          when jsonb_typeof(v_item.pricing_snapshot -> 'billing_buckets') = 'object'
            then v_item.pricing_snapshot -> 'billing_buckets'
          else '{}'::jsonb
        end,
        'price_components', v_item.price_components,
        'manual_price', v_item.manual_price,
        'permanent', v_contract_permanent,
        'area_sqm', v_item.area_sqm,
        'quantity', v_item.quantity,
        'unit', v_item.unit,
        'frequency', v_item.frequency,
        'season_start_month', v_item.season_start_month,
        'season_end_month', v_item.season_end_month,
        'winter_model', v_item.winter_model,
        'included_visits', v_item.included_visits,
        'additional_visit_price_cents', v_item.additional_visit_price_cents
      )
    );
  end loop;

  v_monthly_net_text := coalesce(
    nullif(v_version.billing_totals #>> '{monthly,net_cents}', ''),
    nullif(v_version.billing_totals #>> '{monthly,netCents}', '')
  );
  v_monthly_tax_text := coalesce(
    nullif(v_version.billing_totals #>> '{monthly,tax_cents}', ''),
    nullif(v_version.billing_totals #>> '{monthly,taxCents}', '')
  );
  v_monthly_net_cents := case
    when coalesce(v_monthly_net_text, '') ~ '^[0-9]+$'
      then v_monthly_net_text::bigint
    else 0
  end;
  v_monthly_tax_cents := case
    when coalesce(v_monthly_tax_text, '') ~ '^[0-9]+$'
      then v_monthly_tax_text::bigint
    else 0
  end;
  if v_monthly_net_cents > 0 then
    if coalesce(v_monthly_tax_text, '') ~ '^[0-9]+$' then
      v_monthly_tax_rate_bps := greatest(
        0,
        least(
          10000,
          round(v_monthly_tax_cents::numeric * 10000 / v_monthly_net_cents)::integer
        )
      );
    else
      select coalesce(settings.tax_rate_bps, 1900)
      into v_monthly_tax_rate_bps
      from public.property_admin_settings settings
      where settings.property_id = v_property.id;
      v_monthly_tax_rate_bps := coalesce(v_monthly_tax_rate_bps, 1900);
    end if;
    v_compensation_valid_from := coalesce(
      v_version.planned_start_date,
      v_property.care_start_date,
      (now() at time zone 'Europe/Berlin')::date
    );
    v_compensation_rate_id := public.upsert_property_compensation_rate(
      v_property.id,
      v_monthly_net_cents,
      v_monthly_tax_rate_bps,
      v_compensation_valid_from,
      null,
      'Vertraglicher Monatswert aus Angebot '
        || v_version.offer_number || ' · Version ' || v_version.version_number::text
    );
  end if;

  update public.offer_property_links
  set import_completed_at = now()
  where id = v_link_id;
  update public.offer_versions
  set lifecycle_status = 'linked', updated_at = now()
  where id = v_version.id;
  update public.offers
  set lifecycle_status = 'linked', updated_at = now()
  where id = v_offer.id;

  insert into public.audit_logs (actor_id, action, entity_table, entity_id, metadata)
  values (
    v_actor, 'offer.linked_to_property', 'offers', v_offer.id,
    jsonb_build_object(
      'offer_version_id', v_version.id,
      'property_id', v_property.id,
      'offer_property_link_id', v_link_id,
      'compensation_rate_id', v_compensation_rate_id,
      'monthly_net_cents', v_monthly_net_cents,
      'compensation_valid_from', v_compensation_valid_from
    )
  );

  return jsonb_build_object(
    'offer_id', v_offer.id,
    'offer_version_id', v_version.id,
    'property_id', v_property.id,
    'offer_property_link_id', v_link_id,
    'compensation_rate_id', v_compensation_rate_id
  );
end;
$$;

revoke all on function public.link_accepted_offer_to_property(uuid, uuid, jsonb)
  from public, anon, service_role;
grant execute on function public.link_accepted_offer_to_property(uuid, uuid, jsonb)
  to authenticated;

create or replace function public.admin_create_property_from_offer(
  p_property_payload jsonb,
  p_offer_version_id uuid,
  p_assignments jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_created record;
  v_link jsonb;
begin
  perform private.require_offer_admin();
  if p_property_payload is null or jsonb_typeof(p_property_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'Die Immobiliendaten fehlen';
  end if;

  select * into v_created
  from public.create_property_with_building(
    p_customer_id => (p_property_payload ->> 'customer_id')::uuid,
    p_name => p_property_payload ->> 'name',
    p_property_type => p_property_payload ->> 'property_type',
    p_care_start_date => nullif(p_property_payload ->> 'care_start_date', '')::date,
    p_building_id => (p_property_payload ->> 'building_id')::uuid,
    p_street => p_property_payload ->> 'street',
    p_house_number => p_property_payload ->> 'house_number',
    p_postal_code => p_property_payload ->> 'postal_code',
    p_city => p_property_payload ->> 'city',
    p_country => p_property_payload ->> 'country',
    p_formatted_address => p_property_payload ->> 'formatted_address',
    p_qr_token_nonce => (p_property_payload ->> 'qr_token_nonce')::uuid,
    p_qr_token_hash => p_property_payload ->> 'qr_token_hash',
    p_monthly_fee_net_cents => (p_property_payload ->> 'monthly_fee_net_cents')::bigint,
    p_tax_rate_bps => (p_property_payload ->> 'tax_rate_bps')::integer,
    p_max_visit_minutes => (p_property_payload ->> 'max_visit_minutes')::integer,
    p_property_id => (p_property_payload ->> 'property_id')::uuid,
    p_object_key => nullif(p_property_payload ->> 'object_key', ''),
    p_ownership_name => nullif(p_property_payload ->> 'ownership_name', ''),
    p_property_status => coalesce(nullif(p_property_payload ->> 'property_status', ''), 'active'),
    p_building_label => nullif(p_property_payload ->> 'building_label', ''),
    p_internal_briefing => nullif(p_property_payload ->> 'internal_briefing', ''),
    p_internal_notes => nullif(p_property_payload ->> 'internal_notes', ''),
    p_access_notes => nullif(p_property_payload ->> 'access_notes', ''),
    p_billing_recipient_name => p_property_payload ->> 'billing_recipient_name',
    p_billing_address_addition => nullif(p_property_payload ->> 'billing_address_addition', ''),
    p_billing_street => p_property_payload ->> 'billing_street',
    p_billing_house_number => p_property_payload ->> 'billing_house_number',
    p_billing_postal_code => p_property_payload ->> 'billing_postal_code',
    p_billing_city => p_property_payload ->> 'billing_city',
    p_billing_country => p_property_payload ->> 'billing_country',
    p_billing_email => p_property_payload ->> 'billing_email'
  );

  v_link := public.link_accepted_offer_to_property(
    p_offer_version_id,
    v_created.property_id,
    coalesce(p_assignments, '[]'::jsonb)
  );

  return jsonb_build_object(
    'property_id', v_created.property_id,
    'building_id', v_created.building_id,
    'offer_property_link_id', v_link ->> 'offer_property_link_id'
  );
end;
$$;

revoke all on function public.admin_create_property_from_offer(jsonb, uuid, jsonb)
  from public, anon, service_role;
grant execute on function public.admin_create_property_from_offer(jsonb, uuid, jsonb)
  to authenticated;

create or replace function public.admin_create_building_from_offer(
  p_building_payload jsonb,
  p_offer_version_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_offer public.offers%rowtype;
  v_version public.offer_versions%rowtype;
  v_property public.properties%rowtype;
  v_link_result jsonb;
  v_assignments jsonb;
  v_building_id uuid;
  v_property_id uuid;
  v_qr_token_nonce uuid;
  v_expected_assignment_count integer;
  v_assigned_service_count integer;
begin
  perform private.require_offer_admin();
  if p_building_payload is null or jsonb_typeof(p_building_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'Die Gebäudedaten fehlen';
  end if;

  begin
    v_building_id := nullif(p_building_payload ->> 'building_id', '')::uuid;
    v_property_id := nullif(p_building_payload ->> 'property_id', '')::uuid;
    v_qr_token_nonce := nullif(p_building_payload ->> 'qr_token_nonce', '')::uuid;
  exception when invalid_text_representation then
    raise exception using
      errcode = '22023',
      message = 'Gebäude-, Immobilien- oder QR-ID ist ungültig';
  end;

  if v_building_id is null or v_property_id is null or v_qr_token_nonce is null then
    raise exception using
      errcode = '22023',
      message = 'Gebäude-, Immobilien- und QR-ID sind erforderlich';
  end if;
  if nullif(btrim(coalesce(p_building_payload ->> 'street', '')), '') is null
     or nullif(btrim(coalesce(p_building_payload ->> 'house_number', '')), '') is null
     or nullif(btrim(coalesce(p_building_payload ->> 'postal_code', '')), '') is null
     or nullif(btrim(coalesce(p_building_payload ->> 'city', '')), '') is null
     or nullif(btrim(coalesce(p_building_payload ->> 'formatted_address', '')), '') is null
     or length(btrim(coalesce(p_building_payload ->> 'qr_token_hash', ''))) < 32 then
    raise exception using
      errcode = '22023',
      message = 'Adresse und sicherer QR-Tokenhash des Gebäudes sind erforderlich';
  end if;

  select * into v_offer
  from public.offers offer
  where offer.id = (
    select version.offer_id
    from public.offer_versions version
    where version.id = p_offer_version_id
  )
  for update;
  if not found then raise exception 'Die Angebotsversion wurde nicht gefunden'; end if;

  select * into v_version
  from public.offer_versions version
  where version.id = p_offer_version_id
    and version.offer_id = v_offer.id
  for update;
  if not found then raise exception 'Die Angebotsversion wurde nicht gefunden'; end if;

  select * into v_property
  from public.properties property
  where property.id = v_property_id
  for update;
  if not found or v_property.status = 'archived' then
    raise exception 'Die aktive Immobilie wurde nicht gefunden';
  end if;

  if v_version.calculation_snapshot ->> 'workflow_mode' = 'historical_read_only'
     or v_version.lifecycle_status <> 'accepted'
     or v_offer.lifecycle_status <> 'accepted'
     or v_offer.active_version_id <> v_version.id
     or v_property.customer_id <> v_version.customer_id
     or not exists (
       select 1
       from public.offer_acceptances acceptance
       where acceptance.offer_version_id = v_version.id
     )
     or exists (
       select 1
       from public.offer_property_links link
       where link.offer_version_id = v_version.id
     ) then
    raise exception 'Nur eine noch nicht verknüpfte, neu angenommene Angebotsversion dieser Immobilie kann verwendet werden';
  end if;

  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'item_id', item.id,
          'scope', 'buildings',
          'building_ids', jsonb_build_array(v_building_id)
        )
        order by item.sort_order, item.id
      ),
      '[]'::jsonb
    ),
    count(*)::integer
  into v_assignments, v_expected_assignment_count
  from public.offer_version_items item
  where item.offer_version_id = v_version.id;

  if v_expected_assignment_count = 0 then
    raise exception 'Ein Angebot ohne Positionen kann kein Gebäude begründen';
  end if;

  insert into public.buildings (
    id, property_id, label, street, house_number, postal_code, city, country,
    formatted_address, qr_token_nonce, qr_token_hash, status
  ) values (
    v_building_id,
    v_property.id,
    nullif(btrim(coalesce(p_building_payload ->> 'label', '')), ''),
    btrim(p_building_payload ->> 'street'),
    btrim(p_building_payload ->> 'house_number'),
    btrim(p_building_payload ->> 'postal_code'),
    btrim(p_building_payload ->> 'city'),
    coalesce(
      nullif(btrim(coalesce(p_building_payload ->> 'country', '')), ''),
      'Deutschland'
    ),
    btrim(p_building_payload ->> 'formatted_address'),
    v_qr_token_nonce,
    btrim(p_building_payload ->> 'qr_token_hash'),
    'active'
  );

  if nullif(btrim(coalesce(p_building_payload ->> 'access_notes', '')), '') is not null then
    insert into public.building_access_notes (building_id, access_notes, updated_by)
    values (
      v_building_id,
      btrim(p_building_payload ->> 'access_notes'),
      v_actor
    );
  end if;

  v_link_result := public.link_accepted_offer_to_property(
    v_version.id,
    v_property.id,
    v_assignments
  );

  select count(*)::integer
  into v_assigned_service_count
  from public.offer_property_item_links item_link
  where item_link.offer_property_link_id
      = (v_link_result ->> 'offer_property_link_id')::uuid
    and item_link.scope = 'buildings'
    and exists (
      select 1
      from public.property_service_buildings building_link
      where building_link.property_service_id = item_link.property_service_id
        and building_link.building_id = v_building_id
    );

  if v_assigned_service_count <> v_expected_assignment_count then
    raise exception 'Nicht alle gebäudebezogenen Angebotspositionen konnten zugeordnet werden';
  end if;

  insert into public.audit_logs (actor_id, action, entity_table, entity_id, metadata)
  values (
    v_actor,
    'building.created_from_offer',
    'buildings',
    v_building_id,
    jsonb_build_object(
      'property_id', v_property.id,
      'offer_id', v_offer.id,
      'offer_version_id', v_version.id,
      'offer_property_link_id', (v_link_result ->> 'offer_property_link_id')::uuid,
      'assigned_service_count', v_assigned_service_count,
      'access_note_created',
        nullif(btrim(coalesce(p_building_payload ->> 'access_notes', '')), '') is not null,
      'atomic', true
    )
  );

  return jsonb_build_object(
    'building_id', v_building_id,
    'property_id', v_property.id,
    'offer_property_link_id', (v_link_result ->> 'offer_property_link_id')::uuid,
    'assigned_service_count', v_assigned_service_count
  );
end;
$$;

revoke all on function public.admin_create_building_from_offer(jsonb, uuid)
  from public, anon, service_role;
grant execute on function public.admin_create_building_from_offer(jsonb, uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- RLS and explicit API grants
-- ---------------------------------------------------------------------------

alter table public.offer_sequences enable row level security;
alter table public.offer_versions enable row level security;
alter table public.offer_version_items enable row level security;
alter table public.offer_discounts enable row level security;
alter table public.service_pricing_rules enable row level security;
alter table public.offer_acceptances enable row level security;
alter table public.offer_acceptance_delivery_jobs enable row level security;
alter table public.offer_rejections enable row level security;
alter table public.offer_property_links enable row level security;
alter table public.offer_property_item_links enable row level security;

drop policy if exists "offers_admin_all" on public.offers;
drop policy if exists "offers_customer_select_released" on public.offers;
drop policy if exists "offers_customer_accept_released" on public.offers;
drop policy if exists "offer_items_admin_all" on public.offer_items;
drop policy if exists "offer_items_customer_select_released" on public.offer_items;

create policy offers_admin_select_v2
on public.offers for select to authenticated
using ((select private.is_admin()));

create policy offers_customer_select_v2
on public.offers for select to authenticated
using (
  (select private.is_customer_of_customer(customer_id))
  and exists (
    select 1
    from public.offer_versions version
    where version.offer_id = offers.id
      and version.frozen_at is not null
      and version.sent_at is not null
      and version.lifecycle_status in (
        'sent', 'viewed', 'accepted', 'rejected', 'expired',
        'withdrawn', 'superseded', 'linked'
      )
  )
);

create policy offer_versions_admin_select
on public.offer_versions for select to authenticated
using ((select private.is_admin()));

create policy offer_versions_customer_select
on public.offer_versions for select to authenticated
using (
  frozen_at is not null
  and sent_at is not null
  and lifecycle_status in (
    'sent', 'viewed', 'accepted', 'rejected', 'expired',
    'withdrawn', 'superseded', 'linked'
  )
  and (select private.is_customer_of_customer(customer_id))
);

create policy offer_version_items_admin_select
on public.offer_version_items for select to authenticated
using ((select private.is_admin()));

create policy offer_version_items_customer_select
on public.offer_version_items for select to authenticated
using (
  exists (
    select 1
    from public.offer_versions version
    where version.id = offer_version_items.offer_version_id
      and version.frozen_at is not null
      and version.sent_at is not null
      and version.lifecycle_status in (
        'sent', 'viewed', 'accepted', 'rejected', 'expired',
        'withdrawn', 'superseded', 'linked'
      )
      and (select private.is_customer_of_customer(version.customer_id))
  )
);

create policy offer_discounts_admin_select
on public.offer_discounts for select to authenticated
using ((select private.is_admin()));

create policy offer_discounts_customer_select
on public.offer_discounts for select to authenticated
using (
  exists (
    select 1
    from public.offer_versions version
    where version.id = offer_discounts.offer_version_id
      and version.frozen_at is not null
      and version.sent_at is not null
      and version.lifecycle_status in (
        'sent', 'viewed', 'accepted', 'rejected', 'expired',
        'withdrawn', 'superseded', 'linked'
      )
      and (select private.is_customer_of_customer(version.customer_id))
  )
);

create policy service_pricing_rules_admin_select
on public.service_pricing_rules for select to authenticated
using ((select private.is_admin()));

create policy offer_acceptances_admin_select
on public.offer_acceptances for select to authenticated
using ((select private.is_admin()));

create policy offer_acceptances_customer_select
on public.offer_acceptances for select to authenticated
using ((select private.is_customer_of_customer(customer_id)));

create policy offer_acceptance_delivery_jobs_admin_select
on public.offer_acceptance_delivery_jobs for select to authenticated
using ((select private.is_admin()));

create policy offer_rejections_admin_select
on public.offer_rejections for select to authenticated
using ((select private.is_admin()));

create policy offer_rejections_customer_select
on public.offer_rejections for select to authenticated
using ((select private.is_customer_of_customer(customer_id)));

create policy offer_property_links_admin_select
on public.offer_property_links for select to authenticated
using ((select private.is_admin()));

create policy offer_property_links_customer_select
on public.offer_property_links for select to authenticated
using (
  exists (
    select 1
    from public.offer_versions version
    where version.id = offer_property_links.offer_version_id
      and (select private.is_customer_of_customer(version.customer_id))
  )
);

create policy offer_property_item_links_admin_select
on public.offer_property_item_links for select to authenticated
using ((select private.is_admin()));

create policy offer_property_item_links_customer_select
on public.offer_property_item_links for select to authenticated
using (
  exists (
    select 1
    from public.offer_property_links link
    join public.offer_versions version on version.id = link.offer_version_id
    where link.id = offer_property_item_links.offer_property_link_id
      and (select private.is_customer_of_customer(version.customer_id))
  )
);

create policy offer_sequences_admin_select
on public.offer_sequences for select to authenticated
using ((select private.is_admin()));

revoke all privileges on table
  public.offers,
  public.offer_items,
  public.offer_sequences,
  public.offer_versions,
  public.offer_version_items,
  public.offer_discounts,
  public.service_pricing_rules,
  public.offer_acceptances,
  public.offer_acceptance_delivery_jobs,
  public.offer_rejections,
  public.offer_property_links,
  public.offer_property_item_links
from anon, authenticated;

grant all privileges on table
  public.offer_sequences,
  public.offer_versions,
  public.offer_version_items,
  public.offer_discounts,
  public.service_pricing_rules,
  public.offer_acceptances,
  public.offer_acceptance_delivery_jobs,
  public.offer_rejections,
  public.offer_property_links,
  public.offer_property_item_links
to service_role;

grant select (
  id, customer_id, project_id, status, lifecycle_status, title,
  net_total, tax_rate, tax_total, gross_total, released_at, accepted_at,
  created_at, updated_at, offer_number, document_path, sent_at,
  current_version_id, active_version_id, draft_version_id, source_offer_id,
  last_viewed_at, withdrawn_at
) on public.offers to authenticated;

grant select (
  id, offer_id, customer_id, version_number, lifecycle_status, offer_number,
  title, contact_name, recipient_snapshot, object_label, object_address,
  offer_date, valid_until, planned_start_date, intro, visible_note,
  payment_terms, contract_terms, issuer_snapshot, subtotal_cents,
  discount_total_cents, net_total_cents, tax_total_cents, gross_total_cents,
  billing_totals, frozen_at, sent_at, viewed_at, accepted_at, rejected_at,
  withdrawn_at, withdrawal_reason, superseded_at, original_pdf_bucket,
  original_pdf_path, original_pdf_sha256, document_content_sha256,
  created_at, updated_at
) on public.offer_versions to authenticated;

grant select (
  id, offer_version_id, client_key, service_catalog_id, item_kind, title,
  description, area_sqm, quantity, unit, frequency, frequency_occurrences,
  billing_type, calculation_type, unit_price_cents, total_net_cents,
  tax_rate_bps, manual_price, permanent, seasonal, season_start_month,
  season_end_month, visible_note, winter_surface_type, winter_model,
  included_visits, additional_visit_price_cents, monthly_base_fee_cents,
  seasonal_flat_rate_cents, surcharge_cents, price_components, sort_order,
  created_at
) on public.offer_version_items to authenticated;

grant select (
  id, offer_version_id, offer_item_id, scope, discount_type,
  percentage_bps, amount_cents, applied_amount_cents, reason,
  sort_order, created_at
) on public.offer_discounts to authenticated;

grant select (
  id, offer_id, offer_version_id, customer_id, accepted_by, accepted_name,
  accepted_at, confirmed_gross_total_cents, confirmed_totals,
  confirmed_content_sha256, comment, confirmation_pdf_bucket,
  confirmation_pdf_path, confirmation_pdf_sha256, created_at
) on public.offer_acceptances to authenticated;

grant select (
  id, acceptance_id, status, attempts, available_at, processing_started_at,
  last_attempt_at, sent_at, failed_at, last_error, created_at, updated_at
) on public.offer_acceptance_delivery_jobs to authenticated;

grant select (
  id, offer_id, offer_version_id, customer_id, rejected_by,
  rejected_name, comment, rejected_at, created_at
) on public.offer_rejections to authenticated;

grant select (
  id, offer_id, offer_version_id, property_id, linked_at,
  import_completed_at, created_at
) on public.offer_property_links to authenticated;

grant select (
  id, offer_property_link_id, offer_item_id, property_service_id,
  scope, agreed_price_snapshot, created_at
) on public.offer_property_item_links to authenticated;

-- Admin pages use the server-side service client, but authenticated SQL tools
-- may still inspect the sequence and pricing catalogue under the admin policy.
grant select on public.offer_sequences, public.service_pricing_rules
  to authenticated;

create or replace function private.protect_immutable_offer_pdf()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op not in ('UPDATE', 'DELETE') then return new; end if;
  if exists (
    select 1
    from public.offer_versions version
    where version.original_pdf_bucket = old.bucket_id
      and version.original_pdf_path = old.name
  ) or exists (
    select 1
    from public.offer_acceptances acceptance
    where acceptance.confirmation_pdf_bucket = old.bucket_id
      and acceptance.confirmation_pdf_path = old.name
  ) then
    raise exception 'Ein gespeichertes Angebots- oder Annahmeoriginal ist unveränderlich';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists hausvia_protect_immutable_offer_pdf on storage.objects;
create trigger hausvia_protect_immutable_offer_pdf
before update or delete on storage.objects
for each row execute function private.protect_immutable_offer_pdf();
