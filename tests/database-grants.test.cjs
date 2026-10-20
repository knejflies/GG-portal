const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const setup = fs.readFileSync(path.resolve(__dirname, "..", "portal-setup.sql"), "utf8");
const created = [...setup.matchAll(/create table if not exists public\.([a-z0-9_]+)/gi)].map((match) => match[1]);
assert.ok(created.length > 0, "The setup must create at least one application table.");

for (const table of created) {
  const statement = `grant all privileges on table public.${table} to service_role;`;
  assert.ok(setup.toLowerCase().includes(statement), `public.${table} needs an explicit service_role grant for PostgREST.`);
}

assert.match(setup, /grant usage on schema public to service_role/i);
assert.match(setup, /grant execute on function public\.green_grin_generate_property_invoice\(uuid, text\) to service_role/i);

console.log(`Database grants cover all ${created.length} public application tables.`);
