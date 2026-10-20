const crypto = require("node:crypto");

const ADMIN_PIN = process.env.GREEN_GRIN_ADMIN_PIN || "";
const SESSION_SECRET = process.env.GREEN_GRIN_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function header(event, name) {
  const headers = event?.headers || {};
  const wanted = String(name).toLowerCase();
  const match = Object.keys(headers).find((key) => key.toLowerCase() === wanted);
  return match ? String(headers[match] || "") : "";
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function verifyAdminSession(token) {
  if (!token || !SESSION_SECRET || !ADMIN_PIN) return null;
  const [encoded, suppliedSignature] = String(token).split(".");
  if (!encoded || !suppliedSignature) return null;
  let payload;
  try { payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")); }
  catch (_error) { return null; }
  if (payload?.v !== 1 || payload?.mode !== "admin" || !payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) return null;
  const signingSecret = crypto.createHash("sha256").update(`${SESSION_SECRET}|admin|${ADMIN_PIN}`).digest();
  const expected = crypto.createHmac("sha256", signingSecret).update(encoded).digest("base64url");
  return safeEqual(suppliedSignature, expected) ? payload : null;
}

function adminSession(event) {
  const token = header(event, "authorization").replace(/^Bearer\s+/i, "");
  return verifyAdminSession(token);
}

function isAdminRequest(event) {
  const pin = header(event, "x-admin-pin");
  return Boolean((ADMIN_PIN && safeEqual(pin, ADMIN_PIN)) || adminSession(event));
}

function requireAdmin(event, message = "Owner sign-in is required.") {
  if (!ADMIN_PIN) return "Admin PIN is not configured yet.";
  return isAdminRequest(event) ? null : message;
}

module.exports = { adminSession, header, isAdminRequest, requireAdmin, safeEqual, verifyAdminSession };
