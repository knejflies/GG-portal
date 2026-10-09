# Sales yard measurement — local product draft

This is a local design and implementation draft. It is not linked into the live admin navigation and is not deployed.

## Goal

When a salesman is standing at a property, they can search for the customer or use the phone's location, open recent high-resolution satellite imagery, confirm the correct parcel, outline one or more lawn areas, subtract non-lawn areas, and carry a reviewed square-foot total directly into a mowing, fertilizer, or landscape estimate.

The measurement is a quote input with evidence attached. The system never silently treats an automatic guess as a final price.

## Salesman flow

1. **Open property.** From Customers, Jobs, or a new Sales Tools entry, search by name, address, or customer code. “Use my location” finds nearby properties but still requires the salesman to confirm the address.
2. **Confirm imagery.** The map centers on the property and shows the address match, parcel outline when available, imagery provider, imagery capture date, and an imagery quality badge. A poor match or stale/soft image blocks automatic confidence from being marked high.
3. **Suggest lawn zones.** The draft can request an optional segmentation suggestion from a server-side imagery service. It returns candidate polygons and a confidence score. Suggestions are always editable and are labeled “Suggested” until the salesman accepts them.
4. **Trace and edit.** Draw or edit each lawn zone. Split front, side, and back yards when they have different pricing or access. Add exclusion polygons for the house, driveway, sidewalks, beds, pool, play areas, and any other surface that should not be priced as turf.
5. **Review numbers.** The panel shows gross area, excluded area, net turf square feet, acres, zone totals, and the quote rate that would be used. The area recalculates on every edit with geodesic math and is recalculated again on the server before approval.
6. **Resolve warnings.** The salesman must correct a weak address match, overlapping shapes, self-intersections, missing exclusions, or an unusually small/large result. A manual override requires a reason and records who made it.
7. **Save measurement.** Save as Draft, Reviewed, or Approved. A new measurement supersedes an earlier approved measurement without deleting history. The record stores the polygon data, imagery evidence, accuracy checks, and the exact numbers used in the quote.
8. **Use it.** One action hands the reviewed area to the existing mowing, fertilizer, or landscape estimate builder. The estimate keeps a reference to the measurement so later edits do not silently rewrite an already-sent quote.

## Accuracy model

The displayed confidence is a review aid, not a promise of survey-grade accuracy. It is composed from:

- geocoder confidence and distance from the selected parcel;
- imagery resolution, capture date, cloud/shadow/obstruction flags, and provider;
- whether a parcel boundary is available and whether the lawn polygon stays inside it;
- polygon validity, overlap, gaps, and the size of exclusions;
- amount of manual editing after an automatic suggestion; and
- outlier checks against nearby properties and the customer's prior measurement.

Suggested states:

- **High — ready to review:** address and imagery are strong, shapes are valid, and no material warnings remain.
- **Review required:** the result is usable for manual pricing but needs a salesperson decision.
- **Correction required:** the address or geometry is too uncertain to save as an approved measurement.

The app should show the confidence reasons beside the number, so a salesman knows what to fix instead of trusting a mysterious score.

## Draft storage model

Add a migration for `green_grin_lawn_measurements` rather than putting geometry inside `green_grin_estimates.calculation_inputs`:

```sql
create table if not exists public.green_grin_lawn_measurements (
  id uuid primary key default gen_random_uuid(),
  property_id uuid references public.green_grin_properties(id) on delete set null,
  customer_user_id uuid references auth.users(id) on delete set null,
  estimate_id uuid references public.green_grin_estimates(id) on delete set null,
  measured_by_employee_id uuid references public.green_grin_employees(id) on delete set null,
  status text not null default 'Draft' check (status in ('Draft','Reviewed','Approved','Superseded','Correction required')),
  address_snapshot text not null,
  latitude double precision not null,
  longitude double precision not null,
  geocode_provider text,
  geocode_confidence numeric(5,4),
  imagery_provider text,
  imagery_capture_date date,
  imagery_resolution_meters numeric(8,3),
  imagery_reference text,
  zone_geojson jsonb not null default '[]'::jsonb,
  exclusion_geojson jsonb not null default '[]'::jsonb,
  gross_square_feet numeric(12,2) not null default 0,
  excluded_square_feet numeric(12,2) not null default 0,
  net_square_feet numeric(12,2) not null default 0,
  confidence numeric(5,4),
  confidence_reasons jsonb not null default '[]'::jsonb,
  manual_override_reason text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.green_grin_employees(id) on delete set null
);

create index if not exists green_grin_lawn_measurements_property_idx
  on public.green_grin_lawn_measurements(property_id, created_at desc);
create index if not exists green_grin_lawn_measurements_status_idx
  on public.green_grin_lawn_measurements(status, updated_at desc);
```

For a full audit trail, add `green_grin_lawn_measurement_versions` with `measurement_id`, `version_number`, the complete geometry/number snapshot, `changed_by`, `change_reason`, and `created_at`. Never overwrite an approved measurement in place; create a new version and mark the prior one Superseded.

## API draft

Create `netlify/functions/portal-lawn-measurements.js` with the same admin authentication and Supabase helper pattern as the existing portal functions:

- `GET /api/portal-lawn-measurements?property_id=...` — history and current approved measurement.
- `POST` — create a draft after server-side geometry validation and area recomputation.
- `PATCH` — edit a draft or review/approve it; require a reason for manual overrides.
- `POST action=attach-to-estimate` — copy the reviewed totals and measurement ID into the existing estimate calculation inputs.
- `POST action=supersede` — create a new working version while preserving the earlier quote evidence.

The server must reject self-intersecting polygons, invalid coordinates, negative or inconsistent totals, and geometry that is wildly outside the selected address. The client number is only a preview.

## Imagery and mapping

Keep Leaflet because the portal already loads it. Use a configurable satellite provider instead of hard-coding a key into the page. The draft should support a provider adapter with:

- tile URL and attribution;
- imagery capture date and resolution metadata;
- parcel boundary or parcel lookup endpoint;
- geocoding endpoint with confidence; and
- optional server-side segmentation endpoint.

The first safe implementation can use a licensed satellite tile provider plus manual drawing. Automatic lawn segmentation should be an assistive service behind a feature flag until imagery licensing, accuracy, and cost are proven. No provider token belongs in the browser if the provider supports signed server requests.

## Efficient field behavior

- Load the map only after the property is selected.
- Debounce area calculations and save only after the user pauses editing.
- Cache the last imagery metadata and draft geometry in IndexedDB for dead zones; sync when the connection returns.
- Keep a lightweight “quick measure” mode for a single lawn polygon and an advanced mode for multiple zones/exclusions.
- Use large touch targets, a persistent area readout, undo/redo, and a “recenter on me” control.
- Prefetch only the imagery tiles inside the current map bounds and clear them when the property changes.
- Keep the approved measurement attached to the estimate so the salesman never re-enters square footage.

## Quote handoff

The existing estimate builder should receive a small, explicit payload:

```json
{
  "measurement_id": "uuid",
  "property_id": "uuid",
  "net_square_feet": 8420,
  "zones": [{"name":"Front lawn","square_feet":3120}],
  "measurement_status": "Approved",
  "measurement_confidence": 0.94
}
```

Mowing and fertilizer calculators may use the number, but the customer-facing estimate should show only the chosen service, quantity, rate, and price unless the salesman chooses to include the measurement detail.

## Recurring fertilizer pricing

Fertilizer should be a separate recurring service plan attached to the property. It should not reuse the one-time landscape estimate pricing or turn each application into a new manual quote.

The salesman can set:

- monthly recurring price;
- service months or a start/end season;
- included applications per month or season;
- lawn area used for the plan and the pricing tier it belongs to;
- optional add-ons such as spot treatment or extra material; and
- whether the customer has authorized automatic monthly payment.

The monthly invoice line should read clearly, for example: `Fertilizer service — September 2026 — 8,420 sq ft lawn — $___`. Internal product, rate, amount used, material cost, and technician notes stay in the service record and are excluded from the customer line unless the salesman explicitly includes them.

Add a separate recurring-plan table or extension to the existing service records rather than storing these settings in an estimate:

```sql
create table if not exists public.green_grin_recurring_service_plans (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.green_grin_properties(id) on delete cascade,
  customer_user_id uuid references auth.users(id) on delete set null,
  service_type text not null check (service_type in ('fertilizer','spraying','mowing')),
  status text not null default 'Draft' check (status in ('Draft','Active','Paused','Ended')),
  monthly_price numeric(10,2) not null default 0,
  billing_day smallint not null default 1 check (billing_day between 1 and 28),
  season_start date,
  season_end date,
  included_applications integer not null default 1,
  measurement_id uuid references public.green_grin_lawn_measurements(id) on delete set null,
  autopay_authorized boolean not null default false,
  autopay_authorization_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

When a fertilizer visit is completed, the app records the application date, product, amount used, treated area, and internal material cost against the plan. The monthly billing job gathers completed applications that have not already been invoiced and creates one recurring line item. It must use an idempotency key based on `plan_id + billing_period + application_id`, so retries or a second tap cannot create another charge.

The plan editor should show two distinct amounts: the customer-facing recurring price and the internal material/labor cost. Changing the monthly price applies to future billing periods and keeps the old price on prior invoices. If the area is remeasured, the salesman can choose whether the plan stays at its agreed monthly price or moves to a new pricing tier; that decision is recorded in the plan history.

## Focused verification before wiring it into the live menu

- Known rectangles and holes produce the expected square-foot totals.
- Self-crossing polygons and invalid coordinates cannot be approved.
- Exclusions cannot create a negative net area.
- Double taps do not create duplicate measurement versions.
- A revised measurement does not rewrite a sent estimate.
- Address mismatch produces a correction state instead of a misleading pin.
- Estimate handoff preserves the measurement ID and reviewed total.
- Mobile touch editing works at narrow widths and survives an offline draft/save retry.

## Rollout sequence

1. Add the geometry helper and tests.
2. Add the tables and server endpoint behind an admin-only feature flag.
3. Add the draft panel under a hidden Sales Tools route.
4. Run it against a small set of known properties and compare against manual measurements.
5. Add the provider adapter and segmentation suggestions only after the manual flow is dependable.
6. Expose the menu item after the accuracy review is complete.

## Smooth field experience updates

The draft screen should become a single property workspace instead of sending the salesman across Customers, Jobs, Estimates, and Billing. The property header keeps the address and one-tap actions for Measure yard, Mowing plan, Fertilizer plan, Estimates, and Billing history.

The property workspace should also show:

- the last approved measurement and prior measurement history;
- mowing's recurring price and service frequency;
- fertilizer's recurring monthly price and season dates;
- autopay authorization status;
- a monthly invoice preview with completed services and no-duplicate confirmation; and
- a local-save/sync status when the phone temporarily loses service.

Use preset prices as starting values, but keep every price editable per property. A customer-facing line should always show the agreed recurring price; internal material and labor costs remain in the admin record. The salesman should be able to review the upcoming billing period before sending it, while the billing job uses the same saved line-item snapshot for idempotent autopay.

## Optimization review

The most efficient version should make the next correct action obvious at every step:

1. **One primary action per state.** Search, Measure, Review, and Save are the only primary actions. Mowing, fertilizer, estimates, billing, imagery, and advanced geometry tools remain available without competing with the current step.
2. **Persistent decision data.** Keep net square feet, confidence, current price, and save state visible while the map is edited. A salesman should never scroll away from the number they are about to quote.
3. **Progressive disclosure.** Hide splitting, snapping, manual corner editing, and clearing shapes until Advanced editing is opened. The common path stays fast without removing expert controls.
4. **Property-first navigation.** Once an address is confirmed, keep the salesman in one property workspace instead of sending them across Customers, Jobs, Estimates, and Billing.
5. **Safe defaults.** Reuse the last approved measurement, current pricing preset, and recurring fertilizer plan as suggestions, while requiring an explicit review before changing a price or billing authorization.
6. **Field resilience.** Save geometry and form state locally after each edit, show the sync state, and retry idempotently when connectivity returns.
7. **Short review checklist.** Summarize address match, imagery date, gross area, exclusions, net area, price, billing mode, and customer authorization in one compact card.
8. **Error prevention.** Disable approval when shapes cross themselves, exclusions exceed the lawn, the address is uncertain, or the measurement has not been reviewed. Explain the fix beside the blocked action.
9. **Quote evidence without customer clutter.** Attach the measurement ID and audit history internally; show only service quantity and price on customer documents unless map detail is explicitly included.
10. **Performance budget.** Load Leaflet and imagery only after a property is selected, debounce geometry recalculation, render only visible map tiles, and defer customer history until the property panel opens.

This keeps routine houses fast while preserving the controls and evidence needed for unusual yards, recurring fertilizer plans, and later billing questions.

## Marketing and fertilizer optimization pass

The surrounding workflows should use the same property record and the same clear status language:

- **Marketing:** keep campaign, lead source, contact permission, last contact, next action, and response in one compact lead card. Put follow-up actions behind one `Next step` control, prevent promotional sends when permission is missing, and show failed or skipped messages beside the customer instead of hiding them in a general activity feed.
- **Fertilizer:** keep the recurring price, season, application history, treated area, product notes, and autopay state on the property page. Separate the customer price from internal material cost, show the next billing period before sending, and make `Pause`, `Resume`, `Change price`, and `View applications` direct actions.
- **Shared behavior:** use the same local-save indicator, audit history, duplicate protection, mobile touch sizing, and one-primary-action rule in all three workflows.

The combined home view should show only the next decisions: addresses needing correction, blowouts scheduled for the next route day, fertilizer applications ready to bill, marketing follow-ups due, and invoices waiting for review. Older history remains available from the property record instead of competing with today's work.

## Blowout address correction queue

For sprinkler blowout sign-ups, the salesman should never have to discover a bad address after the route is already planned. Add a Blowout address quality queue to the blowout map and route screen. This queue is specific to blowout leads; it does not change the regular mowing or landscape property workflow. Every blowout sign-up receives one of three visible states:

- **Confirmed:** geocoder confidence is strong and the selected pin is within the allowed distance of the entered address.
- **Review pin:** the match is plausible but the pin is too far away, the parcel is ambiguous, or the address has multiple candidates.
- **Fix address:** the address cannot be located confidently, is missing an apartment or unit, or has no usable coordinates.

The queue should show the customer name, entered address, selected match, distance from the entered address, confidence percentage, and the reason for the warning. Use a yellow warning pin for Review pin and a red warning pin for Fix address. Confirmed blowouts use the normal marker. Filter the blowout map and list by these states so the route can be cleaned before grouping or driving.

The correction action should let the salesman edit the blowout address, select a geocoder result, move the pin manually when necessary, and save a short correction note. Store the original address, corrected address, original coordinates, corrected coordinates, provider response, confidence, editor, and timestamp. Do not place an uncertain blowout into a route group or driving directions; keep it in the correction queue until confirmed.

## Blowout route days and customer notice

Add a dedicated route-day board to the blowout screen. Confirmed leads can be assigned to a service date, grouped by day, reordered for the route, and opened in driving directions. Unconfirmed addresses stay out of the route and remain in the correction queue. An unassigned group makes it obvious which sign-ups still need a day.

Each day card should show:

- service date;
- confirmed lead count;
- addresses needing review;
- route order status;
- customer notice status; and
- the actions `Open route`, `Assign days`, and `Email this day`.

`Email this day` opens a short preview addressed only to the confirmed blowout leads assigned to that date. The default message is: `Thanks for choosing Green Grin Lawn & Landscape! Your sprinkler blowout is expected tomorrow. Please keep access to the irrigation controls clear. We appreciate your business.` The notice is scheduled for the previous day at the business's configured local send time, with a visible `Scheduled` state. The salesman can edit the wording, save the schedule, or use `Send now` for a manual exception. The send operation creates one batch record with a stable idempotency key such as `blowout-day-notice + service_date + template_version`, so a double tap or scheduler retry cannot send duplicate notices.

If the service date changes, the scheduled notice moves with it and the prior schedule is marked superseded. If a customer is added after the notice was sent, they receive a separate notice only when the salesman chooses `Send now` or explicitly reschedules the day. The activity log records scheduled, sent, failed, skipped, and canceled states.

The batch result should show sent, failed, skipped, and unsubscribed counts with a green check beside each successful customer. Customers without an allowed email method, customers who opted out of service notices, and leads with unresolved addresses are skipped with a reason. A failed message can be retried individually without resending the successful messages. Keep the notice in the blowout activity history so the admin can see exactly when the day was announced.

