-- Preserve the marketing source when a giveaway applicant becomes an estimate/customer.
alter table public.green_grin_giveaway_entries
  add column if not exists conversion_status text not null default 'lead',
  add column if not exists converted_estimate_id uuid,
  add column if not exists converted_customer_user_id uuid,
  add column if not exists converted_at timestamptz;

alter table public.green_grin_estimates
  add column if not exists lead_source text,
  add column if not exists lead_campaign text,
  add column if not exists lead_source_entry_id uuid;

alter table public.green_grin_customers
  add column if not exists lead_source text,
  add column if not exists lead_campaign text,
  add column if not exists lead_source_entry_id uuid;

alter table public.green_grin_jobs
  add column if not exists lead_source text,
  add column if not exists lead_campaign text,
  add column if not exists lead_source_entry_id uuid;

create index if not exists green_grin_giveaway_conversion_status_idx
  on public.green_grin_giveaway_entries (conversion_status, created_at desc);

create index if not exists green_grin_estimates_lead_source_idx
  on public.green_grin_estimates (lead_source, lead_campaign);

create index if not exists green_grin_customers_lead_source_idx
  on public.green_grin_customers (lead_source, lead_campaign);
