-- Sprinkler blowout operations layer. Safe to run after portal-setup.sql.
alter table public.green_grin_sprinkler_blowout_leads
  add column if not exists customer_user_id uuid references auth.users(id) on delete set null,
  add column if not exists property_id uuid references public.green_grin_properties(id) on delete set null,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists geocode_status text not null default 'Pending',
  add column if not exists geocode_display_name text,
  add column if not exists scheduled_date date,
  add column if not exists completed_at timestamptz,
  add column if not exists completion_notes text,
  add column if not exists invoice_id uuid references public.green_grin_invoices(id) on delete set null,
  add column if not exists email_marketing_allowed boolean not null default false,
  add column if not exists sms_marketing_allowed boolean not null default false,
  add column if not exists contact_response text,
  add column if not exists followup_status text not null default 'Not queued';

create unique index if not exists green_grin_blowout_leads_customer_user_idx
  on public.green_grin_sprinkler_blowout_leads(customer_user_id) where customer_user_id is not null;
create index if not exists green_grin_blowout_leads_map_idx
  on public.green_grin_sprinkler_blowout_leads(status, geocode_status);

create table if not exists public.green_grin_sprinkler_blowout_history (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  lead_id uuid not null references public.green_grin_sprinkler_blowout_leads(id) on delete cascade,
  customer_user_id uuid references auth.users(id) on delete set null,
  property_id uuid references public.green_grin_properties(id) on delete set null,
  service_date date not null,
  zones integer not null default 0,
  spigots integer not null default 0,
  service_notes text,
  extra_charges jsonb not null default '[]'::jsonb,
  base_amount numeric(10,2) not null default 0,
  total_amount numeric(10,2) not null default 0,
  status text not null default 'Completed',
  invoice_id uuid references public.green_grin_invoices(id) on delete set null,
  idempotency_key text not null unique
);

alter table public.green_grin_invoices add column if not exists blowout_history_id uuid references public.green_grin_sprinkler_blowout_history(id) on delete set null;
create unique index if not exists green_grin_invoices_blowout_history_idx
  on public.green_grin_invoices(blowout_history_id) where blowout_history_id is not null;

create table if not exists public.green_grin_spring_followups (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  lead_id uuid not null references public.green_grin_sprinkler_blowout_leads(id) on delete cascade,
  customer_user_id uuid references auth.users(id) on delete set null,
  property_id uuid references public.green_grin_properties(id) on delete set null,
  service_interest text not null default 'Irrigation start-up',
  area text,
  contact_method text,
  contacted_at timestamptz,
  response text,
  scheduled_date date,
  status text not null default 'Queued',
  opt_out_at timestamptz
);
create unique index if not exists green_grin_spring_followups_lead_interest_idx
  on public.green_grin_spring_followups(lead_id, service_interest);

create table if not exists public.green_grin_service_visibility_settings (
  service_key text primary key,
  enabled boolean not null default true,
  visible_from date,
  visible_until date,
  updated_at timestamptz not null default now(),
  updated_by text
);
insert into public.green_grin_service_visibility_settings(service_key, enabled)
values ('sprinkler_blowout', true)
on conflict (service_key) do nothing;
