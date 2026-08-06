-- Customers need access to the customer-safe task snapshot before and during an Einsatz
-- so the property calendar can explain what is planned. Evidence uploaded by
-- employees remains completion-only and is guarded by a separate helper.

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
          and v.status in ('scheduled', 'started', 'completed')
          and (select private.is_customer_of_property(vt.property_id))
        )
      )
  )
$$;

create or replace function private.can_read_visit_task_attachment(
  p_visit_task_id uuid
)
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

revoke all on function private.can_read_visit_task(uuid)
from public, anon, authenticated, service_role;
revoke all on function private.can_read_visit_task_attachment(uuid)
from public, anon, authenticated, service_role;

grant execute on function private.can_read_visit_task(uuid) to authenticated;
grant execute on function private.can_read_visit_task_attachment(uuid) to authenticated;

drop policy if exists visit_task_attachments_participant_select
on public.visit_task_attachments;

create policy visit_task_attachments_participant_select
on public.visit_task_attachments for select to authenticated
using ((select private.can_read_visit_task_attachment(visit_task_id)));

drop policy if exists "storage_portal_attachment_select" on storage.objects;

create policy "storage_portal_attachment_select" on storage.objects
for select to authenticated
using (
  (
    bucket_id = 'visit-task-attachments'
    and exists (
      select 1 from public.visit_task_attachments a
      where a.bucket = storage.objects.bucket_id
        and a.path = storage.objects.name
        and (select private.can_read_visit_task_attachment(a.visit_task_id))
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
