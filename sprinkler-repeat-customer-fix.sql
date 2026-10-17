-- Allows one customer to have multiple sprinkler blowout signups over time.
-- Safe to run more than once in the Supabase SQL Editor.
drop index if exists public.green_grin_blowout_leads_customer_user_idx;
create index if not exists green_grin_blowout_leads_customer_user_idx
  on public.green_grin_sprinkler_blowout_leads(customer_user_id)
  where customer_user_id is not null;

notify pgrst, 'reload schema';
