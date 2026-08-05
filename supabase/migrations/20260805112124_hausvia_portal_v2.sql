-- Hausvia Portal V2
-- Additive migration: the legacy project/shift/offer tables stay intact while the
-- property, building, visit and billing domains are introduced alongside them.

create extension if not exists pgcrypto;
create extension if not exists btree_gist;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Invitations and existing master data
-- ---------------------------------------------------------------------------

alter table public.invitations alter column status drop default;
alter type public.invitation_status rename to invitation_status_legacy;
create type public.invitation_status as enum ('draft', 'sent', 'accepted', 'expired', 'revoked');
alter table public.invitations
  alter column status type public.invitation_status
  using (
    case status::text
      when 'pending' then 'draft'
      when 'accepted' then 'accepted'
      when 'expired' then 'expired'
      when 'revoked' then 'revoked'
      else 'draft'
    end
  )::public.invitation_status;
alter table public.invitations alter column status set default 'draft';
drop type public.invitation_status_legacy;

alter table public.customers
  add column if not exists category text,
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists contact_first_name text,
  add column if not exists contact_last_name text,
  add column if not exists billing_street text,
  add column if not exists billing_house_number text,
  add column if not exists billing_postal_code text,
  add column if not exists billing_city text,
  add column if not exists billing_country text not null default 'Deutschland',
  add column if not exists archived_at timestamptz;

alter table public.customers
  add constraint customers_category_check
  check (category is null or category in ('private', 'commercial', 'property_management', 'investor')) not valid;

alter table public.employee_profiles
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists category text,
  add column if not exists company_name text,
  add column if not exists address_street text,
  add column if not exists address_house_number text,
  add column if not exists address_postal_code text,
  add column if not exists address_city text,
  add column if not exists address_country text not null default 'Deutschland',
  add column if not exists address_formatted text,
  add column if not exists archived_at timestamptz;

alter table public.employee_profiles
  add constraint employee_profiles_category_check
  check (category is null or category in ('minijob', 'part_time', 'full_time', 'freelancer')) not valid;

alter table public.invitations
  add column if not exists category text,
  add column if not exists customer_id uuid references public.customers(id) on delete restrict,
  add column if not exists employee_id uuid references public.employee_profiles(id) on delete restrict,
  add column if not exists token_hash text,
  add column if not exists expires_at timestamptz,
  add column if not exists revoked_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table public.invitations
  add constraint invitations_expiry_after_creation_check
  check (expires_at is null or expires_at > created_at) not valid;

create unique index invitations_token_hash_uidx
  on public.invitations(token_hash)
  where token_hash is not null;

-- Legacy data may contain several still-open invitations for the same address.
-- Invitations from the old schema had no concrete customer/employee target and
-- cannot safely be redeemed in V2, so archive those first. Then keep the most
-- recently sent (or most recently created) valid invitation per address.
update public.invitations invitation
set status = 'revoked',
    revoked_at = coalesce(invitation.revoked_at, now()),
    updated_at = now()
where invitation.status in ('draft', 'sent')
  and not (
    (invitation.role = 'customer' and invitation.customer_id is not null and invitation.employee_id is null)
    or (invitation.role = 'employee' and invitation.employee_id is not null and invitation.customer_id is null)
    or (invitation.role = 'admin' and invitation.customer_id is null and invitation.employee_id is null)
  );

with ranked_active_invitations as (
  select id,
    row_number() over (
      partition by lower(email)
      order by
        case status when 'sent' then 0 else 1 end,
        coalesce(sent_at, created_at) desc,
        created_at desc,
        id desc
    ) as duplicate_rank
  from public.invitations
  where status in ('draft', 'sent')
)
update public.invitations invitation
set status = 'revoked',
    revoked_at = coalesce(invitation.revoked_at, now()),
    updated_at = now()
from ranked_active_invitations ranked
where invitation.id = ranked.id
  and ranked.duplicate_rank > 1;

-- New invitations always carry their concrete target. NOT VALID deliberately
-- preserves older invitation rows until they are reviewed or reissued.
alter table public.invitations
  add constraint invitations_target_matches_role_check
  check (
    (role = 'customer' and customer_id is not null and employee_id is null)
    or (role = 'employee' and employee_id is not null and customer_id is null)
    or (role = 'admin' and customer_id is null and employee_id is null)
  ) not valid;

create unique index invitations_one_active_email_uidx
  on public.invitations(lower(email))
  where status in ('draft', 'sent');
create index invitations_expires_at_idx
  on public.invitations(expires_at)
  where status = 'sent';
create index invitations_customer_id_idx on public.invitations(customer_id);
create index invitations_employee_id_idx on public.invitations(employee_id);

drop trigger if exists invitations_touch_updated_at on public.invitations;
create trigger invitations_touch_updated_at
before update on public.invitations
for each row execute function public.touch_updated_at();

create table public.customer_users (
  customer_id uuid not null references public.customers(id) on delete restrict,
  user_id uuid not null references public.user_profiles(id) on delete restrict,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (customer_id, user_id)
);

insert into public.customer_users (customer_id, user_id, active)
select id, portal_user_id, true
from public.customers
where portal_user_id is not null
on conflict (customer_id, user_id) do nothing;

create index customer_users_user_id_idx
  on public.customer_users(user_id, customer_id)
  where active = true;

create trigger customer_users_touch_updated_at
before update on public.customer_users
for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Properties, buildings and role-separated sensitive data
-- ---------------------------------------------------------------------------

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  name text not null,
  object_key text,
  property_type text not null,
  ownership_name text,
  care_start_date date,
  care_end_date date,
  status text not null default 'active'
    check (status in ('planning', 'active', 'paused', 'archived')),
  archived_at timestamptz,
  created_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(btrim(name)) > 0),
  check (property_type in (
    'single_family', 'multi_family', 'residential_complex', 'weg',
    'commercial', 'office_practice', 'mixed', 'other'
  )),
  check (care_end_date is null or care_start_date is null or care_end_date >= care_start_date)
);

create unique index properties_object_key_uidx
  on public.properties(lower(object_key))
  where object_key is not null and status <> 'archived';
create index properties_customer_status_idx on public.properties(customer_id, status);
create index properties_created_by_idx on public.properties(created_by);

create trigger properties_touch_updated_at
before update on public.properties
for each row execute function public.touch_updated_at();

create table public.property_admin_settings (
  property_id uuid primary key references public.properties(id) on delete restrict,
  monthly_fee_net_cents bigint not null default 0 check (monthly_fee_net_cents >= 0),
  tax_rate_bps integer not null default 1900 check (tax_rate_bps between 0 and 10000),
  max_visit_minutes integer check (max_visit_minutes is null or max_visit_minutes > 0),
  internal_notes text,
  updated_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger property_admin_settings_touch_updated_at
before update on public.property_admin_settings
for each row execute function public.touch_updated_at();

create table public.property_compensation_rates (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete restrict,
  net_amount_cents bigint not null check (net_amount_cents >= 0),
  tax_rate_bps integer not null default 1900 check (tax_rate_bps between 0 and 10000),
  valid_from date not null,
  valid_until date,
  internal_note text,
  created_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (valid_until is null or valid_until >= valid_from)
);

create unique index property_compensation_rates_period_uidx
  on public.property_compensation_rates(property_id, valid_from);
create index property_compensation_rates_lookup_idx
  on public.property_compensation_rates(property_id, valid_from desc, valid_until);

alter table public.property_compensation_rates
  add constraint property_compensation_rates_no_overlap
  exclude using gist (
    property_id with =,
    daterange(valid_from, coalesce(valid_until, 'infinity'::date), '[]') with &&
  );

create table public.property_briefings (
  property_id uuid primary key references public.properties(id) on delete restrict,
  internal_briefing text,
  updated_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger property_briefings_touch_updated_at
before update on public.property_briefings
for each row execute function public.touch_updated_at();

create table public.property_billing_profiles (
  property_id uuid primary key references public.properties(id) on delete restrict,
  recipient_name text not null,
  address_addition text,
  street text not null,
  house_number text not null,
  postal_code text not null,
  city text not null,
  country text not null default 'Deutschland',
  email text not null,
  is_override boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger property_billing_profiles_touch_updated_at
before update on public.property_billing_profiles
for each row execute function public.touch_updated_at();

create table public.buildings (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete restrict,
  label text,
  street text not null,
  house_number text not null,
  postal_code text not null,
  city text not null,
  country text not null default 'Deutschland',
  formatted_address text not null,
  qr_token_nonce uuid not null default gen_random_uuid(),
  qr_token_hash text not null,
  status text not null default 'active' check (status in ('active', 'archived')),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(btrim(formatted_address)) > 0),
  check (length(btrim(qr_token_hash)) >= 32)
);

create unique index buildings_qr_token_hash_uidx on public.buildings(qr_token_hash);
create unique index buildings_qr_token_nonce_uidx on public.buildings(qr_token_nonce);
create index buildings_property_status_idx on public.buildings(property_id, status);
create index buildings_city_idx on public.buildings(city);

create trigger buildings_touch_updated_at
before update on public.buildings
for each row execute function public.touch_updated_at();

create table public.building_access_notes (
  building_id uuid primary key references public.buildings(id) on delete restrict,
  access_notes text,
  updated_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger building_access_notes_touch_updated_at
before update on public.building_access_notes
for each row execute function public.touch_updated_at();

create table public.property_employee_assignments (
  property_id uuid not null references public.properties(id) on delete restrict,
  employee_id uuid not null references public.employee_profiles(id) on delete restrict,
  assigned_by uuid references public.user_profiles(id) on delete set null,
  active boolean not null default true,
  starts_on date not null default current_date,
  ends_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (property_id, employee_id),
  check (ends_on is null or ends_on >= starts_on)
);

create index property_employee_assignments_employee_idx
  on public.property_employee_assignments(employee_id, property_id)
  where active = true;

create trigger property_employee_assignments_touch_updated_at
before update on public.property_employee_assignments
for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Service catalogue and property services
-- ---------------------------------------------------------------------------

create table public.service_catalog (
  id uuid primary key default gen_random_uuid(),
  service_key text not null unique,
  name text not null,
  category text not null,
  customer_description text,
  default_execution_rule text not null default 'every_visit',
  default_occurrences_per_period integer not null default 1 check (default_occurrences_per_period > 0),
  default_seasonal boolean not null default false,
  default_season_start_month integer check (default_season_start_month between 1 and 12),
  default_season_end_month integer check (default_season_end_month between 1 and 12),
  sort_order integer not null default 0,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (default_execution_rule in (
    'every_visit', 'once_weekly', 'multiple_weekly', 'once_monthly',
    'multiple_monthly', 'once_quarterly', 'once_yearly', 'once_season',
    'on_demand', 'manual'
  )),
  check (
    default_seasonal = false
    or (default_season_start_month is not null and default_season_end_month is not null)
  )
);

create trigger service_catalog_touch_updated_at
before update on public.service_catalog
for each row execute function public.touch_updated_at();

insert into public.service_catalog (
  service_key, name, category, customer_description, default_execution_rule,
  default_occurrences_per_period, default_seasonal, default_season_start_month,
  default_season_end_month, sort_order
)
values
  ('hausmeisterservice', 'Hausmeisterservice / Objektbetreuung', 'Objektbetreuung', 'Regelmäßige Betreuung und Kontrolle der Immobilie.', 'every_visit', 1, false, null, null, 10),
  ('technische-kontrollgaenge', 'Technische Kontrollgänge', 'Kontrolle', 'Regelmäßige Sichtkontrollen der technischen Bereiche.', 'every_visit', 1, false, null, null, 20),
  ('beleuchtung-kontrollieren', 'Beleuchtung kontrollieren', 'Kontrolle', 'Kontrolle der Beleuchtung in den vereinbarten Bereichen.', 'every_visit', 1, false, null, null, 30),
  ('technikraeume-kontrollieren', 'Heizungs- und Technikräume kontrollieren', 'Kontrolle', 'Sichtkontrolle von Heizungs- und Technikräumen.', 'every_visit', 1, false, null, null, 40),
  ('treppenhausreinigung', 'Treppenhausreinigung / Innenreinigung', 'Reinigung', 'Reinigung der vereinbarten Innenbereiche.', 'once_weekly', 1, false, null, null, 50),
  ('aussenreinigung', 'Außenreinigung / Hof / Müllplatz', 'Reinigung', 'Reinigung der vereinbarten Außenbereiche.', 'once_weekly', 1, false, null, null, 60),
  ('muelldienst', 'Mülldienst / Mülltonnenservice', 'Objektbetreuung', 'Bereitstellung und Rückstellung der Mülltonnen nach Vereinbarung.', 'once_weekly', 1, false, null, null, 70),
  ('gartenpflege', 'Gartenpflege / Außenanlagenpflege', 'Außenanlagen', 'Saisonale Pflege der Grün- und Außenanlagen.', 'every_visit', 1, true, 3, 10, 80),
  ('rasenmaehen', 'Rasenmähen', 'Außenanlagen', 'Rasenpflege im vereinbarten Turnus.', 'every_visit', 1, true, 4, 10, 90),
  ('heckenschnitt', 'Hecken- und Strauchschnitt', 'Außenanlagen', 'Saisonaler Schnitt von Hecken und Sträuchern.', 'once_season', 1, true, 3, 10, 100),
  ('laubentfernung', 'Laubentfernung', 'Außenanlagen', 'Entfernung von Laub in den vereinbarten Bereichen.', 'every_visit', 1, true, 9, 12, 110),
  ('winterdienst', 'Winterdienst', 'Winterdienst', 'Räumen und Streuen nach Vereinbarung.', 'on_demand', 1, true, 11, 3, 120),
  ('dienstleisterzugang', 'Zugang für Dienstleister organisieren', 'Koordination', 'Organisation des Objektzugangs nach Bedarf.', 'on_demand', 1, false, null, null, 130),
  ('zaehlerablesung', 'Zähler ablesen', 'Kontrolle', 'Ablesen und Dokumentieren vereinbarter Zählerstände.', 'once_yearly', 1, true, 1, 1, 140),
  ('wartung-kontrolle', 'Kleinere Wartungs- und Kontrollaufgaben', 'Wartung', 'Kleinere Wartungs- und Kontrollaufgaben nach Vereinbarung.', 'every_visit', 1, false, null, null, 150),
  ('kleinreparaturen', 'Kleinreparaturen', 'Reparatur', 'Kleinere Reparaturen im vereinbarten Leistungsumfang.', 'on_demand', 1, false, null, null, 160)
on conflict (service_key) do nothing;

create table public.property_services (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete restrict,
  catalog_id uuid references public.service_catalog(id) on delete set null,
  service_key text not null,
  name text not null,
  category text not null,
  customer_description text,
  execution_rule text not null default 'every_visit',
  occurrences_per_period integer not null default 1 check (occurrences_per_period > 0),
  seasonal boolean not null default false,
  season_start_month integer check (season_start_month between 1 and 12),
  season_end_month integer check (season_end_month between 1 and 12),
  start_date date not null default current_date,
  end_date date,
  estimated_minutes integer check (estimated_minutes is null or estimated_minutes > 0),
  customer_visible boolean not null default true,
  photo_required boolean not null default false,
  sort_order integer not null default 0,
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (execution_rule in (
    'every_visit', 'once_weekly', 'multiple_weekly', 'once_monthly',
    'multiple_monthly', 'once_quarterly', 'once_yearly', 'once_season',
    'on_demand', 'manual'
  )),
  check (end_date is null or end_date >= start_date),
  check (seasonal = false or (season_start_month is not null and season_end_month is not null))
);

create unique index property_services_key_uidx
  on public.property_services(property_id, service_key);
create index property_services_active_idx
  on public.property_services(property_id, status, start_date, end_date);
create index property_services_catalog_idx on public.property_services(catalog_id);
create index property_services_winter_idx
  on public.property_services(property_id)
  where service_key = 'winterdienst' and status = 'active';

create trigger property_services_touch_updated_at
before update on public.property_services
for each row execute function public.touch_updated_at();

create table public.property_service_instructions (
  property_service_id uuid primary key references public.property_services(id) on delete restrict,
  internal_instruction text,
  updated_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger property_service_instructions_touch_updated_at
before update on public.property_service_instructions
for each row execute function public.touch_updated_at();

create table public.property_service_buildings (
  property_service_id uuid not null references public.property_services(id) on delete cascade,
  building_id uuid not null references public.buildings(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (property_service_id, building_id)
);

create index property_service_buildings_building_idx
  on public.property_service_buildings(building_id, property_service_id);

create table public.service_checklist_items (
  id uuid primary key default gen_random_uuid(),
  property_service_id uuid not null references public.property_services(id) on delete cascade,
  label text not null,
  required boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(btrim(label)) > 0)
);

create index service_checklist_items_service_idx
  on public.service_checklist_items(property_service_id, sort_order);

create trigger service_checklist_items_touch_updated_at
before update on public.service_checklist_items
for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Visit planning and immutable task snapshots
-- ---------------------------------------------------------------------------

create table public.visit_plans (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete restrict,
  label text not null,
  frequency text not null check (frequency in ('weekly', 'monthly', 'quarterly', 'individual')),
  visits_per_period integer not null default 1 check (visits_per_period > 0),
  weekdays integer[] not null default '{}',
  month_days integer[] not null default '{}',
  desired_time time,
  window_start time,
  window_end time,
  timezone text not null default 'Europe/Berlin',
  start_date date not null,
  end_date date,
  primary_employee_id uuid references public.employee_profiles(id) on delete restrict,
  max_visit_minutes integer check (max_visit_minutes is null or max_visit_minutes > 0),
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  schedule_config jsonb not null default '{}'::jsonb,
  created_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date),
  check (window_end is null or window_start is null or window_end > window_start),
  check (weekdays <@ array[1,2,3,4,5,6,7]),
  check (month_days <@ array[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31]),
  check (
    (frequency = 'individual' and visits_per_period = 1)
    or (
      frequency = 'weekly'
      and visits_per_period = case when cardinality(weekdays) = 0 then 1 else cardinality(weekdays) end
    )
    or (
      frequency in ('monthly', 'quarterly')
      and visits_per_period = case when cardinality(month_days) = 0 then 1 else cardinality(month_days) end
    )
  )
);

create index visit_plans_property_status_idx on public.visit_plans(property_id, status);
create index visit_plans_primary_employee_idx on public.visit_plans(primary_employee_id);

create trigger visit_plans_touch_updated_at
before update on public.visit_plans
for each row execute function public.touch_updated_at();

create table public.visit_plan_buildings (
  visit_plan_id uuid not null references public.visit_plans(id) on delete cascade,
  building_id uuid not null references public.buildings(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (visit_plan_id, building_id)
);

create index visit_plan_buildings_building_idx on public.visit_plan_buildings(building_id);

create table public.visit_plan_employees (
  visit_plan_id uuid not null references public.visit_plans(id) on delete cascade,
  employee_id uuid not null references public.employee_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (visit_plan_id, employee_id)
);

create index visit_plan_employees_employee_idx on public.visit_plan_employees(employee_id);

create table public.visits (
  id uuid primary key default gen_random_uuid(),
  visit_plan_id uuid references public.visit_plans(id) on delete restrict,
  property_id uuid not null references public.properties(id) on delete restrict,
  primary_employee_id uuid references public.employee_profiles(id) on delete restrict,
  scheduled_date date not null,
  planned_start_time time,
  scheduled_start timestamptz not null,
  window_start time,
  window_end time,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'started', 'completed', 'canceled')),
  started_at timestamptz,
  completed_at timestamptz,
  duration_minutes integer check (duration_minutes is null or duration_minutes >= 0),
  started_by uuid references public.user_profiles(id) on delete restrict,
  completed_by uuid references public.user_profiles(id) on delete restrict,
  manually_adjusted boolean not null default false,
  canceled_at timestamptz,
  cancellation_reason text,
  schedule_key text,
  report_snapshot jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (completed_at is null or started_at is null or completed_at >= started_at),
  check (status <> 'canceled' or canceled_at is not null)
);

create unique index visits_plan_schedule_key_uidx
  on public.visits(visit_plan_id, schedule_key)
  where visit_plan_id is not null and schedule_key is not null;
create unique index visits_one_active_per_user_uidx
  on public.visits(started_by)
  where status = 'started' and started_by is not null;
create index visits_property_schedule_idx on public.visits(property_id, scheduled_start);
create index visits_employee_schedule_idx on public.visits(primary_employee_id, scheduled_start);
create index visits_status_schedule_idx on public.visits(status, scheduled_start);

create trigger visits_touch_updated_at
before update on public.visits
for each row execute function public.touch_updated_at();

create table public.visit_admin_metrics (
  visit_id uuid primary key references public.visits(id) on delete restrict,
  max_visit_minutes integer check (max_visit_minutes is null or max_visit_minutes > 0),
  overtime_minutes integer not null default 0 check (overtime_minutes >= 0),
  warning_created_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger visit_admin_metrics_touch_updated_at
before update on public.visit_admin_metrics
for each row execute function public.touch_updated_at();

create table public.visit_buildings (
  visit_id uuid not null references public.visits(id) on delete cascade,
  building_id uuid not null references public.buildings(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (visit_id, building_id)
);

create index visit_buildings_building_idx on public.visit_buildings(building_id, visit_id);

create table public.visit_tasks (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.visits(id) on delete restrict,
  property_id uuid not null references public.properties(id) on delete restrict,
  building_id uuid references public.buildings(id) on delete restrict,
  property_service_id uuid references public.property_services(id) on delete restrict,
  damage_report_id uuid,
  source_type text not null default 'manual'
    check (source_type in ('service', 'damage', 'manual', 'follow_up')),
  source_id uuid,
  title text not null,
  description text,
  category text,
  checklist_snapshot jsonb not null default '[]'::jsonb,
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'done', 'blocked')),
  blocked_reason text,
  photo_required boolean not null default false,
  customer_visible boolean not null default true,
  due_period_key text,
  dedupe_key text,
  carried_from_task_id uuid references public.visit_tasks(id) on delete restrict,
  follow_up_required boolean not null default false,
  started_at timestamptz,
  completed_at timestamptz,
  completed_by uuid references public.user_profiles(id) on delete restrict,
  created_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'blocked' or length(btrim(coalesce(blocked_reason, ''))) >= 3),
  check (completed_at is null or status in ('done', 'blocked'))
);

create unique index visit_tasks_dedupe_key_uidx
  on public.visit_tasks(dedupe_key)
  where dedupe_key is not null;
create index visit_tasks_visit_status_idx on public.visit_tasks(visit_id, status);
create index visit_tasks_property_idx on public.visit_tasks(property_id, created_at);
create index visit_tasks_building_idx on public.visit_tasks(building_id);
create index visit_tasks_service_idx on public.visit_tasks(property_service_id, due_period_key);
create index visit_tasks_damage_idx on public.visit_tasks(damage_report_id);
create index visit_tasks_follow_up_idx
  on public.visit_tasks(follow_up_required, completed_at)
  where follow_up_required = true;

create trigger visit_tasks_touch_updated_at
before update on public.visit_tasks
for each row execute function public.touch_updated_at();

create table public.visit_task_instructions (
  visit_task_id uuid primary key references public.visit_tasks(id) on delete restrict,
  internal_instruction text,
  created_at timestamptz not null default now()
);

create table public.visit_task_attachments (
  id uuid primary key default gen_random_uuid(),
  visit_task_id uuid not null references public.visit_tasks(id) on delete restrict,
  bucket text not null default 'visit-task-attachments',
  path text not null,
  filename text not null,
  mime_type text not null,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  uploaded_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (bucket = 'visit-task-attachments'),
  check (length(btrim(path)) > 0),
  unique (bucket, path)
);

create index visit_task_attachments_task_idx on public.visit_task_attachments(visit_task_id);

create table public.visit_time_corrections (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.visits(id) on delete restrict,
  original_started_at timestamptz,
  original_completed_at timestamptz,
  corrected_started_at timestamptz not null,
  corrected_completed_at timestamptz not null,
  reason text not null,
  corrected_by uuid not null references public.user_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (corrected_completed_at >= corrected_started_at),
  check (length(btrim(reason)) >= 5)
);

create index visit_time_corrections_visit_idx on public.visit_time_corrections(visit_id, created_at);

-- ---------------------------------------------------------------------------
-- Damage reports and internal operational reports
-- ---------------------------------------------------------------------------

create table public.damage_reports (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete restrict,
  building_id uuid not null references public.buildings(id) on delete restrict,
  source text not null check (source in ('public_qr', 'customer', 'employee', 'admin')),
  title text not null,
  description text not null,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  status text not null default 'new'
    check (status in ('new', 'reviewed', 'scheduled', 'in_progress', 'resolved', 'rejected')),
  created_by uuid references public.user_profiles(id) on delete set null,
  planned_next_visit boolean not null default true,
  linked_visit_id uuid references public.visits(id) on delete restrict,
  linked_visit_task_id uuid references public.visit_tasks(id) on delete restrict,
  resolved_at timestamptz,
  resolution_note text,
  reviewed_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(btrim(title)) > 0),
  check (length(btrim(description)) > 0),
  check (status <> 'resolved' or resolved_at is not null)
);

alter table public.visit_tasks
  add constraint visit_tasks_damage_report_id_fkey
  foreign key (damage_report_id) references public.damage_reports(id) on delete restrict;

create index damage_reports_property_status_idx on public.damage_reports(property_id, status, created_at);
create index damage_reports_building_status_idx on public.damage_reports(building_id, status);
create index damage_reports_next_visit_idx
  on public.damage_reports(property_id, created_at)
  where planned_next_visit = true and status in ('new', 'reviewed', 'scheduled');

create trigger damage_reports_touch_updated_at
before update on public.damage_reports
for each row execute function public.touch_updated_at();

-- Abuse-prevention identifiers must never be exposed with the customer-visible
-- damage report. Public submissions write this row with the service-role client.
create table public.damage_report_submission_metadata (
  damage_report_id uuid primary key references public.damage_reports(id) on delete cascade,
  submission_fingerprint text not null,
  created_at timestamptz not null default now(),
  check (length(submission_fingerprint) >= 32)
);

create index damage_report_submission_fingerprint_idx
  on public.damage_report_submission_metadata(submission_fingerprint, created_at);

create table public.damage_attachments (
  id uuid primary key default gen_random_uuid(),
  damage_report_id uuid not null references public.damage_reports(id) on delete restrict,
  bucket text not null default 'damage-attachments',
  path text not null,
  filename text not null,
  mime_type text not null,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  uploaded_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (bucket = 'damage-attachments'),
  check (length(btrim(path)) > 0),
  unique (bucket, path)
);

create index damage_attachments_report_idx on public.damage_attachments(damage_report_id);

create table public.operational_reports (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete restrict,
  building_id uuid references public.buildings(id) on delete restrict,
  equipment_id uuid,
  visit_id uuid references public.visits(id) on delete restrict,
  employee_id uuid not null references public.employee_profiles(id) on delete restrict,
  created_by uuid not null references public.user_profiles(id) on delete restrict,
  category text not null check (category in (
    'equipment_broken', 'cleaning_supply_empty', 'consumable_low', 'tool_missing',
    'access_impossible', 'key_problem', 'other'
  )),
  urgency text not null default 'normal' check (urgency in ('low', 'normal', 'high', 'urgent')),
  title text not null,
  description text not null,
  status text not null default 'new' check (status in ('new', 'reviewing', 'organized', 'resolved')),
  reviewed_by uuid references public.user_profiles(id) on delete set null,
  resolved_at timestamptz,
  resolved_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(btrim(title)) > 0),
  check (length(btrim(description)) > 0)
);

create index operational_reports_property_status_idx on public.operational_reports(property_id, status, created_at);
create index operational_reports_employee_idx on public.operational_reports(employee_id, created_at);
create index operational_reports_building_idx on public.operational_reports(building_id);
create index operational_reports_visit_idx on public.operational_reports(visit_id);

create trigger operational_reports_touch_updated_at
before update on public.operational_reports
for each row execute function public.touch_updated_at();

create table public.operational_report_attachments (
  id uuid primary key default gen_random_uuid(),
  operational_report_id uuid not null references public.operational_reports(id) on delete restrict,
  bucket text not null default 'operational-report-attachments',
  path text not null,
  filename text not null,
  mime_type text not null,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  uploaded_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (bucket = 'operational-report-attachments'),
  check (length(btrim(path)) > 0),
  unique (bucket, path)
);

create index operational_report_attachments_report_idx
  on public.operational_report_attachments(operational_report_id);

-- ---------------------------------------------------------------------------
-- Equipment. Commercial details are separated from employee-visible data.
-- ---------------------------------------------------------------------------

create table public.equipment (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null check (category in (
    'device', 'tool', 'consumable', 'cleaning_product', 'rental',
    'protective_clothing', 'other'
  )),
  description text,
  sku text,
  unit text not null default 'Stück',
  current_stock numeric(12,3) not null default 0 check (current_stock >= 0),
  minimum_stock numeric(12,3) not null default 0 check (minimum_stock >= 0),
  condition text not null default 'available' check (condition in (
    'available', 'in_use', 'empty', 'defective', 'in_repair', 'lost', 'archived'
  )),
  ownership_type text not null default 'owned' check (ownership_type in ('owned', 'rented')),
  storage_location text,
  image_bucket text,
  image_path text,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(btrim(name)) > 0)
);

create unique index equipment_sku_uidx on public.equipment(lower(sku)) where sku is not null;
create index equipment_status_category_idx on public.equipment(status, category);

create trigger equipment_touch_updated_at
before update on public.equipment
for each row execute function public.touch_updated_at();

create table public.equipment_admin_details (
  equipment_id uuid primary key references public.equipment(id) on delete restrict,
  supplier text,
  rental_cost_cents bigint check (rental_cost_cents is null or rental_cost_cents >= 0),
  internal_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger equipment_admin_details_touch_updated_at
before update on public.equipment_admin_details
for each row execute function public.touch_updated_at();

alter table public.operational_reports
  add constraint operational_reports_equipment_id_fkey
  foreign key (equipment_id) references public.equipment(id) on delete restrict;

create table public.property_equipment (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete restrict,
  building_id uuid references public.buildings(id) on delete restrict,
  equipment_id uuid not null references public.equipment(id) on delete restrict,
  required_quantity numeric(12,3) not null default 1 check (required_quantity > 0),
  seasonal boolean not null default false,
  season_start_month integer check (season_start_month between 1 and 12),
  season_end_month integer check (season_end_month between 1 and 12),
  rental boolean not null default false,
  notification_lead_hours integer not null default 48 check (notification_lead_hours >= 0),
  provision_note text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint property_equipment_scope_key
    unique nulls not distinct (property_id, equipment_id, building_id),
  check (seasonal = false or (season_start_month is not null and season_end_month is not null))
);

create index property_equipment_equipment_idx on public.property_equipment(equipment_id);
create index property_equipment_active_idx on public.property_equipment(property_id, active);
create index property_equipment_building_idx on public.property_equipment(building_id);

create trigger property_equipment_touch_updated_at
before update on public.property_equipment
for each row execute function public.touch_updated_at();

create table public.service_equipment (
  property_service_id uuid not null references public.property_services(id) on delete cascade,
  equipment_id uuid not null references public.equipment(id) on delete restrict,
  required_quantity numeric(12,3) not null default 1 check (required_quantity > 0),
  created_at timestamptz not null default now(),
  primary key (property_service_id, equipment_id)
);

create index service_equipment_equipment_idx on public.service_equipment(equipment_id);

create table public.equipment_employee_assignments (
  equipment_id uuid not null references public.equipment(id) on delete restrict,
  employee_id uuid not null references public.employee_profiles(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  returned_at timestamptz,
  assigned_by uuid references public.user_profiles(id) on delete set null,
  primary key (equipment_id, employee_id, assigned_at),
  check (returned_at is null or returned_at >= assigned_at)
);

create index equipment_employee_active_idx
  on public.equipment_employee_assignments(employee_id, equipment_id)
  where returned_at is null;

create table public.visit_equipment (
  visit_id uuid not null references public.visits(id) on delete restrict,
  equipment_id uuid not null references public.equipment(id) on delete restrict,
  required_quantity numeric(12,3) not null default 1 check (required_quantity > 0),
  rental boolean not null default false,
  provision_note text,
  equipment_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (visit_id, equipment_id)
);

create index visit_equipment_equipment_idx on public.visit_equipment(equipment_id);

create or replace function private.capture_visit_equipment_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_capture boolean := tg_op = 'INSERT';
begin
  if tg_op = 'UPDATE' then
    v_capture := new.equipment_id is distinct from old.equipment_id;
  end if;

  if v_capture then
    select jsonb_strip_nulls(jsonb_build_object(
      'id', equipment.id,
      'name', equipment.name,
      'category', equipment.category,
      'description', equipment.description,
      'sku', equipment.sku,
      'unit', equipment.unit,
      'condition', equipment.condition,
      'ownership_type', equipment.ownership_type,
      'image_bucket', equipment.image_bucket,
      'image_path', equipment.image_path
    ))
    into new.equipment_snapshot
    from public.equipment equipment
    where equipment.id = new.equipment_id;

    if new.equipment_snapshot is null then
      raise exception 'Equipment wurde nicht gefunden';
    end if;
  end if;
  return new;
end;
$$;

create trigger visit_equipment_capture_snapshot
before insert or update on public.visit_equipment
for each row execute function private.capture_visit_equipment_snapshot();

-- ---------------------------------------------------------------------------
-- Property chat and complaints
-- ---------------------------------------------------------------------------

create table public.property_messages (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete restrict,
  sender_id uuid references public.user_profiles(id) on delete set null,
  sender_display_name text,
  message_type text not null default 'user' check (message_type in ('user', 'system')),
  body text not null,
  related_type text,
  related_id uuid,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  check (length(btrim(body)) > 0),
  check (message_type <> 'user' or sender_id is not null)
);

create index property_messages_property_created_idx on public.property_messages(property_id, created_at desc);
create index property_messages_sender_idx on public.property_messages(sender_id);

create table public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.property_messages(id) on delete restrict,
  bucket text not null default 'property-message-attachments',
  path text not null,
  filename text not null,
  mime_type text not null,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  uploaded_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (bucket = 'property-message-attachments'),
  check (length(btrim(path)) > 0),
  unique (bucket, path)
);

create index message_attachments_message_idx on public.message_attachments(message_id);

create table public.message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.property_messages(id) on delete cascade,
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  unique (message_id, user_id, emoji),
  check (char_length(emoji) between 1 and 16)
);

create index message_reactions_user_idx on public.message_reactions(user_id);

create table public.message_reads (
  message_id uuid not null references public.property_messages(id) on delete cascade,
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create index message_reads_user_idx on public.message_reads(user_id, read_at desc);

create table public.complaints (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete restrict,
  visit_id uuid references public.visits(id) on delete restrict,
  submitted_by uuid not null references public.user_profiles(id) on delete restrict,
  title text not null,
  description text not null,
  status text not null default 'new' check (status in ('new', 'in_review', 'answered', 'resolved')),
  answered_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(btrim(title)) > 0),
  check (length(btrim(description)) > 0)
);

create index complaints_property_status_idx on public.complaints(property_id, status, created_at);
create index complaints_submitter_idx on public.complaints(submitted_by, created_at);

create trigger complaints_touch_updated_at
before update on public.complaints
for each row execute function public.touch_updated_at();

create table public.complaint_admin_notes (
  complaint_id uuid primary key references public.complaints(id) on delete restrict,
  internal_note text,
  updated_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger complaint_admin_notes_touch_updated_at
before update on public.complaint_admin_notes
for each row execute function public.touch_updated_at();

create table public.complaint_attachments (
  id uuid primary key default gen_random_uuid(),
  complaint_id uuid not null references public.complaints(id) on delete restrict,
  bucket text not null default 'complaint-attachments',
  path text not null,
  filename text not null,
  mime_type text not null,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  uploaded_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (bucket = 'complaint-attachments'),
  check (length(btrim(path)) > 0),
  unique (bucket, path)
);

create index complaint_attachments_complaint_idx on public.complaint_attachments(complaint_id);

-- ---------------------------------------------------------------------------
-- Billing, immutable invoice snapshots and notifications
-- ---------------------------------------------------------------------------

create table public.company_settings (
  id boolean primary key default true check (id),
  legal_name text not null default 'Flaaq Holding GmbH',
  brand_name text not null default 'Hausvia',
  street text,
  house_number text,
  postal_code text,
  city text,
  country text not null default 'Deutschland',
  tax_number text,
  vat_id text,
  commercial_register text,
  management text,
  email text default 'info@hausvia.de',
  phone text,
  bank_name text,
  iban text,
  bic text,
  payment_due_days integer not null default 14 check (payment_due_days between 0 and 365),
  invoice_prefix text not null default 'HV',
  default_tax_rate_bps integer not null default 1900 check (default_tax_rate_bps between 0 and 10000),
  default_hourly_rate_cents bigint not null default 6000 check (default_hourly_rate_cents >= 0),
  invoice_email_from text default 'info@hausvia.de',
  invoice_email_reply_to text default 'info@hausvia.de',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.company_settings (id) values (true) on conflict (id) do nothing;

create trigger company_settings_touch_updated_at
before update on public.company_settings
for each row execute function public.touch_updated_at();

create table public.extra_charges (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete restrict,
  visit_id uuid references public.visits(id) on delete restrict,
  description text not null,
  service_date date not null,
  duration_minutes integer check (duration_minutes is null or duration_minutes >= 0),
  hourly_rate_cents bigint check (hourly_rate_cents is null or hourly_rate_cents >= 0),
  net_amount_cents bigint not null check (net_amount_cents >= 0),
  tax_rate_bps integer not null default 1900 check (tax_rate_bps between 0 and 10000),
  tax_amount_cents bigint not null default 0 check (tax_amount_cents >= 0),
  material_cost_cents bigint not null default 0 check (material_cost_cents >= 0),
  manual_price boolean not null default false,
  original_net_amount_cents bigint check (original_net_amount_cents is null or original_net_amount_cents >= 0),
  internal_note text,
  billable boolean not null default true,
  billing_status text not null default 'open' check (billing_status in ('open', 'queued', 'billed', 'canceled')),
  billed_at timestamptz,
  created_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(btrim(description)) > 0),
  check (billing_status <> 'billed' or billed_at is not null)
);

create index extra_charges_property_billing_idx
  on public.extra_charges(property_id, service_date, billing_status)
  where billable = true;
create index extra_charges_visit_idx on public.extra_charges(visit_id);

create trigger extra_charges_touch_updated_at
before update on public.extra_charges
for each row execute function public.touch_updated_at();

create table public.invoice_sequences (
  year integer primary key check (year between 2000 and 9999),
  last_value bigint not null check (last_value > 0),
  updated_at timestamptz not null default now()
);

alter table public.invoices
  add column if not exists property_id uuid references public.properties(id) on delete restrict,
  add column if not exists billing_month date,
  add column if not exists invoice_date date,
  add column if not exists invoice_kind text not null default 'manual',
  add column if not exists net_total_cents bigint,
  add column if not exists tax_total_cents bigint,
  add column if not exists gross_total_cents bigint,
  add column if not exists issuer_snapshot jsonb,
  add column if not exists recipient_snapshot jsonb,
  add column if not exists bank_snapshot jsonb,
  add column if not exists original_pdf_bucket text,
  add column if not exists original_pdf_path text,
  add column if not exists original_pdf_sha256 text,
  add column if not exists document_content_sha256 text,
  add column if not exists issued_at timestamptz,
  add column if not exists immutable_at timestamptz,
  add column if not exists processing_token text,
  add column if not exists processing_started_at timestamptz,
  add column if not exists error_code text,
  add column if not exists error_message text,
  add column if not exists canceled_at timestamptz,
  add column if not exists cancellation_reason text;

alter table public.invoices
  add constraint invoices_invoice_kind_check
  check (invoice_kind in ('manual', 'regular', 'correction', 'cancellation')) not valid;
alter table public.invoices
  add constraint invoices_billing_month_first_check
  check (billing_month is null or extract(day from billing_month) = 1) not valid;
alter table public.invoices
  add constraint invoices_cent_totals_nonnegative_check
  check (
    (net_total_cents is null or net_total_cents >= 0)
    and (tax_total_cents is null or tax_total_cents >= 0)
    and (gross_total_cents is null or gross_total_cents >= 0)
  ) not valid;
alter table public.invoices
  add constraint invoices_sha256_format_check
  check (
    (original_pdf_sha256 is null or original_pdf_sha256 ~ '^[0-9a-f]{64}$')
    and (document_content_sha256 is null or document_content_sha256 ~ '^[0-9a-f]{64}$')
  ) not valid;

-- Invoice numbers are legal document identifiers and must never be rewritten by
-- a migration. Fail early with the conflicting values so existing production
-- data can be reviewed deliberately instead of surfacing an opaque index error.
do $invoice_number_preflight$
declare
  v_duplicates text;
begin
  select string_agg(
    duplicate.invoice_number || ' (' || duplicate.occurrences::text || 'x)',
    ', ' order by duplicate.invoice_number
  )
  into v_duplicates
  from (
    select invoice_number, count(*) as occurrences
    from public.invoices
    where invoice_number is not null
    group by invoice_number
    having count(*) > 1
    order by invoice_number
    limit 20
  ) duplicate;

  if v_duplicates is not null then
    raise exception using
      message = 'Hausvia Portal V2 kann die Eindeutigkeit der Rechnungsnummern nicht aktivieren.',
      detail = 'Doppelte Rechnungsnummern (maximal 20 angezeigt): ' || v_duplicates,
      hint = 'Bitte die betroffenen historischen Rechnungen fachlich prüfen und die Dubletten vor erneutem Ausführen dieser Migration bereinigen.';
  end if;
end;
$invoice_number_preflight$;

create unique index invoices_invoice_number_uidx
  on public.invoices(invoice_number)
  where invoice_number is not null;
create unique index invoices_regular_property_month_uidx
  on public.invoices(property_id, billing_month)
  where property_id is not null and billing_month is not null and invoice_kind = 'regular';
create index invoices_property_created_idx on public.invoices(property_id, created_at desc);
create index invoices_billing_month_idx on public.invoices(billing_month, status);
create index invoices_project_id_idx on public.invoices(project_id);
create index invoices_offer_id_idx on public.invoices(offer_id);
create index invoices_source_offer_id_idx on public.invoices(source_offer_id);

alter table public.invoice_items
  add column if not exists extra_charge_id uuid references public.extra_charges(id) on delete restrict,
  add column if not exists service_date date,
  add column if not exists unit_net_cents bigint,
  add column if not exists total_net_cents bigint,
  add column if not exists tax_rate_bps integer,
  add column if not exists structured_data jsonb not null default '{}'::jsonb;

alter table public.invoice_items
  add constraint invoice_items_cent_amounts_nonnegative_check
  check (
    (unit_net_cents is null or unit_net_cents >= 0)
    and (total_net_cents is null or total_net_cents >= 0)
    and (tax_rate_bps is null or tax_rate_bps between 0 and 10000)
  ) not valid;

create unique index invoice_items_extra_charge_uidx
  on public.invoice_items(extra_charge_id)
  where extra_charge_id is not null;
create index invoice_items_invoice_id_idx on public.invoice_items(invoice_id);

alter table public.extra_charges
  add column if not exists invoice_item_id uuid references public.invoice_items(id) on delete restrict;
create unique index extra_charges_invoice_item_uidx
  on public.extra_charges(invoice_item_id)
  where invoice_item_id is not null;

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.user_profiles(id) on delete restrict,
  type text not null,
  title text not null,
  body text not null,
  entity_type text,
  entity_id uuid,
  property_id uuid references public.properties(id) on delete restrict,
  read_at timestamptz,
  idempotency_key text,
  created_at timestamptz not null default now(),
  check (length(btrim(title)) > 0),
  check (length(btrim(body)) > 0)
);

create unique index notifications_recipient_idempotency_uidx
  on public.notifications(recipient_id, idempotency_key);
create index notifications_recipient_unread_idx
  on public.notifications(recipient_id, created_at desc)
  where read_at is null;
create index notifications_property_idx on public.notifications(property_id, created_at desc);

create table public.notification_deliveries (
  notification_id uuid primary key references public.notifications(id) on delete cascade,
  email_requested_at timestamptz,
  email_sent_at timestamptz,
  email_error text,
  attempts integer not null default 0 check (attempts >= 0),
  updated_at timestamptz not null default now(),
  check (email_sent_at is null or email_requested_at is not null)
);

create trigger notification_deliveries_touch_updated_at
before update on public.notification_deliveries
for each row execute function public.touch_updated_at();

create table public.public_submission_limits (
  fingerprint text not null,
  window_started_at timestamptz not null,
  attempts integer not null default 1 check (attempts > 0),
  updated_at timestamptz not null default now(),
  primary key (fingerprint, window_started_at)
);

create index public_submission_limits_cleanup_idx on public.public_submission_limits(window_started_at);

-- ---------------------------------------------------------------------------
-- Access helpers. Authorization always requires an active, onboarded profile.
-- SECURITY DEFINER is limited to the unexposed private schema and has a fixed
-- empty search_path. Public compatibility wrappers expose only boolean answers.
-- ---------------------------------------------------------------------------

create or replace function private.is_service_role()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce((select auth.jwt() ->> 'role') = 'service_role', false)
$$;

create or replace function private.is_active_profile()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_profiles up
    where up.id = (select auth.uid())
      and up.status = 'active'
      and up.onboarding_completed = true
  )
$$;

create or replace function private.current_user_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select up.role
  from public.user_profiles up
  where up.id = (select auth.uid())
    and up.status = 'active'
    and up.onboarding_completed = true
$$;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select private.current_user_role()) = 'admin', false)
$$;

create or replace function private.current_employee_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select ep.id
  from public.employee_profiles ep
  join public.user_profiles up on up.id = ep.user_id
  where ep.user_id = (select auth.uid())
    and ep.status = 'active'
    and up.status = 'active'
    and up.onboarding_completed = true
$$;

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
    join public.user_profiles up on up.id = cu.user_id
    where cu.customer_id = p_customer_id
      and cu.user_id = (select auth.uid())
      and cu.active = true
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
    join public.customer_users cu on cu.customer_id = p.customer_id and cu.active = true
    join public.user_profiles up on up.id = cu.user_id
    where p.id = p_property_id
      and p.status <> 'archived'
      and cu.user_id = (select auth.uid())
      and up.status = 'active'
      and up.onboarding_completed = true
  )
$$;

create or replace function private.is_employee_of_property(p_property_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.property_employee_assignments pea
    join public.employee_profiles ep on ep.id = pea.employee_id
    join public.user_profiles up on up.id = ep.user_id
    where pea.property_id = p_property_id
      and pea.employee_id = (select private.current_employee_id())
      and pea.active = true
      and pea.starts_on <= ((now() at time zone 'Europe/Berlin')::date)
      and (pea.ends_on is null or pea.ends_on >= ((now() at time zone 'Europe/Berlin')::date))
      and ep.status = 'active'
      and up.status = 'active'
      and up.onboarding_completed = true
  )
$$;

create or replace function private.can_access_property(p_property_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select (select private.is_admin())
    or (select private.is_customer_of_property(p_property_id))
    or (select private.is_employee_of_property(p_property_id))
$$;

create or replace function private.can_work_visit(p_visit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.visits v
    where v.id = p_visit_id
      and (select private.is_employee_of_property(v.property_id))
      and (
        v.primary_employee_id = (select private.current_employee_id())
        or exists (
          select 1
          from public.visit_plan_employees vpe
          where vpe.visit_plan_id = v.visit_plan_id
            and vpe.employee_id = (select private.current_employee_id())
        )
        or (
          v.primary_employee_id is null
          and not exists (
            select 1
            from public.visit_plan_employees assigned
            where assigned.visit_plan_id = v.visit_plan_id
          )
          and (select private.is_employee_of_property(v.property_id))
        )
      )
  )
$$;

create or replace function public.current_user_role()
returns public.app_role
language sql
stable
security invoker
set search_path = ''
as $$ select private.current_user_role() $$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$ select private.is_admin() $$;

create or replace function public.is_customer_user(customer_uuid uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$ select private.is_customer_of_customer(customer_uuid) $$;

create or replace function public.is_employee_assigned(project_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.project_assignments pa
    join public.employee_profiles ep on ep.id = pa.employee_id
    join public.user_profiles up on up.id = ep.user_id
    where pa.project_id = project_uuid
      and pa.active = true
      and ep.user_id = (select auth.uid())
      and ep.status = 'active'
      and up.status = 'active'
      and up.onboarding_completed = true
  )
$$;

create or replace function public.can_access_project(project_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.is_admin())
    or public.is_employee_assigned(project_uuid)
    or exists (
      select 1
      from public.projects p
      where p.id = project_uuid
        and (select private.is_customer_of_customer(p.customer_id))
    )
$$;

revoke all on function public.current_user_role() from public, anon;
revoke all on function public.is_admin() from public, anon;
revoke all on function public.is_customer_user(uuid) from public, anon;
revoke all on function public.is_employee_assigned(uuid) from public, anon;
revoke all on function public.can_access_project(uuid) from public, anon;
grant execute on function public.current_user_role() to authenticated, service_role;
grant execute on function public.is_admin() to authenticated, service_role;
grant execute on function public.is_customer_user(uuid) to authenticated, service_role;
grant execute on function public.is_employee_assigned(uuid) to authenticated, service_role;
grant execute on function public.can_access_project(uuid) to authenticated, service_role;

revoke all on function private.is_service_role() from public, anon;
revoke all on function private.is_active_profile() from public, anon;
revoke all on function private.current_user_role() from public, anon;
revoke all on function private.is_admin() from public, anon;
revoke all on function private.current_employee_id() from public, anon;
revoke all on function private.is_customer_of_customer(uuid) from public, anon;
revoke all on function private.is_customer_of_property(uuid) from public, anon;
revoke all on function private.is_employee_of_property(uuid) from public, anon;
revoke all on function private.can_access_property(uuid) from public, anon;
revoke all on function private.can_work_visit(uuid) from public, anon;

-- ---------------------------------------------------------------------------
-- Cross-table invariants and mutation guards
-- ---------------------------------------------------------------------------

create or replace function private.assert_same_property()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expected uuid;
  v_actual uuid;
begin
  if tg_table_name = 'property_service_buildings' then
    select property_id into v_expected from public.property_services where id = new.property_service_id;
    select property_id into v_actual from public.buildings where id = new.building_id;
  elsif tg_table_name = 'visit_plan_buildings' then
    select property_id into v_expected from public.visit_plans where id = new.visit_plan_id;
    select property_id into v_actual from public.buildings where id = new.building_id;
  elsif tg_table_name = 'visit_buildings' then
    select property_id into v_expected from public.visits where id = new.visit_id;
    select property_id into v_actual from public.buildings where id = new.building_id;
  elsif tg_table_name = 'property_equipment' then
    v_expected := new.property_id;
    if new.building_id is null then return new; end if;
    select property_id into v_actual from public.buildings where id = new.building_id;
  elsif tg_table_name = 'damage_reports' then
    v_expected := new.property_id;
    select property_id into v_actual from public.buildings where id = new.building_id;
  elsif tg_table_name = 'operational_reports' then
    v_expected := new.property_id;
    if new.building_id is null then return new; end if;
    select property_id into v_actual from public.buildings where id = new.building_id;
  elsif tg_table_name = 'visit_tasks' then
    select property_id into v_expected from public.visits where id = new.visit_id;
    v_actual := new.property_id;
    if v_expected is distinct from v_actual then
      raise exception 'Aufgabe und Einsatz gehören nicht zur selben Immobilie';
    end if;
    if new.building_id is null then return new; end if;
    select property_id into v_actual from public.buildings where id = new.building_id;
  else
    raise exception 'Unsupported invariant trigger table: %', tg_table_name;
  end if;

  if v_expected is null or v_actual is null or v_expected <> v_actual then
    raise exception 'Verknüpfte Datensätze gehören nicht zur selben Immobilie';
  end if;
  return new;
end;
$$;

create trigger property_service_buildings_same_property
before insert or update on public.property_service_buildings
for each row execute function private.assert_same_property();
create trigger visit_plan_buildings_same_property
before insert or update on public.visit_plan_buildings
for each row execute function private.assert_same_property();
create trigger visit_buildings_same_property
before insert or update on public.visit_buildings
for each row execute function private.assert_same_property();
create trigger property_equipment_same_property
before insert or update on public.property_equipment
for each row execute function private.assert_same_property();
create trigger damage_reports_same_property
before insert or update on public.damage_reports
for each row execute function private.assert_same_property();
create trigger operational_reports_same_property
before insert or update on public.operational_reports
for each row execute function private.assert_same_property();
create trigger visit_tasks_same_property
before insert or update on public.visit_tasks
for each row execute function private.assert_same_property();

create or replace function private.normalize_visit_task_transition()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_visit_status text;
begin
  select status into v_visit_status from public.visits where id = new.visit_id;
  if v_visit_status <> 'started' then
    raise exception 'Aufgaben können nur während eines gestarteten Einsatzes geändert werden';
  end if;
  if old.status = new.status then
    if new.completed_at is distinct from old.completed_at
      or new.completed_by is distinct from old.completed_by then
      raise exception 'Abschlusszeit und Bearbeiter werden vom Server gesetzt';
    end if;
    if new.status <> 'blocked' then new.blocked_reason := null; end if;
    return new;
  end if;
  if new.status = 'blocked' and length(btrim(coalesce(new.blocked_reason, ''))) < 3 then
    raise exception 'Für eine nicht ausführbare Aufgabe ist eine Begründung erforderlich';
  end if;
  if new.status in ('done', 'blocked') then
    new.completed_at := now();
    new.completed_by := (select auth.uid());
    new.follow_up_required := (new.status = 'blocked');
  else
    new.completed_at := null;
    new.completed_by := null;
  end if;
  if new.status = 'in_progress' and new.started_at is null then new.started_at := now(); end if;
  return new;
end;
$$;

create trigger visit_tasks_normalize_transition
before update on public.visit_tasks
for each row execute function private.normalize_visit_task_transition();

create or replace function private.protect_immutable_invoice()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and old.immutable_at is not null then
    raise exception 'Freigegebene Rechnungen dürfen nicht gelöscht werden';
  end if;
  if tg_op = 'UPDATE' and old.immutable_at is not null then
    -- The release timestamp itself is write-once. A later send operation may
    -- submit a fresh timestamp, but the database preserves the PDF release.
    new.immutable_at := old.immutable_at;
    -- After a PDF was released, only lifecycle/delivery fields may change.
    -- Comparing the whole row minus this allow-list prevents newly added billing
    -- columns from silently becoming mutable in a future migration.
    if (to_jsonb(new) - array[
          'status', 'sent_at', 'paid_at', 'canceled_at',
          'cancellation_reason', 'error_code', 'error_message',
          'processing_token', 'processing_started_at', 'updated_at'
        ])
       = (to_jsonb(old) - array[
          'status', 'sent_at', 'paid_at', 'canceled_at',
          'cancellation_reason', 'error_code', 'error_message',
          'processing_token', 'processing_started_at', 'updated_at'
        ])
      and new.status in ('released', 'open', 'paid', 'overdue', 'canceled')
      and not (
        old.status = 'canceled'
        and new.status is distinct from old.status
      ) then
      return new;
    end if;
    raise exception 'Freigegebene Rechnungsinhalte sind unveränderlich; Korrektur oder Storno anlegen';
  end if;
  if tg_op = 'UPDATE'
    and old.immutable_at is null
    and new.status in ('released', 'open', 'paid', 'overdue', 'canceled') then
    new.immutable_at := coalesce(new.immutable_at, now());
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger invoices_protect_immutable
before update or delete on public.invoices
for each row execute function private.protect_immutable_invoice();

create or replace function private.protect_immutable_invoice_item()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_invoice_id uuid;
begin
  if tg_op = 'DELETE' then
    v_invoice_id := old.invoice_id;
  else
    v_invoice_id := new.invoice_id;
  end if;
  if exists (select 1 from public.invoices i where i.id = v_invoice_id and i.immutable_at is not null) then
    raise exception 'Positionen einer freigegebenen Rechnung sind unveränderlich';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger invoice_items_protect_immutable
before insert or update or delete on public.invoice_items
for each row execute function private.protect_immutable_invoice_item();

create or replace function public.is_month_in_season(
  p_date date,
  p_start_month integer,
  p_end_month integer
)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when p_start_month is null or p_end_month is null then true
    when p_start_month <= p_end_month
      then extract(month from p_date)::integer between p_start_month and p_end_month
    else extract(month from p_date)::integer >= p_start_month
      or extract(month from p_date)::integer <= p_end_month
  end
$$;

revoke all on function public.is_month_in_season(date, integer, integer) from public, anon;
grant execute on function public.is_month_in_season(date, integer, integer) to authenticated, service_role;

create or replace function private.service_period_key(
  p_rule text,
  p_date date,
  p_start_month integer,
  p_end_month integer
)
returns text
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_season_year integer;
begin
  case p_rule
    when 'every_visit' then return 'visit';
    when 'once_weekly', 'multiple_weekly' then
      return 'week:' || to_char(p_date, 'IYYY-IW');
    when 'once_monthly', 'multiple_monthly' then
      return 'month:' || to_char(p_date, 'YYYY-MM');
    when 'once_quarterly' then
      return 'quarter:' || extract(year from p_date)::integer || '-' || extract(quarter from p_date)::integer;
    when 'once_yearly' then
      return 'year:' || extract(year from p_date)::integer;
    when 'once_season' then
      if p_start_month is not null and p_end_month is not null and p_start_month > p_end_month
        and extract(month from p_date)::integer <= p_end_month then
        v_season_year := extract(year from p_date)::integer - 1;
      else
        v_season_year := extract(year from p_date)::integer;
      end if;
      return 'season:' || v_season_year;
    else return null;
  end case;
end;
$$;

create or replace function public.create_property_with_building(
  p_customer_id uuid,
  p_name text,
  p_property_type text,
  p_care_start_date date,
  p_building_id uuid,
  p_street text,
  p_house_number text,
  p_postal_code text,
  p_city text,
  p_country text,
  p_formatted_address text,
  p_qr_token_nonce uuid,
  p_qr_token_hash text,
  p_monthly_fee_net_cents bigint,
  p_tax_rate_bps integer,
  p_max_visit_minutes integer,
  p_property_id uuid default gen_random_uuid(),
  p_object_key text default null,
  p_ownership_name text default null,
  p_property_status text default 'active',
  p_building_label text default null,
  p_internal_briefing text default null,
  p_internal_notes text default null,
  p_access_notes text default null,
  p_billing_recipient_name text default null,
  p_billing_address_addition text default null,
  p_billing_street text default null,
  p_billing_house_number text default null,
  p_billing_postal_code text default null,
  p_billing_city text default null,
  p_billing_country text default null,
  p_billing_email text default null
)
returns table(property_id uuid, building_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_customer public.customers%rowtype;
begin
  if not ((select private.is_admin()) or (select private.is_service_role())) then
    raise exception 'Nur Administratoren dürfen Immobilien anlegen';
  end if;
  if p_customer_id is null or p_name is null or length(btrim(p_name)) = 0 then
    raise exception 'Kunde und Immobilienname sind erforderlich';
  end if;
  if p_building_id is null or p_qr_token_nonce is null or length(btrim(coalesce(p_qr_token_hash, ''))) < 32 then
    raise exception 'Gebäude-ID und sicherer QR-Tokenhash sind erforderlich';
  end if;

  select * into strict v_customer from public.customers where id = p_customer_id;

  insert into public.properties (
    id, customer_id, name, object_key, property_type, ownership_name,
    care_start_date, status, created_by
  ) values (
    p_property_id, p_customer_id, btrim(p_name), nullif(btrim(p_object_key), ''),
    p_property_type, nullif(btrim(p_ownership_name), ''), p_care_start_date,
    p_property_status, v_actor
  );

  insert into public.property_admin_settings (
    property_id, monthly_fee_net_cents, tax_rate_bps, max_visit_minutes,
    internal_notes, updated_by
  ) values (
    p_property_id, coalesce(p_monthly_fee_net_cents, 0), coalesce(p_tax_rate_bps, 1900),
    p_max_visit_minutes, nullif(btrim(p_internal_notes), ''), v_actor
  );

  insert into public.property_compensation_rates (
    property_id, net_amount_cents, tax_rate_bps, valid_from, internal_note, created_by
  ) values (
    p_property_id, coalesce(p_monthly_fee_net_cents, 0), coalesce(p_tax_rate_bps, 1900),
    coalesce(p_care_start_date, (now() at time zone 'Europe/Berlin')::date),
    'Initial aus Immobilienanlage', v_actor
  );

  insert into public.property_briefings (property_id, internal_briefing, updated_by)
  values (p_property_id, nullif(btrim(p_internal_briefing), ''), v_actor);

  insert into public.buildings (
    id, property_id, label, street, house_number, postal_code, city, country,
    formatted_address, qr_token_nonce, qr_token_hash, status
  ) values (
    p_building_id, p_property_id, nullif(btrim(p_building_label), ''),
    btrim(p_street), btrim(p_house_number), btrim(p_postal_code), btrim(p_city),
    coalesce(nullif(btrim(p_country), ''), 'Deutschland'), btrim(p_formatted_address),
    p_qr_token_nonce, p_qr_token_hash, 'active'
  );

  if nullif(btrim(p_access_notes), '') is not null then
    insert into public.building_access_notes (building_id, access_notes, updated_by)
    values (p_building_id, btrim(p_access_notes), v_actor);
  end if;

  insert into public.property_billing_profiles (
    property_id, recipient_name, address_addition, street, house_number,
    postal_code, city, country, email, is_override
  ) values (
    p_property_id,
    coalesce(nullif(btrim(p_billing_recipient_name), ''), nullif(btrim(v_customer.company_name), ''), v_customer.contact_name),
    nullif(btrim(p_billing_address_addition), ''),
    coalesce(nullif(btrim(p_billing_street), ''), v_customer.billing_street, ''),
    coalesce(nullif(btrim(p_billing_house_number), ''), v_customer.billing_house_number, ''),
    coalesce(nullif(btrim(p_billing_postal_code), ''), v_customer.billing_postal_code, ''),
    coalesce(nullif(btrim(p_billing_city), ''), v_customer.billing_city, ''),
    coalesce(nullif(btrim(p_billing_country), ''), v_customer.billing_country, 'Deutschland'),
    coalesce(nullif(btrim(p_billing_email), ''), v_customer.email),
    p_billing_recipient_name is not null
      or p_billing_street is not null
      or p_billing_email is not null
  );

  insert into public.audit_logs (actor_id, action, entity_table, entity_id, metadata)
  values (
    v_actor, 'property.created', 'properties', p_property_id,
    jsonb_build_object('building_id', p_building_id, 'atomic', true)
  );

  return query select p_property_id, p_building_id;
end;
$$;

create or replace function public.admin_create_property(
  p_customer_id uuid,
  p_name text,
  p_property_type text,
  p_care_start_date date,
  p_building_id uuid,
  p_street text,
  p_house_number text,
  p_postal_code text,
  p_city text,
  p_country text,
  p_formatted_address text,
  p_qr_token_nonce uuid,
  p_qr_token_hash text,
  p_monthly_fee_net_cents bigint,
  p_tax_rate_bps integer,
  p_max_visit_minutes integer,
  p_property_id uuid default gen_random_uuid(),
  p_object_key text default null,
  p_ownership_name text default null,
  p_property_status text default 'active',
  p_building_label text default null,
  p_internal_briefing text default null,
  p_internal_notes text default null,
  p_access_notes text default null,
  p_billing_recipient_name text default null,
  p_billing_address_addition text default null,
  p_billing_street text default null,
  p_billing_house_number text default null,
  p_billing_postal_code text default null,
  p_billing_city text default null,
  p_billing_country text default null,
  p_billing_email text default null
)
returns table(property_id uuid, building_id uuid)
language sql
security invoker
set search_path = ''
as $$
  select *
  from public.create_property_with_building(
    p_customer_id => p_customer_id,
    p_name => p_name,
    p_property_type => p_property_type,
    p_care_start_date => p_care_start_date,
    p_building_id => p_building_id,
    p_street => p_street,
    p_house_number => p_house_number,
    p_postal_code => p_postal_code,
    p_city => p_city,
    p_country => p_country,
    p_formatted_address => p_formatted_address,
    p_qr_token_nonce => p_qr_token_nonce,
    p_qr_token_hash => p_qr_token_hash,
    p_monthly_fee_net_cents => p_monthly_fee_net_cents,
    p_tax_rate_bps => p_tax_rate_bps,
    p_max_visit_minutes => p_max_visit_minutes,
    p_property_id => p_property_id,
    p_object_key => p_object_key,
    p_ownership_name => p_ownership_name,
    p_property_status => p_property_status,
    p_building_label => p_building_label,
    p_internal_briefing => p_internal_briefing,
    p_internal_notes => p_internal_notes,
    p_access_notes => p_access_notes,
    p_billing_recipient_name => p_billing_recipient_name,
    p_billing_address_addition => p_billing_address_addition,
    p_billing_street => p_billing_street,
    p_billing_house_number => p_billing_house_number,
    p_billing_postal_code => p_billing_postal_code,
    p_billing_city => p_billing_city,
    p_billing_country => p_billing_country,
    p_billing_email => p_billing_email
  )
$$;

revoke all on function public.create_property_with_building(
  uuid,text,text,date,uuid,text,text,text,text,text,text,uuid,text,bigint,integer,integer,
  uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text
) from public, anon;
revoke all on function public.admin_create_property(
  uuid,text,text,date,uuid,text,text,text,text,text,text,uuid,text,bigint,integer,integer,
  uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text
) from public, anon;
grant execute on function public.create_property_with_building(
  uuid,text,text,date,uuid,text,text,text,text,text,text,uuid,text,bigint,integer,integer,
  uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text
) to authenticated, service_role;
grant execute on function public.admin_create_property(
  uuid,text,text,date,uuid,text,text,text,text,text,text,uuid,text,bigint,integer,integer,
  uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text
) to authenticated, service_role;

create or replace function public.next_invoice_number(
  p_issued_on date default ((now() at time zone 'Europe/Berlin')::date),
  p_prefix text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_year integer;
  v_value bigint;
  v_prefix text;
begin
  if not ((select private.is_admin()) or (select private.is_service_role())) then
    raise exception 'Nur Administratoren dürfen Rechnungsnummern vergeben';
  end if;
  v_year := extract(
    year from coalesce(p_issued_on, (now() at time zone 'Europe/Berlin')::date)
  )::integer;
  select coalesce(nullif(btrim(p_prefix), ''), cs.invoice_prefix, 'HV')
    into v_prefix
  from public.company_settings cs
  where cs.id = true;
  v_prefix := coalesce(v_prefix, nullif(btrim(p_prefix), ''), 'HV');

  insert into public.invoice_sequences (year, last_value, updated_at)
  values (v_year, 1, now())
  on conflict (year) do update
    set last_value = public.invoice_sequences.last_value + 1,
        updated_at = now()
  returning last_value into v_value;

  return v_prefix || '-' || v_year::text || '-' || lpad(v_value::text, 6, '0');
end;
$$;

revoke all on function public.next_invoice_number(date, text) from public, anon;
grant execute on function public.next_invoice_number(date, text) to authenticated, service_role;

create or replace function public.claim_monthly_invoice(
  p_customer_id uuid,
  p_property_id uuid,
  p_billing_month date,
  p_issued_on date,
  p_prefix text,
  p_title text,
  p_due_date date,
  p_service_period_start date,
  p_service_period_end date,
  p_billing_note text,
  p_net_total_cents bigint,
  p_tax_total_cents bigint,
  p_gross_total_cents bigint,
  p_tax_rate_bps integer,
  p_issuer_snapshot jsonb,
  p_recipient_snapshot jsonb,
  p_bank_snapshot jsonb,
  p_processing_token text
)
returns table (
  invoice_id uuid,
  invoice_number text,
  claimed boolean,
  invoice_status public.invoice_status,
  active_processing_token text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice public.invoices%rowtype;
  v_year integer;
  v_value bigint;
  v_prefix text;
  v_is_fresh boolean;
begin
  if not ((select private.is_admin()) or (select private.is_service_role())) then
    raise exception 'Administrator- oder Service-Berechtigung erforderlich';
  end if;
  if p_customer_id is null or p_property_id is null or p_billing_month is null
    or p_issued_on is null or p_due_date is null
    or p_service_period_start is null or p_service_period_end is null
    or date_trunc('month', p_billing_month)::date <> p_billing_month
    or p_service_period_end < p_service_period_start
    or length(btrim(coalesce(p_title, ''))) = 0
    or length(coalesce(p_processing_token, '')) < 16
    or p_net_total_cents is null or p_net_total_cents < 0
    or p_tax_total_cents is null or p_tax_total_cents < 0
    or p_gross_total_cents is null or p_gross_total_cents < 0
    or p_net_total_cents + p_tax_total_cents <> p_gross_total_cents
    or p_tax_rate_bps is null or p_tax_rate_bps not between 0 and 10000
    or p_issuer_snapshot is null or p_recipient_snapshot is null or p_bank_snapshot is null then
    raise exception 'Ungültiger monatlicher Rechnungskopf';
  end if;
  if not exists (
    select 1 from public.properties p
    where p.id = p_property_id and p.customer_id = p_customer_id
  ) then
    raise exception 'Immobilie und Kunde stimmen nicht überein';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_property_id::text || ':' || p_billing_month::text, 0)
  );

  select * into v_invoice
  from public.invoices i
  where i.property_id = p_property_id
    and i.billing_month = p_billing_month
    and i.invoice_kind = 'regular'
  for update;

  if found then
    if v_invoice.status in ('open', 'paid', 'overdue', 'canceled') then
      return query select v_invoice.id, v_invoice.invoice_number, false,
        v_invoice.status, v_invoice.processing_token;
      return;
    end if;

    if v_invoice.processing_token = p_processing_token then
      return query select v_invoice.id, v_invoice.invoice_number, true,
        v_invoice.status, v_invoice.processing_token;
      return;
    end if;

    v_is_fresh := v_invoice.processing_token is not null
      and v_invoice.processing_started_at > clock_timestamp() - interval '15 minutes';
    if v_is_fresh then
      return query select v_invoice.id, v_invoice.invoice_number, false,
        v_invoice.status, v_invoice.processing_token;
      return;
    end if;

    if v_invoice.status = 'draft' then
      update public.invoices
      set customer_id = p_customer_id,
          invoice_date = p_issued_on,
          title = btrim(p_title),
          due_date = p_due_date,
          service_period_start = p_service_period_start,
          service_period_end = p_service_period_end,
          billing_note = p_billing_note,
          net_total_cents = p_net_total_cents,
          tax_total_cents = p_tax_total_cents,
          gross_total_cents = p_gross_total_cents,
          net_total = p_net_total_cents::numeric / 100,
          tax_rate = p_tax_rate_bps::numeric / 100,
          tax_total = p_tax_total_cents::numeric / 100,
          gross_total = p_gross_total_cents::numeric / 100,
          issuer_snapshot = p_issuer_snapshot,
          recipient_snapshot = p_recipient_snapshot,
          bank_snapshot = p_bank_snapshot,
          processing_token = p_processing_token,
          processing_started_at = clock_timestamp(),
          error_code = p_processing_token,
          error_message = null
      where id = v_invoice.id
      returning * into v_invoice;
    else
      update public.invoices
      set processing_token = p_processing_token,
          processing_started_at = clock_timestamp(),
          error_code = p_processing_token,
          error_message = null
      where id = v_invoice.id
      returning * into v_invoice;
    end if;

    return query select v_invoice.id, v_invoice.invoice_number, true,
      v_invoice.status, v_invoice.processing_token;
    return;
  end if;

  v_year := extract(year from p_issued_on)::integer;
  select coalesce(nullif(btrim(p_prefix), ''), cs.invoice_prefix, 'HV')
    into v_prefix
  from public.company_settings cs
  where cs.id = true;
  v_prefix := coalesce(v_prefix, nullif(btrim(p_prefix), ''), 'HV');

  insert into public.invoice_sequences (year, last_value, updated_at)
  values (v_year, 1, now())
  on conflict (year) do update
    set last_value = public.invoice_sequences.last_value + 1,
        updated_at = now()
  returning last_value into v_value;

  insert into public.invoices (
    customer_id, property_id, billing_month, invoice_date, invoice_kind,
    invoice_number, title, due_date, service_period_start, service_period_end,
    billing_note, status, net_total_cents, tax_total_cents, gross_total_cents,
    net_total, tax_rate, tax_total, gross_total, issuer_snapshot,
    recipient_snapshot, bank_snapshot, processing_token,
    processing_started_at, error_code, error_message
  ) values (
    p_customer_id, p_property_id, p_billing_month, p_issued_on, 'regular',
    v_prefix || '-' || v_year::text || '-' || lpad(v_value::text, 6, '0'),
    btrim(p_title), p_due_date, p_service_period_start, p_service_period_end,
    p_billing_note, 'draft', p_net_total_cents, p_tax_total_cents,
    p_gross_total_cents, p_net_total_cents::numeric / 100,
    p_tax_rate_bps::numeric / 100, p_tax_total_cents::numeric / 100,
    p_gross_total_cents::numeric / 100, p_issuer_snapshot,
    p_recipient_snapshot, p_bank_snapshot, p_processing_token,
    clock_timestamp(), p_processing_token, null
  )
  returning * into v_invoice;

  return query select v_invoice.id, v_invoice.invoice_number, true,
    v_invoice.status, v_invoice.processing_token;
end;
$$;

revoke all on function public.claim_monthly_invoice(
  uuid,uuid,date,date,text,text,date,date,date,text,bigint,bigint,bigint,
  integer,jsonb,jsonb,jsonb,text
) from public, anon;
grant execute on function public.claim_monthly_invoice(
  uuid,uuid,date,date,text,text,date,date,date,text,bigint,bigint,bigint,
  integer,jsonb,jsonb,jsonb,text
) to authenticated, service_role;

create or replace function public.consume_public_submission_limit(
  p_fingerprint text,
  p_limit integer default 5,
  p_window_minutes integer default 15
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz;
  v_attempts integer;
begin
  if not (select private.is_service_role()) then
    raise exception 'Service role required';
  end if;
  if length(coalesce(p_fingerprint, '')) < 32 or p_limit < 1 or p_window_minutes < 1 then
    return false;
  end if;

  v_window := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / (p_window_minutes * 60)) * (p_window_minutes * 60)
  );

  insert into public.public_submission_limits (fingerprint, window_started_at, attempts, updated_at)
  values (p_fingerprint, v_window, 1, now())
  on conflict (fingerprint, window_started_at) do update
    set attempts = public.public_submission_limits.attempts + 1,
        updated_at = now()
  returning attempts into v_attempts;

  delete from public.public_submission_limits
  where window_started_at < clock_timestamp() - interval '24 hours';

  return v_attempts <= p_limit;
end;
$$;

revoke all on function public.consume_public_submission_limit(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_public_submission_limit(text, integer, integer)
  to service_role;

create or replace function public.create_public_damage(
  p_property_id uuid,
  p_building_id uuid,
  p_title text,
  p_description text,
  p_fingerprint text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_damage_id uuid := gen_random_uuid();
begin
  if not (select private.is_service_role()) then
    raise exception 'Service role required';
  end if;
  if length(btrim(coalesce(p_title, ''))) = 0
    or length(btrim(coalesce(p_description, ''))) = 0
    or length(coalesce(p_fingerprint, '')) < 32 then
    raise exception 'Ungültige Schadensmeldung';
  end if;
  if not exists (
    select 1
    from public.buildings b
    join public.properties p on p.id = b.property_id
    where b.id = p_building_id
      and b.property_id = p_property_id
      and b.status = 'active'
      and p.status = 'active'
  ) then
    raise exception 'Gebäude wurde nicht gefunden';
  end if;

  insert into public.damage_reports (
    id, property_id, building_id, source, title, description, priority,
    status, created_by, planned_next_visit
  ) values (
    v_damage_id, p_property_id, p_building_id, 'public_qr', btrim(p_title),
    btrim(p_description), 'normal', 'new', null, true
  );

  insert into public.damage_report_submission_metadata (
    damage_report_id, submission_fingerprint
  ) values (v_damage_id, p_fingerprint);

  return v_damage_id;
end;
$$;

revoke all on function public.create_public_damage(uuid, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_public_damage(uuid, uuid, text, text, text)
  to service_role;

alter table public.property_messages add column if not exists idempotency_key text;
create unique index property_messages_idempotency_uidx
  on public.property_messages(property_id, idempotency_key)
  where idempotency_key is not null;

create or replace function private.notify_property_participants(
  p_property_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_entity_type text,
  p_entity_id uuid,
  p_event_key text,
  p_include_admin boolean default true,
  p_include_customer boolean default true,
  p_include_employee boolean default true,
  p_exclude_user uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_include_admin then
    insert into public.notifications (
      recipient_id, type, title, body, entity_type, entity_id, property_id, idempotency_key
    )
    select up.id, p_type, p_title, p_body, p_entity_type, p_entity_id, p_property_id,
      p_event_key || ':' || up.id::text
    from public.user_profiles up
    where up.role = 'admin'
      and up.status = 'active'
      and up.onboarding_completed = true
      and up.id is distinct from p_exclude_user
    on conflict do nothing;
  end if;

  if p_include_customer then
    insert into public.notifications (
      recipient_id, type, title, body, entity_type, entity_id, property_id, idempotency_key
    )
    select distinct cu.user_id, p_type, p_title, p_body, p_entity_type, p_entity_id,
      p_property_id, p_event_key || ':' || cu.user_id::text
    from public.properties p
    join public.customer_users cu on cu.customer_id = p.customer_id and cu.active = true
    join public.user_profiles up on up.id = cu.user_id
    where p.id = p_property_id
      and up.status = 'active'
      and up.onboarding_completed = true
      and cu.user_id is distinct from p_exclude_user
    on conflict do nothing;
  end if;

  if p_include_employee then
    insert into public.notifications (
      recipient_id, type, title, body, entity_type, entity_id, property_id, idempotency_key
    )
    select distinct ep.user_id, p_type, p_title, p_body, p_entity_type, p_entity_id,
      p_property_id, p_event_key || ':' || ep.user_id::text
    from public.property_employee_assignments pea
    join public.employee_profiles ep on ep.id = pea.employee_id
    join public.user_profiles up on up.id = ep.user_id
    where pea.property_id = p_property_id
      and pea.active = true
      and pea.starts_on <= ((now() at time zone 'Europe/Berlin')::date)
      and (pea.ends_on is null or pea.ends_on >= ((now() at time zone 'Europe/Berlin')::date))
      and ep.user_id is not null
      and ep.status = 'active'
      and up.status = 'active'
      and up.onboarding_completed = true
      and ep.user_id is distinct from p_exclude_user
    on conflict do nothing;
  end if;
end;
$$;

revoke all on function private.notify_property_participants(
  uuid,text,text,text,text,uuid,text,boolean,boolean,boolean,uuid
) from public, anon, authenticated;

create or replace function private.damage_report_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_property_name text;
  v_building_name text;
begin
  select p.name, coalesce(b.label, b.formatted_address)
    into v_property_name, v_building_name
  from public.properties p
  join public.buildings b on b.id = new.building_id
  where p.id = new.property_id;

  perform private.notify_property_participants(
    new.property_id, 'damage.created', 'Neue Schadensmeldung',
    v_property_name || ': ' || new.title, 'damage_reports', new.id,
    'damage:' || new.id::text || ':created', true, true, true, null
  );

  insert into public.property_messages (
    property_id, sender_id, message_type, body, related_type, related_id, idempotency_key
  ) values (
    new.property_id, null, 'system',
    'Neue Schadensmeldung für ' || v_building_name || ': ' || new.title,
    'damage_reports', new.id, 'damage:' || new.id::text || ':created'
  ) on conflict do nothing;
  return new;
end;
$$;

create trigger damage_reports_notify_after_insert
after insert on public.damage_reports
for each row execute function private.damage_report_after_insert();

create or replace function private.damage_report_after_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'resolved' and old.status is distinct from new.status then
    perform private.notify_property_participants(
      new.property_id, 'damage.resolved', 'Schaden erledigt', new.title,
      'damage_reports', new.id, 'damage:' || new.id::text || ':resolved',
      true, true, true, null
    );
    insert into public.property_messages (
      property_id, sender_id, message_type, body, related_type, related_id, idempotency_key
    ) values (
      new.property_id, null, 'system', 'Schaden erledigt: ' || new.title,
      'damage_reports', new.id, 'damage:' || new.id::text || ':resolved'
    ) on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger damage_reports_notify_after_update
after update of status on public.damage_reports
for each row execute function private.damage_report_after_update();

create or replace function private.operational_report_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.notify_property_participants(
    new.property_id, 'operational_report.created', 'Neue betriebliche Meldung', new.title,
    'operational_reports', new.id, 'operational-report:' || new.id::text || ':created',
    true, false, false, null
  );
  return new;
end;
$$;

create trigger operational_reports_notify_after_insert
after insert on public.operational_reports
for each row execute function private.operational_report_after_insert();

create or replace function private.complaint_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.notify_property_participants(
    new.property_id, 'complaint.created', 'Neue Beschwerde', new.title,
    'complaints', new.id, 'complaint:' || new.id::text || ':created',
    true, false, false, null
  );
  return new;
end;
$$;

create trigger complaints_notify_after_insert
after insert on public.complaints
for each row execute function private.complaint_after_insert();

create or replace function private.snapshot_property_message_sender()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.message_type = 'user' then
    select coalesce(nullif(btrim(up.full_name), ''), 'Teilnehmer')
      into new.sender_display_name
    from public.user_profiles up
    where up.id = new.sender_id;
    if new.sender_display_name is null then
      raise exception 'Absenderprofil wurde nicht gefunden';
    end if;
  else
    new.sender_display_name := null;
  end if;
  return new;
end;
$$;

create trigger property_messages_snapshot_sender
before insert or update of sender_id, message_type on public.property_messages
for each row execute function private.snapshot_property_message_sender();

create or replace function private.property_message_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.message_type = 'user' then
    perform private.notify_property_participants(
      new.property_id, 'chat.message', 'Neue Nachricht', left(new.body, 240),
      'property_messages', new.id, 'message:' || new.id::text || ':created',
      true, true, true, new.sender_id
    );
  end if;
  return new;
end;
$$;

create trigger property_messages_notify_after_insert
after insert on public.property_messages
for each row execute function private.property_message_after_insert();

create or replace function private.visit_schedule_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
  v_type text;
  v_key text;
begin
  if tg_op = 'INSERT' then
    v_title := 'Neuer Termin';
    v_type := 'visit.created';
    v_key := 'visit:' || new.id::text || ':scheduled:' || new.scheduled_start::text;
  elsif new.status = 'canceled' and old.status is distinct from new.status then
    v_title := 'Termin abgesagt';
    v_type := 'visit.canceled';
    v_key := 'visit:' || new.id::text || ':canceled';
  elsif old.scheduled_start is distinct from new.scheduled_start
    or old.window_start is distinct from new.window_start
    or old.window_end is distinct from new.window_end then
    v_title := 'Termin geändert';
    v_type := 'visit.changed';
    v_key := 'visit:' || new.id::text || ':changed:' || new.scheduled_start::text;
  else
    return new;
  end if;

  perform private.notify_property_participants(
    new.property_id, v_type, v_title,
    to_char(new.scheduled_start at time zone 'Europe/Berlin', 'DD.MM.YYYY HH24:MI'),
    'visits', new.id, v_key, false, true, false, null
  );

  insert into public.notifications (
    recipient_id, type, title, body, entity_type, entity_id, property_id, idempotency_key
  )
  select distinct ep.user_id, v_type, v_title,
    to_char(new.scheduled_start at time zone 'Europe/Berlin', 'DD.MM.YYYY HH24:MI'),
    'visits', new.id, new.property_id, v_key || ':' || ep.user_id::text
  from public.employee_profiles ep
  join public.user_profiles up on up.id = ep.user_id
  join public.property_employee_assignments pea
    on pea.property_id = new.property_id
    and pea.employee_id = ep.id
    and pea.active = true
    and pea.starts_on <= ((now() at time zone 'Europe/Berlin')::date)
    and (pea.ends_on is null or pea.ends_on >= ((now() at time zone 'Europe/Berlin')::date))
  where up.status = 'active'
    and up.onboarding_completed = true
    and (
      ep.id = new.primary_employee_id
      or exists (
        select 1 from public.visit_plan_employees vpe
        where vpe.visit_plan_id = new.visit_plan_id and vpe.employee_id = ep.id
      )
      or (
        new.primary_employee_id is null
        and not exists (
          select 1 from public.visit_plan_employees assigned
          where assigned.visit_plan_id = new.visit_plan_id
        )
      )
    )
  on conflict do nothing;
  return new;
end;
$$;

create trigger visits_notify_after_insert
after insert on public.visits
for each row execute function private.visit_schedule_after_change();
create trigger visits_notify_after_update
after update of scheduled_start, window_start, window_end, status on public.visits
for each row execute function private.visit_schedule_after_change();

create unique index visit_tasks_carried_from_uidx
  on public.visit_tasks(carried_from_task_id)
  where carried_from_task_id is not null;

create or replace function public.generate_upcoming_visits(
  p_horizon_days integer default 90,
  p_plan_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan record;
  v_date date;
  v_matches boolean;
  v_time time;
  v_start timestamptz;
  v_key text;
  v_visit_id uuid;
  v_inserted integer := 0;
  v_row_count integer;
  v_today date := (now() at time zone 'Europe/Berlin')::date;
  v_horizon date;
begin
  if not ((select private.is_admin()) or (select private.is_service_role())) then
    raise exception 'Nur Administratoren dürfen Termine erzeugen';
  end if;
  if p_horizon_days < 1 or p_horizon_days > 366 then
    raise exception 'Der Planungshorizont muss zwischen 1 und 366 Tagen liegen';
  end if;
  v_horizon := v_today + p_horizon_days;

  for v_plan in
    select vp.*
    from public.visit_plans vp
    join public.properties p on p.id = vp.property_id
    where vp.status = 'active'
      and p.status = 'active'
      and (p_plan_id is null or vp.id = p_plan_id)
    order by vp.id
  loop
    -- Plan changes supersede only untouched, future, not-yet-started generated visits.
    update public.visits v
    set status = 'canceled',
        canceled_at = now(),
        cancellation_reason = 'Durch Änderung des Besuchsplans ersetzt',
        schedule_key = v.schedule_key || ':superseded:' || substr(md5(v.id::text || v_plan.updated_at::text), 1, 8)
    where v.visit_plan_id = v_plan.id
      and v.status = 'scheduled'
      and v.manually_adjusted = false
      and v.scheduled_date >= v_today
      and v.created_at < v_plan.updated_at;

    for v_date in
      select gs::date
      from generate_series(
        greatest(v_today, v_plan.start_date)::timestamp,
        least(v_horizon, coalesce(v_plan.end_date, v_horizon))::timestamp,
        interval '1 day'
      ) gs
    loop
      v_matches := false;

      if v_plan.frequency = 'individual' then
        v_matches := v_date = v_plan.start_date;
      elsif v_plan.frequency = 'weekly' then
        v_matches := case
          when cardinality(v_plan.weekdays) > 0
            then extract(isodow from v_date)::integer = any(v_plan.weekdays)
          else extract(isodow from v_date)::integer = extract(isodow from v_plan.start_date)::integer
        end;
      elsif v_plan.frequency = 'monthly' then
        v_matches := case
          when cardinality(v_plan.month_days) > 0
            then extract(day from v_date)::integer = any(v_plan.month_days)
          else extract(day from v_date)::integer = extract(day from v_plan.start_date)::integer
        end;
      elsif v_plan.frequency = 'quarterly' then
        v_matches := mod(
          (extract(year from v_date)::integer * 12 + extract(month from v_date)::integer)
          - (extract(year from v_plan.start_date)::integer * 12 + extract(month from v_plan.start_date)::integer),
          3
        ) = 0
        and case
          when cardinality(v_plan.month_days) > 0
            then extract(day from v_date)::integer = any(v_plan.month_days)
          else extract(day from v_date)::integer = extract(day from v_plan.start_date)::integer
        end;
      end if;

      if not v_matches then continue; end if;

      v_time := coalesce(v_plan.desired_time, v_plan.window_start, time '09:00');
      v_start := (v_date + v_time) at time zone v_plan.timezone;
      v_key := to_char(v_date, 'YYYY-MM-DD') || 'T' || to_char(v_time, 'HH24:MI:SS');
      v_visit_id := null;

      insert into public.visits (
        visit_plan_id, property_id, primary_employee_id, scheduled_date,
        planned_start_time, scheduled_start, window_start, window_end,
        status, schedule_key
      ) values (
        v_plan.id, v_plan.property_id, v_plan.primary_employee_id, v_date,
        v_plan.desired_time, v_start, v_plan.window_start, v_plan.window_end,
        'scheduled', v_key
      )
      on conflict (visit_plan_id, schedule_key)
        where visit_plan_id is not null and schedule_key is not null
      do nothing
      returning id into v_visit_id;

      if v_visit_id is null then continue; end if;
      v_inserted := v_inserted + 1;

      insert into public.visit_admin_metrics (visit_id, max_visit_minutes)
      select v_visit_id, coalesce(v_plan.max_visit_minutes, pas.max_visit_minutes)
      from public.property_admin_settings pas
      where pas.property_id = v_plan.property_id
      on conflict (visit_id) do nothing;

      insert into public.visit_buildings (visit_id, building_id)
      select v_visit_id, vpb.building_id
      from public.visit_plan_buildings vpb
      where vpb.visit_plan_id = v_plan.id
      on conflict do nothing;

      get diagnostics v_row_count = row_count;
      if v_row_count = 0 then
        insert into public.visit_buildings (visit_id, building_id)
        select v_visit_id, b.id
        from public.buildings b
        where b.property_id = v_plan.property_id and b.status = 'active'
        on conflict do nothing;
      end if;

      -- Snapshot both direct property requirements and equipment attached to an
      -- active service. Grouping first avoids a multi-hit ON CONFLICT error when
      -- the same item is required by several buildings or services.
      with equipment_requirements as (
        select pe.equipment_id, pe.required_quantity, pe.rental, pe.provision_note
        from public.property_equipment pe
        join public.equipment catalog_equipment
          on catalog_equipment.id = pe.equipment_id
          and catalog_equipment.status = 'active'
        where pe.property_id = v_plan.property_id
          and pe.active = true
          and (
            pe.seasonal = false
            or public.is_month_in_season(v_date, pe.season_start_month, pe.season_end_month)
          )
          and (
            pe.building_id is null
            or exists (
              select 1 from public.visit_buildings vb
              where vb.visit_id = v_visit_id and vb.building_id = pe.building_id
            )
          )

        union all

        select se.equipment_id, se.required_quantity, false, null::text
        from public.service_equipment se
        join public.property_services ps on ps.id = se.property_service_id
        join public.equipment catalog_equipment
          on catalog_equipment.id = se.equipment_id
          and catalog_equipment.status = 'active'
        where ps.property_id = v_plan.property_id
          and ps.status = 'active'
          and ps.start_date <= v_date
          and (ps.end_date is null or ps.end_date >= v_date)
          and (
            ps.seasonal = false
            or public.is_month_in_season(v_date, ps.season_start_month, ps.season_end_month)
          )
          and (
            not exists (
              select 1 from public.property_service_buildings scoped
              where scoped.property_service_id = ps.id
            )
            or exists (
              select 1
              from public.property_service_buildings scoped
              join public.visit_buildings vb on vb.building_id = scoped.building_id
              where scoped.property_service_id = ps.id
                and vb.visit_id = v_visit_id
            )
          )
      )
      insert into public.visit_equipment (
        visit_id, equipment_id, required_quantity, rental, provision_note
      )
      select
        v_visit_id,
        requirement.equipment_id,
        max(requirement.required_quantity),
        bool_or(requirement.rental),
        (array_agg(requirement.provision_note order by requirement.provision_note)
          filter (where requirement.provision_note is not null))[1]
      from equipment_requirements requirement
      group by requirement.equipment_id
      on conflict (visit_id, equipment_id) do update
        set required_quantity = greatest(public.visit_equipment.required_quantity, excluded.required_quantity),
            rental = public.visit_equipment.rental or excluded.rental,
            provision_note = coalesce(public.visit_equipment.provision_note, excluded.provision_note);
    end loop;
  end loop;

  return v_inserted;
end;
$$;

revoke all on function public.generate_upcoming_visits(integer, uuid) from public, anon;
grant execute on function public.generate_upcoming_visits(integer, uuid) to authenticated, service_role;

create or replace function public.start_visit(p_visit_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_visit public.visits%rowtype;
  v_employee_id uuid := (select private.current_employee_id());
  v_user_id uuid := (select auth.uid());
  v_service record;
  v_damage record;
  v_previous record;
  v_task_id uuid;
  v_period_key text;
  v_dedupe_key text;
  v_existing_count integer;
  v_limit integer;
  v_building_key text;
begin
  if v_employee_id is null then
    raise exception 'Aktives Mitarbeiterprofil erforderlich';
  end if;

  select * into v_visit
  from public.visits
  where id = p_visit_id
  for update;

  if not found then raise exception 'Einsatz wurde nicht gefunden'; end if;
  if not (select private.can_work_visit(p_visit_id)) then
    raise exception 'Dieser Einsatz ist Ihnen nicht zugewiesen';
  end if;
  if v_visit.status = 'started' and v_visit.started_by = v_user_id then
    return v_visit.started_at;
  end if;
  if v_visit.status <> 'scheduled' then
    raise exception 'Der Einsatz kann in diesem Status nicht gestartet werden';
  end if;

  -- Recurrence counters and damage carry-over are property-wide; serialize
  -- task materialization while allowing unrelated properties to start in parallel.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('visit-task-generation:' || v_visit.property_id::text, 0)
  );

  update public.visits
  set status = 'started',
      started_at = now(),
      started_by = v_user_id
  where id = p_visit_id
  returning * into v_visit;

  for v_service in
    select ps.*, psb.building_id,
      psi.internal_instruction,
      coalesce((
        select jsonb_agg(
          jsonb_build_object('id', sci.id, 'label', sci.label, 'required', sci.required)
          order by sci.sort_order, sci.created_at
        )
        from public.service_checklist_items sci
        where sci.property_service_id = ps.id
      ), '[]'::jsonb) as checklist
    from public.property_services ps
    left join public.property_service_buildings psb on psb.property_service_id = ps.id
    left join public.property_service_instructions psi on psi.property_service_id = ps.id
    where ps.property_id = v_visit.property_id
      and ps.status = 'active'
      and ps.start_date <= v_visit.scheduled_date
      and (ps.end_date is null or ps.end_date >= v_visit.scheduled_date)
      and (
        ps.seasonal = false
        or public.is_month_in_season(v_visit.scheduled_date, ps.season_start_month, ps.season_end_month)
      )
      and ps.execution_rule not in ('on_demand', 'manual')
      and (
        psb.building_id is null
        or exists (
          select 1 from public.visit_buildings vb
          where vb.visit_id = p_visit_id and vb.building_id = psb.building_id
        )
      )
    order by ps.sort_order, ps.id, psb.building_id
  loop
    v_period_key := private.service_period_key(
      v_service.execution_rule, v_visit.scheduled_date,
      v_service.season_start_month, v_service.season_end_month
    );
    if v_service.execution_rule = 'every_visit' then
      v_period_key := 'visit:' || p_visit_id::text;
    end if;

    v_limit := case
      when v_service.execution_rule in ('multiple_weekly', 'multiple_monthly')
        then greatest(v_service.occurrences_per_period, 1)
      else 1
    end;

    select count(*) into v_existing_count
    from public.visit_tasks vt
    join public.visits prior_visit on prior_visit.id = vt.visit_id
    where vt.property_service_id = v_service.id
      and vt.due_period_key = v_period_key
      and vt.building_id is not distinct from v_service.building_id
      and prior_visit.status <> 'canceled';

    if v_existing_count >= v_limit then continue; end if;
    v_building_key := coalesce(v_service.building_id::text, 'property');
    v_dedupe_key := 'service:' || v_service.id::text || ':' || v_period_key || ':'
      || v_building_key || ':' || (v_existing_count + 1)::text;
    v_task_id := null;

    insert into public.visit_tasks (
      visit_id, property_id, building_id, property_service_id, source_type, source_id,
      title, description, category, checklist_snapshot, status, photo_required,
      customer_visible, due_period_key, dedupe_key
    ) values (
      p_visit_id, v_visit.property_id, v_service.building_id, v_service.id, 'service', v_service.id,
      v_service.name, v_service.customer_description, v_service.category, v_service.checklist,
      'open', v_service.photo_required, v_service.customer_visible, v_period_key, v_dedupe_key
    )
    on conflict (dedupe_key) where dedupe_key is not null do nothing
    returning id into v_task_id;

    if v_task_id is not null and nullif(btrim(v_service.internal_instruction), '') is not null then
      insert into public.visit_task_instructions (visit_task_id, internal_instruction)
      values (v_task_id, v_service.internal_instruction)
      on conflict (visit_task_id) do nothing;
    end if;
  end loop;

  for v_damage in
    select dr.*
    from public.damage_reports dr
    where dr.property_id = v_visit.property_id
      and dr.planned_next_visit = true
      and dr.status in ('new', 'reviewed', 'scheduled')
      and exists (
        select 1 from public.visit_buildings vb
        where vb.visit_id = p_visit_id and vb.building_id = dr.building_id
      )
    order by case dr.priority when 'urgent' then 1 when 'high' then 2 when 'normal' then 3 else 4 end,
      dr.created_at
    for update skip locked
  loop
    v_task_id := null;
    insert into public.visit_tasks (
      visit_id, property_id, building_id, damage_report_id, source_type, source_id,
      title, description, category, status, photo_required, customer_visible,
      due_period_key, dedupe_key
    ) values (
      p_visit_id, v_visit.property_id, v_damage.building_id, v_damage.id, 'damage', v_damage.id,
      v_damage.title, v_damage.description, 'Schaden', 'open', false, true,
      'damage:' || v_damage.id::text, 'damage:' || v_damage.id::text || ':initial'
    )
    on conflict (dedupe_key) where dedupe_key is not null do nothing
    returning id into v_task_id;

    if v_task_id is not null then
      update public.damage_reports
      set status = 'scheduled', planned_next_visit = false,
          linked_visit_id = p_visit_id, linked_visit_task_id = v_task_id
      where id = v_damage.id;
    end if;
  end loop;

  for v_previous in
    select vt.*, vti.internal_instruction
    from public.visit_tasks vt
    join public.visits prior_visit on prior_visit.id = vt.visit_id
    left join public.visit_task_instructions vti on vti.visit_task_id = vt.id
    where vt.property_id = v_visit.property_id
      and vt.follow_up_required = true
      and prior_visit.status = 'completed'
      and (
        vt.building_id is null
        or exists (
          select 1
          from public.visit_buildings target_building
          where target_building.visit_id = p_visit_id
            and target_building.building_id = vt.building_id
        )
      )
      and not exists (
        select 1 from public.visit_tasks child where child.carried_from_task_id = vt.id
      )
    order by vt.completed_at, vt.id
    for update of vt skip locked
  loop
    v_task_id := null;
    insert into public.visit_tasks (
      visit_id, property_id, building_id, property_service_id, damage_report_id,
      source_type, source_id, title, description, category, checklist_snapshot,
      status, photo_required, customer_visible, due_period_key, dedupe_key,
      carried_from_task_id
    ) values (
      p_visit_id, v_visit.property_id, v_previous.building_id,
      v_previous.property_service_id, v_previous.damage_report_id,
      'follow_up', v_previous.id, v_previous.title, v_previous.description,
      v_previous.category, v_previous.checklist_snapshot, 'open',
      v_previous.photo_required, v_previous.customer_visible,
      'follow-up:' || v_previous.id::text,
      'follow-up:' || v_previous.id::text, v_previous.id
    )
    on conflict (dedupe_key) where dedupe_key is not null do nothing
    returning id into v_task_id;

    if v_task_id is not null and nullif(btrim(v_previous.internal_instruction), '') is not null then
      insert into public.visit_task_instructions (visit_task_id, internal_instruction)
      values (v_task_id, v_previous.internal_instruction)
      on conflict (visit_task_id) do nothing;
    end if;
  end loop;

  -- Refresh the concrete equipment snapshot at the actual start. The service
  -- branch is based on the tasks that were really materialized above, so
  -- recurring services that are not due cannot add requirements here.
  with equipment_requirements as (
    select pe.equipment_id, pe.required_quantity, pe.rental, pe.provision_note
    from public.property_equipment pe
    join public.equipment catalog_equipment
      on catalog_equipment.id = pe.equipment_id
      and catalog_equipment.status = 'active'
    where pe.property_id = v_visit.property_id
      and pe.active = true
      and (
        pe.seasonal = false
        or public.is_month_in_season(
          v_visit.scheduled_date, pe.season_start_month, pe.season_end_month
        )
      )
      and (
        pe.building_id is null
        or exists (
          select 1 from public.visit_buildings vb
          where vb.visit_id = p_visit_id and vb.building_id = pe.building_id
        )
      )

    union all

    select se.equipment_id, se.required_quantity, false, null::text
    from public.visit_tasks task
    join public.service_equipment se
      on se.property_service_id = task.property_service_id
    join public.equipment catalog_equipment
      on catalog_equipment.id = se.equipment_id
      and catalog_equipment.status = 'active'
    where task.visit_id = p_visit_id
      and task.property_service_id is not null
  )
  insert into public.visit_equipment (
    visit_id, equipment_id, required_quantity, rental, provision_note
  )
  select
    p_visit_id,
    requirement.equipment_id,
    max(requirement.required_quantity),
    bool_or(requirement.rental),
    (array_agg(requirement.provision_note order by requirement.provision_note)
      filter (where requirement.provision_note is not null))[1]
  from equipment_requirements requirement
  group by requirement.equipment_id
  on conflict (visit_id, equipment_id) do update
    set required_quantity = greatest(public.visit_equipment.required_quantity, excluded.required_quantity),
        rental = public.visit_equipment.rental or excluded.rental,
        provision_note = coalesce(excluded.provision_note, public.visit_equipment.provision_note),
        equipment_snapshot = excluded.equipment_snapshot;

  return v_visit.started_at;
exception
  when unique_violation then
    raise exception 'Sie haben bereits einen laufenden Einsatz';
end;
$$;

revoke all on function public.start_visit(uuid) from public, anon;
grant execute on function public.start_visit(uuid) to authenticated;

create or replace function public.complete_visit(p_visit_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_visit public.visits%rowtype;
  v_user_id uuid := (select auth.uid());
  v_completed_at timestamptz := now();
  v_duration integer;
  v_max integer;
  v_overtime integer;
  v_property_name text;
  v_snapshot jsonb;
  v_is_admin boolean := (select private.is_admin());
begin
  select * into v_visit
  from public.visits
  where id = p_visit_id
  for update;

  if not found then raise exception 'Einsatz wurde nicht gefunden'; end if;
  if not v_is_admin and (
    (select private.current_employee_id()) is null
    or v_visit.started_by <> v_user_id
    or not (select private.can_work_visit(p_visit_id))
  ) then
    raise exception 'Nur der aktiv zugewiesene ausführende Mitarbeiter darf den Einsatz abschließen';
  end if;
  if v_visit.status = 'completed' then return v_visit.completed_at; end if;
  if v_visit.status <> 'started' then raise exception 'Der Einsatz wurde nicht gestartet'; end if;
  if exists (
    select 1 from public.visit_tasks vt
    where vt.visit_id = p_visit_id and vt.status not in ('done', 'blocked')
  ) then
    raise exception 'Alle Aufgaben müssen erledigt oder begründet nicht ausführbar sein';
  end if;
  if exists (
    select 1
    from public.visit_tasks vt
    where vt.visit_id = p_visit_id
      and vt.status = 'blocked'
      and length(btrim(coalesce(vt.blocked_reason, ''))) < 3
  ) then
    raise exception 'Nicht ausführbare Aufgaben benötigen eine Begründung';
  end if;
  if exists (
    select 1
    from public.visit_tasks vt
    where vt.visit_id = p_visit_id
      and vt.status = 'done'
      and vt.photo_required = true
      and not exists (
        select 1
        from public.visit_task_attachments vta
        join storage.objects so
          on so.bucket_id = vta.bucket and so.name = vta.path
        where vta.visit_task_id = vt.id
      )
  ) then
    raise exception 'Für mindestens eine Aufgabe fehlt das erforderliche Foto';
  end if;

  v_duration := greatest(0, floor(extract(epoch from (v_completed_at - v_visit.started_at)) / 60)::integer);
  select coalesce(vam.max_visit_minutes, vp.max_visit_minutes, pas.max_visit_minutes)
    into v_max
  from public.visits v
  left join public.visit_admin_metrics vam on vam.visit_id = v.id
  left join public.visit_plans vp on vp.id = v.visit_plan_id
  left join public.property_admin_settings pas on pas.property_id = v.property_id
  where v.id = p_visit_id;
  v_overtime := greatest(0, v_duration - coalesce(v_max, v_duration));

  update public.damage_reports dr
  set status = 'resolved',
      resolved_at = v_completed_at,
      resolution_note = coalesce(dr.resolution_note, 'Im Einsatz erledigt')
  from public.visit_tasks vt
  where vt.visit_id = p_visit_id
    and vt.damage_report_id = dr.id
    and vt.status = 'done';

  update public.damage_reports dr
  set status = 'scheduled'
  from public.visit_tasks vt
  where vt.visit_id = p_visit_id
    and vt.damage_report_id = dr.id
    and vt.status = 'blocked';

  -- Immutable, customer-safe source for the historical completion report. No
  -- property briefing, service instruction, internal equipment note or admin
  -- timing threshold is copied into this document.
  select jsonb_build_object(
    'schema_version', 1,
    'visit_id', v_visit.id,
    'property_id', v_visit.property_id,
    'property_name', (
      select p.name from public.properties p where p.id = v_visit.property_id
    ),
    'scheduled_date', v_visit.scheduled_date,
    'scheduled_start', v_visit.scheduled_start,
    'started_at', v_visit.started_at,
    'completed_at', v_completed_at,
    'duration_minutes', v_duration,
    'employee_id', (
      select ep.id from public.employee_profiles ep where ep.user_id = v_visit.started_by
    ),
    'executed_by_user_id', v_visit.started_by,
    'employee_name', coalesce((
      select coalesce(
        nullif(btrim(concat_ws(' ', nullif(btrim(ep.first_name), ''), nullif(btrim(ep.last_name), ''))), ''),
        nullif(btrim(ep.full_name), ''),
        nullif(btrim(up.full_name), '')
      )
      from public.employee_profiles ep
      left join public.user_profiles up on up.id = ep.user_id
      where ep.user_id = v_visit.started_by
    ), 'Mitarbeiter'),
    'buildings', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id,
        'label', b.label,
        'address', b.formatted_address,
        'formatted_address', b.formatted_address,
        'street', b.street,
        'house_number', b.house_number,
        'postal_code', b.postal_code,
        'city', b.city,
        'country', b.country
      ) order by coalesce(b.label, b.formatted_address), b.id)
      from public.visit_buildings vb
      join public.buildings b on b.id = vb.building_id
      where vb.visit_id = p_visit_id
    ), '[]'::jsonb),
    'tasks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', vt.id,
        'building_id', vt.building_id,
        'title', vt.title,
        'description', vt.description,
        'category', vt.category,
        'source_type', vt.source_type,
        'checklist', vt.checklist_snapshot,
        'checklist_snapshot', vt.checklist_snapshot,
        'status', vt.status,
        'blocked_reason', vt.blocked_reason,
        'completed_at', vt.completed_at,
        'photos', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', attachment.id,
            'bucket', attachment.bucket,
            'path', attachment.path,
            'filename', attachment.filename,
            'mime_type', attachment.mime_type,
            'size_bytes', attachment.size_bytes,
            'created_at', attachment.created_at
          ) order by attachment.created_at, attachment.id)
          from public.visit_task_attachments attachment
          join storage.objects object
            on object.bucket_id = attachment.bucket
            and object.name = attachment.path
          where attachment.visit_task_id = vt.id
        ), '[]'::jsonb)
      ) order by vt.created_at, vt.id)
      from public.visit_tasks vt
      where vt.visit_id = p_visit_id and vt.customer_visible = true
    ), '[]'::jsonb),
    'damages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', dr.id,
        'building_id', dr.building_id,
        'title', dr.title,
        'description', dr.description,
        'priority', dr.priority,
        'status', dr.status,
        'resolved_at', dr.resolved_at,
        'resolution_note', dr.resolution_note,
        'photos', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', attachment.id,
            'bucket', attachment.bucket,
            'path', attachment.path,
            'filename', attachment.filename,
            'mime_type', attachment.mime_type,
            'size_bytes', attachment.size_bytes,
            'created_at', attachment.created_at
          ) order by attachment.created_at, attachment.id)
          from public.damage_attachments attachment
          join storage.objects object
            on object.bucket_id = attachment.bucket
            and object.name = attachment.path
          where attachment.damage_report_id = dr.id
        ), '[]'::jsonb)
      ) order by dr.created_at, dr.id)
      from public.visit_tasks vt
      join public.damage_reports dr on dr.id = vt.damage_report_id
      where vt.visit_id = p_visit_id
        and vt.customer_visible = true
    ), '[]'::jsonb)
  ) into v_snapshot;

  update public.visits
  set status = 'completed',
      completed_at = v_completed_at,
      completed_by = v_user_id,
      duration_minutes = v_duration,
      report_snapshot = v_snapshot
  where id = p_visit_id;

  insert into public.visit_admin_metrics (
    visit_id, max_visit_minutes, overtime_minutes, warning_created_at
  ) values (
    p_visit_id, v_max, v_overtime,
    case when v_overtime > 0 then v_completed_at else null end
  )
  on conflict (visit_id) do update
    set max_visit_minutes = excluded.max_visit_minutes,
        overtime_minutes = excluded.overtime_minutes,
        warning_created_at = excluded.warning_created_at,
        updated_at = now();

  select name into v_property_name from public.properties where id = v_visit.property_id;
  perform private.notify_property_participants(
    v_visit.property_id, 'visit.completed', 'Einsatz abgeschlossen',
    v_property_name || ': Der Einsatz wurde abgeschlossen.',
    'visits', p_visit_id, 'visit:' || p_visit_id::text || ':completed',
    true, true, false, null
  );

  insert into public.property_messages (
    property_id, sender_id, message_type, body, related_type, related_id, idempotency_key
  ) values (
    v_visit.property_id, null, 'system',
    'Einsatz abgeschlossen am ' || to_char(v_completed_at at time zone 'Europe/Berlin', 'DD.MM.YYYY HH24:MI') || '.',
    'visits', p_visit_id, 'visit:' || p_visit_id::text || ':completed'
  ) on conflict do nothing;

  if v_overtime > 0 then
    perform private.notify_property_participants(
      v_visit.property_id, 'visit.overtime', 'Maximale Einsatzdauer überschritten',
      'Der Einsatz dauerte ' || v_overtime::text || ' Minuten länger als intern vorgesehen.',
      'visits', p_visit_id, 'visit:' || p_visit_id::text || ':overtime',
      true, false, false, null
    );
  end if;

  return v_completed_at;
end;
$$;

revoke all on function public.complete_visit(uuid) from public, anon;
grant execute on function public.complete_visit(uuid) to authenticated;

create or replace function private.protect_completed_visit_task()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_visit_id uuid;
begin
  if tg_op = 'INSERT' then v_visit_id := new.visit_id; else v_visit_id := old.visit_id; end if;
  if exists (select 1 from public.visits v where v.id = v_visit_id and v.status = 'completed') then
    raise exception 'Aufgaben abgeschlossener Einsätze sind unveränderlich';
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

create trigger visit_tasks_protect_completed
before insert or update or delete on public.visit_tasks
for each row execute function private.protect_completed_visit_task();

create or replace function private.protect_completed_visit_task_attachment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task_id uuid;
begin
  if tg_op = 'DELETE' then v_task_id := old.visit_task_id; else v_task_id := new.visit_task_id; end if;
  if exists (
    select 1
    from public.visit_tasks vt
    join public.visits v on v.id = vt.visit_id
    where vt.id = v_task_id and v.status = 'completed'
  ) then
    raise exception 'Nachweise abgeschlossener Einsätze sind unveränderlich';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger visit_task_attachments_protect_completed
before insert or update or delete on public.visit_task_attachments
for each row execute function private.protect_completed_visit_task_attachment();

create or replace function private.protect_completed_visit_equipment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_visit_id uuid;
  v_new_visit_id uuid;
begin
  if tg_op in ('UPDATE', 'DELETE') then v_old_visit_id := old.visit_id; end if;
  if tg_op in ('INSERT', 'UPDATE') then v_new_visit_id := new.visit_id; end if;

  if exists (
    select 1
    from public.visits visit
    where visit.status = 'completed'
      and visit.id in (v_old_visit_id, v_new_visit_id)
  ) then
    raise exception 'Equipment-Snapshots abgeschlossener Einsätze sind unveränderlich';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger visit_equipment_protect_completed
before insert or update or delete on public.visit_equipment
for each row execute function private.protect_completed_visit_equipment();

-- ---------------------------------------------------------------------------
-- Read-scope helpers used by RLS and private Storage policies
-- ---------------------------------------------------------------------------

create or replace function private.can_access_visit_plan(p_visit_plan_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.is_admin()) or exists (
    select 1
    from public.visit_plans vp
    where vp.id = p_visit_plan_id
      and (select private.is_employee_of_property(vp.property_id))
      and (
        vp.primary_employee_id = (select private.current_employee_id())
        or exists (
          select 1 from public.visit_plan_employees vpe
          where vpe.visit_plan_id = vp.id
            and vpe.employee_id = (select private.current_employee_id())
        )
        or (
          vp.primary_employee_id is null
          and not exists (
            select 1 from public.visit_plan_employees assigned
            where assigned.visit_plan_id = vp.id
          )
          and (select private.is_employee_of_property(vp.property_id))
        )
      )
  )
$$;

create or replace function private.can_read_visit(p_visit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.is_admin()) or exists (
    select 1
    from public.visits v
    where v.id = p_visit_id
      and (
        (select private.is_customer_of_property(v.property_id))
        or (select private.can_work_visit(v.id))
        or (
          v.started_by = (select auth.uid())
          and (select private.current_employee_id()) is not null
        )
      )
  )
$$;

create or replace function private.can_read_visit_task(p_visit_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.is_admin()) or exists (
    select 1
    from public.visit_tasks vt
    join public.visits v on v.id = vt.visit_id
    where vt.id = p_visit_task_id
      and (
        (select private.can_work_visit(vt.visit_id))
        or (
          vt.customer_visible = true
          and v.status = 'completed'
          and (select private.is_customer_of_property(vt.property_id))
        )
      )
  )
$$;

create or replace function private.can_read_damage(p_damage_report_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.is_admin()) or exists (
    select 1
    from public.damage_reports dr
    where dr.id = p_damage_report_id
      and (select private.can_access_property(dr.property_id))
  )
$$;

create or replace function private.can_read_operational_report(p_report_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.is_admin()) or exists (
    select 1
    from public.operational_reports opr
    where opr.id = p_report_id
      and opr.created_by = (select auth.uid())
      and opr.employee_id = (select private.current_employee_id())
  )
$$;

create or replace function private.can_read_message(p_message_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.property_messages pm
    where pm.id = p_message_id
      and (select private.can_access_property(pm.property_id))
  )
$$;

create or replace function private.can_read_complaint(p_complaint_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.is_admin()) or exists (
    select 1
    from public.complaints c
    where c.id = p_complaint_id
      and c.submitted_by = (select auth.uid())
      and (select private.is_customer_of_property(c.property_id))
  )
$$;

create or replace function private.can_read_equipment(p_equipment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.is_admin()) or (
    (select private.current_employee_id()) is not null
    and (
      exists (
        select 1
        from public.equipment_employee_assignments eea
        where eea.equipment_id = p_equipment_id
          and eea.employee_id = (select private.current_employee_id())
          and eea.returned_at is null
      )
      or exists (
        select 1
        from public.property_equipment pe
        where pe.equipment_id = p_equipment_id
          and pe.active = true
          and (select private.is_employee_of_property(pe.property_id))
      )
      or exists (
        select 1
        from public.visit_equipment ve
        where ve.equipment_id = p_equipment_id
          and (select private.can_work_visit(ve.visit_id))
      )
    )
  )
$$;

create or replace function private.try_uuid(p_value text)
returns uuid
language plpgsql
immutable
security invoker
set search_path = ''
as $$
begin
  return p_value::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Legacy privilege hardening
-- ---------------------------------------------------------------------------

drop policy if exists "profiles_update_own" on public.user_profiles;
create policy "profiles_update_own_safe" on public.user_profiles
for update to authenticated
using (id = (select auth.uid()) and status = 'active')
with check (id = (select auth.uid()) and status = 'active');

revoke update on public.user_profiles from authenticated;
grant update (full_name, phone, onboarding_completed, last_login_at)
  on public.user_profiles to authenticated;

drop policy if exists "employees_update_own" on public.employee_profiles;
create policy "employees_update_own_safe" on public.employee_profiles
for update to authenticated
using (
  user_id = (select auth.uid())
  and (select private.is_active_profile())
)
with check (
  user_id = (select auth.uid())
  and (select private.is_active_profile())
);

revoke update on public.employee_profiles from authenticated;
grant update (
  first_name, last_name, full_name, phone, address_street,
  address_house_number, address_postal_code, address_city,
  address_country, address_formatted
) on public.employee_profiles to authenticated;

drop policy if exists "offers_customer_accept_released" on public.offers;
revoke update on public.offers from authenticated;

-- The V2 visit timer replaces direct client mutation of the legacy shift and
-- material workflows. Service-role admin actions may still read/migrate them,
-- but an authenticated browser can no longer fabricate time or review state.
drop policy if exists "shifts_employee_insert_own" on public.shifts;
drop policy if exists "shifts_employee_update_own_open" on public.shifts;
drop policy if exists "shift_tasks_employee_all_own_shift" on public.shift_tasks;
drop policy if exists "materials_employee_insert_assigned" on public.material_requests;
drop policy if exists "materials_employee_update_own_requested" on public.material_requests;
revoke insert, update, delete on public.shifts from authenticated;
revoke insert, update, delete on public.shift_tasks from authenticated;
revoke insert, update, delete on public.material_requests from authenticated;

drop policy if exists "audit_authenticated_insert" on public.audit_logs;
revoke insert on public.audit_logs from authenticated;

create or replace function private.guard_legacy_shift_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_employee_id uuid := (select private.current_employee_id());
  v_project_customer_id uuid;
begin
  if (select private.is_admin()) or (select private.is_service_role()) then
    return new;
  end if;
  if v_employee_id is null then
    raise exception 'Aktives Mitarbeiterprofil erforderlich';
  end if;

  if tg_op = 'INSERT' then
    select p.customer_id into v_project_customer_id
    from public.projects p where p.id = new.project_id;
    if new.user_id <> (select auth.uid())
      or new.employee_id <> v_employee_id
      or new.customer_id is distinct from v_project_customer_id
      or new.status <> 'open'
      or new.customer_visible
      or new.reviewed_by is not null
      or new.reviewed_at is not null
      or new.review_note is not null
      or not public.is_employee_assigned(new.project_id) then
      raise exception 'Ungültige Zeiterfassung';
    end if;
    return new;
  end if;

  if old.user_id <> (select auth.uid())
    or old.employee_id <> v_employee_id
    or old.status <> 'open'
    or new.user_id is distinct from old.user_id
    or new.employee_id is distinct from old.employee_id
    or new.customer_id is distinct from old.customer_id
    or new.project_id is distinct from old.project_id
    or new.started_at is distinct from old.started_at
    or new.status not in ('open', 'submitted')
    or new.customer_visible
    or new.reviewed_by is not null
    or new.reviewed_at is not null
    or new.review_note is not null then
    raise exception 'Diese Zeiterfassung darf nicht so geändert werden';
  end if;
  return new;
end;
$$;

drop trigger if exists shifts_guard_employee_mutation on public.shifts;
create trigger shifts_guard_employee_mutation
before insert or update on public.shifts
for each row execute function private.guard_legacy_shift_mutation();

create or replace function private.guard_legacy_material_request_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_employee_id uuid := (select private.current_employee_id());
  v_project_customer_id uuid;
begin
  if (select private.is_admin()) or (select private.is_service_role()) then
    return new;
  end if;
  select p.customer_id into v_project_customer_id
  from public.projects p where p.id = new.project_id;

  if tg_op = 'INSERT' then
    if v_employee_id is null
      or new.user_id <> (select auth.uid())
      or new.employee_id <> v_employee_id
      or new.customer_id is distinct from v_project_customer_id
      or new.status <> 'requested'
      or new.admin_comment is not null
      or not public.is_employee_assigned(new.project_id) then
      raise exception 'Ungültige Materialanfrage';
    end if;
    return new;
  end if;

  if old.user_id <> (select auth.uid())
    or old.status <> 'requested'
    or new.user_id is distinct from old.user_id
    or new.employee_id is distinct from old.employee_id
    or new.customer_id is distinct from old.customer_id
    or new.project_id is distinct from old.project_id
    or new.status <> 'requested'
    or new.admin_comment is not null then
    raise exception 'Diese Materialanfrage darf nicht so geändert werden';
  end if;
  return new;
end;
$$;

drop trigger if exists material_requests_guard_employee_mutation on public.material_requests;
create trigger material_requests_guard_employee_mutation
before insert or update on public.material_requests
for each row execute function private.guard_legacy_material_request_mutation();

create or replace function public.correct_visit_time(
  p_visit_id uuid,
  p_property_id uuid,
  p_started_at timestamptz,
  p_completed_at timestamptz,
  p_reason text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_visit public.visits%rowtype;
  v_actor uuid := (select auth.uid());
  v_duration integer;
begin
  if not (select private.is_admin()) then
    raise exception 'Nur Administratoren dürfen Einsatzzeiten korrigieren';
  end if;
  if p_started_at is null or p_completed_at is null or p_completed_at <= p_started_at then
    raise exception 'Das Einsatzende muss nach dem Beginn liegen';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Eine nachvollziehbare Begründung ist erforderlich';
  end if;

  select * into v_visit
  from public.visits
  where id = p_visit_id and property_id = p_property_id
  for update;

  if not found then raise exception 'Einsatz wurde nicht gefunden'; end if;
  if v_visit.status <> 'completed' then
    raise exception 'Nur abgeschlossene Einsätze können korrigiert werden';
  end if;

  v_duration := floor(extract(epoch from (p_completed_at - p_started_at)) / 60)::integer;

  insert into public.visit_time_corrections (
    visit_id, original_started_at, original_completed_at,
    corrected_started_at, corrected_completed_at, reason, corrected_by
  ) values (
    p_visit_id, v_visit.started_at, v_visit.completed_at,
    p_started_at, p_completed_at, btrim(p_reason), v_actor
  );

  update public.visits
  set started_at = p_started_at,
      completed_at = p_completed_at,
      duration_minutes = v_duration,
      report_snapshot = coalesce(report_snapshot, '{}'::jsonb) || jsonb_build_object(
        'started_at', p_started_at,
        'completed_at', p_completed_at,
        'duration_minutes', v_duration,
        'time_corrected_at', now()
      )
  where id = p_visit_id;

  update public.visit_admin_metrics vam
  set overtime_minutes = greatest(0, v_duration - coalesce(vam.max_visit_minutes, v_duration)),
      warning_created_at = case
        when v_duration > coalesce(vam.max_visit_minutes, v_duration) then now()
        else null
      end,
      updated_at = now()
  where vam.visit_id = p_visit_id;

  insert into public.audit_logs (actor_id, action, entity_table, entity_id, metadata)
  values (
    v_actor, 'visit.time_corrected', 'visits', p_visit_id,
    jsonb_build_object(
      'property_id', p_property_id,
      'old_started_at', v_visit.started_at,
      'old_completed_at', v_visit.completed_at,
      'new_started_at', p_started_at,
      'new_completed_at', p_completed_at,
      'duration_minutes', v_duration,
      'reason', btrim(p_reason)
    )
  );

  return v_duration;
end;
$$;

revoke all on function public.correct_visit_time(uuid, uuid, timestamptz, timestamptz, text)
  from public, anon;
grant execute on function public.correct_visit_time(uuid, uuid, timestamptz, timestamptz, text)
  to authenticated;

create or replace function public.upsert_property_compensation_rate(
  p_property_id uuid,
  p_net_amount_cents bigint,
  p_tax_rate_bps integer,
  p_valid_from date,
  p_valid_until date,
  p_internal_note text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_rate_id uuid;
  v_next_start date;
  v_effective_until date := p_valid_until;
  v_today date := (now() at time zone 'Europe/Berlin')::date;
begin
  if not (select private.is_admin()) then
    raise exception 'Nur Administratoren dürfen Grundvergütungen ändern';
  end if;
  if p_property_id is null or p_valid_from is null
    or p_net_amount_cents is null or p_net_amount_cents < 0
    or p_tax_rate_bps is null or p_tax_rate_bps not between 0 and 10000 then
    raise exception 'Ungültige Vergütungsdaten';
  end if;
  if p_valid_until is not null and p_valid_until < p_valid_from then
    raise exception 'Gültig bis darf nicht vor Gültig ab liegen';
  end if;

  -- The property row is the per-property serialization lock for all rate edits.
  perform 1 from public.properties p where p.id = p_property_id for update;
  if not found then raise exception 'Immobilie wurde nicht gefunden'; end if;

  select min(pcr.valid_from)
    into v_next_start
  from public.property_compensation_rates pcr
  where pcr.property_id = p_property_id
    and pcr.valid_from > p_valid_from;

  if v_next_start is not null then
    if v_effective_until is null then
      v_effective_until := v_next_start - 1;
    elsif v_effective_until >= v_next_start then
      raise exception 'Der Zeitraum überschneidet eine zukünftige Grundvergütung';
    end if;
  end if;

  update public.property_compensation_rates pcr
  set valid_until = p_valid_from - 1
  where pcr.property_id = p_property_id
    and pcr.valid_from < p_valid_from
    and (pcr.valid_until is null or pcr.valid_until >= p_valid_from);

  insert into public.property_compensation_rates (
    property_id, net_amount_cents, tax_rate_bps, valid_from, valid_until,
    internal_note, created_by
  ) values (
    p_property_id, p_net_amount_cents, p_tax_rate_bps, p_valid_from,
    v_effective_until, nullif(btrim(p_internal_note), ''), v_actor
  )
  on conflict (property_id, valid_from) do update
  set net_amount_cents = excluded.net_amount_cents,
      tax_rate_bps = excluded.tax_rate_bps,
      valid_until = excluded.valid_until,
      internal_note = excluded.internal_note
  returning id into v_rate_id;

  if p_valid_from <= v_today
    and (v_effective_until is null or v_effective_until >= v_today) then
    insert into public.property_admin_settings (
      property_id, monthly_fee_net_cents, tax_rate_bps, updated_by
    ) values (
      p_property_id, p_net_amount_cents, p_tax_rate_bps, v_actor
    )
    on conflict (property_id) do update
    set monthly_fee_net_cents = excluded.monthly_fee_net_cents,
        tax_rate_bps = excluded.tax_rate_bps,
        updated_by = excluded.updated_by,
        updated_at = now();
  end if;

  insert into public.audit_logs (actor_id, action, entity_table, entity_id, metadata)
  values (
    v_actor, 'property.compensation_rate_upserted',
    'property_compensation_rates', v_rate_id,
    jsonb_build_object(
      'property_id', p_property_id,
      'net_amount_cents', p_net_amount_cents,
      'tax_rate_bps', p_tax_rate_bps,
      'valid_from', p_valid_from,
      'valid_until', v_effective_until
    )
  );

  return v_rate_id;
end;
$$;

revoke all on function public.upsert_property_compensation_rate(
  uuid, bigint, integer, date, date, text
) from public, anon;
grant execute on function public.upsert_property_compensation_rate(
  uuid, bigint, integer, date, date, text
) to authenticated;

-- ---------------------------------------------------------------------------
-- Row-level security. A single admin policy is installed on every new table;
-- narrower policies below add only the reads and writes needed by each portal.
-- ---------------------------------------------------------------------------

do $portal_rls$
declare
  v_table text;
begin
  foreach v_table in array array[
    'customer_users',
    'properties',
    'property_admin_settings',
    'property_compensation_rates',
    'property_briefings',
    'property_billing_profiles',
    'buildings',
    'building_access_notes',
    'property_employee_assignments',
    'service_catalog',
    'property_services',
    'property_service_instructions',
    'property_service_buildings',
    'service_checklist_items',
    'visit_plans',
    'visit_plan_buildings',
    'visit_plan_employees',
    'visits',
    'visit_admin_metrics',
    'visit_buildings',
    'visit_tasks',
    'visit_task_instructions',
    'visit_task_attachments',
    'visit_time_corrections',
    'damage_reports',
    'damage_report_submission_metadata',
    'damage_attachments',
    'operational_reports',
    'operational_report_attachments',
    'equipment',
    'equipment_admin_details',
    'property_equipment',
    'service_equipment',
    'equipment_employee_assignments',
    'visit_equipment',
    'property_messages',
    'message_attachments',
    'message_reactions',
    'message_reads',
    'complaints',
    'complaint_admin_notes',
    'complaint_attachments',
    'company_settings',
    'extra_charges',
    'invoice_sequences',
    'notifications',
    'notification_deliveries',
    'public_submission_limits'
  ]
  loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format(
      'create policy portal_admin_all on public.%I for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()))',
      v_table
    );
  end loop;
end;
$portal_rls$;

create policy customer_users_select_own
on public.customer_users for select to authenticated
using (
  user_id = (select auth.uid())
  and active = true
  and (select private.is_active_profile())
);

create policy properties_customer_select
on public.properties for select to authenticated
using ((select private.is_customer_of_property(id)));

create policy properties_employee_select
on public.properties for select to authenticated
using ((select private.is_employee_of_property(id)));

create policy property_briefings_employee_select
on public.property_briefings for select to authenticated
using ((select private.is_employee_of_property(property_id)));

create policy property_billing_profiles_customer_select
on public.property_billing_profiles for select to authenticated
using ((select private.is_customer_of_property(property_id)));

create policy buildings_participant_select
on public.buildings for select to authenticated
using ((select private.can_access_property(property_id)));

create policy building_access_notes_employee_select
on public.building_access_notes for select to authenticated
using (
  exists (
    select 1 from public.buildings b
    where b.id = building_access_notes.building_id
      and (select private.is_employee_of_property(b.property_id))
  )
);

create policy property_employee_assignments_employee_select
on public.property_employee_assignments for select to authenticated
using (
  employee_id = (select private.current_employee_id())
  and active = true
);

create policy service_catalog_active_select
on public.service_catalog for select to authenticated
using (status = 'active' and (select private.is_active_profile()));

create policy property_services_employee_select
on public.property_services for select to authenticated
using ((select private.is_employee_of_property(property_id)));

create policy property_services_customer_select
on public.property_services for select to authenticated
using (
  customer_visible = true
  and status <> 'archived'
  and (select private.is_customer_of_property(property_id))
);

create policy property_service_instructions_employee_select
on public.property_service_instructions for select to authenticated
using (
  exists (
    select 1 from public.property_services ps
    where ps.id = property_service_instructions.property_service_id
      and (select private.is_employee_of_property(ps.property_id))
  )
);

create policy property_service_buildings_participant_select
on public.property_service_buildings for select to authenticated
using (
  exists (
    select 1 from public.property_services ps
    where ps.id = property_service_buildings.property_service_id
      and (
        (select private.is_employee_of_property(ps.property_id))
        or (
          ps.customer_visible = true
          and (select private.is_customer_of_property(ps.property_id))
        )
      )
  )
);

create policy service_checklist_items_participant_select
on public.service_checklist_items for select to authenticated
using (
  exists (
    select 1 from public.property_services ps
    where ps.id = service_checklist_items.property_service_id
      and (
        (select private.is_employee_of_property(ps.property_id))
        or (
          ps.customer_visible = true
          and (select private.is_customer_of_property(ps.property_id))
        )
      )
  )
);

create policy visit_plans_employee_select
on public.visit_plans for select to authenticated
using ((select private.can_access_visit_plan(id)));

create policy visit_plan_buildings_employee_select
on public.visit_plan_buildings for select to authenticated
using ((select private.can_access_visit_plan(visit_plan_id)));

create policy visit_plan_employees_employee_select
on public.visit_plan_employees for select to authenticated
using (
  employee_id = (select private.current_employee_id())
  and (select private.can_access_visit_plan(visit_plan_id))
);

create policy visits_participant_select
on public.visits for select to authenticated
using ((select private.can_read_visit(id)));

create policy visit_buildings_participant_select
on public.visit_buildings for select to authenticated
using ((select private.can_read_visit(visit_id)));

create policy visit_tasks_participant_select
on public.visit_tasks for select to authenticated
using ((select private.can_read_visit_task(id)));

create policy visit_task_instructions_employee_select
on public.visit_task_instructions for select to authenticated
using (
  exists (
    select 1 from public.visit_tasks vt
    where vt.id = visit_task_instructions.visit_task_id
      and (select private.can_work_visit(vt.visit_id))
  )
);

create policy visit_task_attachments_participant_select
on public.visit_task_attachments for select to authenticated
using ((select private.can_read_visit_task(visit_task_id)));

create policy damage_reports_participant_select
on public.damage_reports for select to authenticated
using ((select private.can_read_damage(id)));

create policy damage_attachments_participant_select
on public.damage_attachments for select to authenticated
using ((select private.can_read_damage(damage_report_id)));

create policy operational_reports_employee_select_own
on public.operational_reports for select to authenticated
using ((select private.can_read_operational_report(id)));

create policy operational_report_attachments_employee_select_own
on public.operational_report_attachments for select to authenticated
using ((select private.can_read_operational_report(operational_report_id)));

create policy equipment_employee_select_relevant
on public.equipment for select to authenticated
using ((select private.can_read_equipment(id)));

create policy property_equipment_employee_select
on public.property_equipment for select to authenticated
using (
  active = true
  and (select private.is_employee_of_property(property_id))
);

create policy service_equipment_employee_select
on public.service_equipment for select to authenticated
using (
  exists (
    select 1 from public.property_services ps
    where ps.id = service_equipment.property_service_id
      and (select private.is_employee_of_property(ps.property_id))
  )
);

create policy equipment_employee_assignments_select_own
on public.equipment_employee_assignments for select to authenticated
using (employee_id = (select private.current_employee_id()));

create policy visit_equipment_employee_select
on public.visit_equipment for select to authenticated
using ((select private.can_work_visit(visit_id)));

create policy property_messages_participant_select
on public.property_messages for select to authenticated
using ((select private.can_read_message(id)));

create policy message_attachments_participant_select
on public.message_attachments for select to authenticated
using ((select private.can_read_message(message_id)));

create policy message_reactions_participant_select
on public.message_reactions for select to authenticated
using ((select private.can_read_message(message_id)));

create policy message_reads_participant_select
on public.message_reads for select to authenticated
using ((select private.can_read_message(message_id)));

create policy complaints_customer_select_own
on public.complaints for select to authenticated
using ((select private.can_read_complaint(id)));

create policy complaint_attachments_customer_select_own
on public.complaint_attachments for select to authenticated
using ((select private.can_read_complaint(complaint_id)));

create policy notifications_recipient_select
on public.notifications for select to authenticated
using (
  recipient_id = (select auth.uid())
  and (select private.is_active_profile())
);

-- Customer and employee writes are deliberately narrow. The matching column
-- grants below are a second boundary against mass-assignment through PostgREST.

create policy visit_tasks_employee_update
on public.visit_tasks for update to authenticated
using ((select private.can_work_visit(visit_id)))
with check (
  (select private.can_work_visit(visit_id))
  and exists (
    select 1 from public.visits v
    where v.id = visit_tasks.visit_id and v.status = 'started'
  )
);

create policy visit_task_attachments_employee_insert
on public.visit_task_attachments for insert to authenticated
with check (
  bucket = 'visit-task-attachments'
  and uploaded_by = (select auth.uid())
  and exists (
    select 1
    from public.visit_tasks vt
    join public.visits v on v.id = vt.visit_id
    where vt.id = visit_task_attachments.visit_task_id
      and (select private.can_work_visit(vt.visit_id))
      and v.status = 'started'
  )
);

create policy damage_reports_customer_insert
on public.damage_reports for insert to authenticated
with check (
  source = 'customer'
  and created_by = (select auth.uid())
  and status = 'new'
  and planned_next_visit = true
  and linked_visit_id is null
  and linked_visit_task_id is null
  and resolved_at is null
  and resolution_note is null
  and reviewed_by is null
  and (select private.is_customer_of_property(property_id))
  and exists (
    select 1 from public.buildings b
    where b.id = damage_reports.building_id
      and b.property_id = damage_reports.property_id
      and b.status = 'active'
  )
);

create policy damage_reports_employee_insert
on public.damage_reports for insert to authenticated
with check (
  source = 'employee'
  and created_by = (select auth.uid())
  and status = 'new'
  and planned_next_visit = true
  and linked_visit_id is null
  and linked_visit_task_id is null
  and resolved_at is null
  and resolution_note is null
  and reviewed_by is null
  and (select private.is_employee_of_property(property_id))
  and exists (
    select 1 from public.buildings b
    where b.id = damage_reports.building_id
      and b.property_id = damage_reports.property_id
      and b.status = 'active'
  )
);

create policy damage_attachments_submitter_insert
on public.damage_attachments for insert to authenticated
with check (
  bucket = 'damage-attachments'
  and uploaded_by = (select auth.uid())
  and exists (
    select 1 from public.damage_reports dr
    where dr.id = damage_attachments.damage_report_id
      and dr.created_by = (select auth.uid())
      and dr.source in ('customer', 'employee')
      and (select private.can_read_damage(dr.id))
  )
);

create policy operational_reports_employee_insert
on public.operational_reports for insert to authenticated
with check (
  employee_id = (select private.current_employee_id())
  and created_by = (select auth.uid())
  and status = 'new'
  and reviewed_by is null
  and resolved_at is null
  and resolved_by is null
  and (select private.is_employee_of_property(property_id))
  and (
    building_id is null
    or exists (
      select 1 from public.buildings b
      where b.id = operational_reports.building_id
        and b.property_id = operational_reports.property_id
    )
  )
  and (
    visit_id is null
    or exists (
      select 1 from public.visits v
      where v.id = operational_reports.visit_id
        and v.property_id = operational_reports.property_id
        and (select private.can_work_visit(v.id))
    )
  )
  and (
    equipment_id is null
    or (select private.can_read_equipment(equipment_id))
  )
);

create policy operational_report_attachments_employee_insert
on public.operational_report_attachments for insert to authenticated
with check (
  bucket = 'operational-report-attachments'
  and uploaded_by = (select auth.uid())
  and exists (
    select 1 from public.operational_reports opr
    where opr.id = operational_report_attachments.operational_report_id
      and opr.created_by = (select auth.uid())
      and opr.employee_id = (select private.current_employee_id())
  )
);

create policy property_messages_participant_insert
on public.property_messages for insert to authenticated
with check (
  message_type = 'user'
  and sender_id = (select auth.uid())
  and related_type is null
  and related_id is null
  and idempotency_key is null
  and edited_at is null
  and deleted_at is null
  and (select private.can_access_property(property_id))
);

create policy message_attachments_sender_insert
on public.message_attachments for insert to authenticated
with check (
  bucket = 'property-message-attachments'
  and uploaded_by = (select auth.uid())
  and exists (
    select 1 from public.property_messages pm
    where pm.id = message_attachments.message_id
      and pm.sender_id = (select auth.uid())
      and pm.message_type = 'user'
      and (select private.can_access_property(pm.property_id))
  )
);

create policy message_reactions_participant_insert
on public.message_reactions for insert to authenticated
with check (
  user_id = (select auth.uid())
  and (select private.can_read_message(message_id))
);

create policy message_reactions_owner_delete
on public.message_reactions for delete to authenticated
using (
  user_id = (select auth.uid())
  and (select private.can_read_message(message_id))
);

create policy message_reads_participant_insert
on public.message_reads for insert to authenticated
with check (
  user_id = (select auth.uid())
  and (select private.can_read_message(message_id))
);

create policy message_reads_owner_update
on public.message_reads for update to authenticated
using (
  user_id = (select auth.uid())
  and (select private.can_read_message(message_id))
)
with check (
  user_id = (select auth.uid())
  and (select private.can_read_message(message_id))
);

create policy complaints_customer_insert
on public.complaints for insert to authenticated
with check (
  submitted_by = (select auth.uid())
  and status = 'new'
  and answered_at is null
  and resolved_at is null
  and (select private.is_customer_of_property(property_id))
  and (
    visit_id is null
    or exists (
      select 1 from public.visits v
      where v.id = complaints.visit_id
        and v.property_id = complaints.property_id
        and v.status = 'completed'
    )
  )
);

create policy complaint_attachments_submitter_insert
on public.complaint_attachments for insert to authenticated
with check (
  bucket = 'complaint-attachments'
  and uploaded_by = (select auth.uid())
  and exists (
    select 1 from public.complaints c
    where c.id = complaint_attachments.complaint_id
      and c.submitted_by = (select auth.uid())
      and (select private.is_customer_of_property(c.property_id))
  )
);

create policy notifications_recipient_update
on public.notifications for update to authenticated
using (
  recipient_id = (select auth.uid())
  and (select private.is_active_profile())
)
with check (
  recipient_id = (select auth.uid())
  and (select private.is_active_profile())
);

-- Reset Supabase's broad default API grants for the new domain, then grant the
-- minimum operation/column surface expected by the server-rendered portals.
revoke all privileges on table
  public.customer_users,
  public.properties,
  public.property_admin_settings,
  public.property_compensation_rates,
  public.property_briefings,
  public.property_billing_profiles,
  public.buildings,
  public.building_access_notes,
  public.property_employee_assignments,
  public.service_catalog,
  public.property_services,
  public.property_service_instructions,
  public.property_service_buildings,
  public.service_checklist_items,
  public.visit_plans,
  public.visit_plan_buildings,
  public.visit_plan_employees,
  public.visits,
  public.visit_admin_metrics,
  public.visit_buildings,
  public.visit_tasks,
  public.visit_task_instructions,
  public.visit_task_attachments,
  public.visit_time_corrections,
  public.damage_reports,
  public.damage_report_submission_metadata,
  public.damage_attachments,
  public.operational_reports,
  public.operational_report_attachments,
  public.equipment,
  public.equipment_admin_details,
  public.property_equipment,
  public.service_equipment,
  public.equipment_employee_assignments,
  public.visit_equipment,
  public.property_messages,
  public.message_attachments,
  public.message_reactions,
  public.message_reads,
  public.complaints,
  public.complaint_admin_notes,
  public.complaint_attachments,
  public.company_settings,
  public.extra_charges,
  public.invoice_sequences,
  public.notifications,
  public.notification_deliveries,
  public.public_submission_limits
from anon, authenticated;

grant all privileges on table
  public.customer_users,
  public.properties,
  public.property_admin_settings,
  public.property_compensation_rates,
  public.property_briefings,
  public.property_billing_profiles,
  public.buildings,
  public.building_access_notes,
  public.property_employee_assignments,
  public.service_catalog,
  public.property_services,
  public.property_service_instructions,
  public.property_service_buildings,
  public.service_checklist_items,
  public.visit_plans,
  public.visit_plan_buildings,
  public.visit_plan_employees,
  public.visits,
  public.visit_admin_metrics,
  public.visit_buildings,
  public.visit_tasks,
  public.visit_task_instructions,
  public.visit_task_attachments,
  public.visit_time_corrections,
  public.damage_reports,
  public.damage_report_submission_metadata,
  public.damage_attachments,
  public.operational_reports,
  public.operational_report_attachments,
  public.equipment,
  public.equipment_admin_details,
  public.property_equipment,
  public.service_equipment,
  public.equipment_employee_assignments,
  public.visit_equipment,
  public.property_messages,
  public.message_attachments,
  public.message_reactions,
  public.message_reads,
  public.complaints,
  public.complaint_admin_notes,
  public.complaint_attachments,
  public.company_settings,
  public.extra_charges,
  public.invoice_sequences,
  public.notifications,
  public.notification_deliveries,
  public.public_submission_limits
to service_role;

grant select on table
  public.customer_users,
  public.properties,
  public.property_admin_settings,
  public.property_compensation_rates,
  public.property_briefings,
  public.property_billing_profiles,
  public.building_access_notes,
  public.property_employee_assignments,
  public.service_catalog,
  public.property_services,
  public.property_service_instructions,
  public.property_service_buildings,
  public.service_checklist_items,
  public.visit_plans,
  public.visit_plan_buildings,
  public.visit_plan_employees,
  public.visits,
  public.visit_admin_metrics,
  public.visit_buildings,
  public.visit_tasks,
  public.visit_task_instructions,
  public.visit_task_attachments,
  public.visit_time_corrections,
  public.damage_reports,
  public.damage_report_submission_metadata,
  public.damage_attachments,
  public.operational_reports,
  public.operational_report_attachments,
  public.equipment,
  public.equipment_admin_details,
  public.property_equipment,
  public.service_equipment,
  public.equipment_employee_assignments,
  public.visit_equipment,
  public.property_messages,
  public.message_attachments,
  public.message_reactions,
  public.message_reads,
  public.complaints,
  public.complaint_admin_notes,
  public.complaint_attachments,
  public.company_settings,
  public.extra_charges,
  public.invoice_sequences,
  public.notifications,
  public.notification_deliveries
to authenticated;

-- QR derivation material is intentionally service-role only. Even an admin UI
-- should obtain/rotate QR tokens through its server action, never a browser row.
grant select (
  id, property_id, label, street, house_number, postal_code, city, country,
  formatted_address, status, archived_at, created_at, updated_at
) on public.buildings to authenticated;

grant update (status, blocked_reason, completed_at, completed_by)
  on public.visit_tasks to authenticated;

grant insert (
  visit_task_id, bucket, path, filename, mime_type, size_bytes, uploaded_by
) on public.visit_task_attachments to authenticated;

grant insert (
  property_id, building_id, source, title, description, priority, status,
  created_by, planned_next_visit
) on public.damage_reports to authenticated;

grant insert (
  damage_report_id, bucket, path, filename, mime_type, size_bytes, uploaded_by
) on public.damage_attachments to authenticated;

grant insert (
  property_id, building_id, equipment_id, visit_id, employee_id, created_by,
  category, urgency, title, description, status
) on public.operational_reports to authenticated;

grant insert (
  operational_report_id, bucket, path, filename, mime_type, size_bytes, uploaded_by
) on public.operational_report_attachments to authenticated;

grant insert (property_id, sender_id, message_type, body)
  on public.property_messages to authenticated;

grant insert (message_id, bucket, path, filename, mime_type, size_bytes, uploaded_by)
  on public.message_attachments to authenticated;

grant insert (message_id, user_id, emoji), delete
  on public.message_reactions to authenticated;

grant insert (message_id, user_id, read_at)
  on public.message_reads to authenticated;
grant update (message_id, user_id, read_at)
  on public.message_reads to authenticated;

grant insert (property_id, visit_id, submitted_by, title, description, status)
  on public.complaints to authenticated;

grant insert (complaint_id, bucket, path, filename, mime_type, size_bytes, uploaded_by)
  on public.complaint_attachments to authenticated;

grant update (read_at) on public.notifications to authenticated;

-- ---------------------------------------------------------------------------
-- Private Storage buckets and path-aware policies
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'damage-attachments', 'damage-attachments', false, 8388608,
    array['image/jpeg','image/png','image/webp','image/heic','image/heif']
  ),
  (
    'operational-report-attachments', 'operational-report-attachments', false, 8388608,
    array['image/jpeg','image/png','image/webp','image/heic','image/heif']
  ),
  (
    'visit-task-attachments', 'visit-task-attachments', false, 8388608,
    array['image/jpeg','image/png','image/webp','image/heic','image/heif']
  ),
  (
    'property-message-attachments', 'property-message-attachments', false, 31457280,
    array[
      'image/jpeg','image/png','image/webp','image/heic','image/heif',
      'video/mp4','video/quicktime','video/webm','application/pdf'
    ]
  ),
  (
    'complaint-attachments', 'complaint-attachments', false, 8388608,
    array['image/jpeg','image/png','image/webp','image/heic','image/heif']
  ),
  (
    'equipment-images', 'equipment-images', false, 8388608,
    array['image/jpeg','image/png','image/webp','image/heic','image/heif']
  )
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "storage_admin_all_hausvia" on storage.objects;
drop policy if exists "storage_employee_shift_photos" on storage.objects;
drop policy if exists "storage_employee_read_own_shift_photos" on storage.objects;
drop policy if exists "storage_portal_admin_all" on storage.objects;
create policy "storage_portal_admin_all" on storage.objects
for all to authenticated
using (
  bucket_id in (
    'offer-pdfs', 'invoice-pdfs', 'customer-documents', 'project-documents',
    'shift-photos', 'damage-attachments', 'operational-report-attachments',
    'visit-task-attachments', 'property-message-attachments',
    'complaint-attachments', 'equipment-images'
  )
  and (select private.is_admin())
)
with check (
  bucket_id in (
    'offer-pdfs', 'invoice-pdfs', 'customer-documents', 'project-documents',
    'shift-photos', 'damage-attachments', 'operational-report-attachments',
    'visit-task-attachments', 'property-message-attachments',
    'complaint-attachments', 'equipment-images'
  )
  and (select private.is_admin())
);

create policy "storage_employee_shift_photos" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'shift-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (select private.current_user_role()) = 'employee'
);

create policy "storage_employee_read_own_shift_photos" on storage.objects
for select to authenticated
using (
  bucket_id = 'shift-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (select private.current_user_role()) = 'employee'
);

create policy "storage_portal_attachment_select" on storage.objects
for select to authenticated
using (
  (
    bucket_id = 'visit-task-attachments'
    and exists (
      select 1 from public.visit_task_attachments a
      where a.bucket = storage.objects.bucket_id
        and a.path = storage.objects.name
        and (select private.can_read_visit_task(a.visit_task_id))
    )
  )
  or (
    bucket_id = 'damage-attachments'
    and exists (
      select 1 from public.damage_attachments a
      where a.bucket = storage.objects.bucket_id
        and a.path = storage.objects.name
        and (select private.can_read_damage(a.damage_report_id))
    )
  )
  or (
    bucket_id = 'operational-report-attachments'
    and exists (
      select 1 from public.operational_report_attachments a
      where a.bucket = storage.objects.bucket_id
        and a.path = storage.objects.name
        and (select private.can_read_operational_report(a.operational_report_id))
    )
  )
  or (
    bucket_id = 'property-message-attachments'
    and exists (
      select 1 from public.message_attachments a
      where a.bucket = storage.objects.bucket_id
        and a.path = storage.objects.name
        and (select private.can_read_message(a.message_id))
    )
  )
  or (
    bucket_id = 'complaint-attachments'
    and exists (
      select 1 from public.complaint_attachments a
      where a.bucket = storage.objects.bucket_id
        and a.path = storage.objects.name
        and (select private.can_read_complaint(a.complaint_id))
    )
  )
  or (
    bucket_id = 'equipment-images'
    and exists (
      select 1 from public.equipment e
      where e.image_bucket = storage.objects.bucket_id
        and e.image_path = storage.objects.name
        and (select private.can_read_equipment(e.id))
    )
  )
);

create policy "storage_visit_task_insert" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'visit-task-attachments'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1
    from public.visit_tasks vt
    join public.visits v on v.id = vt.visit_id
    where vt.id = private.try_uuid((storage.foldername(name))[3])
      and vt.visit_id = private.try_uuid((storage.foldername(name))[2])
      and (select private.can_work_visit(vt.visit_id))
      and v.status = 'started'
  )
);

create policy "storage_damage_insert" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'damage-attachments'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1 from public.damage_reports dr
    where dr.id = private.try_uuid((storage.foldername(name))[3])
      and dr.property_id = private.try_uuid((storage.foldername(name))[2])
      and dr.created_by = (select auth.uid())
      and dr.source in ('customer', 'employee')
      and (select private.can_read_damage(dr.id))
  )
);

create policy "storage_operational_report_insert" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'operational-report-attachments'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1 from public.operational_reports opr
    where opr.id = private.try_uuid((storage.foldername(name))[2])
      and opr.created_by = (select auth.uid())
      and opr.employee_id = (select private.current_employee_id())
  )
);

create policy "storage_property_message_insert" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'property-message-attachments'
  and exists (
    select 1 from public.property_messages pm
    where pm.property_id = private.try_uuid((storage.foldername(name))[1])
      and pm.id = private.try_uuid((storage.foldername(name))[2])
      and pm.sender_id = (select auth.uid())
      and pm.message_type = 'user'
      and (select private.can_access_property(pm.property_id))
  )
);

create policy "storage_complaint_insert" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'complaint-attachments'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1 from public.complaints c
    where c.id = private.try_uuid((storage.foldername(name))[2])
      and c.submitted_by = (select auth.uid())
      and (select private.is_customer_of_property(c.property_id))
  )
);

create or replace function private.protect_immutable_invoice_pdf()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.bucket_id = 'invoice-pdfs' and exists (
    select 1
    from public.invoices i
    where (
      (i.original_pdf_bucket = old.bucket_id and i.original_pdf_path = old.name)
      or i.document_path = old.name
    )
      and (
        i.immutable_at is not null
        or i.status in ('released', 'open', 'paid', 'overdue', 'canceled')
      )
  ) then
    raise exception 'Das Original-PDF einer freigegebenen Rechnung ist unveränderlich';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists hausvia_protect_immutable_invoice_pdf on storage.objects;
create trigger hausvia_protect_immutable_invoice_pdf
before update or delete on storage.objects
for each row execute function private.protect_immutable_invoice_pdf();

-- Chat children are published as well because reactions/read receipts are
-- rendered live by the portal. Membership checks keep this idempotent.
alter table public.property_messages replica identity full;
alter table public.message_attachments replica identity full;
alter table public.message_reactions replica identity full;
alter table public.message_reads replica identity full;

do $portal_realtime$
declare
  v_table text;
begin
  if exists (
    select 1 from pg_catalog.pg_publication p
    where p.pubname = 'supabase_realtime'
  ) then
    foreach v_table in array array[
      'property_messages', 'message_attachments', 'message_reactions', 'message_reads'
    ]
    loop
      if not exists (
        select 1
        from pg_catalog.pg_publication_tables pt
        where pt.pubname = 'supabase_realtime'
          and pt.schemaname = 'public'
          and pt.tablename = v_table
      ) then
        execute format('alter publication supabase_realtime add table public.%I', v_table);
      end if;
    end loop;
  end if;
end;
$portal_realtime$;

-- Private functions are not an API. Expose only the boolean/UUID helpers that
-- RLS and Storage policies evaluate in an authenticated request.
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.is_active_profile() to authenticated;
grant execute on function private.current_user_role() to authenticated;
grant execute on function private.is_admin() to authenticated;
grant execute on function private.current_employee_id() to authenticated;
grant execute on function private.is_customer_of_customer(uuid) to authenticated;
grant execute on function private.is_customer_of_property(uuid) to authenticated;
grant execute on function private.is_employee_of_property(uuid) to authenticated;
grant execute on function private.can_access_property(uuid) to authenticated;
grant execute on function private.can_work_visit(uuid) to authenticated;
grant execute on function private.can_access_visit_plan(uuid) to authenticated;
grant execute on function private.can_read_visit(uuid) to authenticated;
grant execute on function private.can_read_visit_task(uuid) to authenticated;
grant execute on function private.can_read_damage(uuid) to authenticated;
grant execute on function private.can_read_operational_report(uuid) to authenticated;
grant execute on function private.can_read_message(uuid) to authenticated;
grant execute on function private.can_read_complaint(uuid) to authenticated;
grant execute on function private.can_read_equipment(uuid) to authenticated;
grant execute on function private.try_uuid(text) to authenticated;
grant execute on all functions in schema private to service_role;

-- ---------------------------------------------------------------------------
-- Legacy read-surface isolation
-- ---------------------------------------------------------------------------
-- Legacy RLS policies were row-correct but exposed internal columns because all
-- application users share the `authenticated` Postgres role. Keep the legacy
-- workflows, but make their direct REST column surface customer/employee-safe.

create table public.project_employee_briefings (
  project_id uuid primary key references public.projects(id) on delete cascade,
  employee_instructions text,
  updated_at timestamptz not null default now()
);

insert into public.project_employee_briefings (project_id, employee_instructions)
select id, employee_instructions
from public.projects
where employee_instructions is not null
on conflict (project_id) do update
set employee_instructions = excluded.employee_instructions,
    updated_at = now();

create table public.project_task_employee_notes (
  project_task_id uuid primary key references public.project_tasks(id) on delete cascade,
  employee_notes text,
  updated_at timestamptz not null default now()
);

insert into public.project_task_employee_notes (project_task_id, employee_notes)
select id, employee_notes
from public.project_tasks
where employee_notes is not null
on conflict (project_task_id) do update
set employee_notes = excluded.employee_notes,
    updated_at = now();

create table public.shift_employee_notes (
  shift_id uuid primary key references public.shifts(id) on delete cascade,
  employee_note text,
  updated_at timestamptz not null default now()
);

insert into public.shift_employee_notes (shift_id, employee_note)
select id, notes
from public.shifts
where notes is not null
on conflict (shift_id) do update
set employee_note = excluded.employee_note,
    updated_at = now();

create or replace function private.sync_legacy_employee_guidance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'projects' then
    insert into public.project_employee_briefings (project_id, employee_instructions, updated_at)
    values (new.id, new.employee_instructions, now())
    on conflict (project_id) do update
    set employee_instructions = excluded.employee_instructions,
        updated_at = now();
  elsif tg_table_name = 'project_tasks' then
    insert into public.project_task_employee_notes (project_task_id, employee_notes, updated_at)
    values (new.id, new.employee_notes, now())
    on conflict (project_task_id) do update
    set employee_notes = excluded.employee_notes,
        updated_at = now();
  elsif tg_table_name = 'shifts' then
    insert into public.shift_employee_notes (shift_id, employee_note, updated_at)
    values (new.id, new.notes, now())
    on conflict (shift_id) do update
    set employee_note = excluded.employee_note,
        updated_at = now();
  end if;
  return new;
end;
$$;

create trigger projects_sync_employee_briefing
after insert or update of employee_instructions on public.projects
for each row execute function private.sync_legacy_employee_guidance();

create trigger project_tasks_sync_employee_notes
after insert or update of employee_notes on public.project_tasks
for each row execute function private.sync_legacy_employee_guidance();

create trigger shifts_sync_employee_notes
after insert or update of notes on public.shifts
for each row execute function private.sync_legacy_employee_guidance();

alter table public.project_employee_briefings enable row level security;
alter table public.project_task_employee_notes enable row level security;
alter table public.shift_employee_notes enable row level security;

create policy project_employee_briefings_admin_all
on public.project_employee_briefings for all to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));
create policy project_employee_briefings_employee_select
on public.project_employee_briefings for select to authenticated
using ((select public.is_employee_assigned(project_id)));

create policy project_task_employee_notes_admin_all
on public.project_task_employee_notes for all to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));
create policy project_task_employee_notes_employee_select
on public.project_task_employee_notes for select to authenticated
using (
  exists (
    select 1 from public.project_tasks pt
    where pt.id = project_task_employee_notes.project_task_id
      and (select public.is_employee_assigned(pt.project_id))
  )
);

create policy shift_employee_notes_admin_all
on public.shift_employee_notes for all to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));
create policy shift_employee_notes_employee_select
on public.shift_employee_notes for select to authenticated
using (
  exists (
    select 1 from public.shifts s
    where s.id = shift_employee_notes.shift_id
      and s.user_id = (select auth.uid())
      and (select private.is_active_profile())
  )
);

revoke all privileges on table
  public.project_employee_briefings,
  public.project_task_employee_notes,
  public.shift_employee_notes
from anon, authenticated;
grant all privileges on table
  public.project_employee_briefings,
  public.project_task_employee_notes,
  public.shift_employee_notes
to service_role;
grant select on table
  public.project_employee_briefings,
  public.project_task_employee_notes,
  public.shift_employee_notes
to authenticated;

revoke select on table
  public.customers,
  public.employee_profiles,
  public.leads,
  public.projects,
  public.project_tasks,
  public.shifts,
  public.shift_tasks,
  public.material_requests,
  public.offers,
  public.invoice_cycles,
  public.invoices,
  public.invoice_items
from anon, authenticated;

grant select (
  id, portal_user_id, status, category, company_name, first_name, last_name,
  contact_name, contact_first_name, contact_last_name, email, phone,
  archived_at, created_at, updated_at
) on public.customers to authenticated;

grant select (
  id, user_id, full_name, first_name, last_name, email, phone, status,
  category, company_name, address_street, address_house_number,
  address_postal_code, address_city, address_country, address_formatted,
  archived_at, created_at, updated_at
) on public.employee_profiles to authenticated;

grant select (
  id, customer_id, source, status, company_name, contact_name, email, phone,
  object_address, object_type, requested_services, frequency,
  desired_start_date, preferred_callback_time, message, created_at, updated_at
) on public.leads to authenticated;

grant select (
  id, customer_id, status, name, object_address, object_type, public_notes,
  primary_employee_id, care_started_at, created_at, updated_at
) on public.projects to authenticated;

grant select (
  id, project_id, title, description, category, interval_label, interval_unit,
  interval_value, seasonal, season_start_month, season_end_month,
  visible_to_customer, sort_order, created_at, updated_at
) on public.project_tasks to authenticated;

grant select (
  id, customer_id, project_id, employee_id, user_id, started_at, ended_at,
  gross_minutes, break_minutes, net_minutes, status,
  customer_visible, created_at, updated_at
) on public.shifts to authenticated;

grant select (id, shift_id, task_id, done, created_at)
  on public.shift_tasks to authenticated;

grant select (
  id, customer_id, project_id, employee_id, user_id, title, category,
  quantity, unit, note, status, created_at, updated_at
) on public.material_requests to authenticated;

grant select (
  id, customer_id, project_id, status, title, intro, net_total, tax_rate,
  tax_total, gross_total, released_at, accepted_at, accepted_by,
  acceptance_name, acceptance_signature, acceptance_confirmed,
  created_at, updated_at, offer_number, document_path, sent_at,
  billing_mode, billing_interval_label, closing_text, billing_in_advance,
  payment_due_days_before_month_end
) on public.offers to authenticated;

grant select (
  id, customer_id, project_id, offer_id, title, status, frequency,
  amount_net, tax_rate, tax_total, amount_gross, billing_in_advance,
  generate_days_before_month_end, next_period_start, last_generated_at,
  created_at, updated_at
) on public.invoice_cycles to authenticated;

grant select (
  id, customer_id, project_id, offer_id, status, invoice_number, title,
  due_date, net_total, tax_rate, tax_total, gross_total, released_at,
  paid_at, created_at, updated_at, document_path, sent_at, source_offer_id,
  service_period_start, service_period_end, billing_note, invoice_cycle_id,
  property_id, billing_month, invoice_date, invoice_kind,
  net_total_cents, tax_total_cents, gross_total_cents, issued_at,
  immutable_at, canceled_at, cancellation_reason, original_pdf_bucket,
  original_pdf_path, original_pdf_sha256, document_content_sha256
) on public.invoices to authenticated;

grant select (
  id, invoice_id, title, description, quantity, unit, unit_net, total_net,
  sort_order, created_at, service_date, unit_net_cents, total_net_cents,
  tax_rate_bps
) on public.invoice_items to authenticated;

revoke execute on function private.sync_legacy_employee_guidance()
  from public, anon, authenticated;

-- Final invariant guard for polymorphic/optional links that cannot be expressed
-- as a simple foreign key.
create or replace function private.assert_portal_relation_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_property_id uuid;
begin
  if tg_table_name = 'visit_plans' then
    if tg_op = 'UPDATE'
      and new.property_id is not distinct from old.property_id
      and new.primary_employee_id is not distinct from old.primary_employee_id
      and new.timezone is not distinct from old.timezone then
      return new;
    end if;
    if not exists (
      select 1 from pg_catalog.pg_timezone_names tz where tz.name = new.timezone
    ) then
      raise exception 'Unbekannte Zeitzone: %', new.timezone;
    end if;
    if new.primary_employee_id is not null and not exists (
      select 1 from public.property_employee_assignments pea
      where pea.property_id = new.property_id
        and pea.employee_id = new.primary_employee_id
        and pea.active = true
    ) then
      raise exception 'Der primäre Mitarbeiter ist der Immobilie nicht aktiv zugewiesen';
    end if;
  elsif tg_table_name = 'visit_plan_employees' then
    select vp.property_id into v_property_id
    from public.visit_plans vp where vp.id = new.visit_plan_id;
    if not exists (
      select 1 from public.property_employee_assignments pea
      where pea.property_id = v_property_id
        and pea.employee_id = new.employee_id
        and pea.active = true
    ) then
      raise exception 'Der Mitarbeiter ist der Immobilie nicht aktiv zugewiesen';
    end if;
  elsif tg_table_name = 'visits' then
    if tg_op = 'UPDATE'
      and new.visit_plan_id is not distinct from old.visit_plan_id
      and new.property_id is not distinct from old.property_id
      and new.primary_employee_id is not distinct from old.primary_employee_id then
      return new;
    end if;
    if new.visit_plan_id is not null and not exists (
      select 1 from public.visit_plans vp
      where vp.id = new.visit_plan_id and vp.property_id = new.property_id
    ) then
      raise exception 'Besuchsplan und Einsatz gehören nicht zur selben Immobilie';
    end if;
    if new.primary_employee_id is not null and not exists (
      select 1 from public.property_employee_assignments pea
      where pea.property_id = new.property_id
        and pea.employee_id = new.primary_employee_id
        and pea.active = true
    ) then
      raise exception 'Der primäre Mitarbeiter ist der Immobilie nicht aktiv zugewiesen';
    end if;
  elsif tg_table_name = 'visit_tasks' then
    if new.property_service_id is not null and not exists (
      select 1 from public.property_services ps
      where ps.id = new.property_service_id and ps.property_id = new.property_id
    ) then
      raise exception 'Leistung und Aufgabe gehören nicht zur selben Immobilie';
    end if;
    if new.damage_report_id is not null and not exists (
      select 1 from public.damage_reports dr
      where dr.id = new.damage_report_id
        and dr.property_id = new.property_id
        and (new.building_id is null or dr.building_id = new.building_id)
    ) then
      raise exception 'Schaden und Aufgabe gehören nicht zur selben Immobilie';
    end if;
    if new.building_id is not null and not exists (
      select 1 from public.visit_buildings vb
      where vb.visit_id = new.visit_id and vb.building_id = new.building_id
    ) then
      raise exception 'Das Aufgabengebäude gehört nicht zum Einsatz';
    end if;
  elsif tg_table_name = 'damage_reports' then
    if new.linked_visit_id is not null and not exists (
      select 1 from public.visits v
      where v.id = new.linked_visit_id and v.property_id = new.property_id
    ) then
      raise exception 'Verknüpfter Einsatz gehört nicht zur Schadensimmobilie';
    end if;
    if new.linked_visit_task_id is not null and not exists (
      select 1 from public.visit_tasks vt
      where vt.id = new.linked_visit_task_id
        and vt.property_id = new.property_id
        and vt.damage_report_id = new.id
    ) then
      raise exception 'Verknüpfte Aufgabe gehört nicht zur Schadensmeldung';
    end if;
  elsif tg_table_name = 'operational_reports' then
    if new.visit_id is not null and not exists (
      select 1 from public.visits v
      where v.id = new.visit_id and v.property_id = new.property_id
    ) then
      raise exception 'Betriebliche Meldung und Einsatz gehören nicht zur selben Immobilie';
    end if;
  elsif tg_table_name = 'complaints' then
    if new.visit_id is not null and not exists (
      select 1 from public.visits v
      where v.id = new.visit_id and v.property_id = new.property_id
    ) then
      raise exception 'Beschwerde und Einsatz gehören nicht zur selben Immobilie';
    end if;
  elsif tg_table_name = 'extra_charges' then
    if new.visit_id is not null and not exists (
      select 1 from public.visits v
      where v.id = new.visit_id and v.property_id = new.property_id
    ) then
      raise exception 'Zusatzleistung und Einsatz gehören nicht zur selben Immobilie';
    end if;
  end if;
  return new;
end;
$$;

create trigger visit_plans_relation_scope
before insert or update on public.visit_plans
for each row execute function private.assert_portal_relation_scope();
create trigger visit_plan_employees_relation_scope
before insert or update on public.visit_plan_employees
for each row execute function private.assert_portal_relation_scope();
create trigger visits_relation_scope
before insert or update on public.visits
for each row execute function private.assert_portal_relation_scope();
create trigger visit_tasks_relation_scope
before insert or update on public.visit_tasks
for each row execute function private.assert_portal_relation_scope();
create trigger damage_reports_relation_scope
before insert or update on public.damage_reports
for each row execute function private.assert_portal_relation_scope();
create trigger operational_reports_relation_scope
before insert or update on public.operational_reports
for each row execute function private.assert_portal_relation_scope();
create trigger complaints_relation_scope
before insert or update on public.complaints
for each row execute function private.assert_portal_relation_scope();
create trigger extra_charges_relation_scope
before insert or update on public.extra_charges
for each row execute function private.assert_portal_relation_scope();

revoke execute on function private.assert_portal_relation_scope()
  from public, anon, authenticated;

-- Supporting indexes for foreign-key checks, RLS joins and operational queues.
create index if not exists user_profiles_role_status_idx
  on public.user_profiles(role, status, onboarding_completed);
create index if not exists invitations_profile_id_idx on public.invitations(profile_id);
create index if not exists invitations_invited_by_idx on public.invitations(invited_by);
create index if not exists customers_status_idx on public.customers(status, archived_at);
create index if not exists employee_profiles_status_idx on public.employee_profiles(status, archived_at);
create index if not exists property_employee_assignments_active_dates_idx
  on public.property_employee_assignments(property_id, active, starts_on, ends_on, employee_id);
create index if not exists visit_plans_created_by_idx on public.visit_plans(created_by);
create index if not exists visits_visit_plan_idx on public.visits(visit_plan_id);
create index if not exists visits_started_by_idx on public.visits(started_by, status, started_at);
create index if not exists visits_completed_by_idx on public.visits(completed_by);
create index if not exists visit_tasks_completed_by_idx on public.visit_tasks(completed_by);
create index if not exists visit_tasks_created_by_idx on public.visit_tasks(created_by);
create index if not exists visit_task_attachments_uploaded_by_idx
  on public.visit_task_attachments(uploaded_by);
create index if not exists visit_time_corrections_corrected_by_idx
  on public.visit_time_corrections(corrected_by);
create index if not exists damage_reports_created_by_idx on public.damage_reports(created_by);
create index if not exists damage_reports_linked_visit_idx on public.damage_reports(linked_visit_id);
create index if not exists damage_reports_linked_task_idx on public.damage_reports(linked_visit_task_id);
create index if not exists damage_reports_reviewed_by_idx on public.damage_reports(reviewed_by);
create index if not exists damage_attachments_uploaded_by_idx on public.damage_attachments(uploaded_by);
create index if not exists operational_reports_equipment_idx on public.operational_reports(equipment_id);
create index if not exists operational_reports_created_by_idx on public.operational_reports(created_by);
create index if not exists operational_reports_reviewed_by_idx on public.operational_reports(reviewed_by);
create index if not exists operational_reports_resolved_by_idx on public.operational_reports(resolved_by);
create index if not exists operational_report_attachments_uploaded_by_idx
  on public.operational_report_attachments(uploaded_by);
create index if not exists equipment_created_by_idx on public.equipment(created_by);
create index if not exists equipment_employee_assignments_equipment_idx
  on public.equipment_employee_assignments(equipment_id, returned_at);
create index if not exists property_messages_related_idx
  on public.property_messages(related_type, related_id)
  where related_type is not null and related_id is not null;
create index if not exists message_attachments_uploaded_by_idx on public.message_attachments(uploaded_by);
create index if not exists complaints_visit_idx on public.complaints(visit_id);
create index if not exists complaint_attachments_uploaded_by_idx on public.complaint_attachments(uploaded_by);
create index if not exists extra_charges_created_by_idx on public.extra_charges(created_by);
create index if not exists notifications_entity_idx on public.notifications(entity_type, entity_id);
