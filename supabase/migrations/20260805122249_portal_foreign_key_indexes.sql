-- Cover administrative actor foreign keys used during profile updates/deletes.

create index if not exists audit_logs_actor_id_idx
  on public.audit_logs(actor_id);
create index if not exists building_access_notes_updated_by_idx
  on public.building_access_notes(updated_by);
create index if not exists complaint_admin_notes_updated_by_idx
  on public.complaint_admin_notes(updated_by);
create index if not exists equipment_employee_assignments_assigned_by_idx
  on public.equipment_employee_assignments(assigned_by);
create index if not exists property_admin_settings_updated_by_idx
  on public.property_admin_settings(updated_by);
create index if not exists property_briefings_updated_by_idx
  on public.property_briefings(updated_by);
create index if not exists property_compensation_rates_created_by_idx
  on public.property_compensation_rates(created_by);
create index if not exists property_employee_assignments_assigned_by_idx
  on public.property_employee_assignments(assigned_by);
create index if not exists property_service_instructions_updated_by_idx
  on public.property_service_instructions(updated_by);
