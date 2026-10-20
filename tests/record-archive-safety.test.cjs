const assert = require("node:assert/strict");
const fs = require("node:fs");

const expectations = {
  "netlify/functions/portal-jobs.js": [/status:\s*"Archived"/, /archived:\s*true/],
  "netlify/functions/portal-invoices.js": [/status:\s*"Void"/, /active:\s*false/],
  "netlify/functions/portal-expenses.js": [/active:\s*false/, /archived:\s*true/],
  "netlify/functions/portal-estimates.js": [/status:\s*"Declined"/, /archived:\s*true/],
  "netlify/functions/portal-employees.js": [/status:\s*"Inactive"/, /employee_pin:\s*null/]
};

for (const [file, patterns] of Object.entries(expectations)) {
  const source = fs.readFileSync(file, "utf8");
  for (const pattern of patterns) assert.match(source, pattern, `${file} must retain records through a safe terminal state.`);
}

assert.doesNotMatch(fs.readFileSync("netlify/functions/portal-jobs.js", "utf8"), /green_grin_message_log\?job_id[^\n]+method:\s*"DELETE"/);
assert.doesNotMatch(fs.readFileSync("netlify/functions/portal-invoices.js", "utf8"), /green_grin_invoices\?id[^\n]+method:\s*"DELETE"/);
assert.doesNotMatch(fs.readFileSync("netlify/functions/portal-employees.js", "utf8"), /auth\/v1\/admin\/users/);

console.log("Core business records use auditable archive and void states.");
