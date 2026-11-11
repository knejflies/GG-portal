const crypto = require("node:crypto");
const { requireAdmin, header } = require("./portal-auth");

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const BUCKET = "green-grin-giveaway-photos";
const BASE_URL = process.env.URL || "https://portal.greengrinlawns.com";
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

const json = (statusCode, body, extra = {}) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Admin-Pin",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
    ...extra
  },
  body: JSON.stringify(body)
});

function setupError() {
  return SUPABASE_URL && SERVICE_KEY ? null : "Giveaway storage is not configured yet.";
}

async function supabase(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_error) { data = text; }
  if (!response.ok) throw new Error(data?.message || data?.error || "Supabase request failed.");
  return data;
}

function clean(value, max = 500) { return String(value || "").trim().slice(0, max); }
function extension(type, name) {
  const byType = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic" };
  return byType[type] || String(name || "jpg").split(".").pop().toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
}
function decodePhoto(photo) {
  if (!photo || typeof photo.data !== "string" || !/^data:image\/(jpeg|png|webp|heic);base64,/i.test(photo.data)) throw new Error("Choose a JPG, PNG, WEBP, or HEIC photo.");
  const [, encoded] = photo.data.split(",", 2);
  const buffer = Buffer.from(encoded, "base64");
  if (!buffer.length || buffer.length > MAX_PHOTO_BYTES) throw new Error("Photo must be smaller than 8 MB.");
  const type = String(photo.type || "image/jpeg").toLowerCase();
  if (!["image/jpeg", "image/png", "image/webp", "image/heic"].includes(type)) throw new Error("That photo type is not supported.");
  return { buffer, type, ext: extension(type, photo.name) };
}

async function uploadPhoto(path, photo) {
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": photo.type, "x-upsert": "false" },
    body: photo.buffer
  });
  if (!response.ok) throw new Error("Photo upload failed. Please try again.");
}

async function removePhoto(path) {
  await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}`, {
    method: "DELETE",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prefixes: [path] })
  }).catch(() => null);
}

async function signedPhotoUrl(path) {
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${BUCKET}`, {
    method: "POST",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn: 3600, paths: [path] })
  });
  if (!response.ok) return "";
  const data = await response.json().catch(() => null);
  const signed = Array.isArray(data) ? data[0]?.signedURL : data?.signedURL;
  return signed ? `${SUPABASE_URL}/storage/v1${signed}` : "";
}

async function createEntry(event) {
  let body;
  try { body = JSON.parse(event.body || "{}"); } catch (_error) { throw new Error("Invalid form submission."); }
  if (body.website) throw new Error("Unable to accept this submission.");
  const fullName = clean(body.full_name, 120);
  const email = clean(body.email, 180).toLowerCase();
  const phone = clean(body.phone, 40);
  const address = clean(body.service_address, 240);
  if (!fullName || !email || !address) throw new Error("Name, email, and address are required.");
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Enter a valid email address.");
  if (body.terms_agreed !== true) throw new Error("Please accept the entry terms before submitting.");
  if (body.email_marketing_allowed !== true) throw new Error("Please agree to join the Green Grin email list before submitting.");
  const photo = decodePhoto(body.photo);
  const id = crypto.randomUUID();
  const path = `seasonal-giveaway/${id}.${photo.ext}`;
  await uploadPhoto(path, photo);
  try {
    const row = await supabase("green_grin_giveaway_entries", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        id,
        competition_slug: clean(body.competition_slug, 80) || "seasonal-giveaway",
        full_name: fullName,
        email,
        phone: phone || null,
        service_address: address,
        entry_notes: clean(body.notes, 1000) || null,
        photo_path: path,
        email_marketing_allowed: body.email_marketing_allowed === true,
        sms_marketing_allowed: body.sms_marketing_allowed === true,
        terms_agreed: true,
        consent_at: new Date().toISOString()
      })
    });
    const entry = Array.isArray(row) ? row[0] : row;
    return { id: entry.id, share_url: `${BASE_URL}/giveaway.html?entry=${encodeURIComponent(entry.id)}` };
  } catch (error) {
    await removePhoto(path);
    if (String(error.message).toLowerCase().includes("unique")) throw new Error("That email has already entered this giveaway.");
    throw error;
  }
}

async function listEntries() {
  const rows = await supabase("green_grin_giveaway_entries?select=*&order=created_at.desc&limit=500");
  return Promise.all((rows || []).map(async (row) => ({ ...row, photo_url: await signedPhotoUrl(row.photo_path) })));
}

async function updateEntry(event) {
  const id = clean(event.queryStringParameters?.id, 80);
  if (!id) throw new Error("Entry id is required.");
  let body;
  try { body = JSON.parse(event.body || "{}"); } catch (_error) { throw new Error("Invalid update."); }
  const allowed = ["pending", "finalist", "winner", "not_selected", "archived"];
  const status = allowed.includes(body.status) ? body.status : null;
  if (!status) throw new Error("Invalid giveaway status.");
  return supabase(`green_grin_giveaway_entries?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ status, reviewer_notes: clean(body.reviewer_notes, 1000) || null, reviewed_at: new Date().toISOString() })
  });
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(204, {});
  const missing = setupError();
  if (missing) return json(500, { error: missing });
  try {
    if (event.httpMethod === "POST") return json(201, await createEntry(event));
    const adminError = requireAdmin(event);
    if (adminError) return json(401, { error: adminError });
    if (event.httpMethod === "GET") return json(200, { entries: await listEntries() });
    if (event.httpMethod === "PATCH") return json(200, { entries: await updateEntry(event) });
    return json(405, { error: "Method not allowed." });
  } catch (error) {
    return json(400, { error: error.message || "Giveaway request failed." });
  }
};
