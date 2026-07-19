const assert = require("assert");
const fs = require("fs");

const files = ["portal.html", "admin/index.html", "employee/index.html", "portal/index.html"];
const requiredMarkers = [
  'data-tab="fert-bids"',
  'id="fert-bids"',
  'id="fert-bid-form"',
  'id="fert-pricing-form"',
  'id="fert-application-rows"',
  'id="fert-purchase-rows"',
  'id="fert-copy-job"',
  'id="fert-copy-invoice"',
  "function calculateFertBid()",
  "function fertilizerSettingsFromForm()",
  "function fertilizerBidNotes(bid)"
];

for (const file of files) {
  const html = fs.readFileSync(file, "utf8");
  for (const marker of requiredMarkers) {
    assert.ok(html.includes(marker), `${file} is missing ${marker}`);
  }
  assert.equal((html.match(/id="fert-bids"/g) || []).length, 1, `${file} should contain one Fert Bidder panel`);
  assert.equal((html.match(/data-tab="fert-bids"/g) || []).length, 1, `${file} should contain one Fert Bidder tab`);
}

console.log("Fertilizer Bidder portal integration markers passed.");
