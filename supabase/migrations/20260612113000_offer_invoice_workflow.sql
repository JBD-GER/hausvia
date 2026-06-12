alter table public.offers
  add column if not exists offer_number text,
  add column if not exists document_path text,
  add column if not exists sent_at timestamptz,
  add column if not exists billing_mode text not null default 'one_time',
  add column if not exists billing_interval_label text,
  add column if not exists closing_text text,
  add column if not exists billing_in_advance boolean not null default false,
  add column if not exists payment_due_days_before_month_end integer not null default 15;

alter table public.invoices
  add column if not exists document_path text,
  add column if not exists sent_at timestamptz,
  add column if not exists source_offer_id uuid references public.offers(id) on delete set null,
  add column if not exists service_period_start date,
  add column if not exists service_period_end date,
  add column if not exists billing_note text;

create table if not exists public.invoice_cycles (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  offer_id uuid references public.offers(id) on delete set null,
  title text not null default 'Regelmäßige Hausvia Betreuung',
  status text not null default 'active',
  frequency text not null default 'monthly',
  amount_net numeric(12,2) not null default 0,
  tax_rate numeric(5,2) not null default 19,
  tax_total numeric(12,2) not null default 0,
  amount_gross numeric(12,2) not null default 0,
  billing_in_advance boolean not null default true,
  generate_days_before_month_end integer not null default 15,
  next_period_start date,
  last_generated_at timestamptz,
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.invoices
  add column if not exists invoice_cycle_id uuid references public.invoice_cycles(id) on delete set null;

create index if not exists offers_customer_status_idx on public.offers(customer_id, status);
create index if not exists invoices_customer_status_idx on public.invoices(customer_id, status);
create index if not exists invoice_cycles_customer_id_idx on public.invoice_cycles(customer_id);
create index if not exists invoice_cycles_offer_id_idx on public.invoice_cycles(offer_id);
create index if not exists invoices_invoice_cycle_id_idx on public.invoices(invoice_cycle_id);

drop trigger if exists invoice_cycles_touch_updated_at on public.invoice_cycles;
create trigger invoice_cycles_touch_updated_at before update on public.invoice_cycles
for each row execute function public.touch_updated_at();

alter table public.invoice_cycles enable row level security;

drop policy if exists "invoice_cycles_admin_all" on public.invoice_cycles;
create policy "invoice_cycles_admin_all" on public.invoice_cycles
for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "invoice_cycles_customer_select_own" on public.invoice_cycles;
create policy "invoice_cycles_customer_select_own" on public.invoice_cycles
for select using (public.is_customer_user(customer_id));
