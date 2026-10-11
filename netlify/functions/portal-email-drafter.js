const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.GREEN_GRIN_INVOICE_FROM || "Green Grin Lawns <ken@greengrinlawns.com>";
const ADMIN_PIN = process.env.GREEN_GRIN_ADMIN_PIN;
const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type, x-admin-pin", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) });
const clean = (value, max = 20000) => String(value || "").trim().slice(0, max);
const escapeHtml = (value) => clean(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const replaceTokens = (value, recipient) => clean(value).split("{{name}}").join(recipient.name || "there").split("{{address}}").join(recipient.address || "your property").split("{{date}}").join(recipient.date || "");

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
    const recipients = Array.isArray(body.recipients) ? body.recipients.map((recipient) => ({ email: clean(recipient?.email, 320).toLowerCase(), name: clean(recipient?.name, 160), address: clean(recipient?.address, 300), date: clean(recipient?.date, 40) })).filter((recipient) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient.email)).slice(0, 100) : [];
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
      results.push({ email: recipient.email, sent: response.ok, id: data.id || null, error: response.ok ? null : (data?.message || "Email provider rejected the message.") });
    }
    const sent = results.filter((result) => result.sent).length;
    return json(200, { sent, failed: results.length - sent, results, to: targets[0].email, subject });
  } catch (error) {
    return json(500, { error: error.message || "Email could not be sent." });
  }
};
