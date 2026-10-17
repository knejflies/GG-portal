const assert = require("assert");
const crypto = require("crypto");
const payments = require("../netlify/functions/portal-payments.js")._test;

const raw = JSON.stringify({ status: "APPROVED", cardToken: "tok_123", cardNumber: "5454545454545454" });
const secret = "checkout-secret";
const hash = crypto.createHash("sha256").update(raw + secret).digest("hex");
assert.equal(payments.validateCheckoutResponse(raw, hash, secret), true);
assert.equal(payments.validateCheckoutResponse(raw, `${hash.slice(0, -1)}0`, secret), false);
assert.equal(payments.maskedCardNumber("5454 5454 5454 5454"), "5454");
assert.deepEqual(payments.safeTransactionRecord({ transactionId: 42, cardToken: "secret-token", cardNumber: "5454545454", cardHolderName: "Test" }), { transactionId: 42 });
assert.throws(() => payments.cleanConsent({ consent: false }), /authorization box/);

const consent = payments.cleanConsent({
  consent: true,
  billing_mode: "Automatic",
  authorized_services: ["Mowing", "Fertilizer"],
  max_cycle_charge: "500",
  max_extra_price: "125",
  advance_notice_days: "3"
});
assert.equal(consent.billing_mode, "Automatic");
assert.equal(consent.max_cycle_charge, 500);
assert.deepEqual(consent.authorized_services, ["Mowing", "Fertilizer"]);

const authorized = { authorized_services: ["Mowing"], max_cycle_charge: 200, max_extra_price: 50 };
assert.equal(payments.authorizationDecision(authorized, { amount: 160, line_items: [{ category: "Mowing", amount: 160 }] }).approved, true);
assert.match(payments.authorizationDecision(authorized, { amount: 210, line_items: [{ category: "Mowing", amount: 210 }] }).reason, /billing-cycle/);
assert.match(payments.authorizationDecision(authorized, { amount: 50, line_items: [{ category: "Cleanup", amount: 50 }] }).reason, /outside/);

console.log("Helcim payment safety tests passed.");
