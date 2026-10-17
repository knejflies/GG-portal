const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "admin", "index.html"), "utf8");
const sql = fs.readFileSync(path.join(root, "lawn-measurements.sql"), "utf8");
const endpoint = fs.readFileSync(path.join(root, "netlify", "functions", "portal-lawn-measurements.js"), "utf8");

for (const id of ["yard-measurement-finish", "yard-measurement-clear-all", "yard-measurement-shapes", "yard-measurement-save"]) {
  assert.match(html, new RegExp(`id=["']${id}["']`), `${id} must be present`);
}
assert.match(html, /yardMeasurementZones/);
assert.match(html, /yardMeasurementExclusions/);
assert.match(html, /portal-lawn-measurements/);
assert.match(html, /fert_lawn_sqft/);
assert.match(html, /bid_lawn_sqft/);
assert.match(sql, /green_grin_lawn_measurements/);
assert.match(sql, /supersedes_id/);
assert.match(endpoint, /validateMeasurement/);
assert.match(endpoint, /duplicatePrevented/);

console.log("Lawn measurement integration checks passed.");
