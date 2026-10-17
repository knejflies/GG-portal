create extension if not exists pgcrypto;

create table if not exists public.green_grin_lawn_measurements (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  property_id uuid references public.green_grin_properties(id) on delete set null,
  address text not null,
  latitude double precision,
  longitude double precision,
  geocode_confidence numeric(5, 4) not null default 0,
  zones jsonb not null default '[]'::jsonb,
  exclusions jsonb not null default '[]'::jsonb,
  gross_square_feet integer not null default 0,
  excluded_square_feet integer not null default 0,
  net_square_feet integer not null default 0,
  status text not null default 'Draft' check (status in ('Draft', 'Reviewed', 'Approved')),
  imagery_provider text,
  measured_by_type text not null default 'Owner',
  measured_by_employee_id uuid references public.green_grin_employees(id) on delete set null,
  measured_by_name text,
  supersedes_id uuid references public.green_grin_lawn_measurements(id) on delete set null,
  is_current boolean not null default true,
  constraint green_grin_lawn_measurements_positive_area check (gross_square_feet >= 0 and excluded_square_feet >= 0 and net_square_feet >= 0)
);

alter table public.green_grin_lawn_measurements enable row level security;
create index if not exists green_grin_lawn_measurements_property_idx on public.green_grin_lawn_measurements(property_id, created_at desc);
create index if not exists green_grin_lawn_measurements_address_idx on public.green_grin_lawn_measurements(lower(address));
create index if not exists green_grin_lawn_measurements_current_property_idx on public.green_grin_lawn_measurements(property_id, is_current, created_at desc);
