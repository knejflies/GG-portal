const assert = require("node:assert/strict");
const { BUSINESS_NAME, CONTRACT_VERSION, paymentSchedule, buildContract } = require("../assets/green-grin-contract.js");

assert.equal(BUSINESS_NAME, "Green Grin Lawns");
assert.equal(CONTRACT_VERSION, "2026-08-19");
assert.deepEqual(paymentSchedule(10001), {
  project_total: 10001,
  initial_payment: 5000.5,
  final_payment: 5000.5,
  initial_percent: 50,
  final_percent: 50
});

const contract = buildContract({
  estimate_number: "EST-2001",
  customer_name: "Test Customer",
  phone: "2085550100",
  email: "customer@example.com",
  service_address: "100 Test Road",
  project_title: "Landscape Installation",
  project_scope: "Install rock, edging, and plants.",
  total: 12000,
  proposal_sent_at: "2026-08-19T12:00:00.000Z"
}, { registrationNumber: "RCE-TEST" });

assert.equal(contract.business.name, "Green Grin Lawns");
assert.equal(contract.business.contractor_registration_number, "RCE-TEST");
assert.equal(contract.pricing.initial_payment, 6000);
assert.equal(contract.pricing.final_payment, 6000);
assert.equal(contract.disclosure_required, true);
assert.match(contract.consent_text, /Green Grin Lawns/);
assert.match(contract.sections.map((section) => section.title).join(" | "), /Idaho Residential Contractor Disclosure Receipt/);
assert.doesNotMatch(JSON.stringify(contract), /Green Grin Lawn & Landscape/);
assert.doesNotMatch(JSON.stringify(contract), /\(“Green Grin”\)|\("Green Grin"\)/);

console.log("Landscaping contract tests passed.");
