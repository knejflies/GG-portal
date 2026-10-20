const assert = require("node:assert/strict");

process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
process.env.GREEN_GRIN_ADMIN_PIN = "246810";

const estimate = {
  id: "estimate-1",
  estimate_number: "EST-1042",
  customer_user_id: "customer-1",
  customer_code: "GG-1042",
  customer_name: "Test Customer",
  phone: "2085550100",
  email: "customer@example.com",
  service_address: "100 Main Street",
  project_title: "Rock bed refresh",
  project_scope: "Remove weeds and install fabric and rock.",
  contract_template: "landscaping",
  status: "Approved",
  approved_at: "2026-10-20T12:00:00.000Z",
  total: 296.8,
  line_items: [{ description: "Commercial weed fabric", quantity: 1000, unit: "sq ft" }],
  project_job_id: null
};

let job = null;
let inserts = 0;
const originalFetch = global.fetch;
global.fetch = async (url, options = {}) => {
  const path = String(url).split("/rest/v1/")[1] || "";
  let body = null;
  if (path.startsWith("green_grin_estimates?select=*&id=eq.")) body = [estimate];
  else if (path.startsWith("green_grin_jobs?select=*&source_estimate_id=eq.")) body = job ? [job] : [];
  else if (path.startsWith("green_grin_jobs") && options.method === "POST") {
    inserts += 1;
    const payload = JSON.parse(options.body);
    job = { id: "job-1", ...payload };
    body = [job];
  } else if (path.startsWith("green_grin_estimates?id=eq.") && options.method === "PATCH") {
    Object.assign(estimate, JSON.parse(options.body));
    body = [estimate];
  } else if (path.startsWith("green_grin_jobs?select=*&id=eq.")) body = job ? [job] : [];
  else throw new Error(`Unexpected Supabase request: ${path}`);
  return { ok: true, json: async () => body };
};

const estimates = require("../netlify/functions/portal-estimates.js");
const event = {
  httpMethod: "PATCH",
  headers: { "x-admin-pin": "246810" },
  body: JSON.stringify({ id: "estimate-1", action: "convert-to-job" })
};

(async () => {
  try {
    const first = await estimates.handler(event);
    assert.equal(first.statusCode, 200);
    const firstBody = JSON.parse(first.body);
    assert.equal(firstBody.duplicate, false);
    assert.equal(firstBody.job.source_estimate_id, "estimate-1");
    assert.equal(firstBody.job.annual_price, 296.8);
    assert.equal(firstBody.estimate.project_job_id, "job-1");

    const retry = await estimates.handler(event);
    assert.equal(retry.statusCode, 200);
    assert.equal(JSON.parse(retry.body).duplicate, true);
    assert.equal(inserts, 1, "Retrying conversion must not create a second job.");

    console.log("Approved estimate conversion is linked and duplicate-safe.");
  } finally {
    global.fetch = originalFetch;
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
