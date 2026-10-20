-- Optional race protection for Android mileage sync retries.
-- Application-level duplicate detection works without this index, but the index
-- also protects against two identical requests arriving at the same time.
-- This migration is additive and does not modify existing expense values.

create unique index if not exists green_grin_expenses_mileage_widget_source_idx
  on public.green_grin_expenses (receipt_filename)
  where receipt_filename like 'mileage-widget:%' and active = true;
