const crypto = require("node:crypto");
const { requireAdmin, header } = require("./portal-auth");

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const BUCKET = "green-grin-giveaway-photos";
const BASE_URL = process.env.URL || "https://portal.greengrinlawns.com";
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const GIVEAWAY_END_AT = process.env.GIVEAWAY_END_AT || "2026-12-05T18:00:00-07:00";
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const EMAIL_FROM = process.env.GREEN_GRIN_INVOICE_FROM || "Green Grin Lawns <ken@greengrinlawns.com>";
const EMAIL_LOGO_URL = process.env.GREEN_GRIN_EMAIL_LOGO_URL || `${BASE_URL}/assets/green-grin-giveaway-logo.png`;

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
function escapeHtml(value) { return clean(value, 20000).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char])); }
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

async function nextApplicantNumber(competitionSlug) {
  const slug = encodeURIComponent(competitionSlug || "seasonal-giveaway");
  const rows = await supabase(`green_grin_giveaway_entries?select=id&competition_slug=eq.${slug}&limit=5000`);
  return (Array.isArray(rows) ? rows.length : 0) + 1;
}

async function sendEntryConfirmation(entry, offerCode) {
  if (!RESEND_API_KEY || !entry?.email) return { sent: false, skipped: true, reason: "Email is not configured." };
  const customer = escapeHtml(entry.full_name || "there");
  const subject = "Thanks for entering the Cherry Hill Farms giveaway";
  const text = `Hi ${entry.full_name || "there"},\n\nThanks for entering the Cherry Hill Farms giveaway with Green Grin Lawns. Three winners will each receive one free spring fertilizer application.\n\nYour applicant code: ${offerCode}\n\nYour exclusive one-time offer: $50 off one fall cleanup. Use your code when you book. This offer is for the recipient only, may not be combined with another offer, and is subject to scheduling.\n\nOur services include lawn mowing, fertilizer programs, sprinkler blowouts, spring and fall cleanups, aeration, landscaping, landscape maintenance, and irrigation work.\n\nKeep your lawn fed all season with Green Grin fertilizer plans starting at $62.25 per application. Ask about a recurring four-application plan for consistent color and growth.\n\nCall 208-614-2515 for a free quote.\n\nThanks again,\nGreen Grin Lawns`;
  const html = `<!doctype html><html><body style="margin:0;background:#edf4e9;color:#17351f;font-family:Arial,sans-serif"><div style="max-width:680px;margin:0 auto;padding:22px 14px"><div style="background:#fff;padding:18px;text-align:center;border-radius:18px 18px 0 0"><img src="${escapeHtml(EMAIL_LOGO_URL)}" alt="Green Grin Lawns" style="max-width:330px;width:100%;height:auto;max-height:150px;object-fit:contain" /></div><div style="background:#fff;padding:28px;border:1px solid #d4e2d1;border-top:4px solid #80c747;border-radius:0 0 18px 18px"><p style="margin-top:0">Hi ${customer},</p><h1 style="color:#245c2e;font-size:26px;margin-bottom:10px">Thanks for entering!</h1><p>We received your Cherry Hill Farms giveaway submission. Three winners will each receive one free spring fertilizer application from Green Grin Lawns.</p><div style="margin:24px 0;padding:20px;border-radius:14px;background:#edf8e5;border:2px solid #91d453"><p style="margin:0 0 8px;color:#3a7130;font-weight:700">Your applicant code</p><p style="font-size:24px;letter-spacing:.1em;margin:0 0 14px;color:#245c2e"><strong>${escapeHtml(offerCode)}</strong></p><p style="font-size:22px;margin:0 0 8px"><strong>$50 off one fall cleanup</strong></p><p style="margin:0">Use your code when you book. This offer is for the recipient only, may not be combined with another offer, and is subject to scheduling.</p></div><h2 style="font-size:18px;color:#245c2e">Our services</h2><p>Lawn mowing · Fertilizer programs · Sprinkler blowouts · Spring and fall cleanups · Aeration · Landscaping · Landscape maintenance · Irrigation work</p><div style="margin:20px 0;padding:18px;border-radius:12px;background:#f0f9e8;border:1px solid #91d453"><p style="margin:0 0 8px;color:#245c2e;font-size:18px"><strong>Fertilizer plans starting at $62.25</strong></p><p style="margin:0">Ask about a recurring four-application plan for consistent color and growth all season.</p></div><p><strong>Call 208-614-2515 for a free quote.</strong></p><p>Thanks again for choosing Green Grin Lawns.</p><p style="color:#5b6f5e;font-size:13px;margin-bottom:0">Green Grin Lawn &amp; Landscape</p></div></div></body></html>`;
  try {
    const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json", "User-Agent": "Green-Grin-Portal/1.0" }, body: JSON.stringify({ from: EMAIL_FROM, to: [entry.email], subject, text, html }) });
    const data = await response.json().catch(() => ({}));
    return response.ok ? { sent: true, id: data.id || null } : { sent: false, error: data?.message || "Email provider rejected the confirmation." };
  } catch (error) { return { sent: false, error: error.message || "Confirmation email failed." }; }
}

async function createEntry(event) {
  if (Date.now() >= new Date(GIVEAWAY_END_AT).getTime()) throw new Error("This giveaway closed December 5 at 6:00 PM Mountain Time.");
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
  const competitionSlug = clean(body.competition_slug, 80) || "seasonal-giveaway";
  const applicantNumber = await nextApplicantNumber(competitionSlug);
  const offerCode = `Cherry26-${String(applicantNumber).padStart(3, "0")}`;
  const path = `seasonal-giveaway/${id}.${photo.ext}`;
  await uploadPhoto(path, photo);
  try {
    const row = await supabase("green_grin_giveaway_entries", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        id,
        competition_slug: competitionSlug,
        full_name: fullName,
        email,
        phone: phone || null,
        service_address: address,
        entry_notes: clean(body.notes, 1000) || null,
        photo_path: path,
        offer_code: offerCode,
        offer_discount_amount: 50,
        email_marketing_allowed: body.email_marketing_allowed === true,
        sms_marketing_allowed: body.sms_marketing_allowed === true,
        terms_agreed: true,
        consent_at: new Date().toISOString()
      })
    });
    const entry = Array.isArray(row) ? row[0] : row;
    const confirmation = await sendEntryConfirmation(entry, offerCode);
    if (confirmation.sent) await supabase(`green_grin_giveaway_entries?id=eq.${encodeURIComponent(entry.id)}`, { method: "PATCH", body: JSON.stringify({ confirmation_sent_at: new Date().toISOString(), confirmation_email_id: confirmation.id }) }).catch(() => null);
    return { id: entry.id, share_url: `${BASE_URL}/giveaway.html?entry=${encodeURIComponent(entry.id)}`, offer_code: offerCode, confirmation_sent: confirmation.sent };
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
