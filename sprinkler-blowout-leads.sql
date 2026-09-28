-- Run this once in Supabase SQL Editor before using the public sprinkler form.
create table if not exists public.green_grin_sprinkler_blowout_leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  full_name text not null,
  email text not null,
  phone text,
  service_address text not null,
  zones integer not null default 0,
  spigots integer not null default 0,
  notes text,
  share_code text not null unique,
  referred_by_code text,
  discount_percent numeric(5,2) not null default 0,
  referral_count integer not null default 0,
  referral_credit_cents_per_zone integer not null default 50,
  status text not null default 'New',
  contacted_at timestamptz,
  next_year_target boolean not null default true
);
alter table public.green_grin_sprinkler_blowout_leads add column if not exists referral_count integer not null default 0;
alter table public.green_grin_sprinkler_blowout_leads add column if not exists referral_credit_cents_per_zone integer not null default 50;
alter table public.green_grin_sprinkler_blowout_leads enable row level security;
create index if not exists green_grin_sprinkler_blowout_leads_created_at_idx on public.green_grin_sprinkler_blowout_leads(created_at desc);
create index if not exists green_grin_sprinkler_blowout_leads_status_idx on public.green_grin_sprinkler_blowout_leads(status);
create index if not exists green_grin_sprinkler_blowout_leads_share_code_idx on public.green_grin_sprinkler_blowout_leads(share_code);
