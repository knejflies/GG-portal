begin;

grant usage on schema public to service_role;

grant all privileges on table public.green_grin_counters to service_role;
grant all privileges on table public.green_grin_jobs to service_role;
grant all privileges on table public.green_grin_customers to service_role;
grant all privileges on table public.green_grin_customer_chat to service_role;
grant all privileges on table public.green_grin_properties to service_role;
grant all privileges on table public.green_grin_employees to service_role;
grant all privileges on table public.green_grin_daily_route_assignments to service_role;
grant all privileges on table public.green_grin_marketing_routes to service_role;
grant all privileges on table public.green_grin_marketing_leads to service_role;
grant all privileges on table public.green_grin_time_entries to service_role;
grant all privileges on table public.green_grin_work_sessions to service_role;
grant all privileges on table public.green_grin_sprinkler_blowout_leads to service_role;
grant all privileges on table public.green_grin_message_log to service_role;
grant all privileges on table public.green_grin_invoices to service_role;
grant all privileges on table public.green_grin_estimates to service_role;
grant all privileges on table public.green_grin_estimate_signatures to service_role;
grant all privileges on table public.green_grin_expenses to service_role;
grant all privileges on table public.green_grin_pricing_config to service_role;
grant all privileges on table public.green_grin_push_subscriptions to service_role;
grant all privileges on table public.green_grin_lawn_measurements to service_role;
grant all privileges on table public.green_grin_service_entries to service_role;
grant all privileges on table public.green_grin_billing_authorizations to service_role;
grant all privileges on table public.green_grin_billing_audit_log to service_role;
grant all privileges on table public.green_grin_service_visibility_settings to service_role;
grant all privileges on table public.green_grin_sprinkler_blowout_history to service_role;
grant all privileges on table public.green_grin_spring_followups to service_role;
grant all privileges on table public.green_grin_payment_methods to service_role;
grant all privileges on table public.green_grin_payment_setup_sessions to service_role;
grant all privileges on table public.green_grin_payment_attempts to service_role;
grant all privileges on table public.green_grin_payment_webhook_events to service_role;

grant execute on function public.green_grin_generate_property_invoice(uuid, text) to service_role;

notify pgrst, 'reload schema';

commit;
