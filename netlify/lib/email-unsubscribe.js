const crypto = require("node:crypto");

const SECRET = process.env.GREEN_GRIN_UNSUBSCRIBE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.GREEN_GRIN_ADMIN_PIN || "";
const BASE_URL = process.env.URL || "https://portal.greengrinlawns.com";

function encode(value) { return Buffer.from(value).toString("base64url"); }
function decode(value) { return Buffer.from(value, "base64url").toString("utf8"); }

function signEmail(email) {
  const normalized = String(email || "").trim().toLowerCase();
  const payload = encode(JSON.stringify({ email: normalized, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365 }));
  const signature = crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function verifyToken(token) {
  if (!SECRET || !token) return null;
  const [payload, supplied] = String(token).split(".");
  if (!payload || !supplied) return null;
  const expected = crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
  if (expected.length !== supplied.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))) return null;
  try {
    const value = JSON.parse(decode(payload));
    return value?.email && value.exp > Math.floor(Date.now() / 1000) ? value : null;
  } catch (_error) { return null; }
}

function unsubscribeUrl(email) { return `${BASE_URL}/email-preferences.html?token=${encodeURIComponent(signEmail(email))}`; }

function unsubscribeFooter(email) {
  const url = unsubscribeUrl(email);
  return {
    url,
    text: `\n\nYou are receiving this because you opted in to Green Grin updates. Unsubscribe: ${url}`,
    html: `<p style="margin-top:28px;color:#66766b;font-size:12px">You are receiving this because you opted in to Green Grin updates. <a href="${url}" style="color:#3c6b3f">Unsubscribe</a></p>`,
    headers: { "List-Unsubscribe": `<${url}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }
  };
}

module.exports = { signEmail, verifyToken, unsubscribeUrl, unsubscribeFooter };
