const assert = require("node:assert/strict");
const { normalizeEstimateLines, estimatePayload } = require("../netlify/functions/portal-estimates.js")._test;

const lines = normalizeEstimateLines([{
  catalog_id: "weed-fabric",
  description: "Commercial weed fabric",
  category: "Material",
  quantity: 1000,
  unit: "sq ft",
  unit_cost: 0.18,
  markup_percent: 60
}]);

assert.equal(lines[0].rate, 0.29);
assert.equal(lines[0].cost_total, 180);
assert.equal(lines[0].amount, 290);

const estimate = estimatePayload({
  customer_name: "Test Customer",
  project_title: "Rock bed refresh",
  valid_until: "2026-09-08",
  invoice_due_date: "2026-09-15",
  customer_notes: "Materials and final cleanup included.",
  line_items: lines,
  discount: 10,
  tax_rate: 6
});

assert.equal(estimate.internal_cost, 180);
assert.equal(estimate.subtotal, 290);
assert.equal(estimate.gross_profit, 100);
assert.equal(estimate.deposit_amount, 290);
assert.equal(estimate.grouped_totals.Materials, 290);
assert.equal(estimate.gross_margin, 0.3571);
assert.equal(estimate.tax_amount, 16.8);
assert.equal(estimate.total, 296.8);
assert.equal(estimate.valid_until, "2026-09-08");
assert.equal(estimate.invoice_due_date, "2026-09-15");
assert.equal(estimate.customer_notes, "Materials and final cleanup included.");

const mixedEstimate = estimatePayload({
  customer_name: "Mixed Project",
  project_title: "Complete landscape installation",
  line_items: [
    { description: "Rock", category: "Material", quantity: 1, rate: 100 },
    { description: "Installation", category: "Labor", quantity: 1, rate: 200 },
    { description: "Loader", category: "Equipment", quantity: 1, rate: 30 },
    { description: "Dump fee", category: "Disposal", quantity: 1, rate: 10 },
    { description: "Project coordination", category: "Service", quantity: 1, rate: 50 },
    { description: "Contingency", category: "Other", quantity: 1, rate: 25 }
  ]
});
assert.deepEqual(mixedEstimate.grouped_totals, {
  Materials: 100,
  "Labor & Installation": 315
});
assert.equal(Object.keys(mixedEstimate.grouped_totals).length, 2);
assert.equal(Object.keys(mixedEstimate.grouped_totals).some((label) => /contingency/i.test(label)), false);
assert.equal(Object.values(mixedEstimate.grouped_totals).reduce((sum, amount) => sum + amount, 0), mixedEstimate.subtotal);

const linked = estimatePayload({
  ...estimate,
  invoice_id: "8e38cd3a-471f-44ce-99b2-ae93be297dc4",
  invoice_number: "INV-1234",
  invoiced_at: "2026-08-08T18:00:00.000Z"
}, estimate);
assert.equal(linked.invoice_number, "INV-1234");
assert.equal(linked.status, "Draft");

console.log("Project estimator tests passed.");
