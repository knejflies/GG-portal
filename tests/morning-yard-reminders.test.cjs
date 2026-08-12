const assert = require("node:assert/strict");
const { customerAllowsReminder, isServiceToday, localWeekday, reminderDelivered } = require("../netlify/functions/morning-yard-reminders.js")._test;

const tomorrow = "2026-08-12";
assert.equal(localWeekday(tomorrow), 3, "August 12, 2026 must be treated as Wednesday.");

const weeklyJob = {
  recurring_weekly: true,
  schedule_start_date: "2026-04-01",
  schedule_end_date: "2026-10-31",
  scheduled_date: "2026-04-01T00:00:00.000Z"
};
assert.equal(isServiceToday(weeklyJob, tomorrow, 3), true, "A Wednesday customer must qualify tomorrow.");
assert.equal(isServiceToday(weeklyJob, tomorrow, 2), false, "A Tuesday customer must not receive a Wednesday reminder.");
assert.equal(isServiceToday({ ...weeklyJob, schedule_end_date: "2026-08-11" }, tomorrow, 3), false, "An ended season must not send.");
assert.equal(isServiceToday({ recurring_weekly: false, scheduled_date: `${tomorrow}T18:00:00.000Z` }, tomorrow), true, "A one-time job scheduled tomorrow must qualify.");
assert.equal(isServiceToday({ recurring_weekly: false, scheduled_date: "2026-08-13T18:00:00.000Z" }, tomorrow), false, "A future one-time job must not send early.");

assert.equal(reminderDelivered({ sent: 1, total: 1 }), true);
assert.equal(reminderDelivered({ sent: 0, total: 0 }), false, "No registered device is not a successful reminder.");
assert.equal(reminderDelivered({ sent: 0, failed: 1, total: 1 }), false, "A rejected push must remain eligible for retry.");
assert.equal(customerAllowsReminder({ active: true, text_cleanup_reminders: true }), true);
assert.equal(customerAllowsReminder({ active: false, text_cleanup_reminders: true }), false, "Inactive customers must never receive reminders.");
assert.equal(customerAllowsReminder({ active: true, text_cleanup_reminders: false }), false, "Customers who disabled reminders must not receive them.");
assert.equal(customerAllowsReminder(null), true, "A scheduled one-time job without an account can still be evaluated.");

console.log("Tomorrow's morning reminder schedule and delivery checks passed.");
