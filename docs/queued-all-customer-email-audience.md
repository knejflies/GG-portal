# Queued: All-time customer email audience

## Purpose
Keep one durable audience of everyone Green Grin has ever worked for, including archived customers, so past customers can be reached without mixing them into the active weekly customer list.

## Admin flow
- Add an **All Customers** audience view with tabs for Active, Past, and All.
- Search and filter by service history, last service date, service type, and email permission.
- Select customers individually or select a filtered group.
- Open the Email Drafter with the selected audience attached.
- Edit subject and message, preview the recipient count, then queue the blast.
- Send one individual email per recipient so addresses are never exposed to one another.
- Show queued, sent, skipped, failed, and opted-out counts.

## Retention rules
- Archiving a customer removes them from active work lists but keeps their customer record, property history, jobs, invoices, and contact permissions available to the all-time audience.
- A delete action should become an archive action for customers with service history; historical records must not be hard-deleted.
- Deduplicate by customer id first, then normalized email, then normalized phone.
- Keep opt-out and permission checks on every blast.

## Data work queued
- Add an all-time customer query that includes inactive customers and historical job/invoice contacts.
- Add a blast queue and per-recipient delivery log with idempotency keys.
- Add a customer audience selector to the Email Drafter.
- Keep this change unpublished until reviewed and explicitly pushed.
