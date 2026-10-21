const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const { requireAdmin } = require("./portal-auth");

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-admin-pin",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};
const json = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) });

async function supabase(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json", Prefer: "return=representation", ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message || data?.hint || "CRM request failed.");
  return data;
}

const clean = (value, max) => String(value || "").trim().slice(0, max);
const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? String(value) : new Date().toISOString().slice(0, 10);

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, {});
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return json(500, { error: "Supabase is not configured yet." });
  const authError = requireAdmin(event);
  if (authError) return json(401, { error: authError });
  try {
    const params = event.queryStringParameters || {};
    if (event.httpMethod === "GET") {
      const customerId = clean(params.customer_user_id, 100);
      if (!customerId) return json(400, { error: "Customer id is required." });
      const notes = await supabase(`green_grin_customer_crm_notes?select=*&customer_user_id=eq.${encodeURIComponent(customerId)}&order=note_date.desc,created_at.desc&limit=200`);
      return json(200, { notes });
    }
    if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed." });
    const body = JSON.parse(event.body || "{}");
    const customerId = clean(body.customer_user_id, 100);
    const noteBody = clean(body.body, 5000);
    if (!customerId || !noteBody) return json(400, { error: "Customer and note text are required." });
    const note = {
      customer_user_id: customerId,
      note_date: validDate(body.note_date),
      note_type: clean(body.note_type || "Internal note", 40),
      subject: clean(body.subject, 180) || null,
      body: noteBody,
      actor_type: "Owner",
      actor_name: "Owner",
      source_key: clean(body.source_key, 180) || null
    };
    let rows;
    try {
      rows = await supabase("green_grin_customer_crm_notes", { method: "POST", body: JSON.stringify(note) });
    } catch (error) {
      if (note.source_key && /duplicate key|unique/i.test(error.message)) rows = await supabase(`green_grin_customer_crm_notes?select=*&source_key=eq.${encodeURIComponent(note.source_key)}&limit=1`);
      else throw error;
    }
    return json(200, { note: rows?.[0] || null });
  } catch (error) {
    return json(500, { error: error.message });
  }
};
