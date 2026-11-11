-- Keep archived customers available for email audiences unless they opt out.
alter table public.green_grin_customers
  add column if not exists email_marketing_allowed boolean not null default true,
  add column if not exists email_unsubscribed_at timestamptz;

update public.green_grin_customers
set email_marketing_allowed = true
where email_marketing_allowed is null;

grant all privileges on table public.green_grin_customers to service_role;
