const assert = require("assert");
const fs = require("fs");

const { blowoutPriceForZones, blowoutConfirmationPayload } = require("../netlify/functions/portal-sprinkler-blowouts.js")._test;
const html = fs.readFileSync("sprinkler-blowout.html", "utf8");
const signupFunction = fs.readFileSync("netlify/functions/portal-sprinkler-blowouts.js", "utf8");

assert.strictEqual(blowoutPriceForZones(1), 55, "One zone should cost the $55 minimum.");
assert.strictEqual(blowoutPriceForZones(6), 55, "Six zones should be included in the $55 minimum.");
assert.strictEqual(blowoutPriceForZones(7), 60, "The seventh zone should add $5.");
assert.strictEqual(blowoutPriceForZones(10), 75, "Every zone after six should add $5.");

const email = blowoutConfirmationPayload({ full_name: "Test Customer", email: "test@example.com", zones: 8, spigots: 1, service_address: "123 Test St", share_code: "GG-TEST" });
assert.ok(email.text.includes("Price: $65.00"), "Confirmation email should include the calculated price.");
assert.ok(email.html.includes("green-grin-logo.png"), "Confirmation email should include the Green Grin logo.");
assert.ok(html.includes("$55 includes up to 6 zones"), "Public signup should clearly state the base price.");
assert.ok(html.includes("Each additional zone is $5"), "Public signup should clearly state the additional-zone price.");
assert.ok(html.includes('id="blowout-price-preview"'), "Public signup should show a live price preview.");
assert.match(signupFunction, /if \(!\/customer_price\/i\.test\(error\.message \|\| ""\)\) throw error;/, "Signup must remain compatible until the live database has the customer price column.");
assert.ok(signupFunction.includes("compatibleSignup"), "Signup must retry without the optional price column when the live schema is older.");

console.log("Sprinkler signup pricing checks passed.");
