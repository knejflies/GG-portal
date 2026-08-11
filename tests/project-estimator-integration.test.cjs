const fs = require("node:fs");
const assert = require("node:assert/strict");

const admin = fs.readFileSync("admin/index.html", "utf8");
for (const marker of [
  'id="project-bids"',
  'id="estimate-catalog-form"',
  'id="estimate-catalog-select"',
  'id="estimate-line-items"',
  'id="estimate-profit-strip"',
  'id="auto-bid-description"',
  'id="auto-bid-run"',
  'id="project-live-quote"',
  'id="project-material-quantity"',
  '/assets/green-grin-auto-bid-engine.js',
  'function approveHistoricalProductionRate',
  'data-estimator-view="catalog"',
  'data-estimate-intent="draft-invoice"',
  'data-estimate-intent="send-invoice"',
  'function invoiceLandscapeEstimate',
  'requestJson("portal-estimates"',
  'Internal costs and profit stayed private'
]) {
  assert.ok(admin.includes(marker), `Admin Project Estimator is missing ${marker}`);
}

assert.match(admin, /id="bids"[^>]*data-legacy-bidder="mowing"[^>]*hidden/);
assert.match(admin, /id="fert-bids"[^>]*data-legacy-bidder="fertilizer"[^>]*hidden/);

for (const customerFile of ["portal/index.html", "portal.html", "employee/index.html"]) {
  const html = fs.readFileSync(customerFile, "utf8");
  assert.ok(!html.includes('id="project-bids"'), `${customerFile} must not expose owner project costs`);
}

console.log("Project estimator integration markers passed.");
