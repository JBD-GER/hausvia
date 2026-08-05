-- Failed attachment uploads compensate by deleting the just-created message.
-- Keep that deletion complete even if attachment metadata committed and remove
-- the polymorphic notifications created by the message insert trigger.

alter table public.message_attachments
  drop constraint if exists message_attachments_message_id_fkey;
alter table public.message_attachments
  add constraint message_attachments_message_id_fkey
  foreign key (message_id)
  references public.property_messages(id)
  on delete cascade;

create index if not exists notifications_entity_idx
  on public.notifications(entity_type, entity_id);

create or replace function private.cleanup_property_message_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.notifications
  where entity_type = 'property_messages'
    and entity_id = old.id;
  return old;
end;
$$;

revoke all on function private.cleanup_property_message_notifications()
  from public, anon, authenticated, service_role;

drop trigger if exists property_messages_cleanup_notifications_after_delete
  on public.property_messages;
create trigger property_messages_cleanup_notifications_after_delete
after delete on public.property_messages
for each row
execute function private.cleanup_property_message_notifications();
