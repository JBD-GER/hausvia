-- Acceptance hardening: keep administrative timing thresholds out of the
-- authenticated API surface and freeze internal operational reports at visit
-- completion without exposing them through the customer-safe visit snapshot.

revoke select on table public.visit_plans from authenticated;
grant select (
  id, property_id, label, frequency, visits_per_period, weekdays, month_days,
  desired_time, window_start, window_end, timezone, start_date, end_date,
  primary_employee_id, status, schedule_config, created_by, created_at,
  updated_at
) on public.visit_plans to authenticated;

alter table public.visit_admin_metrics
  add column if not exists operational_reports_snapshot jsonb
  not null default '[]'::jsonb;

revoke insert, update, delete, truncate
  on table public.visit_admin_metrics from authenticated;

create or replace function private.snapshot_visit_operational_reports()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_snapshot jsonb;
begin
  if new.status <> 'completed' or old.status = 'completed' then
    return new;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', report.id,
    'building_id', report.building_id,
    'equipment_id', report.equipment_id,
    'employee_id', report.employee_id,
    'category', report.category,
    'urgency', report.urgency,
    'title', report.title,
    'description', report.description,
    'status_at_completion', report.status,
    'created_at', report.created_at,
    'attachments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', attachment.id,
        'bucket', attachment.bucket,
        'path', attachment.path,
        'filename', attachment.filename,
        'mime_type', attachment.mime_type,
        'size_bytes', attachment.size_bytes,
        'created_at', attachment.created_at
      ) order by attachment.created_at, attachment.id)
      from public.operational_report_attachments attachment
      join storage.objects object
        on object.bucket_id = attachment.bucket
       and object.name = attachment.path
      where attachment.operational_report_id = report.id
    ), '[]'::jsonb)
  ) order by report.created_at, report.id), '[]'::jsonb)
  into v_snapshot
  from public.operational_reports report
  where report.visit_id = new.id;

  insert into public.visit_admin_metrics (
    visit_id, operational_reports_snapshot
  ) values (
    new.id, v_snapshot
  )
  on conflict (visit_id) do update
    set operational_reports_snapshot = excluded.operational_reports_snapshot,
        updated_at = now();

  return new;
end;
$$;

revoke all on function private.snapshot_visit_operational_reports()
  from public, anon, authenticated;

drop trigger if exists visits_snapshot_operational_reports on public.visits;
create trigger visits_snapshot_operational_reports
after update of status on public.visits
for each row execute function private.snapshot_visit_operational_reports();

create or replace function private.protect_visit_operational_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.operational_reports_snapshot <> '[]'::jsonb
     and new.operational_reports_snapshot is distinct from old.operational_reports_snapshot then
    raise exception 'Der Snapshot betrieblicher Einsatzmeldungen ist unveränderlich';
  end if;
  return new;
end;
$$;

revoke all on function private.protect_visit_operational_snapshot()
  from public, anon, authenticated;

drop trigger if exists visit_admin_metrics_protect_operational_snapshot
  on public.visit_admin_metrics;
create trigger visit_admin_metrics_protect_operational_snapshot
before update of operational_reports_snapshot on public.visit_admin_metrics
for each row execute function private.protect_visit_operational_snapshot();
