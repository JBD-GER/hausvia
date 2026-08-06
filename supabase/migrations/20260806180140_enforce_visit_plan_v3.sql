-- Visit plans must be mutated through the v3 wrappers so every new or edited
-- plan receives an explicit service selection and its unplanned-task setting.
-- The wrappers are SECURITY DEFINER functions owned by the migration role and
-- can continue calling v2 internally after these client privileges are removed.

revoke execute on function public.create_visit_plan_configuration_v2(
  uuid, text, text, integer, integer[], integer[], time, time, time, date,
  date, uuid, integer, uuid[], uuid[]
) from public, anon, authenticated, service_role;

revoke execute on function public.update_visit_plan_configuration_v2(
  uuid, uuid, timestamptz, text, text, integer, integer[], integer[], time,
  time, time, date, date, uuid, integer, uuid[], uuid[]
) from public, anon, authenticated, service_role;
