const assert = require("node:assert/strict");
const estimator = require("../assets/green-grin-project-estimator.js");

const costs = {
  "decorative-rock": 70,
  mulch: 45,
  "weed-fabric": 0.22,
  "fabric-staples": 0.12,
  "landscape-edging": 1.5,
  sod: 0.55,
  "irrigation-pipe": 1.1,
  "sprinkler-head": 12,
  "irrigation-valve": 35,
  "retaining-material": 14,
  "firepit-material": 800,
  "disposal-load": 95
};
const catalog = estimator.MATERIAL_DEFAULTS.map((item) => ({ ...item, unitCost: costs[item.id] }));

const scenarios = [
  { service: "rock", areaSqFt: 1000, depthInches: 3, includeFabric: true, laborMode: "production", productionRate: 75, contingencyPercent: 5 },
  { service: "mulch", areaSqFt: 1000, laborMode: "production", productionRate: 150, contingencyPercent: 5 },
  { service: "fabric", areaSqFt: 1000, laborMode: "production", productionRate: 200, contingencyPercent: 5 },
  { service: "sod", areaSqFt: 1000, laborMode: "production", productionRate: 100, contingencyPercent: 5 },
  { service: "irrigation", pipeFeet: 250, heads: 12, zones: 2, laborMode: "crew", crewSize: 2, crewHours: 16, contingencyPercent: 10 },
  { service: "retaining", wallLength: 40, wallHeight: 2.5, laborMode: "crew", crewSize: 2, crewHours: 24, contingencyPercent: 5 },
  { service: "firepit", itemQuantity: 1, laborMode: "crew", crewSize: 2, crewHours: 16, contingencyPercent: 5 },
  { service: "demo", areaSqFt: 1000, disposalLoads: 2, laborMode: "crew", crewSize: 2, crewHours: 12, contingencyPercent: 10 }
];

for (const input of scenarios) {
  const bid = estimator.calculateProject(input, { catalog });
  assert.ok(Number.isFinite(bid.internalCost) && bid.internalCost > 0, `${input.service} should have a valid cost`);
  assert.ok(Number.isFinite(bid.subtotal) && bid.subtotal > bid.internalCost, `${input.service} should sell above cost`);
  assert.ok(Number.isFinite(bid.grossMargin), `${input.service} should have a valid margin`);
  assert.deepEqual(bid.missingCosts, [], `${input.service} should have every supplier cost`);
  for (const line of bid.lines) {
    assert.ok(Number.isFinite(line.quantity) && line.quantity >= 0, `${input.service} has a bad quantity`);
    assert.ok(Number.isFinite(line.amount) && line.amount >= 0, `${input.service} has a bad line total`);
  }
}

const rock = estimator.calculateProject(scenarios[0], { catalog });
assert.equal(rock.details.rawCubicYards, 9.26);
assert.equal(rock.lines.find((line) => line.catalog_id === "decorative-rock").quantity, 14.5);
assert.equal(rock.lines.find((line) => line.catalog_id === "weed-fabric").quantity, 1200);

const mulch = estimator.calculateProject(scenarios[1], { catalog });
assert.equal(mulch.details.rawCubicYards, 6.17);
assert.equal(mulch.lines.find((line) => line.catalog_id === "mulch").quantity, 7);

const sod = estimator.calculateProject(scenarios[3], { catalog });
assert.equal(sod.lines.find((line) => line.catalog_id === "sod").quantity, 1050);

console.log("Project bid scenario tests passed.");
