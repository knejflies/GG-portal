const RESEND_API_KEY = process.env.RESEND_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EMAIL_FROM = process.env.GREEN_GRIN_INVOICE_FROM || "Green Grin Lawns <ken@greengrinlawns.com>";
const ADMIN_PIN = process.env.GREEN_GRIN_ADMIN_PIN;
const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type, x-admin-pin", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) });
const clean = (value, max = 20000) => String(value || "").trim().slice(0, max);
const escapeHtml = (value) => clean(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const replaceTokens = (value, recipient) => clean(value).split("{{name}}").join(recipient.name || "there").split("{{address}}").join(recipient.address || "your property").split("{{date}}").join(recipient.date || "");
async function supabase(path) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" } });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message || "Scheduled customers could not be verified.");
  return data;
}
function scheduledRecipients(rows, scheduledDate, requestedIds) {
  const ids = new Set((Array.isArray(requestedIds) ? requestedIds : []).map((value) => clean(value, 80)).filter(Boolean));
  const closedStatuses = new Set(["Completed", "Paid", "Not Successful"]);
  const dateLabel = new Date(`${scheduledDate}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  return (Array.isArray(rows) ? rows : []).filter((row) => ids.has(String(row.id)) && !closedStatuses.has(String(row.status || ""))).map((row) => ({ id: String(row.id), email: clean(row.email, 320).toLowerCase(), name: clean(row.full_name, 160), address: clean(row.service_address, 300), date: dateLabel })).filter((recipient) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient.email));
}
async function recordAttempt(recipient, message, result) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return;
  await fetch(`${SUPABASE_URL}/rest/v1/green_grin_message_log`, { method: "POST", headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({ phone: recipient.email, template: result.sent ? "email-drafter-sent" : "email-drafter-failed", message: result.sent ? message : `${message}\n\nFailure: ${result.error || "Email was not accepted."}`, actor_type: "Owner", actor_name: "Owner", twilio_sid: result.id || null }) }).catch(() => null);
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, {});
  if (event.httpMethod !== "POST") return json(405, { error: "POST is required." });
  if (!ADMIN_PIN || event.headers["x-admin-pin"] !== ADMIN_PIN) return json(401, { error: "Admin access required." });
  if (!RESEND_API_KEY) return json(500, { error: "Email is not configured in Netlify." });
  try {
    const body = JSON.parse(event.body || "{}");
    const to = clean(body.to, 320).toLowerCase();
    const subject = clean(body.subject, 180);
    const message = clean(body.message, 20000);
    let recipients = Array.isArray(body.recipients) ? body.recipients.map((recipient) => ({ email: clean(recipient?.email, 320).toLowerCase(), name: clean(recipient?.name, 160), address: clean(recipient?.address, 300), date: clean(recipient?.date, 80) })).filter((recipient) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient.email)).slice(0, 100) : [];
    const scheduledDate = clean(body.scheduled_date, 20);
    const requestedIds = Array.isArray(body.recipient_ids) ? [...new Set(body.recipient_ids.map((value) => clean(value, 80)).filter(Boolean))].slice(0, 100) : [];
    if (scheduledDate || requestedIds.length) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate) || !requestedIds.length) return json(400, { error: "Reopen Email this day so the scheduled recipients can be verified." });
      if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return json(500, { error: "Scheduled recipient verification is not configured." });
      const rows = await supabase(`green_grin_sprinkler_blowout_leads?select=id,full_name,email,service_address,status,scheduled_date&scheduled_date=eq.${encodeURIComponent(scheduledDate)}&order=created_at.asc&limit=1000`);
      recipients = scheduledRecipients(rows, scheduledDate, requestedIds);
      if (recipients.length !== requestedIds.length) return json(409, { error: "The schedule or an email address changed. No emails were sent. Reopen Email this day and review the updated list." });
    }
    if (!recipients.length && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return json(400, { error: "Enter a valid recipient email." });
    if (!subject) return json(400, { error: "Enter an email subject." });
    if (!message) return json(400, { error: "Write the email message first." });
    const targets = recipients.length ? recipients : [{ email: to, name: "there", address: "your property", date: "" }];
    const results = [];
    for (const recipient of targets) {
      const personalizedSubject = replaceTokens(subject, recipient);
      const personalizedMessage = replaceTokens(message, recipient);
      const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json", "User-Agent": "Green-Grin-Portal/1.0" }, body: JSON.stringify({ from: EMAIL_FROM, to: [recipient.email], subject: personalizedSubject, text: personalizedMessage, html: `<div style="font-family:Arial,sans-serif;line-height:1.55;white-space:pre-wrap">${escapeHtml(personalizedMessage)}</div>` }) });
      const data = await response.json().catch(() => ({}));
      const result = { email: recipient.email, sent: response.ok, id: data.id || null, error: response.ok ? null : (data?.message || "Email provider rejected the message.") };
      results.push(result);
      await recordAttempt(recipient, personalizedMessage, result);
    }
    const sent = results.filter((result) => result.sent).length;
    return json(200, { sent, failed: results.length - sent, results, to: targets[0].email, subject });
  } catch (error) {
    return json(500, { error: error.message || "Email could not be sent." });
  }
};

exports._test = { scheduledRecipients };
