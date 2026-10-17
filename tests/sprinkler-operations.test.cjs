const assert = require("assert");
const fs = require("fs");
const { normalizeAddress, geocodeDecision, extraRows, blowoutIdempotencyKey, resolveBlowoutPrice, scheduledEmailRoster, blowoutCompletionReceiptPayload, compatibleBlowoutLeadUpdate } = require("../netlify/functions/portal-sprinkler-operations.js")._test;
const operationSource = fs.readFileSync("netlify/functions/portal-sprinkler-operations.js", "utf8");

assert.equal(normalizeAddress("123 Main St., Caldwell, ID"), normalizeAddress("123 main st caldwell id"));
assert.equal(geocodeDecision({ lat: "43.6", lon: "-116.6", importance: 0.8, display_name: "123 Main St, Caldwell, Idaho" }, "123 Main St").status, "Located");
assert.equal(geocodeDecision({ lat: "43.6", lon: "-116.6", importance: 0.8, display_name: "Caldwell, Idaho" }, "123 Main St").status, "Needs Correction");
assert.equal(extraRows([{ description: "Drain extra", quantity: 2, rate: 15 }])[0].amount, undefined);
assert.equal(blowoutIdempotencyKey("lead-1", "2026-10-01"), "blowout:lead-1:2026-10-01");
assert.equal(resolveBlowoutPrice({}, { customer_price: 85 }), 85, "Completion must use the account price saved from any device.");
assert.equal(resolveBlowoutPrice({ base_amount: 95 }, { customer_price: 85 }), 95, "An explicitly reviewed completion price must win.");
const roster = scheduledEmailRoster([
  { id: "1", full_name: "First Property", email: "owner@example.com", service_address: "1 Main St", status: "Scheduled" },
  { id: "2", full_name: "Second Property", email: "owner@example.com", service_address: "2 Main St", status: "Scheduled" },
  { id: "3", full_name: "Missing Email", email: "", service_address: "3 Main St", status: "Scheduled" },
  { id: "4", full_name: "Finished", email: "done@example.com", service_address: "4 Main St", status: "Completed" },
  { id: "5", full_name: "Already Invoiced", email: "invoiced@example.com", service_address: "5 Main St", status: "Invoiced" }
], "2026-10-15");
assert.equal(roster.assigned_total, 5);
assert.equal(roster.active_total, 3);
assert.equal(roster.recipients.length, 2, "Separate scheduled records sharing an email must both remain visible in the day count.");
assert.equal(roster.missing_email[0].name, "Missing Email");
assert.equal(roster.closed_total, 2);
const receipt = blowoutCompletionReceiptPayload({ full_name: "Test Customer", email: "test@example.com", service_address: "123 Test St" }, { service_date: "2026-10-16", zones: 8, total_amount: 65, extra_charges: [] });
assert.ok(receipt.subject.includes("payment receipt - $65.00"), "Payment receipt subject should include the final paid amount.");
assert.ok(receipt.text.includes("Status: Paid"), "Receipt should confirm that payment was received.");
assert.ok(receipt.text.includes("October 16, 2026"), "Completion receipt should include the service date.");
assert.ok(operationSource.includes('status: "Paid", service_line: "Sprinkler Blowout"'), "Completing a paid blowout should create a paid invoice for bookkeeping.");
assert.ok(operationSource.includes('const completionUpdate = { status: "Paid"'), "Completing a blowout should close the signup as paid.");
assert.ok(operationSource.includes('body.action === "send-receipt"'), "Older paid blowouts should support sending or resending a receipt.");
const repeatedCustomerUpdate = compatibleBlowoutLeadUpdate({ customer_user_id: "customer-1", property_id: "property-2", status: "Paid" }, new Error('duplicate key value violates unique constraint "green_grin_blowout_leads_customer_user_idx"'));
assert.equal(repeatedCustomerUpdate.customer_user_id, undefined, "Older unique-index schemas should omit the duplicate customer link.");
assert.equal(repeatedCustomerUpdate.property_id, "property-2", "The repeated signup should still link to its property.");

console.log("Sprinkler operations tests passed.");
