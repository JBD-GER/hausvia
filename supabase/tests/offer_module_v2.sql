-- Hausvia offer module V2 database regression tests
-- Run against a database where all migrations through
-- 20260805142115_offer_module_v2.sql are already installed, for example:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/offer_module_v2.sql
--
-- The suite is one transaction and leaves no fixtures, helper functions or
-- consumed offer numbers behind.

begin;

create or replace function public.__offer_v2_test_assert(
  p_condition boolean,
  p_message text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $assert$
begin
  if p_condition is distinct from true then
    raise exception 'OFFER V2 TEST FAILED: %', p_message;
  end if;
end;
$assert$;

create or replace function public.__offer_v2_test_assert_fails_matching(
  p_statement text,
  p_expected_fragment text,
  p_message text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $assert$
declare
  v_error_message text;
begin
  begin
    execute p_statement;
  exception when others then
    get stacked diagnostics v_error_message = message_text;
  end;

  if v_error_message is null then
    raise exception
      'OFFER V2 TEST FAILED (statement unexpectedly succeeded): %',
      p_message;
  end if;
  if position(lower(p_expected_fragment) in lower(v_error_message)) = 0 then
    raise exception
      'OFFER V2 TEST FAILED (unexpected error: "%", expected fragment: "%"): %',
      v_error_message,
      p_expected_fragment,
      p_message;
  end if;
end;
$assert$;

create or replace function public.__offer_v2_test_assert_fails_sqlstate(
  p_statement text,
  p_expected_sqlstate text,
  p_message text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $assert$
declare
  v_error_sqlstate text;
begin
  begin
    execute p_statement;
  exception when others then
    get stacked diagnostics v_error_sqlstate = returned_sqlstate;
  end;

  if v_error_sqlstate is null then
    raise exception
      'OFFER V2 TEST FAILED (statement unexpectedly succeeded): %',
      p_message;
  end if;
  if v_error_sqlstate <> p_expected_sqlstate then
    raise exception
      'OFFER V2 TEST FAILED (unexpected SQLSTATE: "%", expected: "%"): %',
      v_error_sqlstate,
      p_expected_sqlstate,
      p_message;
  end if;
end;
$assert$;

create or replace function public.__offer_v2_test_payload(
  p_customer_id uuid,
  p_title text,
  p_offer_date date,
  p_valid_until date
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $payload$
  select jsonb_build_object(
    'customer_id', p_customer_id,
    'title', p_title,
    'contact_name', 'Angebot Testkunde',
    'recipient_snapshot', jsonb_build_object(
      'recipient_name', 'Angebot Testkunde',
      'email', 'offer-customer@example.invalid',
      'address', 'Angebotsweg 1',
      'postal_code', '10115',
      'city', 'Berlin',
      'country', 'Deutschland'
    ),
    'object_label', 'Testobjekt Angebot V2',
    'object_address', 'Angebotsweg 1, 10115 Berlin',
    'offer_date', p_offer_date,
    'valid_until', p_valid_until,
    'planned_start_date', p_offer_date + 30,
    'intro', 'Transaktionaler Testentwurf',
    'visible_note', 'Nur die vereinbarten Leistungen sind umfasst.',
    'internal_note', 'Darf nie im Kundenportal lesbar sein.',
    'payment_terms', 'Zahlbar innerhalb von 14 Tagen.',
    'contract_terms', 'Testbedingungen Angebot V2',
    'subtotal_cents', 10000,
    'discount_total_cents', 1000,
    'net_total_cents', 9000,
    'tax_total_cents', 1710,
    'gross_total_cents', 10710,
    'billing_totals', jsonb_build_object(
      'monthly', jsonb_build_object(
        'subtotal_cents', 10000,
        'discount_cents', 1000,
        'net_cents', 9000,
        'tax_cents', 1710,
        'gross_cents', 10710
      )
    ),
    'calculation_snapshot', jsonb_build_object(
      'source', 'offer-module-v2-sql-test'
    ),
    'items', jsonb_build_array(jsonb_build_object(
      'client_key', 'item-1',
      'service_catalog_id', null,
      'item_kind', 'custom',
      'title', 'Monatliche Objektbetreuung',
      'description', 'Vertraglich vereinbarte Testleistung',
      'area_sqm', 0,
      'quantity', 1,
      'unit', 'flat',
      'frequency', 'monthly',
      'frequency_occurrences', 1,
      'billing_type', 'monthly',
      'calculation_type', 'custom',
      'unit_price_cents', 10000,
      'minimum_price_cents', 0,
      'automatic_total_cents', 10000,
      'total_net_cents', 10000,
      'tax_rate_bps', 1900,
      'manual_price', true,
      'permanent', true,
      'seasonal', false,
      'included_visits', 0,
      'additional_visit_price_cents', 0,
      'monthly_base_fee_cents', 0,
      'seasonal_flat_rate_cents', 0,
      'surcharge_cents', 0,
      'visible_note', 'Leistungsumfang laut Angebot.',
      'price_components', jsonb_build_array(jsonb_build_object(
        'bucket', 'monthly',
        'label', 'Monatliche Objektbetreuung',
        'net_cents', 10000
      )),
      'pricing_snapshot', jsonb_build_object(
        'source', 'manual-test',
        'subtotal_cents', 10000,
        'discount_cents', 1000,
        'net_cents', 9000,
        'tax_cents', 1710,
        'gross_cents', 10710,
        'billing_buckets', jsonb_build_object(
          'monthly', jsonb_build_object(
            'subtotal_cents', 10000,
            'discount_cents', 1000,
            'net_cents', 9000,
            'tax_cents', 1710,
            'gross_cents', 10710
          )
        )
      ),
      'sort_order', 10
    )),
    'discounts', jsonb_build_array(jsonb_build_object(
      'scope', 'overall',
      'discount_type', 'fixed',
      'amount_cents', 1000,
      'applied_amount_cents', 1000,
      'reason', 'Testnachlass',
      'sort_order', 10
    ))
  )
$payload$;

grant execute on function public.__offer_v2_test_assert(boolean, text)
  to authenticated, service_role;
grant execute on function public.__offer_v2_test_assert_fails_matching(text, text, text)
  to authenticated, service_role;
grant execute on function public.__offer_v2_test_assert_fails_sqlstate(text, text, text)
  to authenticated, service_role;
grant execute on function public.__offer_v2_test_payload(uuid, text, date, date)
  to authenticated, service_role;

create temporary table __offer_v2_test_numbers (
  position integer primary key,
  offer_number text not null
) on commit drop;
grant select, insert on table __offer_v2_test_numbers
  to authenticated, service_role;

-- Stable UUIDs make role changes and cross-table assertions readable. Only the
-- auth.users foreign keys are bypassed while these isolated fixtures are added.
set local session_replication_role = replica;

insert into public.user_profiles (
  id, role, email, full_name, status, onboarding_completed
) values
  (
    '71000000-0000-0000-0000-000000000001', 'admin',
    'offer-admin@example.invalid', 'Angebot V2 Admin', 'active', true
  ),
  (
    '72000000-0000-0000-0000-000000000001', 'customer',
    'offer-customer@example.invalid', 'Angebot V2 Kunde', 'active', true
  ),
  (
    '73000000-0000-0000-0000-000000000001', 'employee',
    'offer-employee@example.invalid', 'Angebot V2 Mitarbeiter', 'active', true
  );

insert into public.customers (
  id, status, company_name, contact_name, email
) values (
  '7a000000-0000-0000-0000-000000000001', 'active',
  'Angebot V2 Testkunde', 'Angebot Testkunde',
  'offer-customer@example.invalid'
);

insert into public.customer_users (customer_id, user_id, active) values (
  '7a000000-0000-0000-0000-000000000001',
  '72000000-0000-0000-0000-000000000001',
  true
);

insert into public.properties (
  id, customer_id, name, property_type, care_start_date, status
) values
  (
    '7b000000-0000-0000-0000-000000000001',
    '7a000000-0000-0000-0000-000000000001',
    'Angebot V2 Zielobjekt', 'multi_family', current_date, 'active'
  ),
  (
    '7b000000-0000-0000-0000-000000000002',
    '7a000000-0000-0000-0000-000000000001',
    'Angebot V2 Fremdobjekt', 'commercial', current_date, 'active'
  );

insert into public.property_admin_settings (
  property_id, monthly_fee_net_cents, tax_rate_bps, max_visit_minutes
) values (
  '7b000000-0000-0000-0000-000000000001', 0, 1900, 90
);

insert into public.property_compensation_rates (
  id, property_id, net_amount_cents, tax_rate_bps, valid_from,
  valid_until, internal_note, created_by
) values (
  '7b100000-0000-0000-0000-000000000001',
  '7b000000-0000-0000-0000-000000000001',
  0,
  1900,
  current_date,
  null,
  'Bestehender Test-Grundbetrag',
  '71000000-0000-0000-0000-000000000001'
);

insert into public.buildings (
  id, property_id, label, street, house_number, postal_code, city, country,
  formatted_address, qr_token_nonce, qr_token_hash, status
) values
  (
    '7c000000-0000-0000-0000-000000000001',
    '7b000000-0000-0000-0000-000000000001',
    'Angebot V2 Zielgebäude', 'Angebotsweg', '1', '10115', 'Berlin',
    'Deutschland', 'Angebotsweg 1, 10115 Berlin',
    '7c100000-0000-0000-0000-000000000001',
    '1111111111111111111111111111111111111111111111111111111111111111',
    'active'
  ),
  (
    '7c000000-0000-0000-0000-000000000002',
    '7b000000-0000-0000-0000-000000000002',
    'Angebot V2 Fremdgebäude', 'Angebotsweg', '2', '10115', 'Berlin',
    'Deutschland', 'Angebotsweg 2, 10115 Berlin',
    '7c100000-0000-0000-0000-000000000002',
    '2222222222222222222222222222222222222222222222222222222222222222',
    'active'
  );

set local session_replication_role = origin;

-- Freeze invariants must not depend on whatever optional legal information is
-- configured in the database that runs this transactional suite.
update public.company_settings
set legal_name = 'Flaaq Holding GmbH',
    brand_name = 'Hausvia',
    street = 'Angebotsweg',
    house_number = '10',
    postal_code = '10115',
    city = 'Berlin',
    country = 'Deutschland',
    tax_number = '12/345/67890',
    vat_id = null,
    commercial_register = 'Amtsgericht Berlin HRB 123456',
    management = 'Angebot V2 Geschäftsführung',
    email = 'offer-issuer@example.invalid',
    phone = '+49 30 123456',
    bank_name = 'Angebot Testbank',
    iban = 'DE00123456780000000000',
    bic = 'TESTDEFFXXX'
where id = true;

-- Migration postconditions for historic offers: NULL numbers must have received
-- stable LEGACY identifiers, and every existing ANG sequence must start at the
-- highest number already issued for that year.
select public.__offer_v2_test_assert(
  not exists (
    select 1 from public.offers offer
    where offer.offer_number is null
  ),
  'migration must backfill every historic NULL offer number'
);
select public.__offer_v2_test_assert(
  not exists (
    select 1
    from (
      select
        split_part(offer.offer_number, '-', 2)::integer as year,
        max(split_part(offer.offer_number, '-', 3)::bigint) as highest_number
      from public.offers offer
      where offer.offer_number ~ '^ANG-[0-9]{4}-[0-9]{6,}$'
      group by split_part(offer.offer_number, '-', 2)::integer
    ) historic
    left join public.offer_sequences seq on seq.year = historic.year
    where seq.last_value is null
       or seq.last_value < historic.highest_number
  ),
  'migration must seed each yearly sequence behind all historic ANG numbers'
);
select public.__offer_v2_test_assert(
  not exists (
    select 1
    from public.offer_versions version
    where version.calculation_snapshot ->> 'source' = 'legacy-backfill'
      and (
        length(btrim(version.title)) not between 1 and 240
        or version.subtotal_cents < 0
        or version.discount_total_cents < 0
        or version.net_total_cents <> version.subtotal_cents - version.discount_total_cents
        or version.tax_total_cents < 0
        or version.gross_total_cents <> version.net_total_cents + version.tax_total_cents
        or coalesce(
          (version.calculation_snapshot ->> 'tax_rate_bps')::integer,
          -1
        ) not between 0 and 10000
      )
  ) and not exists (
    select 1
    from public.offer_version_items item
    join public.offer_versions version on version.id = item.offer_version_id
    where version.calculation_snapshot ->> 'source' = 'legacy-backfill'
      and (
        length(btrim(item.title)) not between 1 and 240
        or item.quantity <= 0
        or item.unit_price_cents < 0
        or item.total_net_cents < 0
        or item.tax_rate_bps not between 0 and 10000
        or item.sort_order not between 0 and 100000
      )
  ),
  'legacy backfill must normalize blank text and invalid monetary values without losing original snapshots'
);
select public.__offer_v2_test_assert(
  not exists (
    select 1
    from public.offer_versions version
    where version.calculation_snapshot ->> 'source' = 'legacy-backfill'
      and version.lifecycle_status <> 'draft'
      and (
        version.calculation_snapshot ->> 'workflow_mode' <> 'historical_read_only'
        or version.frozen_at is null
        or version.sent_at is null
      )
  ) and not exists (
    select 1
    from public.offer_versions version
    join public.offer_acceptances acceptance
      on acceptance.offer_version_id = version.id
    where version.calculation_snapshot ->> 'source' = 'legacy-backfill'
  ),
  'historic non-draft offers must remain visible evidence but never gain invented acceptance evidence'
);
select public.__offer_v2_test_assert(
  not exists (
    select 1
    from public.offer_versions version
    where version.calculation_snapshot ->> 'source' = 'legacy-backfill'
      and version.calculation_snapshot ->> 'legacy_status' in ('released', 'accepted')
      and (
        version.lifecycle_status <> case
          when version.calculation_snapshot ->> 'legacy_status' = 'released'
            then 'sent'
          else 'accepted'
        end
        or version.original_pdf_bucket is not null
        or version.original_pdf_path is not null
        or version.original_pdf_sha256 is not null
        or version.document_content_sha256 is not null
        or version.calculation_snapshot #>> '{evidence,acceptance_evidence_migrated}' <> 'false'
      )
  ),
  'released and accepted legacy statuses must be preserved as read-only history without fabricated hashes or PDF evidence'
);

-- A user-editable/admin-looking JWT claim alone must not grant administration.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"73000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"role":"admin"}}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '73000000-0000-0000-0000-000000000001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
select public.__offer_v2_test_assert_fails_matching(
  $$select public.next_offer_number(date '2097-01-01')$$,
  'Nur Administratoren dürfen Angebote verwalten',
  'an employee must not mint offer numbers by spoofing an admin claim'
);

-- The active admin profile can mint strictly consecutive, year-scoped numbers.
select set_config(
  'request.jwt.claims',
  '{"sub":"71000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"role":"admin"}}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '71000000-0000-0000-0000-000000000001',
  true
);

insert into __offer_v2_test_numbers (position, offer_number)
values (1, public.next_offer_number(date '2097-01-01'));
insert into __offer_v2_test_numbers (position, offer_number)
values (2, public.next_offer_number(date '2097-12-31'));

select public.__offer_v2_test_assert(
  (
    select count(*) = 2
      and count(distinct offer_number) = 2
      and bool_and(offer_number ~ '^ANG-2097-[0-9]{6,}$')
    from __offer_v2_test_numbers
  ) and (
    select
      split_part(second.offer_number, '-', 3)::bigint
        = split_part(first.offer_number, '-', 3)::bigint + 1
    from __offer_v2_test_numbers first
    join __offer_v2_test_numbers second
      on first.position = 1 and second.position = 2
  ),
  'admin offer numbers must be unique and strictly consecutive within a year'
);

-- Server-side validation must not be bypassable by invoking the draft RPC
-- directly without the TypeScript/Zod boundary.
select public.__offer_v2_test_assert_fails_matching(
  format(
    'select public.save_offer_draft(null, null, %L::jsonb)',
    jsonb_set(
      public.__offer_v2_test_payload(
        '7a000000-0000-0000-0000-000000000001',
        'Ungültiger Empfänger', current_date, current_date + 30
      ),
      '{recipient_snapshot,email}',
      '"keine-adresse"'::jsonb
    )::text
  ),
  'Empfänger-E-Mail-Adresse',
  'direct draft RPC must reject an invalid recipient email'
);
select public.__offer_v2_test_assert_fails_matching(
  format(
    'select public.save_offer_draft(null, null, %L::jsonb)',
    jsonb_set(
      public.__offer_v2_test_payload(
        '7a000000-0000-0000-0000-000000000001',
        'Ungültige Anschrift', current_date, current_date + 30
      ),
      '{recipient_snapshot,address}',
      '""'::jsonb
    )::text
  ),
  'Empfängeranschrift',
  'direct draft RPC must reject an incomplete recipient address'
);
select public.__offer_v2_test_assert_fails_matching(
  format(
    'select public.save_offer_draft(null, null, %L::jsonb)',
    jsonb_set(
      jsonb_set(
        jsonb_set(
          public.__offer_v2_test_payload(
            '7a000000-0000-0000-0000-000000000001',
            'Ungültiger Winterdienst', current_date, current_date + 30
          ),
          '{items,0,item_kind}', '"winter"'::jsonb
        ),
        '{items,0,winter_model}', '"per_visit"'::jsonb
      ),
      '{items,0,seasonal}', 'false'::jsonb
    )::text
  ),
  'saisonale Leistung',
  'direct draft RPC must require winter service to be seasonal'
);
select public.__offer_v2_test_assert_fails_matching(
  format(
    'select public.save_offer_draft(null, null, %L::jsonb)',
    jsonb_set(
      public.__offer_v2_test_payload(
        '7a000000-0000-0000-0000-000000000001',
        'Ungültige Saison', current_date, current_date + 30
      ),
      '{items,0,seasonal}', 'true'::jsonb
    )::text
  ),
  'Start- und Endmonate',
  'direct draft RPC must require both season boundary months'
);
select public.__offer_v2_test_assert_fails_matching(
  format(
    'select public.save_offer_draft(null, null, %L::jsonb)',
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            public.__offer_v2_test_payload(
              '7a000000-0000-0000-0000-000000000001',
              'Winterdienst ohne Modell', current_date, current_date + 30
            ),
            '{items,0,item_kind}', '"winter"'::jsonb
          ),
          '{items,0,seasonal}', 'true'::jsonb
        ),
        '{items,0,season_start_month}', '11'::jsonb
      ),
      '{items,0,season_end_month}', '3'::jsonb
    )::text
  ),
  'Abrechnungsmodell',
  'direct draft RPC must require a winter billing model'
);

-- A draft is created through the public RPC and a second save replaces its
-- mutable children rather than duplicating its version, item or discount.
select public.save_offer_draft(
  null,
  null,
  public.__offer_v2_test_payload(
    '7a000000-0000-0000-0000-000000000001',
    'Angebot V2 Hauptangebot V1',
    current_date,
    current_date + 30
  )
);

select public.__offer_v2_test_assert_fails_sqlstate(
  $$select public.save_offer_draft(
      (
        select id from public.offers
        where title = 'Angebot V2 Hauptangebot V1'
      ),
      null,
      public.__offer_v2_test_payload(
        '7a000000-0000-0000-0000-000000000001',
        'Angebot V2 Konflikt darf nicht speichern',
        current_date,
        current_date + 30
      )
    )$$,
  '40001',
  'an existing draft requires an explicit optimistic-concurrency timestamp'
);

select public.save_offer_draft(
  (
    select id from public.offers
    where title = 'Angebot V2 Hauptangebot V1'
  ),
  (
    select version.updated_at
    from public.offer_versions version
    where version.title = 'Angebot V2 Hauptangebot V1'
  ),
  public.__offer_v2_test_payload(
    '7a000000-0000-0000-0000-000000000001',
    'Angebot V2 Hauptangebot V1',
    current_date,
    current_date + 30
  )
);

select public.__offer_v2_test_assert(
  exists (
    select 1
    from public.offers offer
    join public.offer_versions version
      on version.id = offer.draft_version_id
     and version.offer_id = offer.id
    where offer.title = 'Angebot V2 Hauptangebot V1'
      and offer.lifecycle_status = 'draft'
      and offer.current_version_id = version.id
      and offer.active_version_id is null
      and version.version_number = 1
      and version.lifecycle_status = 'draft'
      and version.frozen_at is null
      and version.subtotal_cents = 10000
      and version.discount_total_cents = 1000
      and version.net_total_cents = 9000
      and version.tax_total_cents = 1710
      and version.gross_total_cents = 10710
  ) and (
    select count(*) = 1
    from public.offer_versions version
    where version.title = 'Angebot V2 Hauptangebot V1'
  ) and (
    select count(*) = 1
    from public.offer_version_items item
    join public.offer_versions version on version.id = item.offer_version_id
    where version.title = 'Angebot V2 Hauptangebot V1'
      and item.client_key = 'item-1'
      and item.total_net_cents = 10000
  ) and (
    select count(*) = 1
    from public.offer_discounts discount
    join public.offer_versions version on version.id = discount.offer_version_id
    where version.title = 'Angebot V2 Hauptangebot V1'
      and discount.applied_amount_cents = 1000
  ),
  'draft save must persist one coherent mutable version without duplicate children'
);

-- Keep one draft-only offer to prove it never crosses the customer boundary.
select public.save_offer_draft(
  null,
  null,
  public.__offer_v2_test_payload(
    '7a000000-0000-0000-0000-000000000001',
    'Angebot V2 Nur Entwurf',
    current_date,
    current_date + 30
  )
);

-- A direct RPC call must not bypass the provider-data requirement enforced by
-- the normal server action. Simulate a stale/incomplete mutable snapshot.
set local role service_role;
update public.offer_versions
set issuer_snapshot = issuer_snapshot - 'bic'
where title = 'Angebot V2 Nur Entwurf';
set local role authenticated;
select public.__offer_v2_test_assert_fails_matching(
  $$select public.freeze_offer_version(
      (
        select id from public.offer_versions
        where title = 'Angebot V2 Nur Entwurf'
      ),
      (
        select updated_at from public.offer_versions
        where title = 'Angebot V2 Nur Entwurf'
      ),
      'abababababababababababababababababababababababababababababababab'
    )$$,
  'Unternehmensdaten vollständig',
  'direct freeze RPC must reject an incomplete issuer snapshot'
);

-- Freezing seals both version content and child rows, even for service_role.
select public.freeze_offer_version(
  (
    select id from public.offer_versions
    where title = 'Angebot V2 Hauptangebot V1'
  ),
  (
    select updated_at from public.offer_versions
    where title = 'Angebot V2 Hauptangebot V1'
  ),
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
);
reset role;

set local role service_role;
select public.__offer_v2_test_assert_fails_matching(
  $$update public.offer_versions
    set title = 'Manipulierter versiegelter Inhalt'
    where title = 'Angebot V2 Hauptangebot V1'$$,
  'Der Inhalt einer versiegelten Angebotsversion ist unveränderlich',
  'a frozen offer version must reject content changes'
);
select public.__offer_v2_test_assert_fails_matching(
  $$update public.offer_version_items
    set title = 'Manipulierte Position'
    where offer_version_id = (
      select id from public.offer_versions
      where title = 'Angebot V2 Hauptangebot V1'
    )$$,
  'Positionen und Rabatte einer versiegelten Angebotsversion sind unveränderlich',
  'frozen offer items must reject changes'
);
select public.__offer_v2_test_assert_fails_matching(
  $$update public.offer_version_items
    set offer_version_id = (
          select id from public.offer_versions
          where title = 'Angebot V2 Nur Entwurf'
        ),
        client_key = 'moved-from-frozen-version'
    where offer_version_id = (
      select id from public.offer_versions
      where title = 'Angebot V2 Hauptangebot V1'
    )$$,
  'Positionen und Rabatte einer versiegelten Angebotsversion sind unveränderlich',
  'a child row must not be moved out of a frozen offer version'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"71000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"role":"admin"}}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '71000000-0000-0000-0000-000000000001',
  true
);

select public.finalize_offer_send(
  (
    select id from public.offer_versions
    where title = 'Angebot V2 Hauptangebot V1'
  ),
  'offer-pdfs',
  'offer-v2-tests/main-v1.pdf',
  'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
);

-- Finalization is idempotent only for the exact immutable original.
select public.finalize_offer_send(
  (
    select id from public.offer_versions
    where title = 'Angebot V2 Hauptangebot V1'
  ),
  'offer-pdfs',
  'offer-v2-tests/main-v1.pdf',
  'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
);
select public.__offer_v2_test_assert_fails_matching(
  $$select public.finalize_offer_send(
      (
        select id from public.offer_versions
        where title = 'Angebot V2 Hauptangebot V1'
      ),
      'offer-pdfs',
      'offer-v2-tests/other-main-v1.pdf',
      'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
    )$$,
  'bereits mit einem anderen Original versendet',
  'a sent version must not be finalized with another original'
);

select public.__offer_v2_test_assert(
  exists (
    select 1
    from public.offers offer
    join public.offer_versions version on version.id = offer.active_version_id
    where version.title = 'Angebot V2 Hauptangebot V1'
      and offer.current_version_id = version.id
      and offer.draft_version_id is null
      and offer.lifecycle_status = 'sent'
      and offer.status = 'released'
      and version.lifecycle_status = 'sent'
      and version.frozen_at is not null
      and version.sent_at is not null
      and version.original_pdf_path = 'offer-v2-tests/main-v1.pdf'
  ),
  'send must atomically activate the frozen version and its original PDF'
);
reset role;

set local role service_role;
select public.__offer_v2_test_assert_fails_matching(
  $$update public.offer_versions
    set original_pdf_path = 'offer-v2-tests/tampered.pdf'
    where title = 'Angebot V2 Hauptangebot V1'$$,
  'Das Original-PDF einer Angebotsversion ist unveränderlich',
  'the sent original PDF reference must be immutable'
);
select public.__offer_v2_test_assert_fails_matching(
  $$update public.offer_versions
    set sent_at = sent_at + interval '1 second'
    where title = 'Angebot V2 Hauptangebot V1'$$,
  'Der erste Versandzeitpunkt ist unveränderlich',
  'the first send timestamp must be immutable'
);
reset role;

-- Saving after send creates a separate revision while the old active version
-- remains unchanged until the new revision is frozen and finalized.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"71000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"role":"admin"}}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '71000000-0000-0000-0000-000000000001',
  true
);

select public.save_offer_draft(
  (
    select offer_id from public.offer_versions
    where title = 'Angebot V2 Hauptangebot V1'
  ),
  null,
  public.__offer_v2_test_payload(
    '7a000000-0000-0000-0000-000000000001',
    'Angebot V2 Hauptangebot V2',
    current_date,
    current_date + 30
  )
);

select public.__offer_v2_test_assert(
  exists (
    select 1
    from public.offers offer
    join public.offer_versions active on active.id = offer.active_version_id
    join public.offer_versions draft on draft.id = offer.draft_version_id
    where active.title = 'Angebot V2 Hauptangebot V1'
      and active.lifecycle_status = 'sent'
      and draft.title = 'Angebot V2 Hauptangebot V2'
      and draft.version_number = 2
      and draft.lifecycle_status = 'draft'
      and offer.current_version_id = draft.id
  ),
  'a revision draft must not mutate the currently active sent version'
);

select public.freeze_offer_version(
  (
    select id from public.offer_versions
    where title = 'Angebot V2 Hauptangebot V2'
  ),
  (
    select updated_at from public.offer_versions
    where title = 'Angebot V2 Hauptangebot V2'
  ),
  'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'
);
select public.finalize_offer_send(
  (
    select id from public.offer_versions
    where title = 'Angebot V2 Hauptangebot V2'
  ),
  'offer-pdfs',
  'offer-v2-tests/main-v2.pdf',
  'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd'
);

select public.__offer_v2_test_assert(
  exists (
    select 1
    from public.offers offer
    join public.offer_versions active on active.id = offer.active_version_id
    join public.offer_versions old
      on old.offer_id = offer.id and old.version_number = 1
    where active.title = 'Angebot V2 Hauptangebot V2'
      and active.version_number = 2
      and active.lifecycle_status = 'sent'
      and old.lifecycle_status = 'superseded'
      and old.superseded_at is not null
      and offer.current_version_id = active.id
      and offer.draft_version_id is null
  ),
  'sending a revision must activate it and supersede the prior version atomically'
);

-- Prepare, but do not send, a third revision. If the customer accepts the
-- currently active V2 in the meantime, this frozen draft must never replace it.
select public.save_offer_draft(
  (
    select offer_id from public.offer_versions
    where title = 'Angebot V2 Hauptangebot V2'
  ),
  null,
  public.__offer_v2_test_payload(
    '7a000000-0000-0000-0000-000000000001',
    'Angebot V2 Blockierter Draft V3',
    current_date,
    current_date + 30
  )
);
select public.freeze_offer_version(
  (
    select id from public.offer_versions
    where title = 'Angebot V2 Blockierter Draft V3'
  ),
  (
    select updated_at from public.offer_versions
    where title = 'Angebot V2 Blockierter Draft V3'
  ),
  '1212121212121212121212121212121212121212121212121212121212121212'
);

-- A separately sent but already expired offer exercises the validity guard.
select public.save_offer_draft(
  null,
  null,
  public.__offer_v2_test_payload(
    '7a000000-0000-0000-0000-000000000001',
    'Angebot V2 Abgelaufen',
    current_date - 30,
    current_date - 1
  )
);
select public.freeze_offer_version(
  (
    select id from public.offer_versions
    where title = 'Angebot V2 Abgelaufen'
  ),
  (
    select updated_at from public.offer_versions
    where title = 'Angebot V2 Abgelaufen'
  ),
  'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
);
select public.finalize_offer_send(
  (
    select id from public.offer_versions
    where title = 'Angebot V2 Abgelaufen'
  ),
  'offer-pdfs',
  'offer-v2-tests/expired.pdf',
  'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
);

-- A synthetic historic sent record proves that the migration marker keeps
-- evidence readable without enabling a newly invented acceptance transition.
select public.save_offer_draft(
  null,
  null,
  jsonb_set(
    public.__offer_v2_test_payload(
      '7a000000-0000-0000-0000-000000000001',
      'Angebot V2 Historisch Schreibgeschützt',
      current_date,
      current_date + 30
    ),
    '{calculation_snapshot}',
    jsonb_build_object(
      'source', 'legacy-read-only-regression',
      'workflow_mode', 'historical_read_only'
    )
  )
);
select public.freeze_offer_version(
  (
    select id from public.offer_versions
    where title = 'Angebot V2 Historisch Schreibgeschützt'
  ),
  (
    select updated_at from public.offer_versions
    where title = 'Angebot V2 Historisch Schreibgeschützt'
  ),
  '4545454545454545454545454545454545454545454545454545454545454545'
);
select public.finalize_offer_send(
  (
    select id from public.offer_versions
    where title = 'Angebot V2 Historisch Schreibgeschützt'
  ),
  'offer-pdfs',
  'offer-v2-tests/historical-read-only.pdf',
  '5656565656565656565656565656565656565656565656565656565656565656'
);
reset role;

-- Customer RLS exposes frozen history for that customer, but never draft-only
-- content or internal columns. Employees are excluded from all offer rows.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"72000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '72000000-0000-0000-0000-000000000001',
  true
);

select public.__offer_v2_test_assert(
  (
    select count(*) = 3
    from public.offers
    where customer_id = '7a000000-0000-0000-0000-000000000001'
  ) and (
    select count(*) = 4
    from public.offer_versions
    where customer_id = '7a000000-0000-0000-0000-000000000001'
  ) and not exists (
    select 1 from public.offer_versions
    where title = 'Angebot V2 Nur Entwurf'
  ) and not exists (
    select 1 from public.offer_versions
    where title = 'Angebot V2 Blockierter Draft V3'
  ) and (
    select count(*) = 4
    from public.offer_version_items
  ) and (
    select count(*) = 4
    from public.offer_discounts
  ),
  'customer RLS must expose only its frozen offer history and children'
);
select public.__offer_v2_test_assert(
  not has_column_privilege(
    'authenticated',
    'public.offer_versions',
    'internal_note',
    'select'
  ),
  'authenticated portal SQL must not receive the internal offer-note column'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"73000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '73000000-0000-0000-0000-000000000001',
  true
);
select public.__offer_v2_test_assert(
  (select count(*) = 0 from public.offers)
  and (select count(*) = 0 from public.offer_versions)
  and (select count(*) = 0 from public.offer_version_items)
  and (select count(*) = 0 from public.offer_discounts),
  'employees must not read customer offers or their commercial details'
);
reset role;

-- Acceptance is customer-only and binds exactly one active, unexpired version
-- to the gross amount and content hash that were originally sent.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"72000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '72000000-0000-0000-0000-000000000001',
  true
);

select public.mark_offer_viewed((
  select id from public.offer_versions
  where title = 'Angebot V2 Historisch Schreibgeschützt'
));
select public.__offer_v2_test_assert(
  exists (
    select 1
    from public.offer_versions version
    where version.title = 'Angebot V2 Historisch Schreibgeschützt'
      and version.lifecycle_status = 'sent'
      and version.viewed_at is null
  ),
  'view tracking must not mutate a historic read-only offer'
);
select public.__offer_v2_test_assert_fails_matching(
  $$select public.accept_offer_version(
      (
        select id from public.offer_versions
        where title = 'Angebot V2 Historisch Schreibgeschützt'
      ),
      'Angebot Testkunde', true, 10710, null, null, 'offer-v2-sql-test'
    )$$,
  'Historische Angebote sind schreibgeschützt',
  'a historic released offer must require a newly sent revision before acceptance'
);

select public.__offer_v2_test_assert_fails_matching(
  $$select public.accept_offer_version(
      (
        select id from public.offer_versions
        where title = 'Angebot V2 Hauptangebot V2'
      ),
      'Angebot Testkunde', true, 10711, null, null, 'offer-v2-sql-test'
    )$$,
  'Der bestätigte Angebotsbetrag stimmt nicht mit der Version überein',
  'acceptance must reject even a one-cent amount mismatch'
);
select public.__offer_v2_test_assert_fails_matching(
  $$select public.accept_offer_version(
      (
        select id from public.offer_versions
        where title = 'Angebot V2 Hauptangebot V1'
      ),
      'Angebot Testkunde', true, 10710, null, null, 'offer-v2-sql-test'
    )$$,
  'Diese Angebotsversion wurde ersetzt',
  'acceptance must reject a superseded non-active version'
);
select public.accept_offer_version(
  (
    select id from public.offer_versions
    where title = 'Angebot V2 Abgelaufen'
  ),
  'Angebot Testkunde', true, 10710, null, null, 'offer-v2-sql-test'
);

select public.__offer_v2_test_assert(
  not exists (
    select 1 from public.offer_acceptances
  ) and exists (
    select 1 from public.offer_versions
    where title = 'Angebot V2 Hauptangebot V2'
      and lifecycle_status = 'sent'
  ) and exists (
    select 1
    from public.offer_versions version
    join public.offers offer on offer.id = version.offer_id
    where version.title = 'Angebot V2 Abgelaufen'
      and version.lifecycle_status = 'expired'
      and offer.lifecycle_status = 'expired'
  ),
  'invalid acceptance attempts must create no decision and must persist expiry'
);

select public.accept_offer_version(
  (
    select id from public.offer_versions
    where title = 'Angebot V2 Hauptangebot V2'
  ),
  'Angebot Testkunde',
  true,
  10710,
  'Verbindlich bestätigt.',
  '192.0.2.10',
  'offer-v2-sql-test'
);

-- The acceptance row is customer-readable, while the delivery outbox remains
-- deliberately hidden from the customer by its admin-only SELECT policy.
select public.__offer_v2_test_assert(
  exists (
    select 1
    from public.offer_acceptances acceptance
    join public.offer_versions version
      on version.id = acceptance.offer_version_id
    join public.offers offer on offer.id = acceptance.offer_id
    where version.title = 'Angebot V2 Hauptangebot V2'
      and offer.active_version_id = version.id
      and version.lifecycle_status = 'accepted'
      and offer.lifecycle_status = 'accepted'
      and acceptance.accepted_by = '72000000-0000-0000-0000-000000000001'
      and acceptance.confirmed_gross_total_cents = 10710
      and acceptance.confirmed_content_sha256
        = 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'
      and acceptance.confirmed_totals = version.billing_totals
  ) and not exists (
    select 1 from public.offer_acceptance_delivery_jobs
  ),
  'valid acceptance must atomically freeze actor, amount, totals and content hash'
);
select public.__offer_v2_test_assert(
  not has_function_privilege(
    'authenticated',
    'public.finalize_offer_acceptance_document(uuid,text,text,text)',
    'execute'
  ) and exists (
    select 1 from public.offer_acceptances acceptance
    join public.offer_versions version
      on version.id = acceptance.offer_version_id
    where version.title = 'Angebot V2 Hauptangebot V2'
      and acceptance.confirmation_pdf_path is null
  ),
  'customers must not execute or pre-fill acceptance-document finalization'
);
reset role;

-- Object linking is one database transaction. First provoke a late validation
-- error after the link row would have been inserted, then prove no partial link,
-- imported service, lifecycle change or audit survived the failed statement.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"71000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"role":"admin"}}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '71000000-0000-0000-0000-000000000001',
  true
);

select public.__offer_v2_test_assert(
  exists (
    select 1
    from public.offer_acceptance_delivery_jobs job
    join public.offer_acceptances acceptance
      on acceptance.id = job.acceptance_id
    join public.offer_versions version
      on version.id = acceptance.offer_version_id
    where version.title = 'Angebot V2 Hauptangebot V2'
      and job.status = 'pending'
      and job.attempts = 0
      and job.available_at is not null
      and job.last_error is null
  )
  and has_table_privilege(
    'service_role',
    'public.offer_acceptance_delivery_jobs',
    'update'
  ),
  'acceptance must atomically enqueue one durable service-role delivery job'
);

select public.__offer_v2_test_assert_fails_matching(
  $$select public.finalize_offer_send(
      (
        select id from public.offer_versions
        where title = 'Angebot V2 Blockierter Draft V3'
      ),
      'offer-pdfs',
      'offer-v2-tests/forbidden-after-acceptance.pdf',
      '3434343434343434343434343434343434343434343434343434343434343434'
    )$$,
  'Die Angebotsversion ist nicht für den Versand vorbereitet',
  'an accepted active version must not be displaced by a prepared draft'
);
select public.__offer_v2_test_assert(
  exists (
    select 1
    from public.offers offer
    join public.offer_versions active on active.id = offer.active_version_id
    join public.offer_versions draft on draft.offer_id = offer.id
    where active.title = 'Angebot V2 Hauptangebot V2'
      and active.lifecycle_status = 'accepted'
      and draft.title = 'Angebot V2 Blockierter Draft V3'
      and draft.lifecycle_status = 'superseded'
      and draft.superseded_at is not null
      and draft.frozen_at is not null
      and draft.sent_at is null
      and draft.original_pdf_path is null
      and offer.current_version_id = active.id
      and offer.draft_version_id is null
      and offer.lifecycle_status = 'accepted'
  ),
  'acceptance must discard the prepared draft and prevent its later finalization'
);

select public.__offer_v2_test_assert_fails_matching(
  format(
    'select public.link_accepted_offer_to_property(%L::uuid, %L::uuid, %L::jsonb)',
    (
      select id::text from public.offer_versions
      where title = 'Angebot V2 Hauptangebot V2'
    ),
    '7b000000-0000-0000-0000-000000000001',
    jsonb_build_array(jsonb_build_object(
      'item_id', '7d000000-0000-0000-0000-000000000001',
      'scope', 'property'
    ))::text
  ),
  'unbekannte item_id',
  'object import must reject assignment rows for unknown offer items'
);
select public.__offer_v2_test_assert_fails_matching(
  format(
    'select public.link_accepted_offer_to_property(%L::uuid, %L::uuid, %L::jsonb)',
    (
      select id::text from public.offer_versions
      where title = 'Angebot V2 Hauptangebot V2'
    ),
    '7b000000-0000-0000-0000-000000000001',
    (
      select jsonb_build_array(
        jsonb_build_object('item_id', item.id, 'scope', 'property'),
        jsonb_build_object('item_id', item.id, 'scope', 'property')
      )
      from public.offer_version_items item
      join public.offer_versions version on version.id = item.offer_version_id
      where version.title = 'Angebot V2 Hauptangebot V2'
    )::text
  ),
  'nur einmal zugeordnet',
  'object import must reject duplicate assignment rows for one offer item'
);

select public.__offer_v2_test_assert_fails_matching(
  format(
    'select public.link_accepted_offer_to_property(%L::uuid, %L::uuid, %L::jsonb)',
    (
      select id::text from public.offer_versions
      where title = 'Angebot V2 Hauptangebot V2'
    ),
    '7b000000-0000-0000-0000-000000000001',
    jsonb_build_array(jsonb_build_object(
      'item_id', (
        select item.id::text
        from public.offer_version_items item
        join public.offer_versions version on version.id = item.offer_version_id
        where version.title = 'Angebot V2 Hauptangebot V2'
      ),
      'scope', 'buildings',
      'building_ids', jsonb_build_array(
        '7c000000-0000-0000-0000-000000000002'
      )
    ))::text
  ),
  'Mindestens ein ausgewähltes Gebäude gehört nicht aktiv zur Immobilie',
  'invalid building assignment must abort the complete object import'
);

select public.__offer_v2_test_assert(
  not exists (
    select 1
    from public.offer_property_links link
    join public.offer_versions version on version.id = link.offer_version_id
    where version.title = 'Angebot V2 Hauptangebot V2'
  ) and not exists (
    select 1
    from public.property_services service
    join public.offer_version_items item
      on item.id = service.source_offer_version_item_id
    join public.offer_versions version on version.id = item.offer_version_id
    where version.title = 'Angebot V2 Hauptangebot V2'
  ) and exists (
    select 1
    from public.offer_versions version
    join public.offers offer on offer.id = version.offer_id
    where version.title = 'Angebot V2 Hauptangebot V2'
      and version.lifecycle_status = 'accepted'
      and offer.lifecycle_status = 'accepted'
  ) and not exists (
    select 1 from public.audit_logs audit
    join public.offer_versions version
      on version.offer_id = audit.entity_id
    where version.title = 'Angebot V2 Hauptangebot V2'
      and audit.action = 'offer.linked_to_property'
  ),
  'failed object linking must not leave any partial database state'
);

select public.link_accepted_offer_to_property(
  (
    select id from public.offer_versions
    where title = 'Angebot V2 Hauptangebot V2'
  ),
  '7b000000-0000-0000-0000-000000000001',
  jsonb_build_array(jsonb_build_object(
    'item_id', (
      select item.id::text
      from public.offer_version_items item
      join public.offer_versions version on version.id = item.offer_version_id
      where version.title = 'Angebot V2 Hauptangebot V2'
    ),
    'scope', 'buildings',
    'building_ids', jsonb_build_array(
      '7c000000-0000-0000-0000-000000000001'
    )
  ))
);

select public.__offer_v2_test_assert(
  exists (
    select 1
    from public.offer_property_links link
    join public.offer_versions version on version.id = link.offer_version_id
    join public.offers offer on offer.id = link.offer_id
    where version.title = 'Angebot V2 Hauptangebot V2'
      and link.property_id = '7b000000-0000-0000-0000-000000000001'
      and link.import_completed_at is not null
      and version.lifecycle_status = 'linked'
      and offer.lifecycle_status = 'linked'
      and offer.active_version_id = version.id
  ) and exists (
    select 1
    from public.property_services service
    join public.offer_version_items item
      on item.id = service.source_offer_version_item_id
    join public.offer_versions version on version.id = item.offer_version_id
    where version.title = 'Angebot V2 Hauptangebot V2'
      and service.property_id = '7b000000-0000-0000-0000-000000000001'
      and service.status = 'active'
      and service.name = item.title
      and service.execution_rule = 'once_monthly'
      and service.end_date is null
      and item.permanent = true
      and item.billing_type = 'monthly'
  ) and exists (
    select 1
    from public.offer_property_item_links item_link
    join public.offer_property_links offer_link
      on offer_link.id = item_link.offer_property_link_id
    join public.offer_versions version
      on version.id = offer_link.offer_version_id
    where version.title = 'Angebot V2 Hauptangebot V2'
      and item_link.scope = 'buildings'
      and item_link.agreed_price_snapshot ->> 'subtotal_before_discount_cents' = '10000'
      and item_link.agreed_price_snapshot ->> 'discount_cents' = '1000'
      and item_link.agreed_price_snapshot ->> 'net_cents' = '9000'
      and item_link.agreed_price_snapshot #>> '{billing_buckets,monthly,net_cents}' = '9000'
      and not (item_link.agreed_price_snapshot ? 'subtotal_cents')
  ) and exists (
    select 1
    from public.property_service_buildings building_link
    join public.property_services service
      on service.id = building_link.property_service_id
    join public.offer_version_items item
      on item.id = service.source_offer_version_item_id
    join public.offer_versions version on version.id = item.offer_version_id
    where version.title = 'Angebot V2 Hauptangebot V2'
      and building_link.building_id = '7c000000-0000-0000-0000-000000000001'
  ) and exists (
    select 1
    from public.property_service_instructions instruction
    join public.property_services service
      on service.id = instruction.property_service_id
    join public.offer_version_items item
      on item.id = service.source_offer_version_item_id
    join public.offer_versions version on version.id = item.offer_version_id
    where version.title = 'Angebot V2 Hauptangebot V2'
      and instruction.internal_instruction
        = 'Vertraglicher Angebotshinweis: Leistungsumfang laut Angebot.'
      and instruction.updated_by = '71000000-0000-0000-0000-000000000001'
  ) and exists (
    select 1 from public.property_admin_settings
    where property_id = '7b000000-0000-0000-0000-000000000001'
      and monthly_fee_net_cents = 0
  ) and exists (
    select 1
    from public.property_compensation_rates rate
    where rate.property_id = '7b000000-0000-0000-0000-000000000001'
      and rate.net_amount_cents = 9000
      and rate.tax_rate_bps = 1900
      and rate.valid_from = current_date + 30
      and rate.valid_until is null
      and rate.internal_note like 'Vertraglicher Monatswert aus Angebot %'
  ) and exists (
    select 1
    from public.property_compensation_rates rate
    where rate.id = '7b100000-0000-0000-0000-000000000001'
      and rate.net_amount_cents = 0
      and rate.valid_from = current_date
      and rate.valid_until = current_date + 29
  ) and (
    select count(*) = 1
    from public.audit_logs audit
    join public.offer_versions version on version.offer_id = audit.entity_id
    where version.title = 'Angebot V2 Hauptangebot V2'
      and audit.action = 'offer.linked_to_property'
      and audit.metadata ->> 'property_id'
        = '7b000000-0000-0000-0000-000000000001'
  ),
  'successful object linking must atomically import services, scope, pricing and lifecycle'
);

-- Prepare a separate accepted but deliberately unlinked offer. The building
-- RPC must create the building and perform the initial offer link itself.
select public.save_offer_draft(
  null,
  null,
  public.__offer_v2_test_payload(
    '7a000000-0000-0000-0000-000000000001',
    'Angebot V2 Neues Gebäude',
    current_date,
    current_date + 30
  )
);
select public.freeze_offer_version(
  (
    select id from public.offer_versions
    where title = 'Angebot V2 Neues Gebäude'
  ),
  (
    select updated_at from public.offer_versions
    where title = 'Angebot V2 Neues Gebäude'
  ),
  '6767676767676767676767676767676767676767676767676767676767676767'
);
select public.finalize_offer_send(
  (
    select id from public.offer_versions
    where title = 'Angebot V2 Neues Gebäude'
  ),
  'offer-pdfs',
  'offer-v2-tests/new-building.pdf',
  '7878787878787878787878787878787878787878787878787878787878787878'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"72000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '72000000-0000-0000-0000-000000000001',
  true
);
select public.accept_offer_version(
  (
    select id from public.offer_versions
    where title = 'Angebot V2 Neues Gebäude'
  ),
  'Angebot Testkunde',
  true,
  10710,
  'Gebäudeangebot angenommen.',
  '192.0.2.11',
  'offer-v2-sql-test'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"71000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"role":"admin"}}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '71000000-0000-0000-0000-000000000001',
  true
);
select public.__offer_v2_test_assert(
  exists (
    select 1
    from public.offer_versions version
    join public.offers offer on offer.id = version.offer_id
    where version.title = 'Angebot V2 Neues Gebäude'
      and version.lifecycle_status = 'accepted'
      and offer.lifecycle_status = 'accepted'
      and offer.active_version_id = version.id
  ) and not exists (
    select 1
    from public.offer_property_links link
    join public.offer_versions version on version.id = link.offer_version_id
    where version.title = 'Angebot V2 Neues Gebäude'
  ),
  'building-from-offer fixture must start as an accepted, unlinked active version'
);

select public.__offer_v2_test_assert(
  not has_function_privilege(
    'service_role',
    'public.admin_create_building_from_offer(jsonb,uuid)',
    'execute'
  ) and not has_function_privilege(
    'authenticated',
    'public.claim_offer_acceptance_delivery_job(uuid)',
    'execute'
  ),
  'building creation is authenticated-admin only and outbox claiming is service-role only'
);

select public.admin_create_building_from_offer(
  jsonb_build_object(
    'building_id', '7c000000-0000-0000-0000-000000000003',
    'property_id', '7b000000-0000-0000-0000-000000000001',
    'label', 'Angebot V2 Zusatzgebäude',
    'street', 'Angebotsweg',
    'house_number', '3',
    'postal_code', '10115',
    'city', 'Berlin',
    'country', 'Deutschland',
    'formatted_address', 'Angebotsweg 3, 10115 Berlin',
    'qr_token_nonce', '7c100000-0000-0000-0000-000000000003',
    'qr_token_hash', '3333333333333333333333333333333333333333333333333333333333333333',
    'access_notes', 'Zugang über den hinteren Hof.'
  ),
  (
    select id from public.offer_versions
    where title = 'Angebot V2 Neues Gebäude'
  )
);

select public.__offer_v2_test_assert(
  exists (
    select 1
    from public.buildings building
    where building.id = '7c000000-0000-0000-0000-000000000003'
      and building.property_id = '7b000000-0000-0000-0000-000000000001'
      and building.status = 'active'
      and building.formatted_address = 'Angebotsweg 3, 10115 Berlin'
  ) and exists (
    select 1
    from public.building_access_notes note
    where note.building_id = '7c000000-0000-0000-0000-000000000003'
      and note.access_notes = 'Zugang über den hinteren Hof.'
      and note.updated_by = '71000000-0000-0000-0000-000000000001'
  ) and not exists (
    select 1
    from public.offer_property_item_links item_link
    join public.offer_property_links offer_link
      on offer_link.id = item_link.offer_property_link_id
    where offer_link.offer_version_id = (
        select id from public.offer_versions
        where title = 'Angebot V2 Neues Gebäude'
      )
      and item_link.scope = 'buildings'
      and not exists (
        select 1
        from public.property_service_buildings building_link
        where building_link.property_service_id = item_link.property_service_id
          and building_link.building_id = '7c000000-0000-0000-0000-000000000003'
      )
  ) and exists (
    select 1
    from public.audit_logs audit
    where audit.entity_table = 'buildings'
      and audit.entity_id = '7c000000-0000-0000-0000-000000000003'
      and audit.action = 'building.created_from_offer'
      and audit.metadata ->> 'offer_property_link_id' = (
        select link.id::text
        from public.offer_property_links link
        join public.offer_versions version on version.id = link.offer_version_id
        where version.title = 'Angebot V2 Neues Gebäude'
      )
      and audit.metadata ->> 'assigned_service_count' = '1'
  ) and exists (
    select 1
    from public.offer_versions version
    join public.offers offer on offer.id = version.offer_id
    join public.offer_property_links link on link.offer_version_id = version.id
    where version.title = 'Angebot V2 Neues Gebäude'
      and version.lifecycle_status = 'linked'
      and offer.lifecycle_status = 'linked'
      and link.property_id = '7b000000-0000-0000-0000-000000000001'
      and link.import_completed_at is not null
  ),
  'building-from-offer must atomically create address, access note, audit and all building-scoped assignments'
);

reset role;
set local role service_role;
select set_config(
  'request.jwt.claims',
  '{"role":"service_role"}',
  true
);
select set_config('request.jwt.claim.role', 'service_role', true);

select public.claim_offer_acceptance_delivery_job((
  select job.id
  from public.offer_acceptance_delivery_jobs job
  join public.offer_acceptances acceptance on acceptance.id = job.acceptance_id
  join public.offer_versions version on version.id = acceptance.offer_version_id
  where version.title = 'Angebot V2 Hauptangebot V2'
));
select public.__offer_v2_test_assert(
  exists (
    select 1
    from public.offer_acceptance_delivery_jobs job
    join public.offer_acceptances acceptance on acceptance.id = job.acceptance_id
    join public.offer_versions version on version.id = acceptance.offer_version_id
    where version.title = 'Angebot V2 Hauptangebot V2'
      and job.status = 'processing'
      and job.attempts = 1
      and job.processing_started_at is not null
      and job.last_attempt_at is not null
  ),
  'service worker must atomically claim a pending acceptance delivery job'
);

select public.complete_offer_acceptance_delivery_job(
  (
    select job.id
    from public.offer_acceptance_delivery_jobs job
    join public.offer_acceptances acceptance on acceptance.id = job.acceptance_id
    join public.offer_versions version on version.id = acceptance.offer_version_id
    where version.title = 'Angebot V2 Hauptangebot V2'
  ),
  false,
  'Simulierter Zustellfehler',
  3600
);
select public.__offer_v2_test_assert(
  exists (
    select 1
    from public.offer_acceptance_delivery_jobs job
    join public.offer_acceptances acceptance on acceptance.id = job.acceptance_id
    join public.offer_versions version on version.id = acceptance.offer_version_id
    where version.title = 'Angebot V2 Hauptangebot V2'
      and job.status = 'failed'
      and job.attempts = 1
      and job.failed_at is not null
      and job.available_at > now()
      and job.last_error = 'Simulierter Zustellfehler'
  ),
  'failed delivery must remain durable with retry time and error evidence'
);

-- Explicit claims intentionally bypass available_at so an admin-triggered retry
-- can run immediately through the service worker.
select public.claim_offer_acceptance_delivery_job((
  select job.id
  from public.offer_acceptance_delivery_jobs job
  join public.offer_acceptances acceptance on acceptance.id = job.acceptance_id
  join public.offer_versions version on version.id = acceptance.offer_version_id
  where version.title = 'Angebot V2 Hauptangebot V2'
));
select public.complete_offer_acceptance_delivery_job(
  (
    select job.id
    from public.offer_acceptance_delivery_jobs job
    join public.offer_acceptances acceptance on acceptance.id = job.acceptance_id
    join public.offer_versions version on version.id = acceptance.offer_version_id
    where version.title = 'Angebot V2 Hauptangebot V2'
  ),
  true,
  null,
  300
);
select public.complete_offer_acceptance_delivery_job(
  (
    select job.id
    from public.offer_acceptance_delivery_jobs job
    join public.offer_acceptances acceptance on acceptance.id = job.acceptance_id
    join public.offer_versions version on version.id = acceptance.offer_version_id
    where version.title = 'Angebot V2 Hauptangebot V2'
  ),
  true,
  null,
  300
);
select public.__offer_v2_test_assert(
  exists (
    select 1
    from public.offer_acceptance_delivery_jobs job
    join public.offer_acceptances acceptance on acceptance.id = job.acceptance_id
    join public.offer_versions version on version.id = acceptance.offer_version_id
    where version.title = 'Angebot V2 Hauptangebot V2'
      and job.status = 'sent'
      and job.attempts = 2
      and job.sent_at is not null
      and job.failed_at is null
      and job.last_error is null
  ),
  'an explicit retry must be claimable immediately and complete idempotently'
);

rollback;
