create extension if not exists pgcrypto;

create table if not exists public.green_grin_counters (
  name text primary key,
  last_value integer not null default 0
);

insert into public.green_grin_counters (name, last_value)
values ('customer_code', 0), ('employee_code', 0)
on conflict (name) do nothing;

do $$
begin
  if to_regclass('public.green_grin_jobs') is not null then
    alter table public.green_grin_jobs add column if not exists customer_code text;
  end if;

  if to_regclass('public.green_grin_customers') is not null then
    alter table public.green_grin_customers add column if not exists customer_code text;
  end if;

  if to_regclass('public.green_grin_employees') is not null then
    alter table public.green_grin_employees add column if not exists employee_code text;
  end if;
end $$;

create table if not exists public.green_grin_jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  customer_code text,
  customer_user_id uuid references auth.users(id) on delete set null,
  customer_name text not null,
  phone text not null,
  email text,
  address text,
  service_type text,
  preferred_date date,
  scheduled_date timestamptz,
  recurring_weekly boolean not null default false,
  schedule_start_date date,
  schedule_end_date date,
  cleanup_reminder_time time not null default '08:00',
  assigned_employee_id uuid references public.green_grin_employees(id) on delete set null,
  assigned_employee_name text,
  latitude double precision,
  longitude double precision,
  monthly_price numeric(10, 2),
  annual_price numeric(10, 2),
  status text not null default 'New',
  notes text,
  last_message_template text,
  last_message_sent_at timestamptz,
  last_cleanup_reminder_sent_at timestamptz
);

alter table public.green_grin_jobs
  add column if not exists customer_user_id uuid references auth.users(id) on delete set null;

alter table public.green_grin_jobs
  add column if not exists customer_code text;

alter table public.green_grin_jobs
  add column if not exists last_cleanup_reminder_sent_at timestamptz;

alter table public.green_grin_jobs
  add column if not exists cleanup_reminder_time time not null default '08:00';

alter table public.green_grin_jobs
  add column if not exists assigned_employee_id uuid references public.green_grin_employees(id) on delete set null;

alter table public.green_grin_jobs
  add column if not exists assigned_employee_name text;

alter table public.green_grin_jobs
  add column if not exists monthly_price numeric(10, 2);

alter table public.green_grin_jobs
  add column if not exists annual_price numeric(10, 2);

alter table public.green_grin_jobs
  add column if not exists recurring_weekly boolean not null default false;

alter table public.green_grin_jobs
  add column if not exists schedule_start_date date;

alter table public.green_grin_jobs
  add column if not exists schedule_end_date date;

alter table public.green_grin_jobs
  add column if not exists latitude double precision;

alter table public.green_grin_jobs
  add column if not exists longitude double precision;

create table if not exists public.green_grin_customers (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  customer_code text unique,
  full_name text,
  phone text,
  email text,
  active boolean not null default true,
  billing_plan text,
  requested_plan_id text,
  requested_plan text,
  requested_plan_at timestamptz,
  billing_status text not null default 'Not connected',
  monthly_price numeric(10, 2),
  annual_price numeric(10, 2),
  service_weekday smallint check (service_weekday between 0 and 6),
  text_cleanup_reminders boolean not null default true,
  text_done_messages boolean not null default true,
  email_monthly_receipts boolean not null default false,
  stripe_customer_id text,
  gocardless_customer_id text
);

alter table public.green_grin_customers
  add column if not exists active boolean not null default true;

alter table public.green_grin_customers
  add column if not exists customer_code text;

alter table public.green_grin_customers
  add column if not exists billing_plan text;

alter table public.green_grin_customers
  add column if not exists requested_plan_id text;

alter table public.green_grin_customers
  add column if not exists requested_plan text;

alter table public.green_grin_customers
  add column if not exists requested_plan_at timestamptz;

alter table public.green_grin_customers
  add column if not exists billing_status text not null default 'Not connected';

alter table public.green_grin_customers
  add column if not exists monthly_price numeric(10, 2);

alter table public.green_grin_customers
  add column if not exists annual_price numeric(10, 2);

alter table public.green_grin_customers
  add column if not exists service_weekday smallint check (service_weekday between 0 and 6);

create table if not exists public.green_grin_customer_chat (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  customer_user_id uuid not null references auth.users(id) on delete cascade,
  customer_code text,
  sender_type text not null check (sender_type in ('Customer', 'Owner')),
  sender_name text,
  message text not null check (char_length(message) between 1 and 1000),
  read_at timestamptz
);

alter table public.green_grin_customers
  add column if not exists text_cleanup_reminders boolean not null default true;

alter table public.green_grin_customers
  add column if not exists text_done_messages boolean not null default true;

alter table public.green_grin_customers
  add column if not exists email_monthly_receipts boolean not null default false;

create table if not exists public.green_grin_properties (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  customer_user_id uuid not null references auth.users(id) on delete cascade,
  address text,
  gate_code text,
  pets text,
  yard_notes text,
  service_preferences text,
  active boolean not null default true
);

create table if not exists public.green_grin_employees (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  employee_code text unique,
  user_id uuid references auth.users(id) on delete set null,
  full_name text not null,
  email text not null unique,
  phone text,
  status text not null default 'Pending',
  employee_pin text,
  hourly_rate numeric(10, 2),
  is_marketer boolean not null default false,
  is_subcontractor boolean not null default false,
  subcontractor_services text[] not null default '{}'::text[],
  role text not null default 'Crew'
);

alter table public.green_grin_employees
  add column if not exists employee_pin text;

alter table public.green_grin_employees
  add column if not exists employee_code text;

alter table public.green_grin_employees
  add column if not exists hourly_rate numeric(10, 2);

alter table public.green_grin_employees
  add column if not exists is_marketer boolean not null default false;

alter table public.green_grin_employees
  add column if not exists is_subcontractor boolean not null default false;

alter table public.green_grin_employees
  add column if not exists subcontractor_services text[] not null default '{}'::text[];

alter table public.green_grin_employees
  add column if not exists role text not null default 'Crew';

create table if not exists public.green_grin_daily_route_assignments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  route_date date not null,
  job_id uuid not null references public.green_grin_jobs(id) on delete cascade,
  assigned_employee_id uuid not null references public.green_grin_employees(id) on delete cascade,
  assigned_employee_name text,
  stop_order integer not null default 0,
  unique (route_date, job_id)
);

alter table public.green_grin_daily_route_assignments
  add column if not exists stop_order integer not null default 0;

create table if not exists public.green_grin_marketing_routes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  subdivision_name text not null,
  city text not null,
  state text not null default 'ID',
  notes text,
  assigned_employee_id uuid not null references public.green_grin_employees(id) on delete cascade,
  assigned_employee_name text,
  status text not null default 'Active'
);

create table if not exists public.green_grin_marketing_leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  contacted_at timestamptz,
  route_id uuid not null references public.green_grin_marketing_routes(id) on delete cascade,
  assigned_employee_id uuid not null references public.green_grin_employees(id) on delete cascade,
  address text not null,
  latitude double precision not null,
  longitude double precision not null,
  status text not null default 'New',
  prospect_name text,
  phone text,
  email text,
  notes text
);

create table if not exists public.green_grin_time_entries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  employee_id uuid not null references public.green_grin_employees(id) on delete cascade,
  employee_code text,
  employee_name text,
  clock_in_at timestamptz not null,
  clock_out_at timestamptz,
  total_minutes integer,
  hourly_rate numeric(10, 2),
  gross_pay numeric(10, 2),
  notes text
);

alter table public.green_grin_time_entries
  add column if not exists employee_code text;

alter table public.green_grin_time_entries
  add column if not exists employee_name text;

alter table public.green_grin_time_entries
  add column if not exists clock_out_at timestamptz;

alter table public.green_grin_time_entries
  add column if not exists total_minutes integer;

alter table public.green_grin_time_entries
  add column if not exists hourly_rate numeric(10, 2);

alter table public.green_grin_time_entries
  add column if not exists gross_pay numeric(10, 2);

alter table public.green_grin_time_entries
  add column if not exists notes text;

create table if not exists public.green_grin_work_sessions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  employee_id uuid not null references public.green_grin_employees(id) on delete cascade,
  time_entry_id uuid references public.green_grin_time_entries(id) on delete set null,
  job_id uuid references public.green_grin_jobs(id) on delete set null,
  estimate_id uuid,
  customer_code text,
  customer_name text,
  project_title text,
  work_type text not null default 'Project',
  phase text not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  total_minutes integer,
  notes text
);

alter table public.green_grin_work_sessions add column if not exists estimate_id uuid;
alter table public.green_grin_work_sessions add column if not exists work_type text not null default 'Project';
alter table public.green_grin_work_sessions add column if not exists phase text;
alter table public.green_grin_work_sessions add column if not exists total_minutes integer;
alter table public.green_grin_work_sessions add column if not exists notes text;

create table if not exists public.green_grin_message_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  job_id uuid references public.green_grin_jobs(id) on delete set null,
  phone text not null,
  template text not null,
  message text not null,
  actor_type text,
  actor_name text,
  actor_employee_id uuid references public.green_grin_employees(id) on delete set null,
  twilio_sid text
);

alter table public.green_grin_message_log
  add column if not exists actor_type text;

alter table public.green_grin_message_log
  add column if not exists actor_name text;

alter table public.green_grin_message_log
  add column if not exists actor_employee_id uuid references public.green_grin_employees(id) on delete set null;

create table if not exists public.green_grin_invoices (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  customer_user_id uuid references auth.users(id) on delete cascade,
  customer_code text,
  customer_name text not null,
  phone text,
  email text,
  amount numeric(10, 2) not null default 0,
  due_date date,
  status text not null default 'Draft',
  service_line text,
  service_address text,
  project_scope text,
  notes text,
  payment_url text,
  payment_method text,
  payment_reference text,
  payment_reported_at timestamptz,
  payment_confirmed_at timestamptz,
  accepted_by text,
  accepted_at timestamptz,
  acceptance_terms text,
  acceptance_ip text,
  acceptance_user_agent text,
  source_estimate_id uuid,
  source_estimate_number text,
  active boolean not null default true
);

create or replace function public.green_grin_create_customer_on_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  next_number integer;
  next_code text;
  metadata jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  perform pg_advisory_xact_lock(hashtext('green_grin_customer_code'));

  select greatest(
    coalesce((select last_value from public.green_grin_counters where name = 'customer_code'), 0),
    coalesce((select max(substring(customer_code from 'GG-([0-9]+)$')::integer) from public.green_grin_customers where customer_code ~ '^GG-[0-9]+$'), 0),
    coalesce((select max(substring(customer_code from 'GG-([0-9]+)$')::integer) from public.green_grin_jobs where customer_code ~ '^GG-[0-9]+$'), 0)
  ) + 1 into next_number;

  insert into public.green_grin_counters (name, last_value)
  values ('customer_code', next_number)
  on conflict (name) do update set last_value = excluded.last_value;

  next_code := 'GG-' || lpad(next_number::text, 4, '0');

  insert into public.green_grin_customers (id, customer_code, full_name, phone, email, active, billing_status)
  values (
    new.id,
    next_code,
    coalesce(nullif(trim(metadata ->> 'name'), ''), split_part(coalesce(new.email, ''), '@', 1)),
    regexp_replace(coalesce(metadata ->> 'phone', ''), '[^0-9]', '', 'g'),
    lower(coalesce(new.email, '')),
    true,
    'Not connected'
  )
  on conflict (id) do nothing;

  if nullif(trim(coalesce(metadata ->> 'address', '')), '') is not null then
    insert into public.green_grin_properties (customer_user_id, address, gate_code, pets, yard_notes, service_preferences, active)
    select
      new.id,
      metadata ->> 'address',
      coalesce(metadata ->> 'gate_code', ''),
      coalesce(metadata ->> 'pets', ''),
      coalesce(metadata ->> 'yard_notes', ''),
      '',
      true
    where not exists (
      select 1 from public.green_grin_properties where customer_user_id = new.id and active = true
    );
  end if;

  return new;
end;
$$;

drop trigger if exists green_grin_customer_signup on auth.users;
create trigger green_grin_customer_signup
  after insert on auth.users
  for each row execute function public.green_grin_create_customer_on_signup();

do $$
declare
  signup_user record;
  next_number integer;
  next_code text;
  metadata jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('green_grin_customer_code'));
  select greatest(
    coalesce((select last_value from public.green_grin_counters where name = 'customer_code'), 0),
    coalesce((select max(substring(customer_code from 'GG-([0-9]+)$')::integer) from public.green_grin_customers where customer_code ~ '^GG-[0-9]+$'), 0),
    coalesce((select max(substring(customer_code from 'GG-([0-9]+)$')::integer) from public.green_grin_jobs where customer_code ~ '^GG-[0-9]+$'), 0)
  ) into next_number;

  for signup_user in
    select users.*
    from auth.users as users
    where not exists (select 1 from public.green_grin_customers as customers where customers.id = users.id)
    order by users.created_at asc
  loop
    next_number := next_number + 1;
    next_code := 'GG-' || lpad(next_number::text, 4, '0');
    metadata := coalesce(signup_user.raw_user_meta_data, '{}'::jsonb);

    insert into public.green_grin_customers (id, customer_code, full_name, phone, email, active, billing_status)
    values (
      signup_user.id,
      next_code,
      coalesce(nullif(trim(metadata ->> 'name'), ''), split_part(coalesce(signup_user.email, ''), '@', 1)),
      regexp_replace(coalesce(metadata ->> 'phone', ''), '[^0-9]', '', 'g'),
      lower(coalesce(signup_user.email, '')),
      true,
      'Not connected'
    );

    if nullif(trim(coalesce(metadata ->> 'address', '')), '') is not null then
      insert into public.green_grin_properties (customer_user_id, address, gate_code, pets, yard_notes, service_preferences, active)
      values (
        signup_user.id,
        metadata ->> 'address',
        coalesce(metadata ->> 'gate_code', ''),
        coalesce(metadata ->> 'pets', ''),
        coalesce(metadata ->> 'yard_notes', ''),
        '',
        true
      );
    end if;
  end loop;

  insert into public.green_grin_counters (name, last_value)
  values ('customer_code', next_number)
  on conflict (name) do update set last_value = greatest(public.green_grin_counters.last_value, excluded.last_value);
end;
$$;

alter table public.green_grin_invoices
  add column if not exists customer_user_id uuid references auth.users(id) on delete cascade;

alter table public.green_grin_invoices
  add column if not exists customer_code text;

alter table public.green_grin_invoices
  add column if not exists phone text;

alter table public.green_grin_invoices
  add column if not exists email text;

alter table public.green_grin_invoices
  add column if not exists payment_url text;

alter table public.green_grin_invoices
  add column if not exists payment_method text;

alter table public.green_grin_invoices
  add column if not exists payment_reference text;

alter table public.green_grin_invoices
  add column if not exists payment_reported_at timestamptz;

alter table public.green_grin_invoices
  add column if not exists payment_confirmed_at timestamptz;

alter table public.green_grin_invoices
  add column if not exists service_line text;

alter table public.green_grin_invoices
  add column if not exists active boolean not null default true;

alter table public.green_grin_invoices add column if not exists subtotal numeric(10, 2) not null default 0;
alter table public.green_grin_invoices add column if not exists discount numeric(10, 2) not null default 0;
alter table public.green_grin_invoices add column if not exists tax_rate numeric(7, 4) not null default 0;
alter table public.green_grin_invoices add column if not exists tax_amount numeric(10, 2) not null default 0;
alter table public.green_grin_invoices add column if not exists line_items jsonb not null default '[]'::jsonb;
alter table public.green_grin_invoices add column if not exists service_address text;
alter table public.green_grin_invoices add column if not exists project_scope text;
alter table public.green_grin_invoices add column if not exists accepted_by text;
alter table public.green_grin_invoices add column if not exists accepted_at timestamptz;
alter table public.green_grin_invoices add column if not exists acceptance_terms text;
alter table public.green_grin_invoices add column if not exists acceptance_ip text;
alter table public.green_grin_invoices add column if not exists acceptance_user_agent text;
alter table public.green_grin_invoices add column if not exists source_estimate_id uuid;
alter table public.green_grin_invoices add column if not exists source_estimate_number text;

create table if not exists public.green_grin_estimates (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  estimate_number text not null unique,
  customer_user_id uuid references auth.users(id) on delete set null,
  customer_code text,
  customer_name text not null,
  phone text,
  email text,
  project_title text not null,
  service_address text,
  project_scope text,
  valid_until date,
  invoice_due_date date,
  customer_notes text,
  status text not null default 'Draft',
  line_items jsonb not null default '[]'::jsonb,
  subtotal numeric(12, 2) not null default 0,
  internal_cost numeric(12, 2) not null default 0,
  gross_profit numeric(12, 2) not null default 0,
  discount numeric(12, 2) not null default 0,
  tax_rate numeric(7, 4) not null default 0,
  tax_amount numeric(12, 2) not null default 0,
  total numeric(12, 2) not null default 0,
  invoice_id uuid,
  invoice_number text,
  invoiced_at timestamptz,
  grouped_totals jsonb not null default '{}'::jsonb,
  deposit_amount numeric(12, 2) not null default 0,
  gross_margin numeric(7, 4) not null default 0,
  contingency_percent numeric(7, 4) not null default 0,
  calculation_inputs jsonb not null default '{}'::jsonb,
  proposal_token_hash text,
  proposal_code_hash text,
  proposal_code_expires_at timestamptz,
  proposal_sent_at timestamptz,
  proposal_expires_at timestamptz,
  approved_at timestamptz,
  approved_by text,
  approval_document_hash text,
  project_job_id uuid,
  deposit_invoice_id uuid,
  notes text
);

alter table public.green_grin_estimates add column if not exists valid_until date;
alter table public.green_grin_estimates add column if not exists invoice_due_date date;
alter table public.green_grin_estimates add column if not exists customer_notes text;
alter table public.green_grin_estimates add column if not exists invoice_id uuid;
alter table public.green_grin_estimates add column if not exists invoice_number text;
alter table public.green_grin_estimates add column if not exists invoiced_at timestamptz;
alter table public.green_grin_estimates add column if not exists grouped_totals jsonb not null default '{}'::jsonb;
alter table public.green_grin_estimates add column if not exists deposit_amount numeric(12, 2) not null default 0;
alter table public.green_grin_estimates add column if not exists gross_margin numeric(7, 4) not null default 0;
alter table public.green_grin_estimates add column if not exists contingency_percent numeric(7, 4) not null default 0;
alter table public.green_grin_estimates add column if not exists calculation_inputs jsonb not null default '{}'::jsonb;
alter table public.green_grin_estimates add column if not exists proposal_token_hash text;
alter table public.green_grin_estimates add column if not exists proposal_code_hash text;
alter table public.green_grin_estimates add column if not exists proposal_code_expires_at timestamptz;
alter table public.green_grin_estimates add column if not exists proposal_sent_at timestamptz;
alter table public.green_grin_estimates add column if not exists proposal_expires_at timestamptz;
alter table public.green_grin_estimates add column if not exists approved_at timestamptz;
alter table public.green_grin_estimates add column if not exists approved_by text;
alter table public.green_grin_estimates add column if not exists approval_document_hash text;
alter table public.green_grin_estimates add column if not exists project_job_id uuid;
alter table public.green_grin_estimates add column if not exists deposit_invoice_id uuid;

create table if not exists public.green_grin_estimate_signatures (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  estimate_id uuid not null references public.green_grin_estimates(id) on delete cascade,
  signer_name text not null,
  signer_email text,
  signature_type text not null default 'typed',
  signature_data text,
  consent_text text not null,
  signed_at timestamptz not null default now(),
  document_hash text not null,
  document_snapshot jsonb not null,
  ip_address text,
  user_agent text
);

create table if not exists public.green_grin_expenses (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  expense_type text not null default 'receipt',
  expense_date date not null default current_date,
  vendor text not null default '',
  category text not null default 'Other',
  amount numeric(10,2) not null default 0,
  subtotal numeric(10,2),
  tax numeric(10,2),
  payment_method text,
  notes text,
  receipt_filename text,
  mileage_start numeric(12,2),
  mileage_end numeric(12,2),
  mileage_miles numeric(10,2),
  mileage_rate numeric(10,2),
  ai_confidence numeric(4,2),
  ai_raw jsonb,
  active boolean not null default true
);

alter table public.green_grin_expenses
  add column if not exists expense_type text not null default 'receipt';

alter table public.green_grin_expenses
  add column if not exists expense_date date not null default current_date;

alter table public.green_grin_expenses
  add column if not exists vendor text not null default '';

alter table public.green_grin_expenses
  add column if not exists category text not null default 'Other';

alter table public.green_grin_expenses
  add column if not exists amount numeric(10,2) not null default 0;

alter table public.green_grin_expenses
  add column if not exists subtotal numeric(10,2);

alter table public.green_grin_expenses
  add column if not exists tax numeric(10,2);

alter table public.green_grin_expenses
  add column if not exists payment_method text;

alter table public.green_grin_expenses
  add column if not exists notes text;

alter table public.green_grin_expenses
  add column if not exists receipt_filename text;

alter table public.green_grin_expenses
  add column if not exists mileage_start numeric(12,2);

alter table public.green_grin_expenses
  add column if not exists mileage_end numeric(12,2);

alter table public.green_grin_expenses
  add column if not exists mileage_miles numeric(10,2);

alter table public.green_grin_expenses
  add column if not exists mileage_rate numeric(10,2);

alter table public.green_grin_expenses
  add column if not exists ai_confidence numeric(4,2);

alter table public.green_grin_expenses
  add column if not exists ai_raw jsonb;

alter table public.green_grin_expenses
  add column if not exists active boolean not null default true;

create table if not exists public.green_grin_pricing_config (
  id text primary key default 'active',
  version integer not null default 1,
  config jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.green_grin_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  owner_type text not null default 'customer',
  owner_email text,
  customer_user_id uuid references auth.users(id) on delete cascade,
  customer_code text,
  employee_id uuid references public.green_grin_employees(id) on delete cascade,
  employee_code text,
  user_agent text,
  active boolean not null default true
);

alter table public.green_grin_push_subscriptions
  add column if not exists updated_at timestamptz not null default now();

alter table public.green_grin_push_subscriptions
  add column if not exists owner_type text not null default 'customer';

alter table public.green_grin_push_subscriptions
  add column if not exists owner_email text;

alter table public.green_grin_push_subscriptions
  add column if not exists customer_user_id uuid references auth.users(id) on delete cascade;

alter table public.green_grin_push_subscriptions
  add column if not exists customer_code text;

alter table public.green_grin_push_subscriptions
  add column if not exists employee_id uuid references public.green_grin_employees(id) on delete cascade;

alter table public.green_grin_push_subscriptions
  add column if not exists employee_code text;

alter table public.green_grin_push_subscriptions
  add column if not exists user_agent text;

alter table public.green_grin_push_subscriptions
  add column if not exists active boolean not null default true;

alter table public.green_grin_customers enable row level security;
alter table public.green_grin_properties enable row level security;
alter table public.green_grin_employees enable row level security;
alter table public.green_grin_invoices enable row level security;
alter table public.green_grin_time_entries enable row level security;
alter table public.green_grin_work_sessions enable row level security;
alter table public.green_grin_push_subscriptions enable row level security;
alter table public.green_grin_expenses enable row level security;
alter table public.green_grin_pricing_config enable row level security;
alter table public.green_grin_estimates enable row level security;
alter table public.green_grin_estimate_signatures enable row level security;
alter table public.green_grin_marketing_routes enable row level security;
alter table public.green_grin_marketing_leads enable row level security;
alter table public.green_grin_daily_route_assignments enable row level security;

drop policy if exists "Customers can read own profile" on public.green_grin_customers;
drop policy if exists "Customers can insert own profile" on public.green_grin_customers;
drop policy if exists "Customers can update own profile" on public.green_grin_customers;
drop policy if exists "Customers can read own properties" on public.green_grin_properties;
drop policy if exists "Customers can insert own properties" on public.green_grin_properties;
drop policy if exists "Customers can update own properties" on public.green_grin_properties;
drop policy if exists "Employees can read own employee profile" on public.green_grin_employees;
drop policy if exists "Customers can read own invoices" on public.green_grin_invoices;
drop policy if exists "Employees can read own time entries" on public.green_grin_time_entries;

create policy "Customers can read own profile"
  on public.green_grin_customers for select
  using (auth.uid() = id);

create policy "Customers can insert own profile"
  on public.green_grin_customers for insert
  with check (auth.uid() = id);

create policy "Customers can update own profile"
  on public.green_grin_customers for update
  using (auth.uid() = id);

create policy "Customers can read own properties"
  on public.green_grin_properties for select
  using (auth.uid() = customer_user_id);

create policy "Customers can insert own properties"
  on public.green_grin_properties for insert
  with check (auth.uid() = customer_user_id);

create policy "Customers can update own properties"
  on public.green_grin_properties for update
  using (auth.uid() = customer_user_id);

create policy "Employees can read own employee profile"
  on public.green_grin_employees for select
  using (auth.uid() = user_id);

create policy "Customers can read own invoices"
  on public.green_grin_invoices for select
  using (auth.uid() = customer_user_id);

create policy "Employees can read own time entries"
  on public.green_grin_time_entries for select
  using (
    exists (
      select 1
      from public.green_grin_employees
      where green_grin_employees.id = green_grin_time_entries.employee_id
        and green_grin_employees.user_id = auth.uid()
    )
  );

create index if not exists green_grin_jobs_phone_idx on public.green_grin_jobs(phone);
create index if not exists green_grin_jobs_customer_code_idx on public.green_grin_jobs(customer_code);
create index if not exists green_grin_jobs_customer_user_idx on public.green_grin_jobs(customer_user_id);
create index if not exists green_grin_jobs_assigned_employee_idx on public.green_grin_jobs(assigned_employee_id);
create index if not exists green_grin_jobs_created_at_idx on public.green_grin_jobs(created_at desc);
create index if not exists green_grin_jobs_scheduled_date_idx on public.green_grin_jobs(scheduled_date);
create index if not exists green_grin_properties_customer_user_idx on public.green_grin_properties(customer_user_id);
create index if not exists green_grin_employees_user_id_idx on public.green_grin_employees(user_id);
create index if not exists green_grin_employees_employee_code_idx on public.green_grin_employees(employee_code);
create index if not exists green_grin_employees_email_idx on public.green_grin_employees(email);
create index if not exists green_grin_employees_status_idx on public.green_grin_employees(status);
create index if not exists green_grin_employees_pin_idx on public.green_grin_employees(employee_pin);
create index if not exists green_grin_daily_routes_date_idx on public.green_grin_daily_route_assignments(route_date);
create index if not exists green_grin_daily_routes_employee_date_idx on public.green_grin_daily_route_assignments(assigned_employee_id, route_date);
create index if not exists green_grin_daily_routes_job_date_idx on public.green_grin_daily_route_assignments(job_id, route_date);
create index if not exists green_grin_daily_routes_order_idx on public.green_grin_daily_route_assignments(assigned_employee_id, route_date, stop_order);
create index if not exists green_grin_time_entries_employee_idx on public.green_grin_time_entries(employee_id);
create index if not exists green_grin_time_entries_clock_in_idx on public.green_grin_time_entries(clock_in_at desc);
create index if not exists green_grin_time_entries_open_idx
  on public.green_grin_time_entries(employee_id)
  where clock_out_at is null;
create index if not exists green_grin_work_sessions_employee_idx on public.green_grin_work_sessions(employee_id, started_at desc);
create index if not exists green_grin_work_sessions_job_idx on public.green_grin_work_sessions(job_id, started_at desc);
create unique index if not exists green_grin_work_sessions_open_idx on public.green_grin_work_sessions(employee_id) where ended_at is null;
create index if not exists green_grin_message_log_created_at_idx on public.green_grin_message_log(created_at desc);
create index if not exists green_grin_customers_customer_code_idx on public.green_grin_customers(customer_code);
create index if not exists green_grin_customer_chat_customer_idx on public.green_grin_customer_chat(customer_user_id, created_at);
create index if not exists green_grin_invoices_customer_user_idx on public.green_grin_invoices(customer_user_id);
create index if not exists green_grin_invoices_customer_code_idx on public.green_grin_invoices(customer_code);
create index if not exists green_grin_invoices_status_idx on public.green_grin_invoices(status);
create index if not exists green_grin_invoices_source_estimate_idx on public.green_grin_invoices(source_estimate_id);
create index if not exists green_grin_estimates_updated_idx on public.green_grin_estimates(updated_at desc);
create index if not exists green_grin_estimates_customer_idx on public.green_grin_estimates(customer_user_id);
create index if not exists green_grin_estimates_invoice_idx on public.green_grin_estimates(invoice_id);
create index if not exists green_grin_estimates_proposal_token_idx on public.green_grin_estimates(proposal_token_hash);
create index if not exists green_grin_estimate_signatures_estimate_idx on public.green_grin_estimate_signatures(estimate_id, signed_at desc);
create index if not exists green_grin_push_subscriptions_owner_type_idx on public.green_grin_push_subscriptions(owner_type);
create index if not exists green_grin_push_subscriptions_customer_user_idx on public.green_grin_push_subscriptions(customer_user_id);
create index if not exists green_grin_push_subscriptions_customer_code_idx on public.green_grin_push_subscriptions(customer_code);
create index if not exists green_grin_push_subscriptions_employee_idx on public.green_grin_push_subscriptions(employee_id);
create index if not exists green_grin_push_subscriptions_active_idx on public.green_grin_push_subscriptions(active);
create index if not exists green_grin_expenses_date_idx on public.green_grin_expenses(expense_date);
create index if not exists green_grin_expenses_category_idx on public.green_grin_expenses(category);
create index if not exists green_grin_expenses_active_idx on public.green_grin_expenses(active);
create index if not exists green_grin_expenses_type_idx on public.green_grin_expenses(expense_type);
create index if not exists green_grin_marketing_routes_employee_idx on public.green_grin_marketing_routes(assigned_employee_id);
create index if not exists green_grin_marketing_routes_status_idx on public.green_grin_marketing_routes(status);
create index if not exists green_grin_marketing_leads_route_idx on public.green_grin_marketing_leads(route_id);
create index if not exists green_grin_marketing_leads_employee_idx on public.green_grin_marketing_leads(assigned_employee_id);
create index if not exists green_grin_marketing_leads_status_idx on public.green_grin_marketing_leads(status);
create index if not exists green_grin_marketing_leads_created_at_idx on public.green_grin_marketing_leads(created_at desc);

create unique index if not exists green_grin_customers_customer_code_unique
  on public.green_grin_customers(customer_code)
  where customer_code is not null;

create unique index if not exists green_grin_employees_employee_code_unique
  on public.green_grin_employees(employee_code)
  where employee_code is not null;

notify pgrst, 'reload schema';
