const assert = require("assert");
const pricing = require("../assets/green-grin-pricing-config.json");
const { _test } = require("../netlify/functions/portal-plans.js");

const plans = _test.publicPlans(pricing);

assert.deepStrictEqual(plans.map((plan) => plan.id), ["fresh", "sharp", "full"]);
assert.deepStrictEqual(plans.map((plan) => plan.starting_monthly), [119, 190, 238]);
assert.deepStrictEqual(plans[0].includes, ["Mow", "Edge", "Blow"]);
assert.ok(plans[2].includes.includes("Annual core aeration"));

console.log("Customer plan choices and starting prices passed validation.");
