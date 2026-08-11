const assert = require("node:assert/strict");
const { summarizeWork } = require("../netlify/functions/portal-timeclock.js")._test;

const sessions = [
  { job_id: "job-1", estimate_id: "estimate-1", customer_name: "Test Customer", project_title: "Rock Installation", phase: "Preparation", total_minutes: 75 },
  { job_id: "job-1", estimate_id: "estimate-1", customer_name: "Test Customer", project_title: "Rock Installation", phase: "Installation", total_minutes: 180 }
];
const estimates = [{ id: "estimate-1", calculation_inputs: { service: "rock", materialQuantity: 20, crewSize: 2, difficulty: "normal", equipment: ["mini_ex"], phase_hours: { Preparation: 2, Installation: 4.5 } } }];
const summary = summarizeWork(sessions, estimates);

assert.equal(summary.total_minutes, 255);
assert.equal(summary.total_hours, 4.25);
assert.equal(summary.projects.length, 1);
assert.equal(summary.projects[0].phases.find((phase) => phase.phase === "Preparation").estimated_hours, 2);
assert.equal(summary.projects[0].phases.find((phase) => phase.phase === "Installation").actual_hours, 3);
assert.equal(summary.projects[0].production.service, "rock");
assert.equal(summary.projects[0].production.quantity, 20);
assert.equal(summary.projects[0].production.actual_man_hours, 4.25);
assert.deepEqual(summary.projects[0].production.equipment, ["mini_ex"]);

console.log("Project phase time tracking tests passed.");
