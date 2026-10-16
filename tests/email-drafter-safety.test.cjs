const assert = require("assert");
const { scheduledRecipients } = require("../netlify/functions/portal-email-drafter.js")._test;

const rows = [
  { id: "1", full_name: "Scheduled Customer", email: "first@example.com", service_address: "1 Main St", status: "Scheduled" },
  { id: "2", full_name: "Wrong Day Customer", email: "second@example.com", service_address: "2 Main St", status: "Scheduled" },
  { id: "3", full_name: "Completed Customer", email: "third@example.com", service_address: "3 Main St", status: "Completed" },
  { id: "4", full_name: "Bad Email", email: "invalid", service_address: "4 Main St", status: "Scheduled" }
];
const recipients = scheduledRecipients(rows, "2026-10-15", ["1", "3", "4"]);
assert.deepEqual(recipients.map((recipient) => recipient.id), ["1"], "Only active, valid, explicitly selected scheduled customers may be emailed.");
assert.match(recipients[0].date, /October 15, 2026/);

console.log("Email drafter safety tests passed.");
