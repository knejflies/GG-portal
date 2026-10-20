-- Prevent two overlapping scheduled reminder invocations from claiming the same
-- job and service date. Failed attempts clear this marker so the next scheduled
-- run may retry. This migration is additive and does not alter prior messages.

create unique index if not exists green_grin_message_log_delivery_key_idx
  on public.green_grin_message_log (twilio_sid)
  where twilio_sid like 'yard-reminder:%';
