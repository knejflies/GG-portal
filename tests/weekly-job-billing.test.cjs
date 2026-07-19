const assert = require("assert");
const { calculateWeeklyJobBilling } = require("../assets/green-grin-calculator.js");

const fiveWeekMonth = calculateWeeklyJobBilling({
  weeklyPrice: 50,
  scheduleStartDate: "2026-05-01",
  scheduleEndDate: "2026-07-31",
  billingMonth: "2026-05"
});

assert.equal(fiveWeekMonth.serviceWeeks, 14);
assert.equal(fiveWeekMonth.serviceWeeksInBillingMonth, 5);
assert.equal(fiveWeekMonth.monthlyCharge, 250);
assert.equal(fiveWeekMonth.seasonTotal, 700);

const fourWeekMonth = calculateWeeklyJobBilling({
  weeklyPrice: 50,
  scheduleStartDate: "2026-05-01",
  scheduleEndDate: "2026-07-31",
  billingMonth: "2026-06"
});

assert.equal(fourWeekMonth.serviceWeeksInBillingMonth, 4);
assert.equal(fourWeekMonth.monthlyCharge, 200);
assert.throws(() => calculateWeeklyJobBilling({
  weeklyPrice: 50,
  scheduleStartDate: "2026-07-31",
  scheduleEndDate: "2026-05-01",
  billingMonth: "2026-06"
}), /Season end/);

console.log("Weekly Job Creator billing tests passed.");
