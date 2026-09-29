const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_PIN = process.env.GREEN_GRIN_ADMIN_PIN;
const { requireAccounting } = require("./accounting-auth");

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-admin-pin",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS"
};

function json(statusCode, body) { return { statusCode, headers, body: JSON.stringify(body) }; }
function setupError() {
  return !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY ? "Supabase is not configured yet." : null;
}
function adminError(event) {
  if (!ADMIN_PIN) return "Admin PIN is not configured yet. Add GREEN_GRIN_ADMIN_PIN in Netlify.";
  if (event.headers["x-admin-pin"] !== ADMIN_PIN) return "Wrong admin PIN.";
  return null;
}
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
function serviceEntryPayload(body) {
  const quantity = Math.max(0, Number(body.quantity) || 0);
  const customerPrice = Math.max(0, Number(body.customer_price) || 0);
  const materialCost = Math.max(0, Number(body.material_cost) || 0);
  if (!body.property_id || !body.customer_user_id || !body.service_date || !body.description || !quantity) {
    throw new Error("Property, customer, service date, description, and quantity are required.");
  }
  return {
    property_id: body.property_id,
    customer_user_id: body.customer_user_id,
    job_id: body.job_id || null,
    service_date: body.service_date,
    service_category: String(body.service_category || "Mowing").slice(0, 80),
    description: String(body.description).trim().slice(0, 240),
    quantity,
    unit: String(body.unit || "visit").slice(0, 32),
    customer_price: customerPrice,
    status: ["Draft", "Completed", "Void"].includes(body.status) ? body.status : "Completed",
    internal_notes: body.internal_notes && typeof body.internal_notes === "object" ? body.internal_notes : {},
    material_cost: materialCost,
    include_internal_notes: body.include_internal_notes === true,
    source_key: body.source_key ? String(body.source_key).slice(0, 180) : null
  };
}
function billingIdempotencyKey(propertyId, billingCycle) { return `${propertyId}:${billingCycle}`; }
function authorizationDecision(authorization, entries) {
  const rows = Array.isArray(entries) ? entries : [];
  const allowed = new Set((authorization?.authorized_services || []).map((value) => String(value).toLowerCase()));
  const total = rows.reduce((sum, row) => sum + Number(row.quantity || 0) * Number(row.customer_price || 0), 0);
  const outsideService = rows.find((row) => allowed.size && !allowed.has(String(row.service_category || "").toLowerCase()));
  const extra = rows.find((row) => String(row.service_category || "").toLowerCase() !== "mowing");
  const overCycle = authorization?.max_cycle_charge != null && total > Number(authorization.max_cycle_charge);
  const overExtra = extra && authorization?.max_extra_price != null && Number(extra.quantity || 0) * Number(extra.customer_price || 0) > Number(authorization.max_extra_price);
  return { approved: !outsideService && !overCycle && !overExtra, total: Math.round(total * 100) / 100, reason: outsideService ? "Service is outside the customer authorization." : overCycle ? "Monthly charge exceeds the authorization limit." : overExtra ? "Added service exceeds the authorization limit." : null };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, {});
  const error = setupError();
  if (error) return json(500, { error });
  try {
    await requireAccounting(event, supabase);
    const authError = adminError(event);
    if (authError) return json(401, { error: authError });
    const params = new URLSearchParams(event.rawQuery || "");
    if (event.httpMethod === "GET") {
      const propertyId = params.get("property_id");
      if (!propertyId) return json(400, { error: "Property id is required." });
      const [entries, authorizations, invoices] = await Promise.all([
        supabase(`green_grin_service_entries?select=*&property_id=eq.${encodeURIComponent(propertyId)}&order=service_date.desc,created_at.desc&limit=500`),
        supabase(`green_grin_billing_authorizations?select=*&property_id=eq.${encodeURIComponent(propertyId)}&order=created_at.desc&limit=10`).catch(() => []),
        supabase(`green_grin_invoices?select=*&property_id=eq.${encodeURIComponent(propertyId)}&active=eq.true&order=created_at.desc&limit=100`).catch(() => [])
      ]);
      return json(200, { entries, authorizations, invoices });
    }
    const body = JSON.parse(event.body || "{}");
    if (event.httpMethod === "POST") {
      if (body.action === "generate-invoice") {
        if (!body.property_id || !/^\d{4}-(0[1-9]|1[0-2])$/.test(String(body.billing_cycle || ""))) return json(400, { error: "Property and billing cycle YYYY-MM are required." });
        const result = await supabase("rpc/green_grin_generate_property_invoice", { method: "POST", body: JSON.stringify({ p_property_id: body.property_id, p_billing_cycle: body.billing_cycle }) });
        return json(200, result);
      }
      if (body.action === "authorization") {
        if (!body.property_id || !body.customer_user_id) return json(400, { error: "Property and customer are required." });
        const payload = {
          customer_user_id: body.customer_user_id,
          property_id: body.property_id,
          billing_mode: body.billing_mode === "Automatic" ? "Automatic" : "Review first",
          authorized_services: Array.isArray(body.authorized_services) ? body.authorized_services.slice(0, 20) : ["Mowing"],
          max_cycle_charge: body.max_cycle_charge === "" || body.max_cycle_charge == null ? null : Math.max(0, Number(body.max_cycle_charge) || 0),
          max_extra_price: body.max_extra_price === "" || body.max_extra_price == null ? null : Math.max(0, Number(body.max_extra_price) || 0),
          advance_notice_days: Math.min(30, Math.max(0, Math.round(Number(body.advance_notice_days) || 0))),
          provider: body.provider || null,
          provider_customer_ref: body.provider_customer_ref || null,
          payment_method_ref: body.payment_method_ref || null,
          authorization_version: String(body.authorization_version || "v1").slice(0, 40),
          authorized_at: body.authorized_at || null,
          revoked_at: null,
          status: body.status === "Active" ? "Active" : "Pending"
        };
        const existing = await supabase(`green_grin_billing_authorizations?select=id&property_id=eq.${encodeURIComponent(body.property_id)}&status=neq.Revoked&limit=1`);
        const rows = existing?.[0]
          ? await supabase(`green_grin_billing_authorizations?id=eq.${encodeURIComponent(existing[0].id)}`, { method: "PATCH", body: JSON.stringify({ ...payload, updated_at: new Date().toISOString() }) })
          : await supabase("green_grin_billing_authorizations", { method: "POST", body: JSON.stringify(payload) });
        return json(200, { authorization: rows?.[0] || null });
      }
      const payload = serviceEntryPayload(body);
      const rows = await supabase("green_grin_service_entries", { method: "POST", body: JSON.stringify(payload) });
      return json(200, { entry: rows?.[0] || null });
    }
    if (event.httpMethod === "PATCH") {
      if (!body.id) return json(400, { error: "Service entry id is required." });
      const update = serviceEntryPayload({ ...body, property_id: body.property_id || "linked", customer_user_id: body.customer_user_id || "linked" });
      delete update.property_id; delete update.customer_user_id;
      const rows = await supabase(`green_grin_service_entries?id=eq.${encodeURIComponent(body.id)}`, { method: "PATCH", body: JSON.stringify({ ...update, updated_at: new Date().toISOString() }) });
      return json(200, { entry: rows?.[0] || null });
    }
    return json(405, { error: "Method not allowed." });
  } catch (error) { return json(500, { error: error.message }); }
};

exports._test = { serviceEntryPayload, billingIdempotencyKey, authorizationDecision };
