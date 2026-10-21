const assert = require("node:assert/strict");

const message = require("../netlify/functions/portal-message.js");
const { _test } = message;

assert.equal(_test.normalizeAddress("100 Main St., Caldwell, ID"), "100mainstcaldwellid");
assert.equal(_test.completedServiceDate({ service_date: "2026-10-20" }, {}), "2026-10-20");
assert.equal(_test.completedServiceDate({}, { scheduled_date: "2026-10-19T12:00:00Z" }), "2026-10-19");
assert.equal(_test.completedServicePrice({ customer_price: "79.95" }, { recurring_weekly: true }), 79.95);
assert.equal(_test.completedServicePrice({}, { recurring_weekly: true, monthly_price: 300 }), null, "Recurring totals must not be treated as per-visit prices.");
assert.equal(_test.completedServicePrice({}, { recurring_weekly: false, annual_price: 425 }), 425);
assert.equal(_test.serviceCategoryForJob({ service_type: "Fertilizer application" }), "Fertilizer");
assert.equal(_test.serviceCategoryForJob({ service_type: "Landscape cleanup" }), "Cleanup");
assert.equal(_test.serviceCategoryForJob({ service_type: "Weekly mowing" }), "Mowing");
assert.equal(_test.completionSourceKey({ id: "job-7" }, "2026-10-20"), "job-completed:job-7:2026-10-20");

console.log("Completed jobs use safe per-visit pricing and deterministic service-entry keys.");
