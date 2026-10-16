-- Run once in the Supabase SQL Editor. Safe to run more than once.
alter table public.green_grin_sprinkler_blowout_leads
  add column if not exists customer_price numeric(10,2) not null default 0;
