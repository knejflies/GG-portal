-- Connect giveaway applicant codes to estimates and prevent reuse.
alter table public.green_grin_giveaway_entries
  add column if not exists offer_code text,
  add column if not exists offer_redeemed_at timestamptz,
  add column if not exists offer_discount_amount numeric(12, 2) not null default 50,
  add column if not exists offer_redeemed_estimate_id uuid;

alter table public.green_grin_estimates
  add column if not exists discount_code text,
  add column if not exists discount_source_entry_id uuid,
  add column if not exists discount_amount numeric(12, 2) not null default 0;

create index if not exists green_grin_giveaway_offer_code_idx
  on public.green_grin_giveaway_entries (lower(offer_code));

create index if not exists green_grin_estimates_discount_code_idx
  on public.green_grin_estimates (lower(discount_code));
