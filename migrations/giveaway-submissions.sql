-- Competition giveaway entries and photo uploads.
-- Run this once in Supabase before publishing the public form.
create table if not exists public.green_grin_giveaway_entries (
  id uuid primary key default gen_random_uuid(),
  competition_slug text not null default 'seasonal-giveaway',
  full_name text not null,
  email text not null,
  phone text,
  service_address text not null,
  entry_notes text,
  photo_path text not null,
  email_marketing_allowed boolean not null default false,
  sms_marketing_allowed boolean not null default false,
  terms_agreed boolean not null default false,
  consent_at timestamptz,
  status text not null default 'pending' check (status in ('pending','finalist','winner','not_selected','archived')),
  reviewer_notes text,
  offer_code text,
  offer_redeemed_at timestamptz,
  confirmation_sent_at timestamptz,
  confirmation_email_id text,
  reviewed_at timestamptz,
  share_clicked_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists green_grin_giveaway_email_idx
  on public.green_grin_giveaway_entries (competition_slug, lower(email));
create index if not exists green_grin_giveaway_status_idx
  on public.green_grin_giveaway_entries (competition_slug, status, created_at desc);

alter table public.green_grin_giveaway_entries enable row level security;
revoke all on public.green_grin_giveaway_entries from anon, authenticated;
grant all privileges on public.green_grin_giveaway_entries to service_role;

insert into storage.buckets (id, name, public)
values ('green-grin-giveaway-photos', 'green-grin-giveaway-photos', false)
on conflict (id) do update set public = false;
