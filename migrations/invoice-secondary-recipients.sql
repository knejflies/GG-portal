-- Allow invoices and receipts to be sent to a spouse, bookkeeper, or other additional contact.
alter table public.green_grin_customers add column if not exists secondary_email text;
alter table public.green_grin_invoices add column if not exists additional_emails text[] not null default '{}'::text[];
grant usage on schema public to service_role;
grant all privileges on table public.green_grin_customers to service_role;
grant all privileges on table public.green_grin_invoices to service_role;
notify pgrst, 'reload schema';
