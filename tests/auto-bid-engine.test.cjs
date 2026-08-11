const assert = require("node:assert/strict");
const engine = require("../assets/green-grin-auto-bid-engine.js");

const rock = engine.parseJob("6150 sqft rock, 67 yards, weed mat and staples, push rock through swale with mini ex, tractor, me and one other");
assert.equal(rock.primaryService, "rock");
assert.equal(rock.squareFeet, 6150);
assert.equal(rock.cubicYards, 67);
assert.equal(rock.crewSize, 2);
assert.equal(rock.includeFabric, true);
assert.equal(rock.difficulty, "difficult");
assert.deepEqual(rock.equipment, ["mini_ex", "tractor"]);
assert.ok(rock.jobTypes.includes("fabric"));
assert.ok(rock.jobTypes.includes("grading"));

const labor = engine.estimateLabor(rock);
assert.equal(labor.quantity, 67);
assert.equal(labor.crewSize, 2);
assert.ok(labor.manHours > 20 && labor.manHours < 40);

const sod = engine.parseJob("2500 sq ft sod, remove existing grass, moderate grade, 3 workers");
assert.equal(sod.primaryService, "sod");
assert.equal(sod.squareFeet, 2500);
assert.equal(sod.crewSize, 3);
assert.equal(sod.removal, true);

const cleanup = engine.parseJob("clean out 3 acres, lots of leaves and brush, 3 guys and a tractor");
assert.equal(cleanup.primaryService, "cleanup");
assert.equal(cleanup.acres, 3);
assert.equal(cleanup.squareFeet, 130680);

const bands = engine.priceBands(4000, 8, { overheadPercent: 12, floorGrossMargin: 0.3, targetGrossMargin: 0.42, premiumGrossMargin: 0.5 });
assert.equal(bands.directCost, 4000);
assert.ok(bands.costFloor < bands.recommended);
assert.ok(bands.recommended < bands.premium);

const history = engine.historicalRecommendation([
  { service: "rock", quantity: 60, actual_man_hours: 24, crew_size: 2, difficulty: "normal", equipment: [] },
  { service: "rock", quantity: 50, actual_man_hours: 22, crew_size: 2, difficulty: "normal", equipment: [] },
  { service: "rock", quantity: 75, actual_man_hours: 30, crew_size: 2, difficulty: "normal", equipment: [] }
], "rock");
assert.equal(history.sampleSize, 3);
assert.ok(history.recommendedRate > 2.5 && history.recommendedRate < 3);
assert.ok(history.bestRate >= history.recommendedRate);

console.log("Auto Bid engine tests passed.");
