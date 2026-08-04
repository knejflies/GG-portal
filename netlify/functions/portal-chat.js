const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_PIN = process.env.GREEN_GRIN_ADMIN_PIN;
const { pushReady, sendPushToTarget } = require("./push-helper");

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
  if (!response.ok) throw new Error(data?.message || "Supabase request failed.");
  return data;
}

async function signedInUser(event) {
  const token = String(event.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${token}` } });
  return response.ok ? response.json() : null;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, {});
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return json(500, { error: "Supabase is not configured yet." });
  try {
    const params = event.queryStringParameters || {};
    const admin = event.headers["x-admin-pin"] && event.headers["x-admin-pin"] === ADMIN_PIN;
    const user = admin ? null : await signedInUser(event);
    const customerUserId = admin ? params.customer_user_id || JSON.parse(event.body || "{}").customer_user_id : user?.id;
    if (!customerUserId) return json(401, { error: "Please sign in first." });

    if (event.httpMethod === "GET") {
      const messages = await supabase(`green_grin_customer_chat?select=*&customer_user_id=eq.${encodeURIComponent(customerUserId)}&order=created_at.asc&limit=300`);
      const unreadSender = admin ? "Customer" : "Owner";
      await supabase(`green_grin_customer_chat?customer_user_id=eq.${encodeURIComponent(customerUserId)}&sender_type=eq.${unreadSender}&read_at=is.null`, { method: "PATCH", body: JSON.stringify({ read_at: new Date().toISOString() }) }).catch(() => null);
      return json(200, { messages });
    }

    if (event.httpMethod === "POST") {
      const body = JSON.parse(event.body || "{}");
      const message = String(body.message || "").trim();
      if (!message || message.length > 1000) return json(400, { error: "Enter a message up to 1,000 characters." });
      const customers = await supabase(`green_grin_customers?select=id,customer_code,full_name,email&id=eq.${encodeURIComponent(customerUserId)}&limit=1`);
      const customer = customers?.[0];
      if (!customer) return json(404, { error: "Customer account not found." });
      const rows = await supabase("green_grin_customer_chat", { method: "POST", body: JSON.stringify({ customer_user_id: customerUserId, customer_code: customer.customer_code || null, sender_type: admin ? "Owner" : "Customer", sender_name: admin ? "Green Grin" : customer.full_name || "Customer", message }) });
      const push = pushReady() ? await sendPushToTarget(supabase, admin ? { customer_user_id: customerUserId, customer_code: customer.customer_code, email: customer.email } : { owner_type: "admin" }, { title: admin ? "Message from Green Grin" : `Message from ${customer.full_name || "a customer"}`, body: message, url: admin ? "/portal/?tab=messages" : "/admin/?tab=customers", tag: `green-grin-chat-${customerUserId}` }) : { enabled: false, sent: 0 };
      return json(200, { message: rows?.[0] || null, push });
    }
    return json(405, { error: "Method not allowed." });
  } catch (error) {
    return json(500, { error: error.message });
  }
};
