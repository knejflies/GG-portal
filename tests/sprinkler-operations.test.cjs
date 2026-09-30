const assert = require("assert");
const { normalizeAddress, geocodeDecision, extraRows, blowoutIdempotencyKey } = require("../netlify/functions/portal-sprinkler-operations.js")._test;

assert.equal(normalizeAddress("123 Main St., Caldwell, ID"), normalizeAddress("123 main st caldwell id"));
assert.equal(geocodeDecision({ lat: "43.6", lon: "-116.6", importance: 0.8, display_name: "123 Main St, Caldwell, Idaho" }, "123 Main St").status, "Located");
assert.equal(geocodeDecision({ lat: "43.6", lon: "-116.6", importance: 0.8, display_name: "Caldwell, Idaho" }, "123 Main St").status, "Needs Correction");
assert.equal(extraRows([{ description: "Drain extra", quantity: 2, rate: 15 }])[0].amount, undefined);
assert.equal(blowoutIdempotencyKey("lead-1", "2026-10-01"), "blowout:lead-1:2026-10-01");

console.log("Sprinkler operations tests passed.");
