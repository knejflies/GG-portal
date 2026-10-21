-- Additive migration for older Green Grin databases.
-- Run this in Supabase SQL Editor before using Locate addresses.
alter table public.green_grin_properties
  add column if not exists latitude double precision;
alter table public.green_grin_properties
  add column if not exists longitude double precision;
alter table public.green_grin_properties
  add column if not exists geocode_status text not null default 'Pending';
alter table public.green_grin_properties
  add column if not exists geocode_display_name text;

grant usage on schema public to service_role;
grant all privileges on table public.green_grin_properties to service_role;
notify pgrst, 'reload schema';
