# Green Grin CRM transformation progress

Last updated: 2026-10-20

## Recovery and deployment baseline

- Production checkpoint: annotated Git tag `git-1` at commit `cda390e`.
- Starting branch: `main`, clean and aligned with `origin/main` at inspection time.
- Deployment model: static HTML/CSS/JavaScript on Netlify, Netlify Functions, Supabase Auth/PostgREST, and a service worker/PWA.
- Existing routes preserved: `/`, `/admin/`, `/employee/`, `/portal/`, and `/portal.html`.
- No production SQL has been run by this transformation.

## Verified baseline

- The complete existing `npm test` suite passed before transformation work began.
- All inline portal scripts passed syntax validation.
- Approximate portal source sizes before consolidation:
  - `admin/index.html`: 736 KB
  - `employee/index.html`: 399 KB
  - `portal/index.html`: 405 KB
  - `portal.html`: exact duplicate of `portal/index.html`
- `service-worker.js` uses network-first requests, excludes Netlify Functions from caching, and claims clients immediately.
- Customer and employee access use Supabase Auth in several routes. Privileged owner operations now prefer a signed owner-session token. Initial login and the Android mileage widget retain a shared-PIN compatibility path.

## Environment variables used by name

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GREEN_GRIN_ADMIN_PIN`, `GREEN_GRIN_SESSION_SECRET`, `GREEN_GRIN_ADMIN_EMAIL`, `GREEN_GRIN_OWNER_EMAIL`, `GREEN_GRIN_INVOICE_FROM`, `GREEN_GRIN_EMAIL_LOGO_URL`, `GREEN_GRIN_PORTAL_URL`, `GREEN_GRIN_PROPOSAL_URL`, `GREEN_GRIN_PUBLIC_URL`, `GREEN_GRIN_TIMEZONE`, `GREEN_GRIN_GEOCODER_URL`, `GREEN_GRIN_VAPID_PUBLIC_KEY`, `GREEN_GRIN_VAPID_PRIVATE_KEY`, `GREEN_GRIN_VAPID_SUBJECT`, `GREEN_GRIN_SHEETS_SYNC_KEY`, `GREEN_GRIN_CONTRACTOR_REGISTRATION_NUMBER`, `GREEN_GRIN_VENMO_HANDLE`, `GREEN_GRIN_ZELLE_EMAIL`, `GREEN_GRIN_ZELLE_PHONE`, `GREEN_GRIN_ZELLE_RECIPIENT_NAME`, `HELCIM_API_TOKEN`, `HELCIM_WEBHOOK_SECRET`, `HELCIM_WEBHOOK_VERIFIER_TOKEN`, `RESEND_API_KEY`, `OPENAI_API_KEY`, and `OPENAI_RECEIPT_MODEL`.

## Schema map confirmed from repository SQL

Core records include customers, properties, jobs, estimates, signatures, invoices, employees, time entries, work sessions, expenses, service entries, billing authorizations, payment methods, payment attempts, automatic payments, billing audit logs, messages, chat, push subscriptions, routes, sprinkler leads/history/follow-ups, lawn measurements, and pricing/configuration tables. RLS is enabled for the major customer, property, employee, invoice, time, expense, estimate, payment, push, and measurement tables. The serverless functions use the service-role key and therefore must enforce object authorization themselves.

The setup and repair SQL files contain additive statements but are not treated as automatically safe to execute wholesale. New changes are kept in narrowly scoped files under `migrations/`.

## Completed in current transformation

- Added stable per-trip identifiers to the Android mileage widget.
- Preserved the saved portal PIN when a trip is cleared; the previous reset erased the connection.
- Clear a completed trip only after the portal confirms it was saved. Failed trips remain retryable.
- Added server-side mileage retry detection using the existing `receipt_filename` field, avoiding a required column migration.
- Added optional unique-index migration for simultaneous duplicate mileage requests.
- Hardened accounting header lookup to be case-insensitive and admin PIN comparison to be timing-safe.
- Changed denied accounting requests from misleading HTTP 500 responses to HTTP 401.
- Added `no-store` response caching to the expense/accounting endpoint.
- Added signed owner-session authorization to privileged browser requests while retaining PIN fallback for the Android widget.
- Updated all direct owner-PIN checks in privileged functions to accept and verify signed owner sessions server-side.
- Stopped the saved owner-session restore endpoint from returning the administrator PIN to browser memory.
- Converted destructive customer deletion into archival: active work is removed while invoices, jobs, messages, properties, and Auth history remain preserved.
- Removed the duplicate destructive customer-delete control from every portal source.
- Converted job, estimate, invoice, expense, mileage, and employee destructive actions to auditable archive, void, or deactivate states.
- Hardened public employee access requests so an existing active employee cannot be downgraded or have their PIN replaced through the request form.
- Added scheduled reminder delivery claims and an optional unique index to prevent overlapping runs from sending the same yard reminder twice.
- Replaced the exact 405 KB `portal.html` source duplicate with a small compatibility redirect to the authoritative `/portal/` implementation.
- Bumped the service-worker cache and prevented failed responses from being written into the offline cache.
- Added approved-estimate conversion into a linked one-time job, carrying the customer, address, scope, work items, and selling price while excluding internal costs.
- Added a unique source-estimate link so retries and double clicks cannot create duplicate jobs.
- Added one-click estimate duplication that starts a clean draft without carrying approval, invoice, or job links.
- Expanded owner global search to include estimates and employees in addition to customers, properties, jobs, and invoices.
- Added linked estimates and invoice/payment status directly to the customer file with one-click record navigation.
- Added explicit `service_role` grants for every public application table and the monthly invoice RPC in both the setup SQL and a focused migration.
- Corrected customer-account authentication failures to return HTTP 401 instead of a misleading server error.

## Active risk register

1. **Shared privileged PIN fallback** — browser requests now use signed sessions without replaying the owner PIN, but the Android widget and initial owner login retain PIN compatibility. A later credential-based owner identity can remove this fallback.
2. **Service-role authorization** — functions bypass RLS; every record lookup and mutation must be audited for role and object ownership.
3. **Frontend duplication** — large inline portal documents multiply fixes and regression risk. Extract only proven shared code and retain route-specific behavior.
4. **Employee PIN compatibility** — saved employee PIN sessions still restore the PIN because several employee routes have not yet been migrated to signed employee-session authorization.
5. **Large static assets** — several images are multiple megabytes and affect mobile load time.
6. **Setup-script drift** — overlapping setup/repair scripts make the expected production schema hard to prove without a read-only production schema export.
7. **Production schema state** — new additive migrations are prepared locally but have not been executed or verified against production.

## Next implementation sequence

1. Complete the Netlify function authorization/object-access matrix and migrate employee PIN sessions to signed server-verified sessions.
2. Establish one shared request/error utility and extract verified common portal modules.
3. Connect job completion to reviewable property service entries and monthly invoicing without assuming a price.
4. Add assignment conflict checks and direct calendar-to-job navigation.
5. Add deterministic job-cost reporting only where actual data exists; visibly flag missing costs.
6. Improve static asset delivery, mobile behavior, accessibility, and authenticated route smoke coverage.

## Verification log

- Pre-change: complete test suite passed.
- Post-change: all 45 test files passed, including portal syntax, owner sessions without PIN replay, authorization failures, database grants, customer and core-record archive safety, employee request protection, handler-level duplicate-safe estimate conversion, payment, messaging, billing, pricing, route, measurement, and mileage checks.
- Every Netlify Function script passed `node --check`.
- Android source is queued for the existing GitHub Actions Gradle build after push; local Android SDK compilation is unavailable in this workspace.
