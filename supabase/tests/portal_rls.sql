-- Hausvia Portal V2 authorization regression tests
-- Run against a migrated local/test database, for example:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/portal_rls.sql
--
-- The entire suite is transactional and leaves no fixture data behind.

begin;

create or replace function public.__portal_test_assert(
  p_condition boolean,
  p_message text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_condition is distinct from true then
    raise exception 'RLS TEST FAILED: %', p_message;
  end if;
end;
$$;

create or replace function public.__portal_test_assert_fails(
  p_statement text,
  p_message text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_failed boolean := false;
begin
  begin
    execute p_statement;
  exception when others then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'RLS TEST FAILED (statement unexpectedly succeeded): %', p_message;
  end if;
end;
$$;

create or replace function public.__portal_test_assert_fails_matching(
  p_statement text,
  p_expected_fragment text,
  p_message text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_error_message text;
begin
  begin
    execute p_statement;
  exception when others then
    get stacked diagnostics v_error_message = message_text;
  end;

  if v_error_message is null then
    raise exception 'RLS TEST FAILED (statement unexpectedly succeeded): %', p_message;
  end if;
  if position(lower(p_expected_fragment) in lower(v_error_message)) = 0 then
    raise exception
      'RLS TEST FAILED (unexpected error: "%", expected fragment: "%"): %',
      v_error_message,
      p_expected_fragment,
      p_message;
  end if;
end;
$$;

grant execute on function public.__portal_test_assert(boolean, text) to anon, authenticated;
grant execute on function public.__portal_test_assert_fails(text, text) to anon, authenticated;
grant execute on function public.__portal_test_assert_fails_matching(text, text, text)
  to anon, authenticated, service_role;

-- Stable UUIDs keep the assertions legible. Foreign keys to auth.users are
-- bypassed only while the isolated fixtures are installed.
set local session_replication_role = replica;

insert into public.user_profiles (
  id, role, email, full_name, status, onboarding_completed
) values
  ('10000000-0000-0000-0000-000000000001', 'admin', 'rls-admin@example.invalid', 'RLS Admin', 'active', true),
  ('20000000-0000-0000-0000-000000000001', 'customer', 'rls-customer@example.invalid', 'RLS Kunde', 'active', true),
  ('21000000-0000-0000-0000-000000000001', 'customer', 'rls-customer-2@example.invalid', 'RLS Kunde 2', 'active', true),
  ('30000000-0000-0000-0000-000000000001', 'employee', 'rls-employee@example.invalid', 'RLS Mitarbeiter', 'active', true),
  ('40000000-0000-0000-0000-000000000001', 'employee', 'rls-other-employee@example.invalid', 'RLS Fremdmitarbeiter', 'active', true);

insert into public.customers (
  id, status, company_name, contact_name, email
) values
  ('a0000000-0000-0000-0000-000000000001', 'active', 'RLS Kunde A', 'Kunde A', 'kunde-a@example.invalid'),
  ('a0000000-0000-0000-0000-000000000002', 'active', 'RLS Kunde B', 'Kunde B', 'kunde-b@example.invalid');

insert into public.customer_users (customer_id, user_id, active) values
  ('a0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', true),
  ('a0000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000001', true);

insert into public.invitations (
  id, email, role, category, customer_id, status, token_hash, expires_at, sent_at
) values (
  'a1000000-0000-0000-0000-000000000001',
  'kunde-a-einladung@example.invalid', 'customer', 'property_management',
  'a0000000-0000-0000-0000-000000000001', 'sent',
  'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
  now() + interval '30 days', now()
);

insert into public.employee_profiles (
  id, user_id, full_name, email, status
) values
  ('e0000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'RLS Mitarbeiter', 'rls-employee@example.invalid', 'active'),
  ('e0000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', 'RLS Fremdmitarbeiter', 'rls-other-employee@example.invalid', 'active');

insert into public.properties (
  id, customer_id, name, property_type, care_start_date, status
) values
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'RLS Objekt A', 'multi_family', current_date - 30, 'active'),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', 'RLS Objekt B', 'commercial', current_date - 30, 'active');

insert into public.property_admin_settings (
  property_id, monthly_fee_net_cents, tax_rate_bps, max_visit_minutes, internal_notes
) values
  ('b0000000-0000-0000-0000-000000000001', 10000, 1900, 120, 'Nur Administration'),
  ('b0000000-0000-0000-0000-000000000002', 20000, 1900, 90, 'Nur Administration B');

insert into public.property_briefings (property_id, internal_briefing) values
  ('b0000000-0000-0000-0000-000000000001', 'Interne Einweisung A'),
  ('b0000000-0000-0000-0000-000000000002', 'Interne Einweisung B');

insert into public.property_billing_profiles (
  property_id, recipient_name, street, house_number, postal_code, city, country, email
) values
  ('b0000000-0000-0000-0000-000000000001', 'RLS Kunde A', 'Testweg', '1', '10115', 'Berlin', 'Deutschland', 'kunde-a@example.invalid'),
  ('b0000000-0000-0000-0000-000000000002', 'RLS Kunde B', 'Testweg', '2', '10115', 'Berlin', 'Deutschland', 'kunde-b@example.invalid');

insert into public.buildings (
  id, property_id, label, street, house_number, postal_code, city, country,
  formatted_address, qr_token_nonce, qr_token_hash, status
) values
  (
    'c0000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000001',
    'Haus A', 'Testweg', '1', '10115', 'Berlin', 'Deutschland',
    'Testweg 1, 10115 Berlin', 'c1000000-0000-0000-0000-000000000001',
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'active'
  ),
  (
    'c0000000-0000-0000-0000-000000000002',
    'b0000000-0000-0000-0000-000000000002',
    'Haus B', 'Testweg', '2', '10115', 'Berlin', 'Deutschland',
    'Testweg 2, 10115 Berlin', 'c1000000-0000-0000-0000-000000000002',
    'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'active'
  ),
  (
    'c0000000-0000-0000-0000-000000000003',
    'b0000000-0000-0000-0000-000000000001',
    'Haus A Nebenhaus', 'Testweg', '3', '10115', 'Berlin', 'Deutschland',
    'Testweg 3, 10115 Berlin', 'c1000000-0000-0000-0000-000000000003',
    'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd', 'active'
  );

insert into public.property_employee_assignments (
  property_id, employee_id, active, starts_on
) values
  ('b0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', true, current_date - 30),
  ('b0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000002', true, current_date - 30);

insert into public.property_services (
  id, property_id, service_key, name, category, customer_description,
  execution_rule, occurrences_per_period, start_date, customer_visible,
  photo_required, status
) values (
  'd0000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000001',
  'rls-regelservice', 'RLS Regelservice', 'Kontrolle', 'Sichere Kundenbeschreibung',
  'every_visit', 1, current_date - 30, true, false, 'active'
);

insert into public.service_checklist_items (
  id, property_service_id, label, required, sort_order
) values (
  'd1000000-0000-0000-0000-000000000001',
  'd0000000-0000-0000-0000-000000000001',
  'RLS Prüfschritt', true, 10
);

insert into public.property_service_instructions (
  property_service_id, internal_instruction
) values (
  'd0000000-0000-0000-0000-000000000001',
  'RLS GEHEIME INTERNE ANWEISUNG'
);

insert into public.visit_plans (
  id, property_id, label, frequency, visits_per_period, start_date,
  primary_employee_id, max_visit_minutes, status
) values (
  'd2000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000001',
  'RLS Einzelplan', 'individual', 1, current_date,
  'e0000000-0000-0000-0000-000000000001', 75, 'active'
);

insert into public.equipment (
  id, name, category, current_stock, minimum_stock, condition,
  ownership_type, status
) values (
  'ec000000-0000-0000-0000-000000000001',
  'RLS Prüfgerät', 'tool', 1, 0, 'available', 'owned', 'active'
);

insert into public.service_equipment (
  property_service_id, equipment_id, required_quantity
) values (
  'd0000000-0000-0000-0000-000000000001',
  'ec000000-0000-0000-0000-000000000001', 2
);

insert into public.visits (
  id, property_id, primary_employee_id, scheduled_date, planned_start_time,
  scheduled_start, status
) values (
  'f0000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000001',
  'e0000000-0000-0000-0000-000000000001',
  current_date, time '09:00', now() + interval '1 hour', 'scheduled'
);

insert into public.operational_reports (
  id, property_id, building_id, visit_id, employee_id, created_by,
  category, urgency, title, description, status
) values (
  'f1000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000001',
  'f0000000-0000-0000-0000-000000000001',
  'e0000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  'cleaning_supply_empty', 'normal', 'Waschmittel leer',
  'Bitte vor dem nächsten Einsatz auffüllen.', 'new'
);

insert into public.invoices (
  id, customer_id, property_id, status, invoice_number, title
) values (
  'f2000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000001',
  'open', 'RLS-2026-000001', 'RLS Kundenrechnung'
);

insert into public.visit_buildings (visit_id, building_id) values (
  'f0000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000001'
);

-- Generated visits now receive immutable service/checklist snapshots before
-- an employee starts them. This fixture mirrors that operational state.
insert into public.visit_tasks (
  id, visit_id, property_id, building_id, property_service_id,
  source_type, source_id, title, description, category, checklist_snapshot,
  status, photo_required, customer_visible, due_period_key, dedupe_key
) values (
  'f3000000-0000-0000-0000-000000000001',
  'f0000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000001',
  'd0000000-0000-0000-0000-000000000001',
  'service', 'd0000000-0000-0000-0000-000000000001',
  'RLS Regelservice', 'Sichere Kundenbeschreibung', 'Kontrolle',
  jsonb_build_array(jsonb_build_object(
    'id', 'd1000000-0000-0000-0000-000000000001',
    'label', 'RLS Prüfschritt',
    'required', true
  )),
  'open', false, true, 'visit:f0000000-0000-0000-0000-000000000001',
  'service-planned:rls-fixture'
);

insert into public.visit_task_instructions (
  visit_task_id, internal_instruction
) values (
  'f3000000-0000-0000-0000-000000000001',
  'RLS GEHEIME INTERNE ANWEISUNG'
);

insert into public.visit_task_attachments (
  id, visit_task_id, bucket, path, filename, mime_type, uploaded_by
) values (
  'f3100000-0000-0000-0000-000000000001',
  'f3000000-0000-0000-0000-000000000001',
  'visit-task-attachments',
  '30000000-0000-0000-0000-000000000001/f0000000-0000-0000-0000-000000000001/f3000000-0000-0000-0000-000000000001/live.jpg',
  'live.jpg', 'image/jpeg',
  '30000000-0000-0000-0000-000000000001'
);

insert into public.property_messages (
  id, property_id, sender_id, sender_display_name, message_type, body
) values
  (
    '91000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001', 'RLS Kunde', 'user', 'Nachricht A'
  ),
  (
    '91000000-0000-0000-0000-000000000002',
    'b0000000-0000-0000-0000-000000000002',
    null, null, 'system', 'Nachricht B'
  );

insert into public.notifications (
  id, recipient_id, type, title, body, property_id, idempotency_key
) values
  (
    '92000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    'rls.test', 'Eigene Nachricht', 'Nur Empfänger A',
    'b0000000-0000-0000-0000-000000000001', 'rls-test-customer-a'
  ),
  (
    '92000000-0000-0000-0000-000000000002',
    '40000000-0000-0000-0000-000000000001',
    'rls.test', 'Fremde Nachricht', 'Nur Empfänger B',
    'b0000000-0000-0000-0000-000000000002', 'rls-test-employee-b'
  );

set local session_replication_role = origin;

-- Anonymous users do not receive a domain-table privilege at all (stronger
-- than relying on an empty RLS result).
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select public.__portal_test_assert_fails(
  'select * from public.properties',
  'anon must not have permission to read properties'
);
select public.__portal_test_assert_fails(
  'select * from public.damage_reports',
  'anonymous QR users must not read existing damage reports'
);
reset role;

-- Customer A can read only its property/customer-safe data.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select public.__portal_test_assert(
  (select count(*) = 1 from public.properties),
  'customer must see exactly its own property'
);
select public.__portal_test_assert(
  not exists (
    select 1 from public.properties
    where id = 'b0000000-0000-0000-0000-000000000002'
  ),
  'customer must not see another customer property'
);
select public.__portal_test_assert(
  (select count(*) = 0 from public.property_admin_settings),
  'customer must not read property admin settings'
);
select public.__portal_test_assert(
  (select count(*) = 0 from public.property_briefings),
  'customer must not read employee briefing'
);
select public.__portal_test_assert(
  (select count(*) = 0 from public.visit_admin_metrics),
  'customer must not read internal visit metrics or operational snapshots'
);
select public.__portal_test_assert(
  (select count(*) = 1 from public.visit_tasks),
  'customer must read its customer-visible planned calendar task'
);
select public.__portal_test_assert(
  (select count(*) = 0 from public.visit_task_instructions),
  'customer must not read internal task instructions'
);
select public.__portal_test_assert(
  (select count(*) = 0 from public.visit_task_attachments),
  'customer must not read task evidence before visit completion'
);
select public.__portal_test_assert(
  (select count(*) = 1 from public.property_billing_profiles),
  'customer must read only its billing profile'
);
select public.__portal_test_assert_fails(
  'select qr_token_hash from public.buildings limit 1',
  'authenticated customer must not read QR token material'
);
select public.__portal_test_assert(
  (select count(*) = 1 from public.property_messages),
  'customer must see only chat for its property'
);
select public.__portal_test_assert(
  (select count(*) = 1 from public.notifications),
  'customer must see only own notification'
);
select public.__portal_test_assert_fails(
  $$insert into public.property_messages (
      property_id, sender_id, message_type, body
    ) values (
      'b0000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000001',
      'system', 'Gefälschte Systemnachricht'
    )$$,
  'customer must not create system chat messages'
);

insert into public.property_messages (property_id, sender_id, message_type, body)
values (
  'b0000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  'user', 'Erlaubte Kundennachricht'
);
select public.__portal_test_assert(
  exists (
    select 1 from public.property_messages
    where body = 'Erlaubte Kundennachricht' and sender_display_name = 'RLS Kunde'
  ),
  'customer message must receive a safe sender-name snapshot'
);

insert into public.complaints (
  property_id, submitted_by, title, description, status
) values (
  'b0000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  'Vertraulicher Test', 'Nur Absender und Administration', 'new'
);
reset role;

-- Deactivation is an authorization boundary, not merely a visual list status.
set local role service_role;
update public.customers
set status = 'inactive'
where id = 'a0000000-0000-0000-0000-000000000001';
select public.__portal_test_assert(
  (
    select status = 'revoked' and expires_at is null
    from public.invitations
    where id = 'a1000000-0000-0000-0000-000000000001'
  ),
  'customer deactivation must revoke every open invitation atomically'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select public.__portal_test_assert(
  (select count(*) = 0 from public.properties),
  'inactive customer must immediately lose property access'
);
select public.__portal_test_assert(
  (select count(*) = 0 from public.customer_users),
  'inactive customer must not read its membership row'
);
reset role;

set local role service_role;
update public.customers
set status = 'active'
where id = 'a0000000-0000-0000-0000-000000000001';
reset role;

-- A second user of the same customer account cannot read the first user's complaint.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"21000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '21000000-0000-0000-0000-000000000001', true);
select public.__portal_test_assert(
  (select count(*) = 0 from public.complaints),
  'complaints must remain confidential to their submitter'
);
reset role;

-- Unassigned employee B cannot read/start property A's visit.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000001', true);
select public.__portal_test_assert(
  not exists (
    select 1 from public.properties
    where id = 'b0000000-0000-0000-0000-000000000001'
  ),
  'unassigned employee must not read another property'
);
select public.__portal_test_assert(
  not exists (
    select 1 from public.visits
    where id = 'f0000000-0000-0000-0000-000000000001'
  ),
  'unassigned employee must not read visit'
);
select public.__portal_test_assert_fails(
  $$select public.start_visit('f0000000-0000-0000-0000-000000000001')$$,
  'unassigned employee must not start visit'
);
reset role;

-- Assigned employee A can start, work and complete the already planned visit.
-- Server timestamps and actor identity are asserted after the transition.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"30000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);
select public.__portal_test_assert(
  (select count(*) = 0 from public.invoices),
  'employee must not read invoices through the API data boundary'
);
select public.__portal_test_assert_fails(
  'select max_visit_minutes from public.visit_plans limit 1',
  'employee must not read the internal maximum visit duration'
);
reset role;
set local role service_role;
select public.__portal_test_assert_fails_matching(
  $$insert into public.operational_reports (
      property_id, building_id, visit_id, employee_id, created_by,
      category, urgency, title, description, status
    ) values (
      'b0000000-0000-0000-0000-000000000001',
      'c0000000-0000-0000-0000-000000000003',
      'f0000000-0000-0000-0000-000000000001',
      'e0000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000001',
      'other', 'normal', 'Falsches Gebäude',
      'Dieses Gebäude gehört nicht zum Einsatz.', 'new'
    )$$,
  'Das Gebäude gehört nicht zum ausgewählten Einsatz',
  'employee report building must belong to the selected visit'
);
reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"30000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);
select public.start_visit('f0000000-0000-0000-0000-000000000001');
select public.__portal_test_assert(
  exists (
    select 1 from public.visits
    where id = 'f0000000-0000-0000-0000-000000000001'
      and status = 'started'
      and started_by = '30000000-0000-0000-0000-000000000001'
      and primary_employee_id = 'e0000000-0000-0000-0000-000000000001'
  ),
  'start_visit must use server actor without rewriting primary assignment'
);
select public.__portal_test_assert(
  (select count(*) = 1 from public.visit_tasks where visit_id = 'f0000000-0000-0000-0000-000000000001'),
  'start_visit must preserve one preplanned recurring task'
);
select public.__portal_test_assert(
  exists (
    select 1 from public.visit_equipment
    where visit_id = 'f0000000-0000-0000-0000-000000000001'
      and equipment_id = 'ec000000-0000-0000-0000-000000000001'
      and required_quantity = 2
      and equipment_snapshot ->> 'name' = 'RLS Prüfgerät'
  ),
  'start_visit must snapshot equipment and its immutable catalog label for a due service'
);
select public.start_visit('f0000000-0000-0000-0000-000000000001');
select public.__portal_test_assert(
  (select count(*) = 1 from public.visit_tasks where visit_id = 'f0000000-0000-0000-0000-000000000001'),
  'repeated start_visit must not duplicate tasks'
);

-- The customer-safe task remains visible while the visit is live, but its
-- status can still only be changed by an employee or admin.
select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select public.__portal_test_assert(
  (select count(*) = 1 from public.visit_tasks where visit_id = 'f0000000-0000-0000-0000-000000000001'),
  'customer must read its customer-visible live visit task'
);
select public.__portal_test_assert(
  (select count(*) = 0 from public.visit_task_attachments),
  'customer must not read live employee task evidence'
);
update public.visit_tasks
set status = 'done'
where visit_id = 'f0000000-0000-0000-0000-000000000001';

-- Admins may complete a task during a started visit. The admin read also proves
-- that the customer UPDATE above affected zero rows through RLS.
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select public.__portal_test_assert(
  exists (
    select 1 from public.visit_tasks
    where visit_id = 'f0000000-0000-0000-0000-000000000001'
      and status = 'open'
  ),
  'customer must not update a live visit task'
);
update public.visit_tasks
set status = 'done'
where visit_id = 'f0000000-0000-0000-0000-000000000001';
select public.__portal_test_assert(
  exists (
    select 1 from public.visit_tasks
    where visit_id = 'f0000000-0000-0000-0000-000000000001'
      and status = 'done'
      and completed_by = '10000000-0000-0000-0000-000000000001'
  ),
  'admin must complete a task with server-owned actor identity'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"30000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);

update public.visit_tasks
set status = 'open'
where visit_id = 'f0000000-0000-0000-0000-000000000001';

update public.visit_tasks
set status = 'done', completed_at = '2000-01-01 00:00:00+00',
    completed_by = '40000000-0000-0000-0000-000000000001'
where visit_id = 'f0000000-0000-0000-0000-000000000001';
select public.__portal_test_assert(
  exists (
    select 1 from public.visit_tasks
    where visit_id = 'f0000000-0000-0000-0000-000000000001'
      and status = 'done'
      and completed_by = '30000000-0000-0000-0000-000000000001'
      and completed_at > now() - interval '1 minute'
  ),
  'task completion actor/time must be overwritten by the database'
);

select public.complete_visit('f0000000-0000-0000-0000-000000000001');
select public.__portal_test_assert(
  exists (
    select 1 from public.visits
    where id = 'f0000000-0000-0000-0000-000000000001'
      and status = 'completed'
      and completed_by = '30000000-0000-0000-0000-000000000001'
      and duration_minutes >= 0
      and report_snapshot is not null
      and report_snapshot ->> 'employee_name' = 'RLS Mitarbeiter'
      and report_snapshot #>> '{buildings,0,address}' = 'Testweg 1, 10115 Berlin'
      and report_snapshot #>> '{tasks,0,checklist,0,label}' = 'RLS Prüfschritt'
      and report_snapshot::text not like '%RLS GEHEIME INTERNE ANWEISUNG%'
  ),
  'complete_visit must persist customer-safe immutable completion evidence'
);
reset role;
set local role service_role;
select public.__portal_test_assert_fails_matching(
  $$insert into public.visit_task_attachments (
      visit_task_id, bucket, path, filename, mime_type, uploaded_by
    )
    select id, 'visit-task-attachments',
      '30000000-0000-0000-0000-000000000001/f0000000-0000-0000-0000-000000000001/' || id::text || '/late.jpg',
      'late.jpg', 'image/jpeg', '30000000-0000-0000-0000-000000000001'
    from public.visit_tasks
    where visit_id = 'f0000000-0000-0000-0000-000000000001'$$,
  'Nachweise abgeschlossener Einsätze sind unveränderlich',
  'employee must not append evidence after visit completion'
);
reset role;

-- Customer sees customer-visible tasks only after completion, and still cannot
-- invoke the employee completion RPC.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select public.__portal_test_assert(
  (select count(*) = 1 from public.visit_tasks where visit_id = 'f0000000-0000-0000-0000-000000000001'),
  'customer must read customer-visible tasks of completed visit'
);
select public.__portal_test_assert(
  (select count(*) = 1 from public.visit_task_attachments),
  'customer may read customer-visible task evidence only after visit completion'
);
select public.__portal_test_assert_fails(
  $$select public.complete_visit('f0000000-0000-0000-0000-000000000001')$$,
  'customer must not complete a visit, including idempotent completed calls'
);
update public.visit_tasks
set status = 'open'
where visit_id = 'f0000000-0000-0000-0000-000000000001';
select public.__portal_test_assert(
  exists (
    select 1 from public.visit_tasks
    where visit_id = 'f0000000-0000-0000-0000-000000000001'
      and status = 'done'
  ),
  'customer must not change completed task evidence'
);
update public.notifications
set read_at = now()
where id = '92000000-0000-0000-0000-000000000001';
select public.__portal_test_assert_fails(
  $$update public.notifications
    set body = 'Manipuliert'
    where id = '92000000-0000-0000-0000-000000000001'$$,
  'recipient may update read_at but not notification content'
);
reset role;

-- Admin receives row-level access, but QR material remains server-action only.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select public.__portal_test_assert(
  (
    select count(*) = 2 from public.properties
    where id in (
      'b0000000-0000-0000-0000-000000000001',
      'b0000000-0000-0000-0000-000000000002'
    )
  ),
  'active admin must read all properties'
);
select public.__portal_test_assert(
  (
    select count(*) = 2 from public.property_admin_settings
    where property_id in (
      'b0000000-0000-0000-0000-000000000001',
      'b0000000-0000-0000-0000-000000000002'
    )
  ),
  'active admin must read sensitive settings'
);
select public.__portal_test_assert(
  exists (
    select 1
    from public.visit_admin_metrics
    where visit_id = 'f0000000-0000-0000-0000-000000000001'
      and operational_reports_snapshot #>> '{0,title}' = 'Waschmittel leer'
  ),
  'admin completion evidence must contain the frozen operational report snapshot'
);
select public.__portal_test_assert_fails(
  'select qr_token_hash from public.buildings limit 1',
  'QR token material must remain service-role only, even for admin browser JWT'
);
select public.set_customer_status(
  'a0000000-0000-0000-0000-000000000002', 'inactive'
);
select public.__portal_test_assert(
  exists (
    select 1 from public.customers
    where id = 'a0000000-0000-0000-0000-000000000002'
      and status = 'inactive'
  ) and exists (
    select 1 from public.audit_logs
    where entity_table = 'customers'
      and entity_id = 'a0000000-0000-0000-0000-000000000002'
      and action = 'customer.status_changed'
  ),
  'admin customer status change and audit must commit atomically'
);
select public.set_customer_status(
  'a0000000-0000-0000-0000-000000000002', 'active'
);

select public.create_property_service_configuration(
  p_property_id => 'b0000000-0000-0000-0000-000000000001',
  p_catalog_id => null,
  p_service_key => 'rls-atomic-service',
  p_name => 'Atomare Testleistung',
  p_category => 'Kontrolle',
  p_customer_description => 'Kundensicher',
  p_execution_rule => 'every_visit',
  p_occurrences_per_period => 1,
  p_seasonal => false,
  p_season_start_month => null,
  p_season_end_month => null,
  p_start_date => current_date,
  p_end_date => null,
  p_estimated_minutes => 20,
  p_customer_visible => true,
  p_photo_required => false,
  p_sort_order => 20,
  p_status => 'active',
  p_internal_instruction => 'Interne Version eins',
  p_building_ids => array['c0000000-0000-0000-0000-000000000003'::uuid]
);
select public.__portal_test_assert(
  exists (
    select 1
    from public.property_services ps
    join public.property_service_instructions psi
      on psi.property_service_id = ps.id
    where ps.property_id = 'b0000000-0000-0000-0000-000000000001'
      and ps.service_key = 'rls-atomic-service'
      and psi.updated_by = '10000000-0000-0000-0000-000000000001'
  ) and (
    select count(*) = 1 from public.audit_logs
    where action = 'property_service.created'
      and entity_id = (
        select id from public.property_services
        where property_id = 'b0000000-0000-0000-0000-000000000001'
          and service_key = 'rls-atomic-service'
      )
  ),
  'service create RPC must commit configuration and exactly one audit atomically'
);

select public.update_property_service_configuration(
  p_property_id => 'b0000000-0000-0000-0000-000000000001',
  p_property_service_id => (
    select id from public.property_services
    where property_id = 'b0000000-0000-0000-0000-000000000001'
      and service_key = 'rls-atomic-service'
  ),
  p_expected_updated_at => (
    select updated_at from public.property_services
    where property_id = 'b0000000-0000-0000-0000-000000000001'
      and service_key = 'rls-atomic-service'
  ),
  p_catalog_id => null,
  p_service_key => 'rls-atomic-service',
  p_name => 'Atomare Testleistung aktualisiert',
  p_category => 'Kontrolle',
  p_customer_description => 'Kundensicher aktualisiert',
  p_execution_rule => 'once_monthly',
  p_occurrences_per_period => 1,
  p_seasonal => false,
  p_season_start_month => null,
  p_season_end_month => null,
  p_start_date => current_date,
  p_end_date => null,
  p_estimated_minutes => 25,
  p_customer_visible => true,
  p_photo_required => true,
  p_sort_order => 30,
  p_status => 'active',
  p_internal_instruction => 'Interne Version zwei',
  p_expected_instruction_version => (
    select psi.updated_at
    from public.property_service_instructions psi
    join public.property_services ps on ps.id = psi.property_service_id
    where ps.property_id = 'b0000000-0000-0000-0000-000000000001'
      and ps.service_key = 'rls-atomic-service'
  ),
  p_building_ids => array[]::uuid[]
);
select public.__portal_test_assert(
  exists (
    select 1
    from public.property_services ps
    join public.property_service_instructions psi
      on psi.property_service_id = ps.id
    where ps.property_id = 'b0000000-0000-0000-0000-000000000001'
      and ps.service_key = 'rls-atomic-service'
      and ps.name = 'Atomare Testleistung aktualisiert'
      and ps.photo_required = true
      and psi.internal_instruction = 'Interne Version zwei'
      and not exists (
        select 1 from public.property_service_buildings psb
        where psb.property_service_id = ps.id
      )
  ) and (
    select count(*) = 1 from public.audit_logs
    where action = 'property_service.updated'
      and entity_id = (
        select id from public.property_services
        where property_id = 'b0000000-0000-0000-0000-000000000001'
          and service_key = 'rls-atomic-service'
      )
  ),
  'service update RPC must commit every configuration part and exactly one audit atomically'
);
select public.__portal_test_assert_fails_matching(
  $$select public.update_property_service_configuration(
      p_property_id => 'b0000000-0000-0000-0000-000000000001',
      p_property_service_id => (
        select id from public.property_services
        where property_id = 'b0000000-0000-0000-0000-000000000001'
          and service_key = 'rls-atomic-service'
      ),
      p_expected_updated_at => '2000-01-01 00:00:00+00',
      p_catalog_id => null,
      p_service_key => 'rls-atomic-service',
      p_name => 'Unzulässige Überschreibung',
      p_category => 'Kontrolle',
      p_customer_description => null,
      p_execution_rule => 'every_visit',
      p_occurrences_per_period => 1,
      p_seasonal => false,
      p_season_start_month => null,
      p_season_end_month => null,
      p_start_date => current_date,
      p_end_date => null,
      p_estimated_minutes => null,
      p_customer_visible => true,
      p_photo_required => false,
      p_sort_order => 0,
      p_status => 'active',
      p_internal_instruction => null,
      p_expected_instruction_version => null,
      p_building_ids => array[]::uuid[]
    )$$,
  'Die Leistung wurde zwischenzeitlich geändert',
  'stale service versions must never overwrite newer configuration'
);

select public.__portal_test_assert_fails_matching(
  $$select public.set_property_employee_assignment(
      'b0000000-0000-0000-0000-000000000001',
      'e0000000-0000-0000-0000-000000000001',
      false,
      (
        select updated_at from public.property_employee_assignments
        where property_id = 'b0000000-0000-0000-0000-000000000001'
          and employee_id = 'e0000000-0000-0000-0000-000000000001'
      )
    )$$,
  'aktiven Besuchsplan',
  'employee assignment must remain active while an active visit plan references it'
);
select public.__portal_test_assert_fails_matching(
  $$select public.set_employee_status(
      'e0000000-0000-0000-0000-000000000001',
      'disabled'::public.profile_status
    )$$,
  'Aktive Immobilienzuordnungen müssen vor der Mitarbeiterdeaktivierung beendet werden',
  'employee deactivation must not strand active property assignments or planned work'
);

select public.set_visit_plan_status(
  'b0000000-0000-0000-0000-000000000001',
  'd2000000-0000-0000-0000-000000000001',
  'paused',
  'active'
);
reset role;
set local role service_role;
select public.__portal_test_assert(
  exists (
    select 1 from public.visit_plans
    where id = 'd2000000-0000-0000-0000-000000000001'
      and property_id = 'b0000000-0000-0000-0000-000000000001'
      and status = 'paused'
  ) and exists (
    select 1 from public.audit_logs
    where action = 'visit_plan.status_changed'
      and entity_id = 'd2000000-0000-0000-0000-000000000001'
      and metadata ->> 'previous_status' = 'active'
      and metadata ->> 'status' = 'paused'
  ),
  'visit-plan status and audit must commit atomically'
);

reset role;
set local role service_role;
insert into public.visits (
  id, property_id, primary_employee_id, scheduled_date, scheduled_start, status
) values (
  'f0000000-0000-0000-0000-000000000099',
  'b0000000-0000-0000-0000-000000000001',
  'e0000000-0000-0000-0000-000000000001',
  current_date + 2, now() + interval '2 days', 'scheduled'
);
reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select public.__portal_test_assert_fails_matching(
  $$select public.set_property_employee_assignment(
      'b0000000-0000-0000-0000-000000000001',
      'e0000000-0000-0000-0000-000000000001',
      false,
      (
        select updated_at from public.property_employee_assignments
        where property_id = 'b0000000-0000-0000-0000-000000000001'
          and employee_id = 'e0000000-0000-0000-0000-000000000001'
      )
    )$$,
  'offenen Einsatz',
  'employee assignment must remain active while an open visit references it'
);
reset role;
set local role service_role;
update public.visits
set status = 'canceled', canceled_at = now(), cancellation_reason = 'Test beendet'
where id = 'f0000000-0000-0000-0000-000000000099';
select public.__portal_test_assert_fails_matching(
  $$delete from public.property_employee_assignments
    where property_id = 'b0000000-0000-0000-0000-000000000001'
      and employee_id = 'e0000000-0000-0000-0000-000000000001'$$,
  'Mitarbeiterzuordnungen werden beendet und nicht gelöscht',
  'employee assignment history must never be physically deleted'
);
reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

select public.set_property_employee_assignment(
  'b0000000-0000-0000-0000-000000000002',
  'e0000000-0000-0000-0000-000000000001',
  true,
  null
);
select public.__portal_test_assert(
  exists (
    select 1 from public.property_employee_assignments
    where property_id = 'b0000000-0000-0000-0000-000000000002'
      and employee_id = 'e0000000-0000-0000-0000-000000000001'
      and active = true
  ),
  'employee assignment RPC must create or reactivate atomically'
);
select public.set_property_employee_assignment(
  'b0000000-0000-0000-0000-000000000002',
  'e0000000-0000-0000-0000-000000000001',
  false,
  (
    select updated_at from public.property_employee_assignments
    where property_id = 'b0000000-0000-0000-0000-000000000002'
      and employee_id = 'e0000000-0000-0000-0000-000000000001'
  )
);
select public.__portal_test_assert(
  exists (
    select 1 from public.property_employee_assignments
    where property_id = 'b0000000-0000-0000-0000-000000000002'
      and employee_id = 'e0000000-0000-0000-0000-000000000001'
      and active = false
      and ends_on is not null
  ) and exists (
    select 1 from public.audit_logs
    where action = 'property.employee_unassigned'
      and entity_id = 'b0000000-0000-0000-0000-000000000002'
  ),
  'employee unassignment and audit must commit atomically'
);

select public.set_property_equipment_assignment(
  'b0000000-0000-0000-0000-000000000001',
  'ec000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000003',
  1, false, null, null, false, 48, 'RLS Bereitstellung',
  null, null, false
);
select public.__portal_test_assert(
  exists (
    select 1 from public.property_equipment
    where property_id = 'b0000000-0000-0000-0000-000000000001'
      and equipment_id = 'ec000000-0000-0000-0000-000000000001'
      and building_id = 'c0000000-0000-0000-0000-000000000003'
      and active = true
  ),
  'property equipment RPC must assign active equipment atomically'
);
select public.set_property_equipment_assignment(
  'b0000000-0000-0000-0000-000000000001',
  null, null, 1, false, null, null, false, 0, null,
  (
    select id from public.property_equipment
    where property_id = 'b0000000-0000-0000-0000-000000000001'
      and equipment_id = 'ec000000-0000-0000-0000-000000000001'
      and building_id = 'c0000000-0000-0000-0000-000000000003'
  ),
  (
    select updated_at from public.property_equipment
    where property_id = 'b0000000-0000-0000-0000-000000000001'
      and equipment_id = 'ec000000-0000-0000-0000-000000000001'
      and building_id = 'c0000000-0000-0000-0000-000000000003'
  ),
  true
);

select public.set_building_status(
  'b0000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000003',
  'archived',
  'active'
);
reset role;
set local role service_role;
select public.__portal_test_assert_fails_matching(
  $$insert into public.property_service_buildings (
      property_service_id, building_id
    ) values (
      'd0000000-0000-0000-0000-000000000001',
      'c0000000-0000-0000-0000-000000000003'
    )$$,
  'Archivierte Gebäude können nicht neu zugeordnet werden',
  'new service links to archived buildings must fail'
);
reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select public.set_building_status(
  'b0000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000003',
  'active',
  'archived'
);

reset role;
set local role service_role;
insert into public.visits (
  id, property_id, primary_employee_id, scheduled_date, scheduled_start,
  status, manually_adjusted, schedule_key
) values
  (
    'f0000000-0000-0000-0000-000000000093',
    'b0000000-0000-0000-0000-000000000002',
    'e0000000-0000-0000-0000-000000000002',
    current_date - 1,
    now() - interval '1 day',
    'scheduled', false, 'rls-past-property-visit'
  ),
  (
    'f0000000-0000-0000-0000-000000000092',
    'b0000000-0000-0000-0000-000000000002',
    'e0000000-0000-0000-0000-000000000002',
    current_date - 2,
    now() - interval '2 days',
    'scheduled', true, 'rls-past-manual-property-visit'
  ),
  (
    'f0000000-0000-0000-0000-000000000091',
    'b0000000-0000-0000-0000-000000000002',
    'e0000000-0000-0000-0000-000000000002',
    current_date + 1,
    now() + interval '1 day',
    'scheduled', false, 'rls-future-property-visit'
  );
reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

select public.set_property_status(
  'b0000000-0000-0000-0000-000000000002',
  'archived'
);
select public.__portal_test_assert(
  exists (
    select 1 from public.properties
    where id = 'b0000000-0000-0000-0000-000000000002'
      and status = 'archived'
  ) and not exists (
    select 1 from public.property_employee_assignments
    where property_id = 'b0000000-0000-0000-0000-000000000002'
      and active = true
  ) and exists (
    select 1 from public.visits
    where id = 'f0000000-0000-0000-0000-000000000093'
      and status = 'scheduled'
      and manually_adjusted = false
      and canceled_at is null
      and cancellation_reason is null
      and schedule_key = 'rls-past-property-visit'
  ) and exists (
    select 1 from public.visits
    where id = 'f0000000-0000-0000-0000-000000000092'
      and status = 'scheduled'
      and manually_adjusted = true
      and canceled_at is null
      and cancellation_reason is null
      and schedule_key = 'rls-past-manual-property-visit'
  ) and exists (
    select 1 from public.visits
    where id = 'f0000000-0000-0000-0000-000000000091'
      and status = 'canceled'
      and manually_adjusted = true
      and canceled_at is not null
      and cancellation_reason = 'Immobilie archiviert'
  ) and exists (
    select 1 from public.audit_logs
    where action = 'property.status_changed'
      and entity_id = 'b0000000-0000-0000-0000-000000000002'
      and metadata ->> 'status' = 'archived'
      and (metadata ->> 'canceled_visits')::integer = 1
  ),
  'property archival must close active employee assignments atomically'
);
reset role;
set local role service_role;
select public.__portal_test_assert_fails_matching(
  $$insert into public.visits (
      property_id, scheduled_date, scheduled_start, status
    ) values (
      'b0000000-0000-0000-0000-000000000002',
      current_date + 1, now() + interval '1 day', 'scheduled'
    )$$,
  'Für eine archivierte Immobilie darf kein offener Einsatz bestehen',
  'archived properties must reject newly scheduled visits'
);
select public.__portal_test_assert_fails_matching(
  $$update public.property_employee_assignments
    set active = true, ends_on = null
    where property_id = 'b0000000-0000-0000-0000-000000000002'
      and employee_id = 'e0000000-0000-0000-0000-000000000001'$$,
  'Archivierten Immobilien können keine Mitarbeiter zugeordnet werden',
  'archived properties must reject reactivated employee assignments'
);
select public.__portal_test_assert_fails_matching(
  $$insert into public.visit_plans (
      id, property_id, label, frequency, visits_per_period, start_date,
      primary_employee_id, max_visit_minutes, status
    ) values (
      'd2000000-0000-0000-0000-000000000002',
      'b0000000-0000-0000-0000-000000000002',
      'Unzulässiger Plan', 'individual', 1, current_date,
      null, 60, 'active'
    )$$,
  'Ein aktiver Besuchsplan benötigt eine aktive Immobilie',
  'archived properties must reject active visit plans'
);
reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

-- Plan configuration, its link sets, generated visits and audit entries must
-- commit as one unit. Employee B is assigned only after its earlier RLS denial
-- was verified, so it can now exercise the additional-employee link atomically.
select public.set_property_employee_assignment(
  'b0000000-0000-0000-0000-000000000001',
  'e0000000-0000-0000-0000-000000000002',
  true,
  null
);

select public.create_visit_plan_configuration(
  p_property_id => 'b0000000-0000-0000-0000-000000000001',
  p_label => 'RLS atomarer Besuchsplan',
  p_frequency => 'individual',
  p_visits_per_period => 1,
  p_weekdays => array[]::integer[],
  p_month_days => array[]::integer[],
  p_desired_time => time '11:30',
  p_window_start => null,
  p_window_end => null,
  p_start_date => current_date + 7,
  p_end_date => current_date + 7,
  p_primary_employee_id => 'e0000000-0000-0000-0000-000000000001',
  p_max_visit_minutes => 55,
  p_building_ids => array[
    'c0000000-0000-0000-0000-000000000001'::uuid,
    'c0000000-0000-0000-0000-000000000003'::uuid
  ],
  p_additional_employee_ids => array[
    'e0000000-0000-0000-0000-000000000002'::uuid
  ]
);
reset role;
set local role service_role;
select public.__portal_test_assert(
  exists (
    select 1
    from public.visit_plans as plan
    where plan.property_id = 'b0000000-0000-0000-0000-000000000001'
      and plan.label = 'RLS atomarer Besuchsplan'
      and plan.status = 'active'
      and plan.primary_employee_id = 'e0000000-0000-0000-0000-000000000001'
      and plan.desired_time = time '11:30'
      and plan.created_by = '10000000-0000-0000-0000-000000000001'
  ) and (
    select count(*) = 2
    from public.visit_plan_buildings as link
    where link.visit_plan_id = (
      select id from public.visit_plans
      where label = 'RLS atomarer Besuchsplan'
    )
      and link.building_id in (
        'c0000000-0000-0000-0000-000000000001',
        'c0000000-0000-0000-0000-000000000003'
      )
  ) and not exists (
    select 1
    from public.visit_plan_buildings as link
    where link.visit_plan_id = (
      select id from public.visit_plans
      where label = 'RLS atomarer Besuchsplan'
    )
      and link.building_id not in (
        'c0000000-0000-0000-0000-000000000001',
        'c0000000-0000-0000-0000-000000000003'
      )
  ) and (
    select count(*) = 1
    from public.visit_plan_employees as link
    where link.visit_plan_id = (
      select id from public.visit_plans
      where label = 'RLS atomarer Besuchsplan'
    )
      and link.employee_id = 'e0000000-0000-0000-0000-000000000002'
  ) and not exists (
    select 1
    from public.visit_plan_employees as link
    where link.visit_plan_id = (
      select id from public.visit_plans
      where label = 'RLS atomarer Besuchsplan'
    )
      and link.employee_id <> 'e0000000-0000-0000-0000-000000000002'
  ) and (
    select count(*) = 1
    from public.visits as visit
    where visit.visit_plan_id = (
      select id from public.visit_plans
      where label = 'RLS atomarer Besuchsplan'
    )
      and visit.status = 'scheduled'
      and visit.scheduled_date = current_date + 7
      and visit.planned_start_time = time '11:30'
  ) and (
    select count(*) = 1
    from public.visits as visit
    where visit.visit_plan_id = (
      select id from public.visit_plans
      where label = 'RLS atomarer Besuchsplan'
    )
  ) and (
    select count(*) = 2
    from public.visit_buildings as visit_building
    join public.visits as visit on visit.id = visit_building.visit_id
    where visit.visit_plan_id = (
      select id from public.visit_plans
      where label = 'RLS atomarer Besuchsplan'
    )
      and visit.status = 'scheduled'
      and visit_building.building_id in (
        'c0000000-0000-0000-0000-000000000001',
        'c0000000-0000-0000-0000-000000000003'
      )
  ) and not exists (
    select 1
    from public.visit_buildings as visit_building
    join public.visits as visit on visit.id = visit_building.visit_id
    where visit.visit_plan_id = (
      select id from public.visit_plans
      where label = 'RLS atomarer Besuchsplan'
    )
      and visit.status = 'scheduled'
      and visit_building.building_id not in (
        'c0000000-0000-0000-0000-000000000001',
        'c0000000-0000-0000-0000-000000000003'
      )
  ) and (
    select count(*) = 1
    from public.audit_logs
    where action = 'visit_plan.created'
      and entity_id = (
        select id from public.visit_plans
        where label = 'RLS atomarer Besuchsplan'
      )
  ),
  'visit-plan create RPC must commit links, one generated visit and exactly one audit atomically'
);

-- now() is transaction-stable. Age the first generated row explicitly so this
-- same-transaction regression test exercises production's supersede path.
reset role;
set local role service_role;
update public.visits
set created_at = now() - interval '1 minute'
where visit_plan_id = (
  select id from public.visit_plans
  where label = 'RLS atomarer Besuchsplan'
);
reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

select public.update_visit_plan_configuration(
  p_property_id => 'b0000000-0000-0000-0000-000000000001',
  p_visit_plan_id => (
    select id from public.visit_plans
    where label = 'RLS atomarer Besuchsplan'
  ),
  p_expected_updated_at => (
    select updated_at from public.visit_plans
    where label = 'RLS atomarer Besuchsplan'
  ),
  p_label => 'RLS atomarer Besuchsplan aktualisiert',
  p_frequency => 'individual',
  p_visits_per_period => 1,
  p_weekdays => array[]::integer[],
  p_month_days => array[]::integer[],
  p_desired_time => time '13:30',
  p_window_start => null,
  p_window_end => null,
  p_start_date => current_date + 7,
  p_end_date => current_date + 7,
  p_primary_employee_id => 'e0000000-0000-0000-0000-000000000001',
  p_max_visit_minutes => 65,
  p_building_ids => array[
    'c0000000-0000-0000-0000-000000000003'::uuid
  ],
  p_additional_employee_ids => array[]::uuid[]
);
reset role;
set local role service_role;
select public.__portal_test_assert(
  exists (
    select 1
    from public.visit_plans as plan
    where plan.property_id = 'b0000000-0000-0000-0000-000000000001'
      and plan.label = 'RLS atomarer Besuchsplan aktualisiert'
      and plan.desired_time = time '13:30'
      and plan.max_visit_minutes = 65
  ) and (
    select count(*) = 1
    from public.visit_plan_buildings as link
    where link.visit_plan_id = (
      select id from public.visit_plans
      where label = 'RLS atomarer Besuchsplan aktualisiert'
    )
      and link.building_id = 'c0000000-0000-0000-0000-000000000003'
  ) and not exists (
    select 1
    from public.visit_plan_buildings as link
    where link.visit_plan_id = (
      select id from public.visit_plans
      where label = 'RLS atomarer Besuchsplan aktualisiert'
    )
      and link.building_id <> 'c0000000-0000-0000-0000-000000000003'
  ) and not exists (
    select 1
    from public.visit_plan_employees as link
    where link.visit_plan_id = (
      select id from public.visit_plans
      where label = 'RLS atomarer Besuchsplan aktualisiert'
    )
  ) and (
    select count(*) = 1
    from public.visits as visit
    where visit.visit_plan_id = (
      select id from public.visit_plans
      where label = 'RLS atomarer Besuchsplan aktualisiert'
    )
      and visit.status = 'scheduled'
      and visit.scheduled_date = current_date + 7
      and visit.planned_start_time = time '13:30'
  ) and (
    select count(*) = 1
    from public.visits as visit
    where visit.visit_plan_id = (
      select id from public.visit_plans
      where label = 'RLS atomarer Besuchsplan aktualisiert'
    )
      and visit.status = 'canceled'
      and visit.planned_start_time = time '11:30'
  ) and (
    select count(*) = 2
    from public.visits as visit
    where visit.visit_plan_id = (
      select id from public.visit_plans
      where label = 'RLS atomarer Besuchsplan aktualisiert'
    )
  ) and (
    select count(*) = 1
    from public.visit_buildings as visit_building
    join public.visits as visit on visit.id = visit_building.visit_id
    where visit.visit_plan_id = (
      select id from public.visit_plans
      where label = 'RLS atomarer Besuchsplan aktualisiert'
    )
      and visit.status = 'scheduled'
      and visit_building.building_id = 'c0000000-0000-0000-0000-000000000003'
  ) and not exists (
    select 1
    from public.visit_buildings as visit_building
    join public.visits as visit on visit.id = visit_building.visit_id
    where visit.visit_plan_id = (
      select id from public.visit_plans
      where label = 'RLS atomarer Besuchsplan aktualisiert'
    )
      and visit.status = 'scheduled'
      and visit_building.building_id <> 'c0000000-0000-0000-0000-000000000003'
  ) and (
    select count(*) = 1
    from public.audit_logs
    where action = 'visit_plan.updated'
      and entity_id = (
        select id from public.visit_plans
        where label = 'RLS atomarer Besuchsplan aktualisiert'
      )
  ),
  'visit-plan update RPC must replace links and generated visit with exactly one audit atomically'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select public.__portal_test_assert_fails_matching(
  $$select public.update_visit_plan_configuration(
      p_property_id => 'b0000000-0000-0000-0000-000000000001',
      p_visit_plan_id => (
        select id from public.visit_plans
        where label = 'RLS atomarer Besuchsplan aktualisiert'
      ),
      p_expected_updated_at => '2000-01-01 00:00:00+00',
      p_label => 'Unzulässige veraltete Planänderung',
      p_frequency => 'individual',
      p_visits_per_period => 1,
      p_weekdays => array[]::integer[],
      p_month_days => array[]::integer[],
      p_desired_time => time '15:30',
      p_window_start => null,
      p_window_end => null,
      p_start_date => current_date + 7,
      p_end_date => current_date + 7,
      p_primary_employee_id => 'e0000000-0000-0000-0000-000000000001',
      p_max_visit_minutes => 70,
      p_building_ids => array['c0000000-0000-0000-0000-000000000001'::uuid],
      p_additional_employee_ids => array[]::uuid[]
    )$$,
  'Der Besuchsplan wurde zwischenzeitlich geändert',
  'stale visit-plan versions must never overwrite newer configuration'
);
reset role;
set local role service_role;
select public.__portal_test_assert(
  exists (
    select 1 from public.visit_plans
    where label = 'RLS atomarer Besuchsplan aktualisiert'
      and desired_time = time '13:30'
      and max_visit_minutes = 65
  ) and not exists (
    select 1 from public.visit_plans
    where label = 'Unzulässige veraltete Planänderung'
  ) and (
    select count(*) = 1
    from public.visit_plan_buildings as link
    where link.visit_plan_id = (
      select id from public.visit_plans
      where label = 'RLS atomarer Besuchsplan aktualisiert'
    )
      and link.building_id = 'c0000000-0000-0000-0000-000000000003'
  ) and not exists (
    select 1
    from public.visit_plan_employees as link
    where link.visit_plan_id = (
      select id from public.visit_plans
      where label = 'RLS atomarer Besuchsplan aktualisiert'
    )
  ) and (
    select count(*) = 1
    from public.audit_logs
    where action = 'visit_plan.updated'
      and entity_id = (
        select id from public.visit_plans
        where label = 'RLS atomarer Besuchsplan aktualisiert'
      )
  ),
  'failed stale plan update must leave configuration and audit history unchanged'
);
reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select public.set_visit_plan_status(
  'b0000000-0000-0000-0000-000000000001',
  (
    select id from public.visit_plans
    where label = 'RLS atomarer Besuchsplan aktualisiert'
  ),
  'paused',
  'active'
);
reset role;
set local role service_role;
select public.__portal_test_assert(
  exists (
    select 1 from public.visit_plans
    where label = 'RLS atomarer Besuchsplan aktualisiert'
      and status = 'paused'
  )
  and not exists (
    select 1
    from public.visits as visit
    where visit.visit_plan_id = (
      select id from public.visit_plans
      where label = 'RLS atomarer Besuchsplan aktualisiert'
    )
      and visit.status = 'scheduled'
      and visit.manually_adjusted = false
      and visit.scheduled_date >= current_date
  )
  and exists (
    select 1
    from public.audit_logs
    where action = 'visit_plan.status_changed'
      and entity_id = (
        select id from public.visit_plans
        where label = 'RLS atomarer Besuchsplan aktualisiert'
      )
      and metadata ->> 'status' = 'paused'
      and (metadata ->> 'canceled_visits')::integer = 1
  ),
  'pausing a plan must atomically cancel its untouched future generated visits'
);
reset role;

-- Plan lifecycle changes must remain prospective. An overdue scheduled visit
-- is historical operational evidence and therefore survives archival exactly
-- as recorded.
set local role service_role;
insert into public.visits (
  id, visit_plan_id, property_id, primary_employee_id,
  scheduled_date, scheduled_start, status, manually_adjusted, schedule_key
) values
  (
    'f0000000-0000-0000-0000-000000000098',
    (
      select id from public.visit_plans
      where label = 'RLS atomarer Besuchsplan aktualisiert'
    ),
    'b0000000-0000-0000-0000-000000000001',
    'e0000000-0000-0000-0000-000000000001',
    current_date - 1,
    now() - interval '1 day',
    'scheduled',
    false,
    'rls-past-visit-must-survive'
  ),
  (
    'f0000000-0000-0000-0000-000000000097',
    (
      select id from public.visit_plans
      where label = 'RLS atomarer Besuchsplan aktualisiert'
    ),
    'b0000000-0000-0000-0000-000000000001',
    'e0000000-0000-0000-0000-000000000001',
    current_date - 2,
    now() - interval '2 days',
    'scheduled',
    true,
    'rls-past-manual-visit-must-survive'
  );
reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select public.set_visit_plan_status(
  'b0000000-0000-0000-0000-000000000001',
  (
    select id from public.visit_plans
    where label = 'RLS atomarer Besuchsplan aktualisiert'
  ),
  'archived',
  'paused'
);
reset role;
set local role service_role;
select public.__portal_test_assert(
  exists (
    select 1
    from public.visits
    where id = 'f0000000-0000-0000-0000-000000000098'
      and status = 'scheduled'
      and canceled_at is null
      and cancellation_reason is null
      and schedule_key = 'rls-past-visit-must-survive'
  )
  and exists (
    select 1
    from public.visits
    where id = 'f0000000-0000-0000-0000-000000000097'
      and status = 'scheduled'
      and manually_adjusted = true
      and canceled_at is null
      and cancellation_reason is null
      and schedule_key = 'rls-past-manual-visit-must-survive'
  )
  and exists (
    select 1
    from public.visit_plans
    where label = 'RLS atomarer Besuchsplan aktualisiert'
      and status = 'archived'
  )
  and exists (
    select 1
    from public.audit_logs
    where action = 'visit_plan.status_changed'
      and entity_id = (
        select id from public.visit_plans
        where label = 'RLS atomarer Besuchsplan aktualisiert'
      )
      and metadata ->> 'previous_status' = 'paused'
      and metadata ->> 'status' = 'archived'
      and (metadata ->> 'canceled_visits')::integer = 0
  ),
  'archiving a plan must not rewrite historical scheduled visits'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000001', true);
select public.__portal_test_assert(
  not exists (
    select 1 from public.properties
    where id = 'b0000000-0000-0000-0000-000000000002'
  ),
  'employee must immediately lose access to an archived assigned property'
);
reset role;

-- A failed chat attachment is compensated by deleting its message. That must
-- also remove any attachment metadata, participant notifications and delivery
-- state created before the failure was observed by the application.
set local role service_role;
insert into public.property_messages (
  id, property_id, sender_id, message_type, body
) values (
  '91000000-0000-0000-0000-000000000099',
  'b0000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  'user', 'Compensation-Cleanup-Test'
);
insert into public.message_attachments (
  id, message_id, bucket, path, filename, mime_type, size_bytes, uploaded_by
) values (
  '91100000-0000-0000-0000-000000000099',
  '91000000-0000-0000-0000-000000000099',
  'property-message-attachments',
  'b0000000-0000-0000-0000-000000000001/91000000-0000-0000-0000-000000000099/test.png',
  'test.png', 'image/png', 1,
  '20000000-0000-0000-0000-000000000001'
);
reset role;

create temporary table __chat_cleanup_notification_ids on commit drop as
select id
from public.notifications
where entity_type = 'property_messages'
  and entity_id = '91000000-0000-0000-0000-000000000099';

select public.__portal_test_assert(
  exists (select 1 from __chat_cleanup_notification_ids),
  'user-message insert must create participant notifications before compensation'
);
insert into public.notification_deliveries (notification_id)
select id from __chat_cleanup_notification_ids limit 1;

set local role service_role;
delete from public.property_messages
where id = '91000000-0000-0000-0000-000000000099';
reset role;

select public.__portal_test_assert(
  not exists (
    select 1 from public.notifications
    where entity_type = 'property_messages'
      and entity_id = '91000000-0000-0000-0000-000000000099'
  ),
  'compensating message delete must remove generated notifications'
);
select public.__portal_test_assert(
  not exists (
    select 1 from public.message_attachments
    where message_id = '91000000-0000-0000-0000-000000000099'
  ),
  'compensating message delete must cascade attachment metadata'
);
select public.__portal_test_assert(
  not exists (
    select 1
    from public.notification_deliveries as delivery
    join __chat_cleanup_notification_ids as notification
      on notification.id = delivery.notification_id
  ),
  'notification delivery state must cascade with deleted message notifications'
);

-- Structural policy/bucket/realtime checks execute as migration owner.
select public.__portal_test_assert(
  (
    select count(*) = 6 and coalesce(bool_and(not public), false)
    from storage.buckets
    where id in (
      'damage-attachments', 'operational-report-attachments',
      'visit-task-attachments', 'property-message-attachments',
      'complaint-attachments', 'equipment-images'
    )
  ),
  'all portal upload buckets must be private'
);
set local role service_role;
select public.__portal_test_assert_fails_matching(
  $$update public.visit_equipment
    set required_quantity = 99
    where visit_id = 'f0000000-0000-0000-0000-000000000001'$$,
  'Equipment-Snapshots abgeschlossener Einsätze sind unveränderlich',
  'completed visit equipment snapshot must be immutable even for privileged writers'
);
reset role;
select public.__portal_test_assert(
  (
    select count(*) = 4
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename in (
        'property_messages', 'message_attachments', 'message_reactions', 'message_reads'
      )
  ),
  'chat tables must belong to supabase_realtime publication'
);
select public.__portal_test_assert(
  exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'storage_portal_attachment_select'
  ),
  'private attachment storage SELECT policy must exist'
);
select public.__portal_test_assert(
  not has_function_privilege(
    'authenticated',
    'public.generate_upcoming_visits(integer,uuid)',
    'execute'
  )
  and has_function_privilege(
    'service_role',
    'public.generate_upcoming_visits(integer,uuid)',
    'execute'
  )
  and not has_function_privilege(
    'authenticated',
    'private.generate_upcoming_visits_unlocked(integer,uuid)',
    'execute'
  ),
  'only the trusted server role may execute the low-level visit generator'
);

rollback;
