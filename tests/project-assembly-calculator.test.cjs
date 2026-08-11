const assert = require("node:assert/strict");
const estimator = require("../assets/green-grin-project-estimator.js");

assert.equal(estimator.rockDepthForSize("small", "new"), 2);
assert.equal(estimator.rockDepthForSize("medium", "new"), 3);
assert.equal(estimator.rockDepthForSize("large", "new"), 4);
assert.equal(estimator.rockDepthForSize("large", "topoff"), 1);

const catalog = estimator.MATERIAL_DEFAULTS.map((item) => ({ ...item }));
Object.assign(catalog.find((item) => item.id === "decorative-rock"), { unitCost: 60, defaultRate: 78 });
Object.assign(catalog.find((item) => item.id === "weed-fabric"), { unitCost: 0.15, defaultRate: 0.2 });
Object.assign(catalog.find((item) => item.id === "fabric-staples"), { unitCost: 0.12, defaultRate: 0.18 });

const rock = estimator.calculateProject({
  service: "rock",
  areaSqFt: 1200,
  rockSize: "small",
  installType: "new",
  includeFabric: true,
  laborMode: "crew",
  crewSize: 2,
  crewHours: 8,
  equipmentId: "svl65",
  rentalPeriod: "day",
  rentalCount: 1,
  contingencyPercent: 5
}, { catalog });

assert.equal(rock.details.depth, 2);
assert.equal(rock.details.rawCubicYards, 7.41);
assert.equal(rock.lines.find((line) => line.catalog_id === "decorative-rock").quantity, 11.5);
assert.equal(rock.lines.find((line) => line.catalog_id === "installation-labor").quantity, 16);
assert.equal(rock.lines.find((line) => line.catalog_id === "rental-svl65").unit_cost, 250);
assert.ok(rock.depositAmount > 0);
assert.ok(rock.groupedTotals.Materials > 0);
assert.ok(rock.groupedTotals["Installation & Labor"] > 0);
assert.deepEqual(rock.missingCosts, []);

const mulch = estimator.calculateProject({
  service: "mulch",
  areaSqFt: 540,
  laborMode: "manual",
  manualManHours: 4,
  contingencyPercent: 0
}, { catalog });
assert.equal(mulch.details.depth, 2);

console.log("Project assembly calculator tests passed.");
