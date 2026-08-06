-- INSERT ... RETURNING is checked against the SELECT policy. The former
-- policy called private.can_read_message(id), which queried property_messages
-- again and could not see the row created by the still-running INSERT.
-- Authorize the row directly through its property instead.

drop policy if exists property_messages_participant_select
  on public.property_messages;

create policy property_messages_participant_select
on public.property_messages for select to authenticated
using ((select private.can_access_property(property_id)));
