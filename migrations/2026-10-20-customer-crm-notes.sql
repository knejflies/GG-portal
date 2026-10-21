create table if not exists public.green_grin_customer_crm_notes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  customer_user_id uuid not null references auth.users(id) on delete cascade,
  note_date date not null default current_date,
  note_type text not null default 'Internal note',
  subject text,
  body text not null,
  actor_type text not null default 'Owner',
  actor_name text,
  source_key text
);

create unique index if not exists green_grin_customer_crm_notes_source_key_idx
  on public.green_grin_customer_crm_notes(source_key)
  where source_key is not null;
create index if not exists green_grin_customer_crm_notes_customer_date_idx
  on public.green_grin_customer_crm_notes(customer_user_id, note_date desc, created_at desc);

alter table public.green_grin_customer_crm_notes enable row level security;
grant usage on schema public to service_role;
grant all privileges on table public.green_grin_customer_crm_notes to service_role;
notify pgrst, 'reload schema';
