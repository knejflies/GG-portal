const assert = require("assert");
const pricing = require("../assets/green-grin-pricing-config.json");
const { calculateFertilizerBid } = require("../assets/green-grin-calculator.js");

const closeTo = (actual, expected, tolerance = 0.000001) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} was not within ${tolerance} of ${expected}`);
};

const bid = calculateFertilizerBid(
  { customer: "Test Property", lawnSqFt: 10876 },
  pricing.fertilizerBid
);

assert.equal(bid.customer, "Test Property");
assert.equal(bid.annualPrice, 1905);
assert.equal(bid.averageApplicationCharge, 381);
closeTo(bid.operatingCost, 946.558447359491);
closeTo(bid.grossProfit, 958.441552640509);
closeTo(bid.grossMargin, 0.5031189252706084);
closeTo(bid.totalProductAppliedLb, 166.0954347826087);
assert.equal(bid.totalLaborHours, 5);
closeTo(bid.cashProductPurchase, 328.06);
closeTo(bid.firstJobCashProfit, 853.7692682926829);
closeTo(bid.pricePer1000SqFtPerVisit, 35.031261493196034);
assert.deepEqual(bid.applications.map((application) => application.quotedCharge), [360, 350, 360, 405, 430]);
assert.deepEqual(bid.purchasePlan.map((product) => product.bagsToPurchase), [1, 2, 2]);
assert.equal(bid.visitCountAligned, true);

const largerBid = calculateFertilizerBid(
  { lawnSqFt: 25000 },
  pricing.fertilizerBid
);
assert.ok(largerBid.annualPrice > bid.annualPrice);
assert.ok(largerBid.totalProductAppliedLb > bid.totalProductAppliedLb);
assert.ok(largerBid.grossMargin >= pricing.fertilizerBid.targetGrossMargin);

assert.throws(
  () => calculateFertilizerBid({ lawnSqFt: 0 }, pricing.fertilizerBid),
  /greater than zero/
);

console.log("Fertilizer Bidder calculator tests passed.");
