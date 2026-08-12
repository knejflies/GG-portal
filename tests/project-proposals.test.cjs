const assert = require("node:assert/strict");
const { hash, customerGroupedTotals, publicEstimate, documentSnapshot } = require("../netlify/functions/portal-proposals.js")._test;

const estimate = {
  id: "estimate-1",
  estimate_number: "EST-1001",
  customer_name: "Test Customer",
  email: "customer@example.com",
  project_title: "Decorative Rock Installation",
  service_address: "100 Test Road",
  project_scope: "Prepare and install decorative rock.",
  grouped_totals: { Materials: 2000, "Installation & Labor": 1500 },
  subtotal: 3500,
  total: 3500,
  deposit_amount: 2000,
  valid_until: "2026-09-08"
};

assert.equal(hash("same"), hash("same"));
assert.notEqual(hash("same"), hash("different"));
const publicCopy = publicEstimate(estimate);
assert.equal(publicCopy.deposit_amount, 2000);
assert.equal(publicCopy.email_hint, "cu***@example.com");
assert.equal(Object.hasOwn(publicCopy, "internal_cost"), false);
assert.equal(Object.hasOwn(publicCopy, "line_items"), false);
const snapshot = documentSnapshot(estimate);
assert.match(snapshot.payment_terms, /completion/i);
assert.equal(snapshot.grouped_totals.Materials, 2000);

const repairedGroups = customerGroupedTotals({
  subtotal: 450,
  grouped_totals: { Materials: 450 },
  line_items: [
    { description: "Material", category: "Material", quantity: 1, rate: 100 },
    { description: "Labor", category: "Labor", quantity: 1, rate: 200 },
    { description: "Management", category: "Service", quantity: 1, rate: 150 }
  ]
});
assert.deepEqual(repairedGroups, {
  Materials: 100,
  "Installation & Labor": 200,
  "Project Coordination & Allowance": 150
});

console.log("Project proposal tests passed.");
