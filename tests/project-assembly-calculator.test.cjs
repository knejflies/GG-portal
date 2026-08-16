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
assert.ok(rock.groupedTotals["Labor & Installation"] > 0);
assert.deepEqual(Object.keys(rock.groupedTotals), ["Materials", "Labor & Installation"]);
assert.deepEqual(estimator.invoiceLines(rock.lines).map((line) => line.description), ["Materials", "Labor & Installation"]);
assert.deepEqual(rock.missingCosts, []);

const combinedFabricRock = estimator.calculateProject({
  service: "rock",
  areaSqFt: 1200,
  rockSize: "small",
  installType: "new",
  includeFabric: true,
  laborMode: "manual",
  manualManHours: 8,
  contingencyPercent: 0
}, { catalog, excludedCatalogIds: ["fabric-staples"] });
assert.ok(combinedFabricRock.lines.some((line) => line.catalog_id === "weed-fabric"));
assert.ok(!combinedFabricRock.lines.some((line) => line.catalog_id === "fabric-staples"));

const mulch = estimator.calculateProject({
  service: "mulch",
  areaSqFt: 540,
  laborMode: "manual",
  manualManHours: 4,
  contingencyPercent: 0
}, { catalog });
assert.equal(mulch.details.depth, 2);

const irrigationCatalog = estimator.MATERIAL_DEFAULTS.map((item) => ({ ...item, unitCost: 1 }));
const irrigation = estimator.calculateProject({
  service: "irrigation",
  pipeFeet: 100,
  heads: 5,
  zones: 1,
  laborMode: "manual",
  manualManHours: 4,
  contingencyPercent: 0
}, { catalog: irrigationCatalog });
assert.equal(irrigation.lines.find((line) => line.catalog_id === "irrigation-pipe").quantity, 120);
assert.equal(irrigation.lines.find((line) => line.catalog_id === "sprinkler-head").quantity, 5);
assert.equal(irrigation.lines.find((line) => line.catalog_id === "irrigation-valve").quantity, 1);

const demo = estimator.calculateProject({
  service: "demo",
  areaSqFt: 500,
  disposalLoads: 1,
  laborMode: "manual",
  manualManHours: 8,
  contingencyPercent: 0
});
assert.deepEqual(demo.missingCosts, ["Disposal and dump fees"]);

const blankDefaults = estimator.calculateProject({
  service: "mulch",
  areaSqFt: 540,
  depthInches: "",
  laborMode: "crew",
  crewSize: "",
  crewHours: 8,
  contingencyPercent: 0
}, { catalog });
assert.equal(blankDefaults.details.depth, 2);
assert.equal(blankDefaults.lines.find((line) => line.catalog_id === "installation-labor").quantity, 8);

const liveRockQuote = estimator.calculateProject({
  service: "rock",
  areaSqFt: 1000,
  depthInches: 3,
  includeFabric: false,
  primaryMaterial: {
    name: "Salt and Pepper 1-inch rock",
    unit: "yard",
    unitCost: 52,
    markupPercent: 35,
    purchaseIncrement: 0.5
  },
  deliveryCost: 175,
  deliveryMarkupPercent: 20,
  laborMode: "manual",
  manualManHours: 10,
  contingencyPercent: 0
}, { catalog });
const quotedRock = liveRockQuote.lines.find((line) => line.catalog_id === "decorative-rock");
assert.equal(quotedRock.description, "Salt and Pepper 1-inch rock");
assert.equal(quotedRock.unit, "yard");
assert.equal(quotedRock.quantity, 10.5);
assert.equal(quotedRock.unit_cost, 52);
assert.equal(quotedRock.rate, 70.2);
assert.equal(liveRockQuote.lines.find((line) => line.catalog_id === "supplier-delivery").amount, 210);
assert.match(liveRockQuote.scope, /Salt and Pepper/);

console.log("Project assembly calculator tests passed.");
