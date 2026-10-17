const assert = require("assert");
const pricing = require("../assets/green-grin-pricing-config.json");
const { calculateFertilizerBid, calculateFertilizerBagEconomics } = require("../assets/green-grin-calculator.js");

const closeTo = (actual, expected, tolerance = 0.000001) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} was not within ${tolerance} of ${expected}`);
};

const bid = calculateFertilizerBid(
  { customer: "Test Property", lawnSqFt: 10876 },
  pricing.fertilizerBid
);

assert.equal(bid.customer, "Test Property");
assert.equal(bid.annualPrice, 1014);
assert.equal(bid.averageApplicationCharge, 253.5);
assert.equal(bid.paymentAmount, 253.5);
assert.equal(bid.paymentsPerYear, 4);
closeTo(bid.salesCommission, 60.84);
closeTo(bid.operatingCost, 427.3075986666666);
closeTo(bid.grossProfit, 525.8524013333334);
closeTo(bid.grossMargin, 0.5185921117685734);
closeTo(bid.totalProductAppliedLb, 217.52);
closeTo(bid.totalLaborHours, 2.050133333333333);
closeTo(bid.cashProductPurchase, 462.1);
closeTo(bid.firstJobCashProfit, 359.30533333333335);
closeTo(bid.pricePer1000SqFtPerVisit, 23.30820154468555);
assert.equal(bid.configuredPricePer1000SqFtPerVisit, 35);
assert.deepEqual(bid.applications.map((application) => application.quotedCharge), [253.5, 253.5, 253.5, 253.5]);
assert.deepEqual(bid.purchasePlan.map((product) => product.bagsToPurchase), [2, 2, 3]);
assert.equal(bid.visitCountAligned, true);
assert.equal(bid.marginGoalMet, true);

const smallBid = calculateFertilizerBid({ lawnSqFt: 2000 }, pricing.fertilizerBid);
const mediumBid = calculateFertilizerBid({ lawnSqFt: 10000 }, pricing.fertilizerBid);
assert.equal(smallBid.annualPrice, 299, "2,000 sq ft should use the sellable small-lawn minimum");
assert.equal(mediumBid.annualPrice, 935, "10,000 sq ft should use the configured annual plan ladder");
assert.equal(smallBid.marginGoalMet, true, "protected pricing should not allow a below-target quote");
assert.equal(mediumBid.salesCommission, mediumBid.annualPrice * 0.06);

const tierOnlySettings = JSON.parse(JSON.stringify(pricing.fertilizerBid));
tierOnlySettings.protectTargetMargin = false;
const includedPlan = calculateFertilizerBid({ lawnSqFt: 4000 }, tierOnlySettings);
const largerPlan = calculateFertilizerBid({ lawnSqFt: 5000 }, tierOnlySettings);
assert.equal(includedPlan.annualPrice, 395, "the annual minimum should include the configured 4,000 sq ft");
assert.equal(largerPlan.annualPrice, 485, "the plan should add $0.09 annually for each square foot above 4,000");
assert.equal(largerPlan.paymentAmount, 121.25, "the annual price should split into four quarterly payments");
assert.equal(largerPlan.salesCommission, 29.099999999999998, "first-year commission should be 6% of the annual price");
const postageStampPlan = calculateFertilizerBid({ lawnSqFt: 2500 }, tierOnlySettings);
const transitionPlan = calculateFertilizerBid({ lawnSqFt: 3000 }, tierOnlySettings);
assert.equal(postageStampPlan.annualPrice, 299);
assert.equal(postageStampPlan.paymentAmount, 74.75);
assert.equal(transitionPlan.annualPrice, 331, "small lawns should rise smoothly toward the standard breakpoint");

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

const bagEconomics = calculateFertilizerBagEconomics(pricing.fertilizerBid.pricingGuide, {
  targetGrossMargin: 0.5,
  laborCost: 35,
  visitOverhead: 95,
  costReserve: 1,
  chargeIncrement: 5
});
assert.equal(bagEconomics.healthyCoverageSqFt, 10000);
closeTo(bagEconomics.maximumCoverageSqFt, 7142.857142857143);
assert.equal(bagEconomics.healthyMaterialCostPer1000, 4.4);
assert.equal(bagEconomics.maximumMaterialCostPer1000, 6.16);
assert.equal(bagEconomics.productOnlyProfit, 16);
closeTo(bagEconomics.productOnlyMargin, 0.26666666666666666);
assert.equal(bagEconomics.fullServiceCost, 175);
assert.equal(bagEconomics.currentFullServiceProfit, -115);
assert.equal(bagEconomics.recommendedChargePerBag, 350);

const legacySettings = JSON.parse(JSON.stringify(pricing.fertilizerBid));
legacySettings.applications = legacySettings.applications.map((application) => ({
  ...application,
  productRateLbPer1000: undefined,
  nitrogenRateLbPer1000: 0.5
}));
const legacyBid = calculateFertilizerBid({ lawnSqFt: 10000 }, legacySettings);
assert.ok(legacyBid.applications.every((application) => application.productRateLbPer1000 > 0));

const excessiveRateSettings = JSON.parse(JSON.stringify(pricing.fertilizerBid));
excessiveRateSettings.applications[0].productRateLbPer1000 = 7.1;
assert.throws(
  () => calculateFertilizerBid({ lawnSqFt: 10000 }, excessiveRateSettings),
  /exceeds the 7 lb per 1,000 maximum/
);

console.log("Fertilizer Bidder calculator tests passed.");
