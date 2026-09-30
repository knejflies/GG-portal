const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_PIN = process.env.GREEN_GRIN_ADMIN_PIN;
const REFERRAL_CREDIT_CENTS_PER_ZONE = 50;
const PUBLIC_URL = process.env.GREEN_GRIN_PUBLIC_URL || "https://portal.greengrinlawns.com";

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, x-admin-pin",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};

const json = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) });

async function supabase(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message || "Supabase request failed.");
  return data;
}

function clean(value, max = 500) {
  return String(value || "").trim().slice(0, max);
}

function positiveInteger(value, max = 999) {
  return Math.max(0, Math.min(max, Math.round(Number(value) || 0)));
}

function newShareCode() {
  return `GG-BLOW-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function requestBaseUrl(event) {
  const forwarded = event.headers["x-forwarded-proto"] || "https";
  const host = event.headers.host || "";
  return host ? `${forwarded}://${host}` : PUBLIC_URL;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, {});
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return json(500, { error: "Supabase is not configured yet." });

  try {
    if (event.httpMethod === "GET") {
      if (!ADMIN_PIN || event.headers["x-admin-pin"] !== ADMIN_PIN) return json(401, { error: "Admin access required." });
      const leads = await supabase("green_grin_sprinkler_blowout_leads?select=*&order=created_at.desc&limit=1000");
      return json(200, { leads });
    }

    if (event.httpMethod === "PATCH") {
      if (!ADMIN_PIN || event.headers["x-admin-pin"] !== ADMIN_PIN) return json(401, { error: "Admin access required." });
      const body = JSON.parse(event.body || "{}");
      const id = clean(body.id, 80);
      const status = clean(body.status, 40);
      const allowed = new Set(["New", "Contacted", "Successful", "Paid", "Not Successful"]);
      if (!id || !allowed.has(status)) return json(400, { error: "Choose a valid lead status." });
      const currentRows = await supabase(`green_grin_sprinkler_blowout_leads?select=*&id=eq.${encodeURIComponent(id)}&limit=1`);
      const current = currentRows?.[0];
      if (!current) return json(404, { error: "Sprinkler blowout lead not found." });
      const update = { status, referral_active: !["Paid", "Not Successful"].includes(status) };
      if (status === "Successful" && !current.referral_credited_at && current.referred_by_code) {
        const referrerQuery = current.referrer_lead_id
          ? `id=eq.${encodeURIComponent(current.referrer_lead_id)}`
          : `share_code=eq.${encodeURIComponent(current.referred_by_code)}`;
        const referrers = await supabase(`green_grin_sprinkler_blowout_leads?select=id,referral_count&${referrerQuery}&limit=1`);
        const referrer = referrers?.[0];
        if (referrer) {
          update.referral_credited_at = new Date().toISOString();
          await supabase(`green_grin_sprinkler_blowout_leads?id=eq.${encodeURIComponent(referrer.id)}`, { method: "PATCH", body: JSON.stringify({ referral_count: Math.max(0, Number(referrer.referral_count) || 0) + 1 }) });
        }
      }
      const rows = await supabase(`green_grin_sprinkler_blowout_leads?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(update) });
      return json(200, { lead: rows?.[0] || null });
    }
    if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed." });
    const body = JSON.parse(event.body || "{}");
    const fullName = clean(body.full_name, 160);
    const email = clean(body.email, 180).toLowerCase();
    const phone = clean(body.phone, 40);
    const serviceAddress = clean(body.service_address, 300);
    const zones = positiveInteger(body.zones, 200);
    const spigots = positiveInteger(body.spigots, 100);
    const notes = clean(body.notes, 2000);
    const referredByCode = clean(body.referred_by_code, 40).toUpperCase();
    const waiverAgreed = body.waiver_agreed === true;
    const emailMarketingAllowed = body.email_marketing_allowed === true;
    const smsMarketingAllowed = body.sms_marketing_allowed === true;
    let referrerLeadId = null;
    if (!fullName || !email || !serviceAddress) return json(400, { error: "Name, email, and service address are required." });
    if (!/^\S+@\S+\.\S+$/.test(email)) return json(400, { error: "Enter a valid email address." });
    if (!waiverAgreed) return json(400, { error: "Check the waiver agreement before submitting the form." });

    if (referredByCode) {
      const referrers = await supabase(`green_grin_sprinkler_blowout_leads?select=id,share_code,referral_count&share_code=eq.${encodeURIComponent(referredByCode)}&limit=1`);
      if (!referrers?.length) return json(400, { error: "That referral code was not found. Check it and try again." });
      referrerLeadId = referrers[0].id;
    }

    let shareCode = newShareCode();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const existing = await supabase(`green_grin_sprinkler_blowout_leads?select=id&share_code=eq.${encodeURIComponent(shareCode)}&limit=1`);
      if (!existing?.length) break;
      shareCode = newShareCode();
    }
    const rows = await supabase("green_grin_sprinkler_blowout_leads", {
      method: "POST",
      body: JSON.stringify({ full_name: fullName, email, phone, service_address: serviceAddress, zones, spigots, notes, share_code: shareCode, referred_by_code: referredByCode || null, referrer_lead_id: referrerLeadId, discount_percent: 0, referral_count: 0, referral_credit_cents_per_zone: REFERRAL_CREDIT_CENTS_PER_ZONE, referral_active: true, waiver_agreed: true, waiver_agreed_at: new Date().toISOString(), email_marketing_allowed: emailMarketingAllowed, sms_marketing_allowed: smsMarketingAllowed, followup_status: emailMarketingAllowed || smsMarketingAllowed ? "Queued" : "Opted out" })
    });
    const base = requestBaseUrl(event);
    return json(200, {
      lead: rows?.[0] || null,
      share_code: shareCode,
      referral_url: `${base}/sprinkler-blowout.html?ref=${encodeURIComponent(shareCode)}`,
      referral_credit_cents_per_zone: REFERRAL_CREDIT_CENTS_PER_ZONE,
      referral_count: 0,
      message: referredByCode ? "Your request was saved. The referral will be reviewed by Green Grin before credit is applied." : "Your sprinkler blowout request was saved. Share your referral link with neighbors to earn $0.50 off each zone per successful referral."
    });
  } catch (error) {
    return json(500, { error: error.message || "Could not save the sprinkler blowout request." });
  }
};
