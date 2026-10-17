const assert = require("assert");
const fs = require("fs");

const source = fs.readFileSync("netlify/functions/portal-customers.js", "utf8");

assert.ok(source.includes("async function savePropertyGeocode"), "Property map updates should use the schema-compatible geocode saver.");
assert.match(source, /if \(!\/geocode_display_name\/i\.test\(error\.message \|\| ""\)\) throw error;/, "Only the known missing display-name column should trigger compatibility mode.");
assert.ok(source.includes("compatibleUpdate"), "Property mapping should retry without the optional display-name column.");

console.log("Property map schema compatibility checks passed.");
