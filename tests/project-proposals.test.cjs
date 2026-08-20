const assert = require("node:assert/strict");
process.env.GREEN_GRIN_CONTRACTOR_REGISTRATION_NUMBER = "RCE-TEST";
const { hash, customerGroupedTotals, proposalPriceDisplay, customerVisibleGroups, publicEstimate, proposalEmail, documentSnapshot, signedProposalEmail } = require("../netlify/functions/portal-proposals.js")._test;

const estimate = {
  id: "estimate-1",
  estimate_number: "EST-1001",
  customer_name: "Test Customer",
  email: "customer@example.com",
  project_title: "Decorative Rock Installation",
  service_address: "100 Test Road",
  project_scope: "Prepare and install decorative rock.",
  grouped_totals: { Materials: 2000, "Labor & Installation": 1500 },
  subtotal: 3500,
  total: 3500,
  deposit_amount: 2000,
  valid_until: "2026-09-08",
  invoice_due_date: "2026-09-15",
  calculation_inputs: { proposal_price_display: "grouped" }
};

assert.equal(hash("same"), hash("same"));
assert.notEqual(hash("same"), hash("different"));
const publicCopy = publicEstimate(estimate);
assert.equal(publicCopy.deposit_amount, 1750);
assert.equal(publicCopy.email_hint, "cu***@example.com");
assert.equal(publicCopy.invoice_due_date, "2026-09-15");
assert.equal(publicCopy.contract.business.name, "Green Grin Lawns");
assert.equal(publicCopy.contract.business.contractor_registration_number, "RCE-TEST");
assert.equal(publicCopy.contract.pricing.initial_payment, 1750);
assert.equal(publicCopy.contract.pricing.final_payment, 1750);
assert.equal(publicCopy.contract.disclosure_required, true);
assert.equal(Object.hasOwn(publicCopy, "internal_cost"), false);
assert.equal(Object.hasOwn(publicCopy, "line_items"), false);
const snapshot = documentSnapshot(estimate);
assert.match(snapshot.payment_terms, /completion/i);
assert.equal(snapshot.grouped_totals.Materials, 2000);
assert.equal(proposalPriceDisplay(estimate), "grouped");

const emailCopy = proposalEmail(estimate, "https://portal.example/proposal?token=test");
assert.match(emailCopy, /LANDSCAPING CUSTOMER CONTRACT/);
assert.match(emailCopy, /Scope of work/);
assert.match(emailCopy, /Project price/);
assert.match(emailCopy, /50% initial payment/);
assert.match(emailCopy, /Green Grin Lawns/);
assert.match(emailCopy, /Payment due:/);
assert.doesNotMatch(emailCopy, /Quantity|Rate/);

const privateEstimate = { ...estimate, calculation_inputs: { proposal_price_display: "total_only" } };
assert.equal(proposalPriceDisplay(privateEstimate), "grouped");
assert.deepEqual(customerVisibleGroups(privateEstimate), { Materials: 2000, "Labor & Installation": 1500 });
assert.deepEqual(publicEstimate(privateEstimate).grouped_totals, { Materials: 2000, "Labor & Installation": 1500 });
assert.deepEqual(documentSnapshot(privateEstimate).grouped_totals, { Materials: 2000, "Labor & Installation": 1500 });

const ownerCopy = signedProposalEmail(privateEstimate, documentSnapshot(privateEstimate), {
  signer_name: "Test Customer",
  signer_email: "customer@example.com",
  signature_type: "typed",
  signature_data: "Test Customer",
  consent_text: "Approved",
  signed_at: "2026-08-14T12:00:00.000Z",
  document_hash: "document-hash"
});
assert.match(ownerCopy, /Signed Green Grin Lawns Landscaping Customer Contract/);
assert.match(ownerCopy, /Project total: \$3,500\.00/);
assert.match(ownerCopy, /Idaho Residential Contractor Disclosure Receipt/);
assert.match(ownerCopy, /Materials<\/td>/);
assert.match(ownerCopy, /Labor &amp; Installation/);
assert.match(ownerCopy, /document-hash/);

const repairedGroups = customerGroupedTotals({
  subtotal: 450,
  grouped_totals: { Materials: 450 },
  line_items: [
    { description: "Material", category: "Material", quantity: 1, rate: 100 },
    { description: "Labor", category: "Labor", quantity: 1, rate: 200 },
    { description: "Management", category: "Service", quantity: 1, rate: 150 }
  ]
});
assert.deepEqual(repairedGroups, {
  Materials: 100,
  "Labor & Installation": 350
});

console.log("Project proposal tests passed.");
