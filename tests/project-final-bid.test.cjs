const assert = require("node:assert/strict");
const estimator = require("../assets/green-grin-project-estimator.js");
const { estimatePayload } = require("../netlify/functions/portal-estimates.js")._test;
const { customerGroupedTotals } = require("../netlify/functions/portal-proposals.js")._test;

const costs = {
  "decorative-rock": 70,
  "weed-fabric": 0.22,
  "fabric-staples": 0.12,
  "disposal-load": 95
};
const catalog = estimator.MATERIAL_DEFAULTS.map((item) => ({
  ...item,
  unitCost: costs[item.id] ?? item.unitCost
}));

const calculated = estimator.calculateProject({
  service: "rock",
  areaSqFt: 1200,
  depthInches: 3,
  includeFabric: true,
  disposalLoads: 1,
  laborMode: "manual",
  manualManHours: 16,
  equipmentId: "svl65",
  rentalPeriod: "day",
  rentalCount: 1,
  contingencyPercent: 5
}, { catalog });

const lines = [
  ...calculated.lines,
  {
    catalog_id: "pricing-protection",
    description: "Project management, overhead, and profit protection",
    category: "Service",
    quantity: 1,
    unit: "each",
    unit_cost: 0,
    markup_percent: 0,
    rate: 350,
    deposit_eligible: false
  }
];
const saved = estimatePayload({
  customer_name: "Tomorrow Customer",
  project_title: "Decorative Rock Installation",
  line_items: lines
});
const customerGroups = customerGroupedTotals(saved);
const amountFor = (category) => saved.line_items
  .filter((line) => line.category === category)
  .reduce((sum, line) => sum + line.amount, 0);

assert.equal(customerGroups.Materials, amountFor("Material"));
assert.equal(customerGroups["Labor & Installation"], saved.subtotal - amountFor("Material"));
assert.deepEqual(Object.keys(customerGroups), ["Materials", "Labor & Installation"]);
assert.equal(Object.values(customerGroups).reduce((sum, amount) => sum + amount, 0), saved.subtotal);
assert.equal(Object.keys(customerGroups).some((label) => /contingency|equipment|disposal/i.test(label)), false);
assert.deepEqual(estimator.invoiceLines(saved.line_items).map((line) => line.description), ["Materials", "Labor & Installation"]);
assert.ok(saved.deposit_amount < saved.subtotal, "Labor and project coordination must not enter the material deposit.");

console.log("Final customer bid category reconciliation passed.");
