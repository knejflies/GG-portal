const assert = require("node:assert/strict");
const calendar = require("../assets/green-grin-calendar.js");

const source = {
  jobs: [
    {
      id: "weekly-1",
      customer_code: "GG-0001",
      customer_name: "Weekly Customer",
      service_type: "Weekly mowing",
      recurring_weekly: true,
      schedule_start_date: "2026-09-01",
      schedule_end_date: "2026-09-30",
      status: "Scheduled"
    },
    {
      id: "fert-1",
      customer_code: "GG-0002",
      customer_name: "Fertilizer Customer",
      service_type: "Fall fertilizer treatment",
      scheduled_date: "2026-09-18T08:00:00.000Z",
      status: "Scheduled"
    }
  ],
  invoices: [
    { id: "invoice-open", customer_name: "Weekly Customer", amount: 125, due_date: "2026-09-05", status: "Sent", active: true },
    { id: "invoice-paid", customer_name: "Fertilizer Customer", amount: 80, due_date: "2026-09-18", status: "Paid", active: true }
  ],
  completions: [
    {
      id: "completion-1",
      created_at: "2026-09-18T18:30:00.000Z",
      template: "completed",
      actor_name: "Crew Member",
      green_grin_jobs: {
        id: "fert-1",
        customer_code: "GG-0002",
        customer_name: "Fertilizer Customer",
        address: "123 Main St",
        service_type: "Fall fertilizer treatment"
      }
    }
  ]
};

const month = calendar.buildMonth(source, "2026-09");
assert.equal(month.month, "2026-09");
assert.equal(month.allEvents.filter((event) => event.id === "weekly-1").length, 5, "weekly work should repeat through the season");
assert.equal(month.eventsByDate["2026-09-05"][0].kind, "payment-due");
assert.ok(month.eventsByDate["2026-09-18"].some((event) => event.kind === "fertilizer-scheduled"));
assert.ok(month.eventsByDate["2026-09-18"].some((event) => event.kind === "fertilizer-completed"));
assert.ok(month.eventsByDate["2026-09-18"].some((event) => event.kind === "payment-paid"));

const history = calendar.fertilizerHistory(source);
assert.equal(history.length, 1);
assert.equal(history[0].customerCode, "GG-0002");
assert.equal(history[0].completedDate, "2026-09-18");
assert.equal(calendar.isFertilizer("Weekly mowing"), false);
assert.equal(calendar.isFertilizer("Fertilization program"), true);

console.log("Admin calendar tests passed.");
