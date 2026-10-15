const assert = require("assert");
const { normalizeAddress, geocodeDecision, extraRows, blowoutIdempotencyKey, scheduledEmailRoster } = require("../netlify/functions/portal-sprinkler-operations.js")._test;

assert.equal(normalizeAddress("123 Main St., Caldwell, ID"), normalizeAddress("123 main st caldwell id"));
assert.equal(geocodeDecision({ lat: "43.6", lon: "-116.6", importance: 0.8, display_name: "123 Main St, Caldwell, Idaho" }, "123 Main St").status, "Located");
assert.equal(geocodeDecision({ lat: "43.6", lon: "-116.6", importance: 0.8, display_name: "Caldwell, Idaho" }, "123 Main St").status, "Needs Correction");
assert.equal(extraRows([{ description: "Drain extra", quantity: 2, rate: 15 }])[0].amount, undefined);
assert.equal(blowoutIdempotencyKey("lead-1", "2026-10-01"), "blowout:lead-1:2026-10-01");
const roster = scheduledEmailRoster([
  { id: "1", full_name: "First Property", email: "owner@example.com", service_address: "1 Main St", status: "Scheduled" },
  { id: "2", full_name: "Second Property", email: "owner@example.com", service_address: "2 Main St", status: "Scheduled" },
  { id: "3", full_name: "Missing Email", email: "", service_address: "3 Main St", status: "Scheduled" },
  { id: "4", full_name: "Finished", email: "done@example.com", service_address: "4 Main St", status: "Completed" }
], "2026-10-15");
assert.equal(roster.assigned_total, 4);
assert.equal(roster.active_total, 3);
assert.equal(roster.recipients.length, 2, "Separate scheduled records sharing an email must both remain visible in the day count.");
assert.equal(roster.missing_email[0].name, "Missing Email");
assert.equal(roster.closed_total, 1);

console.log("Sprinkler operations tests passed.");
