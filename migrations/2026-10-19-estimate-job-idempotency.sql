begin;

alter table public.green_grin_jobs
  add column if not exists source_estimate_id uuid references public.green_grin_estimates(id) on delete set null;

create unique index if not exists green_grin_jobs_source_estimate_idx
  on public.green_grin_jobs(source_estimate_id)
  where source_estimate_id is not null;

notify pgrst, 'reload schema';

commit;
