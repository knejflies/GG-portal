alter table public.green_grin_jobs
  add column if not exists service_category text not null default 'Mowing',
  add column if not exists schedule_frequency text not null default 'One-time',
  add column if not exists route_order integer;

update public.green_grin_jobs
set service_category = case
  when lower(coalesce(service_type, '')) similar to '%(cleanup|clean up|aeration|fertil)%' then 'Cleanup'
  when lower(coalesce(service_type, '')) similar to '%(landscap|install|design|rock|mulch)%' then 'Landscaping'
  when lower(coalesce(service_type, '')) similar to '%(mow|lawn|grass)%' then 'Mowing'
  else coalesce(nullif(service_category, ''), 'Other')
end
where service_category is null or service_category = 'Mowing';

update public.green_grin_jobs
set schedule_frequency = case
  when recurring_weekly then 'Weekly'
  else 'One-time'
end
where schedule_frequency is null or schedule_frequency = 'One-time';
