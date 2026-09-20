const assert = require("node:assert/strict");
const contract = require("../assets/green-grin-contract.js");
const estimates = require("../netlify/functions/portal-estimates.js");

const mowing = contract.buildContract({ total: 900, contract_template: "mowing" });
assert.equal(mowing.title, "Recurring Lawn Mowing Agreement");
assert.ok(mowing.sections.some((section) => section.title === "Mowing Service Terms"));

const custom = contract.buildContract({ total: 1200, contract_template: "cleanup", contract_sections: [{ title: "My job rules", paragraphs: ["Customer supplies access code."], bullets: ["No hazardous waste."] }], contract_consent_text: "I agree to the custom cleanup terms." });
assert.equal(custom.sections[0].title, "My job rules");
assert.equal(custom.consent_text, "I agree to the custom cleanup terms.");

const disclosure = contract.buildContract({ total: 2500, contract_template: "aeration", contract_sections: [{ title: "Custom", paragraphs: ["Custom term"] }] });
assert.ok(disclosure.sections.some((section) => /residential contractor disclosure/i.test(section.title)));

const payload = estimates._test.estimatePayload({ customer_name: "Customer", phone: "208-555-0100", project_title: "Cleanup", line_items: [{ description: "Cleanup", category: "Labor", quantity: 1, rate: 900, unit_cost: 400 }], contract_template: "cleanup", contract_sections: [{ title: "Cleanup terms", paragraphs: ["Typeable term"], bullets: [] }], contract_consent_text: "I agree." });
assert.equal(payload.contract_template, "cleanup");
assert.equal(payload.contract_sections[0].paragraphs[0], "Typeable term");
assert.equal(payload.contract_consent_text, "I agree.");

console.log("Per-job contract template editor tests passed.");
