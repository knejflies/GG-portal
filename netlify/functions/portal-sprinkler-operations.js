const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_PIN = process.env.GREEN_GRIN_ADMIN_PIN;
const VENMO_HANDLE = String(process.env.GREEN_GRIN_VENMO_HANDLE || "@greengrinlawns").replace(/^@/, "");
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.GREEN_GRIN_INVOICE_FROM || "Green Grin Lawns <ken@greengrinlawns.com>";
const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type, x-admin-pin", "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS" };
const json = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) });
const clean = (value, max = 500) => String(value || "").trim().slice(0, max);
const validUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
const escapeHtml = (value) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#039;");

async function supabase(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...options, headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json", Prefer: "return=representation", ...(options.headers || {}) } });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message || "Supabase request failed.");
  return data;
}
async function authAdmin(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/${path}`, { ...options, headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json", ...(options.headers || {}) } });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.msg || data?.message || "Supabase account service failed.");
  return data;
}
function requireAdmin(event) {
  if (!ADMIN_PIN || event.headers["x-admin-pin"] !== ADMIN_PIN) return "Admin access required.";
  return null;
}
function normalizeAddress(value) { return clean(value, 300).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
function geocodeDecision(result, requestedAddress) {
  if (!result) return { status: "Needs Correction", latitude: null, longitude: null, display_name: null };
  const display = String(result.display_name || "");
  const requestedNumber = String(requestedAddress || "").match(/^\s*(\d+[a-z]?)/i)?.[1];
  const hasHouseNumber = !requestedNumber || new RegExp(`\\b${requestedNumber.replace(/[a-z]/i, "[a-z]?")}\\b`, "i").test(display);
  const latitude = Number(result.lat);
  const longitude = Number(result.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !hasHouseNumber) return { status: "Needs Correction", latitude: null, longitude: null, display_name: display || null };
  return { status: "Located", latitude, longitude, display_name: display };
}
async function geocodeAddress(address) {
  const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=3&addressdetails=1&q=${encodeURIComponent(address)}`, { headers: { "User-Agent": "Green-Grin-Portal/1.0 contact@greengrinlawns.com" } });
  if (!response.ok) return geocodeDecision(null, address);
  const rows = await response.json().catch(() => []);
  return geocodeDecision(rows?.[0], address);
}
async function getLead(id) {
  const rows = await supabase(`green_grin_sprinkler_blowout_leads?select=*&id=eq.${encodeURIComponent(id)}&limit=1`);
  if (!rows?.[0]) throw new Error("Sprinkler blowout lead not found.");
  return rows[0];
}
async function ensureCustomerProperty(lead) {
  if (lead.customer_user_id && lead.property_id) return { customer_user_id: lead.customer_user_id, property_id: lead.property_id };
  let customer = null;
  const emailRows = lead.email ? await supabase(`green_grin_customers?select=*&email=eq.${encodeURIComponent(String(lead.email).toLowerCase())}&limit=1`) : [];
  customer = emailRows?.[0] || null;
  if (!customer && lead.phone) {
    const phoneRows = await supabase(`green_grin_customers?select=*&phone=eq.${encodeURIComponent(lead.phone)}&limit=1`);
    customer = phoneRows?.[0] || null;
  }
  if (!customer) {
    let user;
    try {
      user = await authAdmin("users", { method: "POST", body: JSON.stringify({ email: lead.email, email_confirm: false, user_metadata: { name: lead.full_name, phone: lead.phone || "", address: lead.service_address } }) });
    } catch (error) {
      const retry = await supabase(`green_grin_customers?select=*&email=eq.${encodeURIComponent(String(lead.email).toLowerCase())}&limit=1`);
      if (!retry?.[0]) throw error;
      customer = retry[0];
    }
    if (!customer && user?.id) {
      const rows = await supabase("green_grin_customers?on_conflict=id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify({ id: user.id, full_name: lead.full_name, phone: lead.phone || "", email: lead.email, active: true, billing_status: "Not connected" }) });
      customer = rows?.[0] || { id: user.id, full_name: lead.full_name, phone: lead.phone || "", email: lead.email };
    }
  }
  let properties = await supabase(`green_grin_properties?select=*&customer_user_id=eq.${encodeURIComponent(customer.id)}&active=eq.true&limit=100`);
  const addressKey = normalizeAddress(lead.service_address);
  let property = (properties || []).find((row) => normalizeAddress(row.address) === addressKey);
  if (!property) {
    const rows = await supabase("green_grin_properties", { method: "POST", body: JSON.stringify({ customer_user_id: customer.id, address: lead.service_address, property_name: "Sprinkler blowout property", property_type: "Residential", active: true }) });
    property = rows?.[0];
  }
  if (!property) throw new Error("Customer property could not be created.");
  const geocode = lead.geocode_status === "Located" ? { status: lead.geocode_status, latitude: lead.latitude, longitude: lead.longitude, display_name: lead.geocode_display_name } : await geocodeAddress(lead.service_address);
  const update = { customer_user_id: customer.id, property_id: property.id, geocode_status: geocode.status, latitude: geocode.latitude, longitude: geocode.longitude, geocode_display_name: geocode.display_name };
  const updated = await supabase(`green_grin_sprinkler_blowout_leads?id=eq.${encodeURIComponent(lead.id)}`, { method: "PATCH", body: JSON.stringify(update) });
  return { customer_user_id: customer.id, property_id: property.id, geocode, lead: updated?.[0] || { ...lead, ...update } };
}
function extraRows(value) {
  return (Array.isArray(value) ? value : []).slice(0, 30).map((row) => ({ description: clean(row.description, 180), quantity: Math.max(0, Number(row.quantity) || 0), unit: clean(row.unit || "each", 24), rate: Math.max(0, Number(row.rate) || 0) })).filter((row) => row.description && row.quantity > 0);
}
function blowoutIdempotencyKey(leadId, serviceDate) { return `blowout:${leadId}:${serviceDate}`; }
function resolveBlowoutPrice(body, lead) {
  return Math.max(0, Number(Object.prototype.hasOwnProperty.call(body || {}, "base_amount") ? body.base_amount : lead?.customer_price) || 0);
}
function blowoutCompletionReceiptPayload(lead, history) {
  const customer = lead.full_name || "Customer";
  const amount = `$${Number(history.total_amount || 0).toFixed(2)}`;
  const serviceDate = new Date(`${history.service_date}T12:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const extras = extraRows(history.extra_charges);
  const extraText = extras.map((row) => `${row.description}: ${row.quantity} ${row.unit} × $${row.rate.toFixed(2)}`);
  const extraHtml = extras.length ? `<h2 style="font-size:18px;color:#07351d">Additional work</h2><ul>${extras.map((row) => `<li>${escapeHtml(row.description)}: ${escapeHtml(row.quantity)} ${escapeHtml(row.unit)} × $${row.rate.toFixed(2)}</li>`).join("")}</ul>` : "";
  return {
    from: EMAIL_FROM,
    to: [lead.email],
    subject: `Green Grin payment receipt - ${amount}`,
    text: [`Hi ${customer},`, "", "Thank you. Your payment for the completed sprinkler blowout has been received.", `Service date: ${serviceDate}`, `Service address: ${lead.service_address || ""}`, `Sprinkler zones: ${Number(history.zones) || 0}`, `Amount paid: ${amount}`, ...extraText, "", "Status: Paid", "", "This email is your payment receipt.", "", "Thank you for choosing Green Grin Lawns."].filter(Boolean).join("\n"),
    html: `<!doctype html><html><body style="margin:0;background:#eef4ec;color:#102419;font-family:Arial,sans-serif"><div style="max-width:680px;margin:0 auto;padding:28px 16px"><div style="background:#07351d;color:#fff;padding:24px;border-radius:8px 8px 0 0"><strong style="font-size:22px">Green Grin Lawns</strong></div><div style="background:#fff;padding:28px;border:1px solid #d5e2d2;border-top:0;border-radius:0 0 8px 8px"><p>Hi ${escapeHtml(customer)},</p><h1 style="font-size:25px;color:#07351d">Payment received</h1><p>Thank you. Your payment for the completed sprinkler blowout has been received.</p><div style="background:#f2f8ef;border-left:4px solid #78c653;padding:16px;margin:22px 0"><p><strong>Service date:</strong> ${escapeHtml(serviceDate)}</p><p><strong>Service address:</strong> ${escapeHtml(lead.service_address || "")}</p><p><strong>Sprinkler zones:</strong> ${escapeHtml(Number(history.zones) || 0)}</p><p><strong>Amount paid:</strong> ${escapeHtml(amount)}</p><p><strong>Status:</strong> Paid</p></div>${extraHtml}<p style="color:#526458;font-size:14px">This email is your payment receipt.</p><p>Thank you for choosing Green Grin Lawns.</p></div></div></body></html>`
  };
}
async function sendBlowoutCompletionReceipt(lead, history) {
  if (!lead?.email) return { enabled: Boolean(RESEND_API_KEY), sent: false, skipped: true, reason: "Customer has no email address." };
  if (!RESEND_API_KEY) return { enabled: false, sent: false, skipped: true, reason: "Completion email is not configured in Netlify." };
  try {
    const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json", "User-Agent": "Green-Grin-Portal/1.0" }, body: JSON.stringify(blowoutCompletionReceiptPayload(lead, history)) });
    const data = await response.json().catch(() => ({}));
    return response.ok ? { enabled: true, sent: true, id: data.id || null } : { enabled: true, sent: false, error: data.message || "Email provider rejected the completion receipt." };
  } catch (error) { return { enabled: true, sent: false, error: error.message || "Completion receipt could not be sent." }; }
}
function scheduledEmailRoster(leads, scheduledDate) {
  const rows = Array.isArray(leads) ? leads : [];
  const closedStatuses = new Set(["Completed", "Invoiced", "Paid", "Not Successful"]);
  const active = rows.filter((lead) => !closedStatuses.has(String(lead?.status || "")));
  const recipients = [];
  const missingEmail = [];
  for (const lead of active) {
    const email = clean(lead?.email, 320).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      missingEmail.push({ id: lead?.id || null, name: clean(lead?.full_name || "Unnamed customer", 160), email });
      continue;
    }
    recipients.push({ id: lead?.id || null, email, name: clean(lead?.full_name, 160), address: clean(lead?.service_address, 300), date: scheduledDate });
  }
  return {
    assigned_total: rows.length,
    active_total: active.length,
    recipients,
    missing_email: missingEmail,
    closed_total: rows.length - active.length
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, {});
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return json(500, { error: "Supabase is not configured yet." });
  const publicParams = new URLSearchParams(event.rawQuery || "");
  if (event.httpMethod === "GET" && publicParams.get("settings") === "1") {
    try {
      const rows = await supabase("green_grin_service_visibility_settings?select=*&service_key=eq.sprinkler_blowout&limit=1");
      const setting = rows?.[0] || { service_key: "sprinkler_blowout", enabled: true };
      const today = new Date().toISOString().slice(0, 10);
      const active = setting.enabled !== false && (!setting.visible_from || today >= setting.visible_from) && (!setting.visible_until || today <= setting.visible_until);
      return json(200, { setting, active });
    } catch (error) { return json(200, { active: true, setting: { service_key: "sprinkler_blowout", enabled: true } }); }
  }
  const authError = requireAdmin(event);
  if (authError) return json(401, { error: authError });
  try {
    const params = new URLSearchParams(event.rawQuery || "");
    if (event.httpMethod === "GET") {
      const status = params.get("status");
      const area = params.get("area");
      const followups = params.get("followups") === "1";
      if (followups) {
        const rows = await supabase("green_grin_spring_followups?select=*,green_grin_sprinkler_blowout_leads(full_name,email,phone,service_address,email_marketing_allowed,sms_marketing_allowed)&order=created_at.asc&limit=1000");
        return json(200, { followups: rows });
      }
      if (params.get("settings") === "1") {
        const rows = await supabase("green_grin_service_visibility_settings?select=*&service_key=eq.sprinkler_blowout&limit=1");
        return json(200, { setting: rows?.[0] || null });
      }
      if (params.get("email_recipients") === "1") {
        const scheduledDate = clean(params.get("scheduled_date"), 20);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate)) return json(400, { error: "Choose a valid scheduled day." });
        const leads = await supabase(`green_grin_sprinkler_blowout_leads?select=id,full_name,email,service_address,status,scheduled_date&scheduled_date=eq.${encodeURIComponent(scheduledDate)}&order=created_at.asc&limit=1000`);
        return json(200, scheduledEmailRoster(leads, scheduledDate));
      }
      const filter = status && status !== "All" && status !== "Needs Correction" ? `&status=eq.${encodeURIComponent(status)}` : status === "Needs Correction" ? "&geocode_status=eq.Needs%20Correction" : "";
      const leads = await supabase(`green_grin_sprinkler_blowout_leads?select=*&order=created_at.desc&limit=1000${filter}`);
      return json(200, { leads: area ? leads.filter((lead) => String(lead.service_address || "").toLowerCase().includes(area.toLowerCase())) : leads });
    }
    const body = JSON.parse(event.body || "{}");
    if (event.httpMethod === "POST" && body.action === "locate-missing") {
      const leads = await supabase("green_grin_sprinkler_blowout_leads?select=*&order=created_at.asc&limit=1000");
      let located = 0;
      let needsCorrection = 0;
      for (const lead of (leads || []).filter((item) => item.geocode_status !== "Located").slice(0, 40)) {
        const geocode = await geocodeAddress(lead.service_address);
        const update = { geocode_status: geocode.status, latitude: geocode.latitude, longitude: geocode.longitude, geocode_display_name: geocode.display_name };
        await supabase(`green_grin_sprinkler_blowout_leads?id=eq.${encodeURIComponent(lead.id)}`, { method: "PATCH", body: JSON.stringify(update) });
        if (geocode.status === "Located") located += 1;
        else needsCorrection += 1;
      }
      return json(200, { located, needs_correction: needsCorrection, remaining: Math.max(0, (leads || []).filter((item) => item.geocode_status !== "Located").length - 40) });
    }
    if (event.httpMethod === "PATCH" && body.action === "settings") {
      const rows = await supabase("green_grin_service_visibility_settings?on_conflict=service_key", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify({ service_key: "sprinkler_blowout", enabled: body.enabled !== false, visible_from: body.visible_from || null, visible_until: body.visible_until || null, updated_at: new Date().toISOString(), updated_by: "Owner" }) });
      return json(200, { setting: rows?.[0] || null });
    }
    if (event.httpMethod === "PATCH" && body.action === "followup-response") {
      if (!body.followup_id) return json(400, { error: "Follow-up id is required." });
      const rows = await supabase(`green_grin_spring_followups?id=eq.${encodeURIComponent(body.followup_id)}`, { method: "PATCH", body: JSON.stringify({ response: clean(body.response, 100), status: clean(body.status || "Contacted", 40), contacted_at: new Date().toISOString(), scheduled_date: body.scheduled_date || null }) });
      return json(200, { followup: rows?.[0] || null });
    }
    const lead = await getLead(body.lead_id || body.id);
    if (event.httpMethod === "POST" && body.action === "sync") {
      const result = await ensureCustomerProperty(lead);
      return json(200, result);
    }
    if (event.httpMethod === "POST" && body.action === "schedule") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(body.scheduled_date || ""))) return json(400, { error: "A valid service date is required." });
      // Scheduling is a planning step and must work before a customer/property is linked.
      // Linking is still handled when the blowout is completed or synced.
      const rows = await supabase(`green_grin_sprinkler_blowout_leads?id=eq.${encodeURIComponent(lead.id)}`, { method: "PATCH", body: JSON.stringify({ status: "Scheduled", scheduled_date: body.scheduled_date }) });
      return json(200, { lead: rows?.[0] || null, directions_url: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(lead.service_address)}` });
    }
    if (event.httpMethod === "POST" && body.action === "unschedule") {
      const rows = await supabase(`green_grin_sprinkler_blowout_leads?id=eq.${encodeURIComponent(lead.id)}`, { method: "PATCH", body: JSON.stringify({ status: "New", scheduled_date: null }) });
      return json(200, { lead: rows?.[0] || null });
    }
    if (event.httpMethod === "POST" && body.action === "complete") {
      const result = await ensureCustomerProperty(lead);
      const serviceDate = body.service_date || lead.scheduled_date || new Date().toISOString().slice(0, 10);
      const key = blowoutIdempotencyKey(lead.id, serviceDate);
      const existing = await supabase(`green_grin_sprinkler_blowout_history?select=*&idempotency_key=eq.${encodeURIComponent(key)}&limit=1`);
      if (existing?.[0]) return json(200, { history: existing[0], duplicate: true });
      const extras = extraRows(body.extra_charges);
      const baseAmount = resolveBlowoutPrice(body, lead);
      const total = Math.round((baseAmount + extras.reduce((sum, row) => sum + row.quantity * row.rate, 0)) * 100) / 100;
      const rows = await supabase("green_grin_sprinkler_blowout_history", { method: "POST", body: JSON.stringify({ lead_id: lead.id, customer_user_id: result.customer_user_id, property_id: result.property_id, service_date: serviceDate, zones: Number(lead.zones) || 0, spigots: Number(lead.spigots) || 0, service_notes: clean(body.service_notes, 2000), extra_charges: extras, base_amount: baseAmount, total_amount: total, status: "Completed", idempotency_key: key }) });
      const history = rows?.[0] || { service_date: serviceDate, zones: Number(lead.zones) || 0, extra_charges: extras, base_amount: baseAmount, total_amount: total };
      const lines = [{ description: `Sprinkler blowout (${Number(history.zones) || 0} zones)`, category: "Sprinkler Blowout", quantity: 1, unit: "service", rate: baseAmount, amount: baseAmount }, ...extras.map((row) => ({ ...row, category: "Approved Extra", amount: Math.round(row.quantity * row.rate * 100) / 100 }))];
      const invoiceKey = `blowout:${history.id}`;
      const existingInvoices = await supabase(`green_grin_invoices?select=*&source_estimate_number=eq.${encodeURIComponent(invoiceKey)}&limit=1`);
      let invoice = existingInvoices?.[0] || null;
      if (!invoice) {
        const invoiceRows = await supabase("green_grin_invoices", { method: "POST", body: JSON.stringify({ customer_user_id: result.customer_user_id, customer_name: lead.full_name, phone: lead.phone || "", email: lead.email, amount: total, subtotal: total, line_items: lines, due_date: serviceDate, status: "Paid", service_line: "Sprinkler Blowout", service_address: lead.service_address, notes: "Paid sprinkler blowout service.", payment_method: clean(body.payment_method || "Customer payment", 80), property_id: result.property_id, source_estimate_number: invoiceKey, blowout_history_id: history.id, active: true }) });
        invoice = invoiceRows?.[0] || null;
      }
      if (!invoice) throw new Error("The paid blowout invoice could not be recorded.");
      await supabase(`green_grin_sprinkler_blowout_history?id=eq.${encodeURIComponent(history.id)}`, { method: "PATCH", body: JSON.stringify({ invoice_id: invoice.id, status: "Paid" }) });
      const completionUpdate = { status: "Paid", completed_at: new Date().toISOString(), completion_notes: clean(body.service_notes, 2000), customer_price: baseAmount, customer_user_id: result.customer_user_id, property_id: result.property_id, invoice_id: invoice.id, referral_active: false };
      try {
        await supabase(`green_grin_sprinkler_blowout_leads?id=eq.${encodeURIComponent(lead.id)}`, { method: "PATCH", body: JSON.stringify(completionUpdate) });
      } catch (error) {
        if (!/customer_price/i.test(error.message || "")) throw error;
        const { customer_price: omittedPrice, ...compatibleUpdate } = completionUpdate;
        await supabase(`green_grin_sprinkler_blowout_leads?id=eq.${encodeURIComponent(lead.id)}`, { method: "PATCH", body: JSON.stringify(compatibleUpdate) });
      }
      const email = await sendBlowoutCompletionReceipt(lead, history);
      await supabase("green_grin_message_log", { method: "POST", body: JSON.stringify({ job_id: null, phone: lead.email || lead.phone || "", template: email.sent ? "completed-email-sent" : "completed-email-failed", message: email.sent ? `Sprinkler blowout completion receipt sent to ${lead.full_name || "Customer"}.` : `Sprinkler blowout completion receipt failed for ${lead.full_name || "Customer"}: ${email.error || email.reason || "Unknown error."}`, actor_type: "Owner", actor_name: "Owner", twilio_sid: email.id || null }) }).catch(() => null);
      return json(200, { history: { ...history, invoice_id: invoice.id, status: "Paid" }, invoice, duplicate: false, email });
    }
    if (event.httpMethod === "POST" && body.action === "set-price") {
      const baseAmount = Math.max(0, Number(body.base_amount) || 0);
      const leadRows = await supabase(`green_grin_sprinkler_blowout_leads?id=eq.${encodeURIComponent(lead.id)}`, { method: "PATCH", body: JSON.stringify({ customer_price: baseAmount }) });
      const historyRows = await supabase(`green_grin_sprinkler_blowout_history?select=*&lead_id=eq.${encodeURIComponent(lead.id)}&order=service_date.desc&limit=1`);
      const history = historyRows?.[0];
      if (!history) return json(200, { lead: leadRows?.[0] || { ...lead, customer_price: baseAmount }, history: null });
      const extras = extraRows(history.extra_charges);
      const totalAmount = Math.round((baseAmount + extras.reduce((sum, row) => sum + row.quantity * row.rate, 0)) * 100) / 100;
      const rows = await supabase(`green_grin_sprinkler_blowout_history?id=eq.${encodeURIComponent(history.id)}`, { method: "PATCH", body: JSON.stringify({ base_amount: baseAmount, total_amount: totalAmount }) });
      return json(200, { lead: leadRows?.[0] || { ...lead, customer_price: baseAmount }, history: rows?.[0] || { ...history, base_amount: baseAmount, total_amount: totalAmount } });
    }
    if (event.httpMethod === "POST" && body.action === "invoice") {
      const result = await ensureCustomerProperty(lead);
      const serviceDate = body.service_date || lead.completed_at?.slice(0, 10) || new Date().toISOString().slice(0, 10);
      const historyRows = await supabase(`green_grin_sprinkler_blowout_history?select=*&lead_id=eq.${encodeURIComponent(lead.id)}&service_date=eq.${encodeURIComponent(serviceDate)}&limit=1`);
      let history = historyRows?.[0];
      if (!history) return json(400, { error: "Mark the blowout complete before creating its invoice." });
      if (Object.prototype.hasOwnProperty.call(body, "base_amount")) {
        const baseAmount = Math.max(0, Number(body.base_amount) || 0);
        const extras = extraRows(history.extra_charges);
        const totalAmount = Math.round((baseAmount + extras.reduce((sum, row) => sum + row.quantity * row.rate, 0)) * 100) / 100;
        const updated = await supabase(`green_grin_sprinkler_blowout_history?id=eq.${encodeURIComponent(history.id)}`, { method: "PATCH", body: JSON.stringify({ base_amount: baseAmount, total_amount: totalAmount }) });
        history = updated?.[0] || { ...history, base_amount: baseAmount, total_amount: totalAmount };
      }
      if (history.invoice_id) {
        await supabase(`green_grin_sprinkler_blowout_leads?id=eq.${encodeURIComponent(lead.id)}`, { method: "PATCH", body: JSON.stringify({ status: "Invoiced", invoice_id: history.invoice_id }) });
        return json(200, { duplicate: true, invoice_id: history.invoice_id });
      }
      const lines = [{ description: `Sprinkler blowout (${Number(history.zones) || 0} zones)`, category: "Sprinkler Blowout", quantity: 1, unit: "service", rate: Number(history.base_amount) || 0, amount: Number(history.base_amount) || 0 }, ...extraRows(history.extra_charges).map((row) => ({ ...row, category: "Approved Extra", amount: Math.round(row.quantity * row.rate * 100) / 100 }))];
      const invoiceKey = `blowout:${history.id}`;
      const existing = await supabase(`green_grin_invoices?select=id&source_estimate_number=eq.${encodeURIComponent(invoiceKey)}&limit=1`);
      if (existing?.[0]) {
        await supabase(`green_grin_sprinkler_blowout_leads?id=eq.${encodeURIComponent(lead.id)}`, { method: "PATCH", body: JSON.stringify({ status: "Invoiced", invoice_id: existing[0].id }) });
        return json(200, { duplicate: true, invoice_id: existing[0].id });
      }
      const invoiceRows = await supabase("green_grin_invoices", { method: "POST", body: JSON.stringify({ customer_user_id: result.customer_user_id, customer_name: lead.full_name, phone: lead.phone || "", email: lead.email, amount: Number(history.total_amount) || 0, subtotal: Number(history.total_amount) || 0, line_items: lines, due_date: body.due_date || null, status: "Draft", service_line: "Sprinkler Blowout", service_address: lead.service_address, notes: "Review this itemized blowout invoice before sending.", payment_method: "Venmo Business", payment_url: `https://venmo.com/u/${encodeURIComponent(VENMO_HANDLE)}`, property_id: result.property_id, source_estimate_number: invoiceKey, blowout_history_id: history.id, active: true }) });
      const invoice = invoiceRows?.[0] || null;
      if (invoice) {
        await supabase(`green_grin_sprinkler_blowout_history?id=eq.${encodeURIComponent(history.id)}`, { method: "PATCH", body: JSON.stringify({ invoice_id: invoice.id, status: "Invoiced" }) });
        await supabase(`green_grin_sprinkler_blowout_leads?id=eq.${encodeURIComponent(lead.id)}`, { method: "PATCH", body: JSON.stringify({ status: "Invoiced", invoice_id: invoice.id }) });
      }
      return json(200, { invoice, duplicate: false });
    }
    if (event.httpMethod === "POST" && body.action === "queue-followup") {
      if (!lead.email_marketing_allowed && !lead.sms_marketing_allowed) return json(400, { error: "This customer has not opted in to promotional follow-up." });
      const result = await ensureCustomerProperty(lead);
      const rows = await supabase("green_grin_spring_followups", { method: "POST", body: JSON.stringify({ lead_id: lead.id, customer_user_id: result.customer_user_id, property_id: result.property_id, service_interest: clean(body.service_interest || "Irrigation start-up", 100), area: clean(body.area, 100), contact_method: lead.email_marketing_allowed ? "Email" : "SMS", status: "Queued" }) });
      return json(200, { followup: rows?.[0] || null });
    }
    return json(405, { error: "Method not allowed." });
  } catch (error) { return json(500, { error: error.message || "Sprinkler operation failed." }); }
};

exports.ensureCustomerProperty = ensureCustomerProperty;
exports._test = { normalizeAddress, geocodeDecision, extraRows, blowoutIdempotencyKey, resolveBlowoutPrice, scheduledEmailRoster, blowoutCompletionReceiptPayload };

