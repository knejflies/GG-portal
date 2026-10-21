const assert = require("assert");
const fs = require("fs");

const files = ["admin/index.html", "employee/index.html", "portal/index.html"];
const requiredMarkers = [
  'data-bidder-section="bids"',
  'data-bidder-section="fert-bids"',
  'id="fert-bids"',
  'id="fert-bid-form"',
  'id="fert-pricing-form"',
  'id="fert-application-rows"',
  'id="fert-purchase-rows"',
  'id="fert-copy-job"',
  'id="fert-copy-invoice"',
  'id="fert_price_1000"',
  'id="mowing_rate_1000"',
  'id="owner_job_weekly_price"',
  "function calculateFertBid()",
  "function calculateBid()",
  "function fertilizerSettingsFromForm()",
  "function fertilizerBidNotes(bid)"
];

for (const file of files) {
  const html = fs.readFileSync(file, "utf8");
  for (const marker of requiredMarkers) {
    assert.ok(html.includes(marker), `${file} is missing ${marker}`);
  }
  assert.equal((html.match(/id="fert-bids"/g) || []).length, 1, `${file} should contain one Fert Bidder panel`);
  const directFertilizerNavCount = (html.match(/data-tab="fert-bids"/g) || []).length;
  assert.equal(directFertilizerNavCount, file === "admin/index.html" ? 1 : 0, `${file} should expose direct fertilizer navigation only in the admin portal`);
  if (file === "admin/index.html") assert.equal(/<section id="fert-bids"[^>]*\shidden(?:\s|>)/.test(html), false, "Admin Fertilizer Plans panel must not remain hidden after direct navigation");
  assert.equal((html.match(/data-tab="bids"/g) || []).length, 1, `${file} should contain one Bidders tab`);
  assert.equal(html.includes('id="owner_job_monthly_price"'), false, `${file} should price created jobs by service week`);
}

console.log("Fertilizer Bidder portal integration markers passed.");
