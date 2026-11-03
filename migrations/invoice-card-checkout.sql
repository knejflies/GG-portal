-- Hosted one-time Helcim checkout sessions. No card numbers are stored here.
create table if not exists public.green_grin_invoice_checkout_sessions (
  checkout_token text primary key,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  completed_at timestamptz,
  invoice_id uuid not null references public.green_grin_invoices(id) on delete cascade,
  customer_user_id uuid references auth.users(id) on delete cascade,
  secret_token text not null,
  amount numeric(10,2) not null
);
alter table public.green_grin_invoice_checkout_sessions alter column customer_user_id drop not null;
alter table public.green_grin_invoices add column if not exists guest_payment_token_hash text;
alter table public.green_grin_invoices add column if not exists guest_payment_token_expires_at timestamptz;
create unique index if not exists green_grin_invoices_guest_payment_token_idx on public.green_grin_invoices(guest_payment_token_hash) where guest_payment_token_hash is not null;
create index if not exists green_grin_invoice_checkout_customer_idx on public.green_grin_invoice_checkout_sessions(customer_user_id, invoice_id);
grant usage on schema public to service_role;
grant all privileges on table public.green_grin_invoice_checkout_sessions to service_role;
notify pgrst, 'reload schema';
