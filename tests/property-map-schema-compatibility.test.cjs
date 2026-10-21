const assert = require("assert");
const fs = require("fs");

const source = fs.readFileSync("netlify/functions/portal-customers.js", "utf8");
const migration = fs.readFileSync("migrations/2026-10-20-property-map-columns.sql", "utf8");

assert.ok(source.includes("async function savePropertyGeocode"), "Property map updates should use the schema-compatible geocode saver.");
assert.ok(source.includes("geocode_display_name") && source.includes("geocode_status"), "Property mapping should handle optional geocode columns.");
assert.ok(source.includes("compatibleUpdate"), "Property mapping should retry without the optional display-name column.");
assert.ok(source.includes("insertPropertyCompatible"), "Property backfill should work with older schemas missing optional geocode columns.");
assert.match(source, /geocode_status.*coordinateUpdate/s, "Property updates should fall back to coordinates when geocode status is missing.");
assert.ok(source.includes('property_source: "job_fallback"'), "Legacy job-only customers should remain visible to the customer map.");
assert.ok(source.includes("knownProperties"), "Locate addresses should avoid duplicate property backfills.");
for (const column of ["latitude", "longitude", "geocode_status", "geocode_display_name"]) assert.match(migration, new RegExp(`add column if not exists ${column}`), `Migration should add ${column}.`);

console.log("Property map schema compatibility checks passed.");
