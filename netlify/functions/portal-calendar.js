const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_PIN = process.env.GREEN_GRIN_ADMIN_PIN;

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, x-admin-pin",
  "Access-Control-Allow-Methods": "GET, OPTIONS"
};

function json(statusCode, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

async function supabase(path) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json"
    }
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message || "Supabase request failed.");
  return data;
}

function setupError() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return "Supabase is not configured yet.";
  if (!ADMIN_PIN) return "Admin PIN is not configured yet.";
  return "";
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, {});
  if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed." });
  const error = setupError();
  if (error) return json(500, { error });
  if (event.headers["x-admin-pin"] !== ADMIN_PIN) return json(401, { error: "Wrong admin PIN." });

  try {
    const [jobs, invoices, completions] = await Promise.all([
      supabase("green_grin_jobs?select=id,customer_user_id,customer_code,customer_name,address,service_type,preferred_date,scheduled_date,recurring_weekly,schedule_start_date,schedule_end_date,status,monthly_price,annual_price&order=created_at.desc&limit=1000"),
      supabase("green_grin_invoices?select=id,customer_user_id,customer_code,customer_name,amount,due_date,status,service_line,notes,active&active=eq.true&order=due_date.asc&limit=1000"),
      supabase("green_grin_message_log?select=id,created_at,job_id,template,actor_name,green_grin_jobs(id,customer_user_id,customer_code,customer_name,address,service_type,scheduled_date)&template=eq.completed&order=created_at.desc&limit=1000")
    ]);
    return json(200, { jobs, invoices, completions });
  } catch (requestError) {
    return json(500, { error: requestError.message });
  }
};

exports._test = { setupError };
