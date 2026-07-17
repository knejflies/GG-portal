const assert = require("assert");
const pricing = require("../assets/green-grin-pricing-config.json");
const cases = require("./calculator-tests.json");
const { calculateAllGreenGrinPlans } = require("../assets/green-grin-calculator.js");

assert.equal(pricing.version, cases.pricingConfigVersion);

for (const testCase of cases.cases) {
  const results = calculateAllGreenGrinPlans(testCase.input, pricing);
  if (testCase.expected) {
    for (const result of results) {
      const expected = testCase.expected[result.planId];
      for (const field of ["weeklyService", "annualTotal", "monthlyPayment"]) {
        assert.ok(
          Math.abs(result[field] - expected[field]) <= cases.moneyTolerance,
          `${testCase.name}: ${result.planId}.${field} expected ${expected[field]}, received ${result[field]}`
        );
      }
    }
  }
  if (testCase.expectedFlags) {
    for (const result of results) {
      for (const [field, expected] of Object.entries(testCase.expectedFlags)) {
        assert.equal(result[field], expected, `${testCase.name}: ${field}`);
      }
    }
  }
}

console.log(`${cases.cases.length} Lawn Bidder acceptance cases passed.`);
