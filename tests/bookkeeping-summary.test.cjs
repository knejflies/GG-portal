const assert = require("assert");
const { summarize } = require("../assets/green-grin-bookkeeping.js");

const invoices = [
  { id: "paid-month", status: "Paid", amount: 900, created_at: "2026-09-30T18:00:00Z", payment_confirmed_at: "2026-10-05T18:00:00Z", active: true },
  { id: "paid-old", status: "Paid", amount: 400, created_at: "2026-08-01T18:00:00Z", payment_confirmed_at: "2026-08-15T18:00:00Z", active: true },
  { id: "sent", status: "Sent", amount: 250, created_at: "2026-10-08T18:00:00Z", active: true },
  { id: "draft", status: "Draft", amount: 125, created_at: "2026-10-09T18:00:00Z", active: true },
  { id: "deleted", status: "Paid", amount: 999, payment_confirmed_at: "2026-10-10T18:00:00Z", active: false }
];
const expenses = [
  { id: "fuel", amount: 200, expense_date: "2026-10-03", active: true },
  { id: "old", amount: 75, expense_date: "2026-08-03", active: true },
  { id: "deleted", amount: 999, expense_date: "2026-10-03", active: false }
];

const month = summarize(invoices, expenses, { period: "month", now: new Date("2026-10-15T12:00:00") });
assert.equal(month.paidRevenue, 900);
assert.equal(month.loggedExpenses, 200);
assert.equal(month.netCash, 700);
assert.equal(month.billed, 375);
assert.equal(month.outstanding, 250, "Draft invoices must not count as outstanding.");

const year = summarize(invoices, expenses, { period: "year", now: new Date("2026-10-15T12:00:00") });
assert.equal(year.paidRevenue, 1300);
assert.equal(year.loggedExpenses, 275);
assert.equal(year.netCash, 1025);

console.log("Bookkeeping summary tests passed.");
