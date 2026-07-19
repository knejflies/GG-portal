const assert = require("assert");
const pricing = require("../assets/green-grin-pricing-config.json");
const { calculateMowingBid } = require("../assets/green-grin-calculator.js");

const standard = calculateMowingBid({ lawnSqFt: 5000, annualAgreement: true }, pricing.mowingBid);
assert.equal(standard.serviceName, "Mowing service");
assert.equal(standard.perVisitPrice, 50);
assert.equal(standard.annualTotal, 1425);
assert.equal(standard.monthlyPayment, 118.75);

const larger = calculateMowingBid({ lawnSqFt: 10000, annualAgreement: true }, pricing.mowingBid);
assert.equal(larger.perVisitPrice, 100);
assert.equal(larger.annualTotal, 2850);

const complex = calculateMowingBid({ lawnSqFt: 5000, difficultyMultiplier: 1.15, annualAgreement: true }, pricing.mowingBid);
assert.equal(complex.perVisitPrice, 60);

const hoa = calculateMowingBid({ propertyType: "hoa_commercial", lawnSqFt: 10000 }, pricing.mowingBid);
assert.equal(hoa.manualReviewRequired, true);
assert.equal(hoa.displayPriceAllowed, false);

console.log("Simple Mowing Bidder tests passed.");
