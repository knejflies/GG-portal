-- Property-level service entries, billing authorization, and idempotent monthly billing.
-- Run after portal-setup.sql in Supabase.

alter table public.green_grin_properties
  add column if not exists property_name text,
  add column if not exists property_type text not null default 'Residential',
  add column if not exists default_billing_mode text not null default 'Review first';

create table if not exists public.green_grin_service_entries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  property_id uuid not null references public.green_grin_properties(id) on delete cascade,
  customer_user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid references public.green_grin_jobs(id) on delete set null,
  service_date date not null,
  service_category text not null default 'Mowing',
  description text not null,
  quantity numeric(10,2) not null default 1,
  unit text not null default 'visit',
  customer_price numeric(10,2) not null default 0,
  status text not null default 'Completed',
  internal_notes jsonb not null default '{}'::jsonb,
  material_cost numeric(10,2) not null default 0,
  include_internal_notes boolean not null default false,
  invoice_id uuid references public.green_grin_invoices(id) on delete set null,
  source_key text,
  check (quantity > 0),
  check (customer_price >= 0),
  check (material_cost >= 0),
  check (status in ('Draft','Completed','Invoiced','Void'))
);
create unique index if not exists green_grin_service_entries_source_key_idx
  on public.green_grin_service_entries(source_key) where source_key is not null;
create index if not exists green_grin_service_entries_property_date_idx
  on public.green_grin_service_entries(property_id, service_date desc);

create table if not exists public.green_grin_billing_authorizations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  customer_user_id uuid not null references auth.users(id) on delete cascade,
  property_id uuid not null references public.green_grin_properties(id) on delete cascade,
  billing_mode text not null default 'Review first',
  authorized_services text[] not null default '{Mowing}',
  max_cycle_charge numeric(10,2),
  max_extra_price numeric(10,2),
  advance_notice_days integer not null default 0,
  provider text,
  provider_customer_ref text,
  payment_method_ref text,
  authorization_version text not null default 'v1',
  authorized_at timestamptz,
  revoked_at timestamptz,
  status text not null default 'Pending',
  check (billing_mode in ('Review first','Automatic')),
  check (advance_notice_days between 0 and 30),
  check (status in ('Pending','Active','Revoked'))
);
create unique index if not exists green_grin_billing_authorizations_property_active_idx
  on public.green_grin_billing_authorizations(property_id) where status <> 'Revoked';

create table if not exists public.green_grin_billing_audit_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  customer_user_id uuid references auth.users(id) on delete set null,
  property_id uuid references public.green_grin_properties(id) on delete set null,
  invoice_id uuid references public.green_grin_invoices(id) on delete set null,
  service_entry_id uuid references public.green_grin_service_entries(id) on delete set null,
  actor_type text not null default 'System',
  action text not null,
  details jsonb not null default '{}'::jsonb
);

alter table public.green_grin_invoices add column if not exists property_id uuid references public.green_grin_properties(id) on delete set null;
alter table public.green_grin_invoices add column if not exists billing_cycle text;
alter table public.green_grin_invoices add column if not exists source_entry_ids jsonb not null default '[]'::jsonb;
alter table public.green_grin_invoices add column if not exists idempotency_key text;
alter table public.green_grin_invoices add column if not exists charge_status text not null default 'Not requested';
alter table public.green_grin_invoices add column if not exists provider text;
alter table public.green_grin_invoices add column if not exists provider_payment_ref text;
create unique index if not exists green_grin_invoices_billing_key_idx
  on public.green_grin_invoices(idempotency_key) where idempotency_key is not null;

create or replace function public.green_grin_generate_property_invoice(p_property_id uuid, p_billing_cycle text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  property_row record;
  customer_row record;
  existing_row record;
  new_invoice public.green_grin_invoices%rowtype;
  entry_rows jsonb;
  entry_ids jsonb;
  subtotal numeric(10,2);
  invoice_key text := p_property_id::text || ':' || p_billing_cycle;
begin
  if p_billing_cycle !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception 'Billing cycle must use YYYY-MM.';
  end if;
  perform pg_advisory_xact_lock(hashtext(invoice_key));
  select * into property_row from public.green_grin_properties where id = p_property_id and active = true;
  if not found then raise exception 'Property was not found.'; end if;
  select * into customer_row from public.green_grin_customers where id = property_row.customer_user_id;
  if not found then raise exception 'Customer was not found.'; end if;

  select * into existing_row from public.green_grin_invoices where idempotency_key = invoice_key limit 1;
  if found then
    return jsonb_build_object('created', false, 'invoice', to_jsonb(existing_row));
  end if;

  select coalesce(sum(quantity * customer_price), 0),
         coalesce(jsonb_agg(jsonb_build_object(
           'id', id, 'service_date', service_date, 'description', description,
           'category', service_category, 'quantity', quantity, 'unit', unit,
           'rate', customer_price, 'amount', round((quantity * customer_price)::numeric, 2),
           'include_internal_notes', include_internal_notes,
           'internal_notes', case when include_internal_notes then internal_notes else '{}'::jsonb end
         ) order by service_date, created_at), '[]'::jsonb),
         coalesce(jsonb_agg(to_jsonb(id) order by service_date, created_at), '[]'::jsonb)
    into subtotal, entry_rows, entry_ids
    from public.green_grin_service_entries
   where property_id = p_property_id
     and status = 'Completed'
     and invoice_id is null
     and service_date >= (p_billing_cycle || '-01')::date
     and service_date < ((p_billing_cycle || '-01')::date + interval '1 month');
  if jsonb_array_length(entry_ids) = 0 then
    return jsonb_build_object('created', false, 'invoice', null, 'reason', 'No uninvoiced completed entries.');
  end if;

  insert into public.green_grin_invoices (
    customer_user_id, customer_code, customer_name, phone, email, amount, subtotal,
    line_items, due_date, status, service_line, service_address, property_id,
    billing_cycle, source_entry_ids, idempotency_key, charge_status, notes
  ) values (
    customer_row.id, customer_row.customer_code, coalesce(customer_row.full_name, 'Customer'),
    customer_row.phone, customer_row.email, subtotal, subtotal, entry_rows,
    (p_billing_cycle || '-01')::date, 'Draft', 'Monthly property services', property_row.address,
    property_row.id, p_billing_cycle, entry_ids, invoice_key, 'Not requested',
    'Generated from completed property service entries.'
  ) returning * into new_invoice;

  update public.green_grin_service_entries
     set invoice_id = new_invoice.id, status = 'Invoiced', updated_at = now()
   where id in (select jsonb_array_elements_text(entry_ids)::uuid);
  insert into public.green_grin_billing_audit_log(customer_user_id, property_id, invoice_id, actor_type, action, details)
  values (customer_row.id, property_row.id, new_invoice.id, 'System', 'invoice.generated', jsonb_build_object('billing_cycle', p_billing_cycle, 'entry_ids', entry_ids));
  return jsonb_build_object('created', true, 'invoice', to_jsonb(new_invoice));
end;
$$;
