create extension if not exists pgcrypto;

create type public.app_role as enum ('admin', 'employee', 'customer');
create type public.profile_status as enum ('invited', 'active', 'disabled');
create type public.invitation_status as enum ('pending', 'accepted', 'revoked', 'expired');
create type public.lead_status as enum ('new', 'qualified', 'converted', 'archived');
create type public.customer_status as enum ('lead', 'active', 'inactive', 'archived');
create type public.project_status as enum ('planning', 'active', 'paused', 'completed', 'archived');
create type public.interval_unit as enum ('one_time', 'daily', 'weekly', 'monthly', 'seasonal', 'custom');
create type public.shift_status as enum ('open', 'submitted', 'approved', 'rejected');
create type public.material_request_status as enum ('requested', 'approved', 'ordered', 'delivered', 'rejected', 'canceled');
create type public.offer_status as enum ('draft', 'released', 'accepted', 'rejected', 'expired', 'archived');
create type public.invoice_status as enum ('draft', 'released', 'open', 'paid', 'overdue', 'canceled');
create type public.document_visibility as enum ('admin', 'employee', 'customer', 'shared');

create table public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null,
  email text not null,
  full_name text not null default '',
  phone text,
  status public.profile_status not null default 'invited',
  onboarding_completed boolean not null default false,
  invited_by uuid references public.user_profiles(id),
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  role public.app_role not null,
  profile_id uuid references public.user_profiles(id) on delete set null,
  status public.invitation_status not null default 'pending',
  invited_by uuid references public.user_profiles(id) on delete set null,
  token_note text,
  sent_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  portal_user_id uuid references public.user_profiles(id) on delete set null,
  status public.customer_status not null default 'lead',
  company_name text,
  contact_name text not null default '',
  email text not null,
  phone text,
  billing_address text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.employee_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references public.user_profiles(id) on delete cascade,
  full_name text not null,
  email text not null,
  phone text,
  status public.profile_status not null default 'invited',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete set null,
  source text not null default 'website',
  status public.lead_status not null default 'new',
  company_name text,
  contact_name text,
  email text,
  phone text,
  object_address text,
  object_type text,
  requested_services text[] not null default '{}',
  frequency text,
  desired_start_date date,
  preferred_callback_time text,
  message text,
  estimate jsonb,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  status public.project_status not null default 'planning',
  name text not null,
  object_address text not null,
  object_type text,
  public_notes text,
  admin_notes text,
  employee_instructions text,
  primary_employee_id uuid references public.employee_profiles(id) on delete set null,
  care_started_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.project_assignments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  employee_id uuid not null references public.employee_profiles(id) on delete cascade,
  assigned_by uuid references public.user_profiles(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(project_id, employee_id)
);

create table public.project_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  description text,
  category text,
  interval_label text,
  interval_unit public.interval_unit not null default 'custom',
  interval_value integer,
  seasonal boolean not null default false,
  season_start_month integer,
  season_end_month integer,
  visible_to_customer boolean not null default true,
  employee_notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.task_intervals (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.project_tasks(id) on delete cascade,
  label text not null,
  interval_unit public.interval_unit not null,
  interval_value integer,
  months integer[],
  weekdays text[],
  created_at timestamptz not null default now()
);

create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  employee_id uuid not null references public.employee_profiles(id) on delete cascade,
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz,
  gross_minutes integer not null default 0,
  break_minutes integer not null default 0,
  net_minutes integer not null default 0,
  notes text,
  status public.shift_status not null default 'open',
  customer_visible boolean not null default false,
  reviewed_by uuid references public.user_profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.shift_tasks (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.shifts(id) on delete cascade,
  task_id uuid not null references public.project_tasks(id) on delete cascade,
  done boolean not null default false,
  note text,
  created_at timestamptz not null default now(),
  unique(shift_id, task_id)
);

create table public.material_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  employee_id uuid references public.employee_profiles(id) on delete set null,
  user_id uuid references public.user_profiles(id) on delete set null,
  title text not null,
  category text not null default 'sonstiges Material',
  quantity numeric(10,2),
  unit text,
  note text,
  status public.material_request_status not null default 'requested',
  admin_comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.offers (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  status public.offer_status not null default 'draft',
  title text not null,
  intro text,
  net_total numeric(12,2) not null default 0,
  tax_rate numeric(5,2) not null default 19,
  tax_total numeric(12,2) not null default 0,
  gross_total numeric(12,2) not null default 0,
  admin_notes text,
  released_at timestamptz,
  accepted_at timestamptz,
  accepted_by uuid references public.user_profiles(id) on delete set null,
  acceptance_name text,
  acceptance_signature text,
  acceptance_confirmed boolean not null default false,
  acceptance_ip text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.offer_items (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.offers(id) on delete cascade,
  title text not null,
  description text,
  quantity numeric(10,2) not null default 1,
  unit text not null default 'Pauschale',
  unit_net numeric(12,2) not null default 0,
  total_net numeric(12,2) not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  offer_id uuid references public.offers(id) on delete set null,
  status public.invoice_status not null default 'draft',
  invoice_number text,
  title text not null default 'Hausvia Rechnung',
  due_date date,
  net_total numeric(12,2) not null default 0,
  tax_rate numeric(5,2) not null default 19,
  tax_total numeric(12,2) not null default 0,
  gross_total numeric(12,2) not null default 0,
  released_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  title text not null,
  description text,
  quantity numeric(10,2) not null default 1,
  unit text not null default 'Pauschale',
  unit_net numeric(12,2) not null default 0,
  total_net numeric(12,2) not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  related_table text,
  related_id uuid,
  bucket text not null,
  path text not null,
  filename text not null,
  mime_type text,
  visibility public.document_visibility not null default 'admin',
  released_to_customer boolean not null default false,
  uploaded_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.user_profiles(id) on delete set null,
  action text not null,
  entity_table text,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index customers_portal_user_id_idx on public.customers(portal_user_id);
create index leads_customer_id_idx on public.leads(customer_id);
create index projects_customer_id_idx on public.projects(customer_id);
create index project_assignments_project_id_idx on public.project_assignments(project_id);
create index project_assignments_employee_id_idx on public.project_assignments(employee_id);
create index shifts_employee_id_idx on public.shifts(employee_id);
create index shifts_project_id_idx on public.shifts(project_id);
create index offers_customer_id_idx on public.offers(customer_id);
create index invoices_customer_id_idx on public.invoices(customer_id);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger user_profiles_touch_updated_at before update on public.user_profiles
for each row execute function public.touch_updated_at();
create trigger customers_touch_updated_at before update on public.customers
for each row execute function public.touch_updated_at();
create trigger employee_profiles_touch_updated_at before update on public.employee_profiles
for each row execute function public.touch_updated_at();
create trigger leads_touch_updated_at before update on public.leads
for each row execute function public.touch_updated_at();
create trigger projects_touch_updated_at before update on public.projects
for each row execute function public.touch_updated_at();
create trigger project_tasks_touch_updated_at before update on public.project_tasks
for each row execute function public.touch_updated_at();
create trigger shifts_touch_updated_at before update on public.shifts
for each row execute function public.touch_updated_at();
create trigger material_requests_touch_updated_at before update on public.material_requests
for each row execute function public.touch_updated_at();
create trigger offers_touch_updated_at before update on public.offers
for each row execute function public.touch_updated_at();
create trigger invoices_touch_updated_at before update on public.invoices
for each row execute function public.touch_updated_at();

create or replace function public.current_user_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.user_profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() = 'admin', false);
$$;

create or replace function public.is_customer_user(customer_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.customers c
    where c.id = customer_uuid and c.portal_user_id = auth.uid()
  );
$$;

create or replace function public.is_employee_assigned(project_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.project_assignments pa
    join public.employee_profiles ep on ep.id = pa.employee_id
    where pa.project_id = project_uuid
      and pa.active = true
      and ep.user_id = auth.uid()
  );
$$;

create or replace function public.can_access_project(project_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
    or public.is_employee_assigned(project_uuid)
    or exists (
      select 1
      from public.projects p
      join public.customers c on c.id = p.customer_id
      where p.id = project_uuid and c.portal_user_id = auth.uid()
    );
$$;

alter table public.user_profiles enable row level security;
alter table public.invitations enable row level security;
alter table public.customers enable row level security;
alter table public.employee_profiles enable row level security;
alter table public.leads enable row level security;
alter table public.projects enable row level security;
alter table public.project_assignments enable row level security;
alter table public.project_tasks enable row level security;
alter table public.task_intervals enable row level security;
alter table public.shifts enable row level security;
alter table public.shift_tasks enable row level security;
alter table public.material_requests enable row level security;
alter table public.offers enable row level security;
alter table public.offer_items enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.documents enable row level security;
alter table public.audit_logs enable row level security;

create policy "profiles_select_own_or_admin" on public.user_profiles
for select using (id = auth.uid() or public.is_admin());
create policy "profiles_admin_all" on public.user_profiles
for all using (public.is_admin()) with check (public.is_admin());
create policy "profiles_update_own" on public.user_profiles
for update using (id = auth.uid()) with check (id = auth.uid());

create policy "invitations_admin_all" on public.invitations
for all using (public.is_admin()) with check (public.is_admin());

create policy "customers_admin_all" on public.customers
for all using (public.is_admin()) with check (public.is_admin());
create policy "customers_customer_select_own" on public.customers
for select using (public.is_customer_user(id));
create policy "customers_employee_select_assigned" on public.customers
for select using (
  exists (
    select 1 from public.projects p
    where p.customer_id = customers.id and public.is_employee_assigned(p.id)
  )
);

create policy "employees_admin_all" on public.employee_profiles
for all using (public.is_admin()) with check (public.is_admin());
create policy "employees_select_own" on public.employee_profiles
for select using (user_id = auth.uid());
create policy "employees_update_own" on public.employee_profiles
for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "leads_admin_all" on public.leads
for all using (public.is_admin()) with check (public.is_admin());
create policy "leads_customer_select_own" on public.leads
for select using (customer_id is not null and public.is_customer_user(customer_id));

create policy "projects_admin_all" on public.projects
for all using (public.is_admin()) with check (public.is_admin());
create policy "projects_customer_select_own" on public.projects
for select using (public.is_customer_user(customer_id));
create policy "projects_employee_select_assigned" on public.projects
for select using (public.is_employee_assigned(id));

create policy "assignments_admin_all" on public.project_assignments
for all using (public.is_admin()) with check (public.is_admin());
create policy "assignments_employee_select_own" on public.project_assignments
for select using (
  exists (
    select 1 from public.employee_profiles ep
    where ep.id = project_assignments.employee_id and ep.user_id = auth.uid()
  )
);

create policy "tasks_admin_all" on public.project_tasks
for all using (public.is_admin()) with check (public.is_admin());
create policy "tasks_employee_select_assigned" on public.project_tasks
for select using (public.is_employee_assigned(project_id));
create policy "tasks_customer_select_visible" on public.project_tasks
for select using (
  visible_to_customer = true
  and exists (
    select 1 from public.projects p
    where p.id = project_tasks.project_id and public.is_customer_user(p.customer_id)
  )
);

create policy "task_intervals_admin_all" on public.task_intervals
for all using (public.is_admin()) with check (public.is_admin());
create policy "task_intervals_employee_select_assigned" on public.task_intervals
for select using (
  exists (
    select 1 from public.project_tasks t
    where t.id = task_intervals.task_id and public.is_employee_assigned(t.project_id)
  )
);
create policy "task_intervals_customer_select_visible" on public.task_intervals
for select using (
  exists (
    select 1
    from public.project_tasks t
    join public.projects p on p.id = t.project_id
    where t.id = task_intervals.task_id
      and t.visible_to_customer = true
      and public.is_customer_user(p.customer_id)
  )
);

create policy "shifts_admin_all" on public.shifts
for all using (public.is_admin()) with check (public.is_admin());
create policy "shifts_employee_select_own" on public.shifts
for select using (user_id = auth.uid());
create policy "shifts_employee_insert_own" on public.shifts
for insert with check (user_id = auth.uid() and public.is_employee_assigned(project_id));
create policy "shifts_employee_update_own_open" on public.shifts
for update using (user_id = auth.uid() and status in ('open', 'submitted')) with check (user_id = auth.uid());
create policy "shifts_customer_select_released" on public.shifts
for select using (customer_visible = true and status = 'approved' and public.is_customer_user(customer_id));

create policy "shift_tasks_admin_all" on public.shift_tasks
for all using (public.is_admin()) with check (public.is_admin());
create policy "shift_tasks_employee_all_own_shift" on public.shift_tasks
for all using (
  exists (select 1 from public.shifts s where s.id = shift_tasks.shift_id and s.user_id = auth.uid())
) with check (
  exists (select 1 from public.shifts s where s.id = shift_tasks.shift_id and s.user_id = auth.uid())
);
create policy "shift_tasks_customer_select_released" on public.shift_tasks
for select using (
  exists (
    select 1 from public.shifts s
    where s.id = shift_tasks.shift_id
      and s.customer_visible = true
      and s.status = 'approved'
      and public.is_customer_user(s.customer_id)
  )
);

create policy "materials_admin_all" on public.material_requests
for all using (public.is_admin()) with check (public.is_admin());
create policy "materials_employee_select_own" on public.material_requests
for select using (user_id = auth.uid() or public.is_employee_assigned(project_id));
create policy "materials_employee_insert_assigned" on public.material_requests
for insert with check (user_id = auth.uid() and public.is_employee_assigned(project_id));
create policy "materials_employee_update_own_requested" on public.material_requests
for update using (user_id = auth.uid() and status = 'requested') with check (user_id = auth.uid());

create policy "offers_admin_all" on public.offers
for all using (public.is_admin()) with check (public.is_admin());
create policy "offers_customer_select_released" on public.offers
for select using (status in ('released', 'accepted', 'rejected', 'expired') and public.is_customer_user(customer_id));
create policy "offers_customer_accept_released" on public.offers
for update using (status = 'released' and public.is_customer_user(customer_id))
with check (status = 'accepted' and public.is_customer_user(customer_id));

create policy "offer_items_admin_all" on public.offer_items
for all using (public.is_admin()) with check (public.is_admin());
create policy "offer_items_customer_select_released" on public.offer_items
for select using (
  exists (
    select 1 from public.offers o
    where o.id = offer_items.offer_id
      and o.status in ('released', 'accepted', 'rejected', 'expired')
      and public.is_customer_user(o.customer_id)
  )
);

create policy "invoices_admin_all" on public.invoices
for all using (public.is_admin()) with check (public.is_admin());
create policy "invoices_customer_select_released" on public.invoices
for select using (status in ('released', 'open', 'paid', 'overdue', 'canceled') and public.is_customer_user(customer_id));

create policy "invoice_items_admin_all" on public.invoice_items
for all using (public.is_admin()) with check (public.is_admin());
create policy "invoice_items_customer_select_released" on public.invoice_items
for select using (
  exists (
    select 1 from public.invoices i
    where i.id = invoice_items.invoice_id
      and i.status in ('released', 'open', 'paid', 'overdue', 'canceled')
      and public.is_customer_user(i.customer_id)
  )
);

create policy "documents_admin_all" on public.documents
for all using (public.is_admin()) with check (public.is_admin());
create policy "documents_employee_select_assigned" on public.documents
for select using (
  visibility in ('employee', 'shared')
  and project_id is not null
  and public.is_employee_assigned(project_id)
);
create policy "documents_customer_select_released" on public.documents
for select using (
  released_to_customer = true
  and visibility in ('customer', 'shared')
  and customer_id is not null
  and public.is_customer_user(customer_id)
);

create policy "audit_admin_select" on public.audit_logs
for select using (public.is_admin());
create policy "audit_authenticated_insert" on public.audit_logs
for insert with check (auth.uid() is not null);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('offer-pdfs', 'offer-pdfs', false, 10485760, array['application/pdf']),
  ('invoice-pdfs', 'invoice-pdfs', false, 10485760, array['application/pdf']),
  ('customer-documents', 'customer-documents', false, 20971520, null),
  ('project-documents', 'project-documents', false, 20971520, null),
  ('shift-photos', 'shift-photos', false, 20971520, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "storage_admin_all_hausvia" on storage.objects
for all using (bucket_id in ('offer-pdfs', 'invoice-pdfs', 'customer-documents', 'project-documents', 'shift-photos') and public.is_admin())
with check (bucket_id in ('offer-pdfs', 'invoice-pdfs', 'customer-documents', 'project-documents', 'shift-photos') and public.is_admin());

create policy "storage_employee_shift_photos" on storage.objects
for insert with check (bucket_id = 'shift-photos' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "storage_employee_read_own_shift_photos" on storage.objects
for select using (bucket_id = 'shift-photos' and auth.uid()::text = (storage.foldername(name))[1]);
