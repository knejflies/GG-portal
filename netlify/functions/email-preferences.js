const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const { verifyToken } = require("../lib/email-unsubscribe");

const json = (statusCode, body) => ({ statusCode, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "POST, OPTIONS" }, body: JSON.stringify(body) });

async function patch(path, body) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { method: "PATCH", headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error("Preference update failed.");
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(204, {});
  if (event.httpMethod !== "POST") return json(405, { error: "POST is required." });
  if (!SUPABASE_URL || !SERVICE_KEY) return json(500, { error: "Email preferences are not configured." });
  let body;
  try { body = JSON.parse(event.body || "{}"); } catch (_error) { return json(400, { error: "Invalid request." }); }
  const verified = verifyToken(body.token);
  if (!verified) return json(400, { error: "This unsubscribe link is invalid or expired." });
  const email = encodeURIComponent(verified.email);
  try {
    const updates = await Promise.allSettled([
      patch(`green_grin_customers?email=eq.${email}`, { email_marketing_allowed: false, email_unsubscribed_at: new Date().toISOString() }),
      patch(`green_grin_sprinkler_blowout_leads?email=eq.${email}`, { email_marketing_allowed: false, followup_status: "Opted out" }),
      patch(`green_grin_giveaway_entries?email=eq.${email}`, { email_marketing_allowed: false })
    ]);
    if (updates.every((result) => result.status === "rejected")) throw updates[0].reason;
    return json(200, { ok: true, message: "You have been unsubscribed from Green Grin marketing emails." });
  } catch (error) { return json(500, { error: error.message || "Could not update email preferences." }); }
};
