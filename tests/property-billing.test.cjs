const assert = require("assert");
const { serviceEntryPayload, billingIdempotencyKey, authorizationDecision } = require("../netlify/functions/portal-property-billing.js")._test;

const entry = serviceEntryPayload({
  property_id: "property-1",
  customer_user_id: "customer-1",
  service_date: "2026-09-29",
  service_category: "Fertilizer",
  description: "Fall fertilizer application",
  quantity: 2,
  unit: "zones",
  customer_price: 85,
  material_cost: 14.25,
  internal_notes: { product: "16-0-0", amount_used: "2 bags" },
  include_internal_notes: false,
  source_key: "fert-2026-09-29-property-1"
});

assert.equal(entry.quantity, 2);
assert.equal(entry.customer_price, 85);
assert.equal(entry.material_cost, 14.25);
assert.equal(entry.include_internal_notes, false);
assert.equal(entry.status, "Completed");
assert.throws(() => serviceEntryPayload({ property_id: "p", customer_user_id: "c", service_date: "2026-09-29", description: "Missing quantity" }), /quantity are required/);
assert.equal(billingIdempotencyKey("property-1", "2026-09"), "property-1:2026-09");
assert.equal(authorizationDecision({ authorized_services: ["Mowing"], max_cycle_charge: 100 }, [{ service_category: "Mowing", quantity: 2, customer_price: 40 }]).approved, true);
assert.equal(authorizationDecision({ authorized_services: ["Mowing"], max_cycle_charge: 100 }, [{ service_category: "Fertilizer", quantity: 1, customer_price: 40 }]).approved, false);
assert.match(authorizationDecision({ authorized_services: ["Mowing"], max_cycle_charge: 50 }, [{ service_category: "Mowing", quantity: 2, customer_price: 40 }]).reason, /exceeds/);

console.log("Property billing entry tests passed.");
