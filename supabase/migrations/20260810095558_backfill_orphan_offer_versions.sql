-- Funnel submissions created legacy offer containers after Offer V2 had
-- already backfilled the existing rows. Re-run the same normalization for
-- every funnel draft that still has no version. Funnel-created offers were
-- always drafts; limiting the backfill to that state keeps the V2 freeze and
-- evidence guards fully active. The guards make this data migration safe to
-- execute more than once.

update public.offers offer
set lifecycle_status = case offer.status::text
  when 'draft' then 'draft'
  when 'released' then 'sent'
  when 'accepted' then 'accepted'
  when 'rejected' then 'rejected'
  when 'expired' then 'expired'
  when 'archived' then 'withdrawn'
  else 'draft'
end
where offer.current_version_id is null
  and offer.status::text = 'draft'
  and not exists (
    select 1
    from public.offer_versions existing
    where existing.offer_id = offer.id
  );

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
  coalesce(project.object_address, customer.billing_address),
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
    'source', 'orphan-offer-backfill',
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
  and offer.status::text = 'draft'
  and not exists (
    select 1
    from public.offer_versions existing
    where existing.offer_id = offer.id
  )
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
  case when offer.billing_mode = 'monthly' then 'monthly' else 'once' end,
  case when offer.billing_mode = 'monthly' then 'monthly' else 'one_time' end,
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
    'source', 'orphan-offer-backfill',
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
  on version.offer_id = offer.id
  and version.version_number = 1
  and version.calculation_snapshot ->> 'source' = 'orphan-offer-backfill'
cross join lateral (
  select
    greatest(coalesce(round(item.unit_net * 100)::bigint, 0), 0) as unit_net_cents,
    greatest(coalesce(round(item.total_net * 100)::bigint, 0), 0) as total_net_cents,
    greatest(
      0,
      least(10000, coalesce(round(offer.tax_rate * 100)::integer, 0))
    ) as tax_rate_bps
) legacy_item
where offer.current_version_id is null
  and not exists (
  select 1
  from public.offer_version_items existing
  where existing.offer_version_id = version.id
    and existing.client_key = item.id::text
  );

update public.offers offer
set current_version_id = version.id,
    active_version_id = case when offer.lifecycle_status <> 'draft' then version.id end,
    draft_version_id = case when offer.lifecycle_status = 'draft' then version.id end
from public.offer_versions version
where version.offer_id = offer.id
  and version.version_number = 1
  and version.calculation_snapshot ->> 'source' = 'orphan-offer-backfill'
  and offer.current_version_id is null;
