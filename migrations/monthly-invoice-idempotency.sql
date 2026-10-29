-- Safe repeat-click protection for monthly invoices.
alter table public.green_grin_invoices add column if not exists billing_cycle text;
alter table public.green_grin_invoices add column if not exists idempotency_key text;
create unique index if not exists green_grin_invoices_billing_key_idx
  on public.green_grin_invoices(idempotency_key) where idempotency_key is not null;
grant usage on schema public to service_role;
grant all privileges on table public.green_grin_invoices to service_role;
notify pgrst, 'reload schema';
