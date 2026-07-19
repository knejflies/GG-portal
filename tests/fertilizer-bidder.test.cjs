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
assert.equal(bid.annualPrice, 1900);
assert.equal(bid.averageApplicationCharge, 380);
closeTo(bid.operatingCost, 873.3877156521739);
closeTo(bid.grossProfit, 1026.612284347826);
closeTo(bid.grossMargin, 0.5403222549199085);
closeTo(bid.totalProductAppliedLb, 166.0954347826087);
assert.equal(bid.totalLaborHours, 5);
closeTo(bid.cashProductPurchase, 328.06);
closeTo(bid.firstJobCashProfit, 921.94);
closeTo(bid.pricePer1000SqFtPerVisit, 34.93931592497242);
assert.equal(bid.configuredPricePer1000SqFtPerVisit, 35);
assert.deepEqual(bid.applications.map((application) => application.quotedCharge), [380, 380, 380, 380, 380]);
assert.deepEqual(bid.purchasePlan.map((product) => product.bagsToPurchase), [1, 2, 2]);
assert.equal(bid.visitCountAligned, true);
assert.equal(bid.marginGoalMet, true);

const smallBid = calculateFertilizerBid({ lawnSqFt: 2000 }, pricing.fertilizerBid);
const mediumBid = calculateFertilizerBid({ lawnSqFt: 10000 }, pricing.fertilizerBid);
assert.equal(smallBid.annualPrice, 625, "2,000 sq ft should use the $125 per-application minimum");
assert.equal(mediumBid.annualPrice, 1750, "10,000 sq ft should use $35 per 1,000 sq ft per application");
assert.equal(smallBid.marginGoalMet, false, "profit check should flag a minimum below configured operating costs");

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
