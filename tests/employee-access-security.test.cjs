const assert = require("node:assert/strict");

process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_ANON_KEY = "anon";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
process.env.GREEN_GRIN_ADMIN_PIN = "2468";

const requests = [];
global.fetch = async (url, options = {}) => {
  requests.push({ url: String(url), method: options.method || "GET", body: options.body || "" });
  if (String(url).includes("green_grin_employees?select=*&email=eq.active%40example.com")) {
    return { ok: true, json: async () => [{ id: "employee-1", full_name: "Active Employee", email: "active@example.com", phone: "2085550101", status: "Active", employee_pin: "7777", hourly_rate: 30 }] };
  }
  throw new Error(`Unexpected request: ${url}`);
};

const { handler } = require("../netlify/functions/portal-employees.js");

(async () => {
  const invalidPin = await handler({ httpMethod: "POST", headers: {}, body: JSON.stringify({ full_name: "New Employee", email: "new@example.com", phone: "2085550102", requested_pin: "12a" }) });
  assert.equal(invalidPin.statusCode, 400);

  const response = await handler({ httpMethod: "POST", headers: {}, body: JSON.stringify({ full_name: "Attacker", email: "active@example.com", phone: "2085559999", requested_pin: "1234" }) });
  assert.equal(response.statusCode, 200);
  const data = JSON.parse(response.body);
  assert.equal(data.existing, true);
  assert.equal(data.employee.status, "Active", "A public request must not downgrade an active employee.");
  assert.equal(data.employee.employee_pin, undefined, "Public responses must never expose the employee PIN.");
  assert.equal(data.employee.hourly_rate, undefined, "Public responses must never expose pay rates.");
  assert.equal(requests.length, 1, "An active employee request must not perform an update.");

  console.log("Employee access request security checks passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
