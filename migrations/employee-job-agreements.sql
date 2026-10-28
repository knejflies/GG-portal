-- Per-job work agreements for employees and subcontractors.
create table if not exists public.green_grin_job_agreements (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  job_id uuid not null unique references public.green_grin_jobs(id) on delete cascade,
  employee_id uuid not null references public.green_grin_employees(id) on delete cascade,
  agreement_title text not null default 'Job Work Agreement',
  scope text not null default '',
  pay_amount numeric(10,2),
  due_date date,
  token_hash text not null unique,
  status text not null default 'Sent' check (status in ('Sent','Signed','Cancelled')),
  sent_at timestamptz not null default now(),
  signed_at timestamptz,
  signer_name text,
  signer_email text,
  signature_type text,
  signature_data text,
  consent_text text,
  ip_address text,
  user_agent text
);
create index if not exists green_grin_job_agreements_employee_idx on public.green_grin_job_agreements(employee_id);
grant usage on schema public to service_role;
grant all privileges on table public.green_grin_job_agreements to service_role;
notify pgrst, 'reload schema';
