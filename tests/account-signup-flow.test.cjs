const assert = require("node:assert/strict");
const fs = require("node:fs");

const portal = fs.readFileSync("portal/index.html", "utf8");
const portalFallback = fs.readFileSync("portal.html", "utf8");
const sql = fs.readFileSync("portal-setup.sql", "utf8");

for (const html of [portal, portalFallback]) {
  assert.ok(html.includes('authForm.dataset.busy = "true"'), "signup must block duplicate submissions");
  assert.ok(html.includes("result.data.user.identities.length === 0"), "signup must identify an existing email response");
  assert.ok(html.includes("Check your email to confirm it"), "signup must explain email confirmation");
  assert.ok(html.includes("Too many account attempts were made"), "signup must explain rate limiting");
}

assert.ok(sql.includes("green_grin_create_customer_on_signup"), "database must create customer profiles on signup");
assert.ok(sql.includes("after insert on auth.users"), "customer trigger must run immediately after signup");
assert.ok(sql.includes("green_grin_customer_code"), "customer code assignment must use an advisory lock");
assert.ok(sql.includes("insert into public.green_grin_properties"), "signup must create the initial property");
assert.ok(sql.includes("where not exists (select 1 from public.green_grin_customers"), "setup must repair existing auth users missing customer profiles");

console.log("Account signup flow tests passed.");
