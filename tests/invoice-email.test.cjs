const assert = require("node:assert/strict");

process.env.GREEN_GRIN_INVOICE_FROM = "Green Grin Lawn & Landscape <ken@greengrinlawns.com>";
process.env.GREEN_GRIN_PORTAL_URL = "https://portal.greengrinlawns.com/portal/";

const { invoiceEmailPayload, escapeHtml } = require("../netlify/functions/portal-invoices.js")._test;

assert.equal(escapeHtml('<script>"test"</script>'), "&lt;script&gt;&quot;test&quot;&lt;/script&gt;");

const payload = invoiceEmailPayload({
  customer_name: "Ken <Owner>",
  email: "customer@example.com",
  amount: 119,
  due_date: "2026-08-15",
  service_line: "Fresh Grin",
  notes: "Monthly mowing"
});

assert.equal(payload.from, "Green Grin Lawn & Landscape <ken@greengrinlawns.com>");
assert.deepEqual(payload.to, ["customer@example.com"]);
assert.match(payload.subject, /\$119\.00/);
assert.match(payload.text, /View your invoice: https:\/\/portal\.greengrinlawns\.com\/portal\//);
assert.match(payload.html, /Ken &lt;Owner&gt;/);
assert.doesNotMatch(payload.html, /Ken <Owner>/);

console.log("Invoice email tests passed.");
