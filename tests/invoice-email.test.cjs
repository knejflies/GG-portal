const assert = require("node:assert/strict");

process.env.GREEN_GRIN_INVOICE_FROM = "Green Grin Lawn & Landscape <ken@greengrinlawns.com>";
process.env.GREEN_GRIN_PORTAL_URL = "https://portal.greengrinlawns.com/portal/";

const { invoicePayload, invoiceEmailPayload, escapeHtml } = require("../netlify/functions/portal-invoices.js")._test;

assert.equal(escapeHtml('<script>"test"</script>'), "&lt;script&gt;&quot;test&quot;&lt;/script&gt;");

const payload = invoiceEmailPayload({
  customer_name: "Ken <Owner>",
  email: "customer@example.com",
  amount: 119,
  due_date: "2026-08-15",
  service_line: "Fresh Grin",
  service_address: "123 Green Way, Caldwell, ID",
  project_scope: "Install 3 tons of <river rock>\nFinal cleanup included.",
  notes: "Monthly mowing"
});

assert.equal(payload.from, "Green Grin Lawn & Landscape <ken@greengrinlawns.com>");
assert.deepEqual(payload.to, ["customer@example.com"]);
assert.match(payload.subject, /\$119\.00/);
assert.match(payload.text, /View your invoice: https:\/\/portal\.greengrinlawns\.com\/portal\//);
assert.match(payload.html, /Ken &lt;Owner&gt;/);
assert.match(payload.html, /123 Green Way/);
assert.match(payload.html, /Install 3 tons of &lt;river rock&gt;/);
assert.match(payload.text, /Project scope:/);
assert.doesNotMatch(payload.html, /Ken <Owner>/);

const calculated = invoicePayload({
  customer_name: "Test Customer",
  status: "Draft",
  discount: 5,
  tax_rate: 6,
  line_items: [
    { description: "Monthly mowing", category: "Service", quantity: 1, unit: "visit", rate: 100 },
    { description: "Weed spray", category: "Spray", quantity: 12, unit: "oz", rate: 0.5 }
  ]
});
assert.equal(calculated.subtotal, 106);
assert.equal(calculated.tax_amount, 6.06);
assert.equal(calculated.amount, 107.06);
assert.equal(calculated.line_items[1].amount, 6);

const project = invoicePayload({
  customer_name: "One-time Customer",
  service_address: "456 Rock Road",
  project_scope: "Remove old mulch and install decorative rock.",
  source_estimate_id: "8e38cd3a-471f-44ce-99b2-ae93be297dc4",
  source_estimate_number: "EST-ROCK-1",
  line_items: [{ description: "Decorative rock", quantity: 3, unit: "ton", rate: 275, unit_cost: 140, markup_percent: 96.4 }]
});
assert.equal(project.service_address, "456 Rock Road");
assert.equal(project.project_scope, "Remove old mulch and install decorative rock.");
assert.equal(project.amount, 825);
assert.equal(project.source_estimate_number, "EST-ROCK-1");
assert.equal("unit_cost" in project.line_items[0], false);
assert.equal("markup_percent" in project.line_items[0], false);

const projectEmail = invoiceEmailPayload(project);
assert.match(projectEmail.html, /<th[^>]*>Description<\/th><th[^>]*>Amount<\/th>/);
assert.doesNotMatch(projectEmail.html, />Quantity<\/th>/);
assert.doesNotMatch(projectEmail.html, />Rate<\/th>/);
assert.match(projectEmail.text, /Decorative rock: \$825\.00/);
assert.doesNotMatch(projectEmail.text, /3 ton/);

console.log("Invoice email tests passed.");
