const assert = require("assert");
const fs = require("fs");

const html = fs.readFileSync("admin/index.html", "utf8");
const signupFunction = fs.readFileSync("netlify/functions/portal-sprinkler-blowouts.js", "utf8");

assert.ok(html.includes("const savedLead = blowoutLeads.find"), "Each rendered card must load its own saved lead before reading its price.");
assert.ok(html.includes("const savedPrice = Number(savedLead.customer_price)"), "Saved prices must render from the matching lead.");
assert.match(html, /status === "All"\s*\? !closed/, "The default blowout list should show active work only.");
assert.ok(html.includes("reconcileBlowoutRoute();"), "Reloading leads must clear stale route stops.");
assert.match(html, /renderBlowoutLeads\(filteredBlowoutLeads\(\)\);\s*refreshLeads = false;/, "Removing a day must redraw the list and map immediately.");
assert.ok(html.includes('card.classList.remove("blowout-collapsed")'), "Tapping a map marker must open the matching customer card.");
assert.ok(html.includes('data-blowout-route-date="unscheduled"'), "Unscheduled sign-ups must have a separate assignment queue.");
assert.ok(!html.includes('$("#blowout-bulk-date").addEventListener("change"'), "Choosing an assignment date must not discard checked unscheduled customers by navigating the list.");
assert.match(signupFunction, /status: "New", scheduled_date: null/, "A new public sign-up must remain unscheduled until the owner assigns it.");

console.log("Blowout admin flow checks passed.");
