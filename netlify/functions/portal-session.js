const crypto = require("node:crypto");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_PIN = process.env.GREEN_GRIN_ADMIN_PIN;
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

const headers = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function json(statusCode, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function baseSecret() {
  return process.env.GREEN_GRIN_SESSION_SECRET || SUPABASE_SERVICE_ROLE_KEY || "";
}

function signingSecret(mode, pin) {
  return crypto.createHash("sha256").update(`${baseSecret()}|${mode}|${pin}`).digest();
}

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function decode(value) {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
}

function signPayload(payload, pin) {
  const encoded = encode(payload);
  const signature = crypto.createHmac("sha256", signingSecret(payload.mode, pin)).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

function tokenPayload(token) {
  const [encoded] = String(token || "").split(".");
  if (!encoded) throw new Error("Saved sign-in is invalid.");
  return decode(encoded);
}

function verifyToken(token, mode, pin) {
  const [encoded, suppliedSignature] = String(token || "").split(".");
  if (!encoded || !suppliedSignature) throw new Error("Saved sign-in is invalid.");
  const expected = crypto.createHmac("sha256", signingSecret(mode, pin)).update(encoded).digest("base64url");
  if (!safeEqual(suppliedSignature, expected)) throw new Error("Saved sign-in is invalid.");
  const payload = decode(encoded);
  const now = Math.floor(Date.now() / 1000);
  if (payload.v !== 1 || payload.mode !== mode || !payload.exp || payload.exp <= now) {
    throw new Error("Saved sign-in has expired.");
  }
  return payload;
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
  if (!response.ok) throw new Error(data?.message || "Employee sign-in could not be verified.");
  return data;
}

async function activeEmployeeByPin(pin) {
  if (!pin) return null;
  const rows = await supabase(`green_grin_employees?select=id,employee_pin,status&employee_pin=eq.${encodeURIComponent(pin)}&status=eq.Active&limit=1`);
  return rows?.[0] || null;
}

async function activeEmployeeById(id) {
  if (!id) return null;
  const rows = await supabase(`green_grin_employees?select=id,employee_pin,status&id=eq.${encodeURIComponent(id)}&status=eq.Active&limit=1`);
  return rows?.[0] || null;
}

function newPayload(mode, sub = "") {
  const now = Math.floor(Date.now() / 1000);
  return { v: 1, mode, sub, iat: now, exp: now + SESSION_TTL_SECONDS };
}

async function createSession(mode, pin) {
  if (mode === "admin") {
    if (!ADMIN_PIN || !safeEqual(pin, ADMIN_PIN)) throw new Error("Wrong admin PIN.");
    const payload = newPayload("admin");
    return { token: signPayload(payload, ADMIN_PIN), expiresAt: payload.exp };
  }
  if (mode === "employee") {
    const employee = await activeEmployeeByPin(pin);
    if (!employee) throw new Error("Employee PIN is not active.");
    const payload = newPayload("employee", employee.id);
    return { token: signPayload(payload, employee.employee_pin), expiresAt: payload.exp };
  }
  throw new Error("Unknown sign-in type.");
}

async function restoreSession(mode, token) {
  if (mode === "admin") {
    if (!ADMIN_PIN) throw new Error("Admin PIN is not configured.");
    const payload = verifyToken(token, "admin", ADMIN_PIN);
    return { pin: ADMIN_PIN, expiresAt: payload.exp };
  }
  if (mode === "employee") {
    const untrusted = tokenPayload(token);
    if (untrusted.mode !== "employee" || !untrusted.sub) throw new Error("Saved sign-in is invalid.");
    const employee = await activeEmployeeById(untrusted.sub);
    if (!employee?.employee_pin) throw new Error("Employee access is no longer active.");
    const payload = verifyToken(token, "employee", employee.employee_pin);
    return { pin: employee.employee_pin, expiresAt: payload.exp };
  }
  throw new Error("Unknown sign-in type.");
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, {});
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed." });
  if (!baseSecret() || !SUPABASE_URL) return json(500, { error: "Secure device sessions are not configured." });

  try {
    const body = JSON.parse(event.body || "{}");
    const mode = String(body.mode || "").toLowerCase();
    if (body.action === "create") return json(200, await createSession(mode, String(body.pin || "")));
    if (body.action === "restore") return json(200, await restoreSession(mode, String(body.token || "")));
    return json(400, { error: "Unknown session action." });
  } catch (error) {
    return json(401, { error: error.message || "Saved sign-in could not be verified." });
  }
};

exports._test = { safeEqual, signPayload, verifyToken, tokenPayload, newPayload };
