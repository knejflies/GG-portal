const assert = require("node:assert/strict");
const fs = require("node:fs");

const source = fs.readFileSync("netlify/functions/portal-customers.js", "utf8");

assert.match(source, /async function archiveCustomerRecords/);
assert.match(source, /billing_status:\s*"Archived"/);
assert.match(source, /status:\s*"Archived"/);
assert.doesNotMatch(source, /auth\/v1\/admin\/users/);
assert.doesNotMatch(source, /green_grin_invoices[^`]*method:\s*"DELETE"/s);
assert.doesNotMatch(source, /green_grin_properties[^`]*method:\s*"DELETE"/s);

for (const file of ["admin/index.html", "employee/index.html", "portal/index.html", "portal.html"]) {
  const html = fs.readFileSync(file, "utf8");
  assert.doesNotMatch(html, />Delete Customer<\/button>/, `${file} must not expose destructive customer deletion.`);
}
assert.match(fs.readFileSync("admin/index.html", "utf8"), />Archive Customer<\/button>/, "The admin portal must keep the reversible archive action.");

console.log("Customer archival preserves financial and service history.");
