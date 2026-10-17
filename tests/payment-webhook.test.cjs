const assert = require("assert");
const crypto = require("crypto");

const verifier = Buffer.from("webhook-secret-bytes").toString("base64");
process.env.HELCIM_WEBHOOK_VERIFIER_TOKEN = verifier;
const webhook = require("../netlify/functions/payment-webhook.js")._test;
const body = JSON.stringify({ id: "25764674", type: "cardTransaction" });
const id = "msg_test_123";
const timestamp = "1716412291";
const signature = crypto.createHmac("sha256", Buffer.from(verifier, "base64")).update(`${id}.${timestamp}.${body}`).digest("base64");
const event = { body, headers: { "webhook-id": id, "webhook-timestamp": timestamp, "webhook-signature": `v1,${signature}` } };
assert.equal(webhook.verifyWebhook(event), true);
assert.equal(webhook.verifyWebhook({ ...event, body: `${body} ` }), false);
assert.equal(webhook.paymentState({ status: "APPROVED" }), "Paid");
assert.equal(webhook.paymentState({ status: "DECLINED" }), "Failed");
assert.equal(webhook.paymentReference({ transactionId: 42 }), "42");

console.log("Payment webhook signature tests passed.");
