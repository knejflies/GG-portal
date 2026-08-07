const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_PIN = process.env.GREEN_GRIN_ADMIN_PIN;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const INVOICE_FROM = process.env.GREEN_GRIN_INVOICE_FROM || "Green Grin Lawn & Landscape <ken@greengrinlawns.com>";
const PORTAL_URL = process.env.GREEN_GRIN_PORTAL_URL || "https://portal.greengrinlawns.com/portal/";
const { sendPushToTarget } = require("./push-helper");

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, x-admin-pin",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS"
};

function json(statusCode, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

function requireSetup() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return "Supabase is not configured yet.";
  return null;
}

function requireAdmin(event) {
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

function invoicePayload(body) {
  const amount = Number(body.amount);
  const status = body.status || "Draft";
  const isPaid = status === "Paid";
  return {
    customer_user_id: body.customer_user_id || null,
    customer_code: body.customer_code || "",
    customer_name: body.customer_name || "Customer",
    phone: body.phone || "",
    email: body.email || "",
    amount: Number.isFinite(amount) ? amount : 0,
    due_date: body.due_date || null,
    status,
    service_line: body.service_line || "",
    notes: body.notes || "",
    payment_url: body.payment_url || "",
    payment_method: body.payment_method || "",
    payment_reference: body.payment_reference || "",
    payment_reported_at: body.payment_reported_at || null,
    payment_confirmed_at: isPaid
      ? (body.payment_confirmed_at || new Date().toISOString())
      : null,
    active: body.active !== false
  };
}

function legacyInvoicePayload(payload) {
  const legacy = { ...payload };
  delete legacy.payment_method;
  delete legacy.payment_reference;
  delete legacy.payment_reported_at;
  delete legacy.payment_confirmed_at;
  return legacy;
}

function isMissingPaymentColumn(error) {
  return /payment_method|payment_reference|payment_reported_at|payment_confirmed_at|schema cache/i.test(error?.message || "");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function invoiceEmailPayload(invoice) {
  const amount = `$${Number(invoice.amount || 0).toFixed(2)}`;
  const service = invoice.service_line || invoice.notes || "Lawn and landscape service";
  const due = invoice.due_date
    ? new Date(`${invoice.due_date}T12:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : "Upon receipt";
  const customer = invoice.customer_name || "Customer";
  const subject = `Green Grin invoice - ${amount}`;
  const text = [
    `Hi ${customer},`,
    "",
    "Your Green Grin invoice is ready.",
    `Service: ${service}`,
    `Amount: ${amount}`,
    `Due: ${due}`,
    invoice.notes ? `Notes: ${invoice.notes}` : "",
    "",
    `View your invoice: ${PORTAL_URL}`,
    "",
    "Green Grin Lawn & Landscape"
  ].filter(Boolean).join("\n");
  return {
    from: INVOICE_FROM,
    to: [invoice.email],
    subject,
    text,
    html: `<!doctype html><html><body style="margin:0;background:#eef4ec;color:#102419;font-family:Arial,sans-serif"><div style="max-width:620px;margin:0 auto;padding:28px 16px"><div style="background:#07351d;color:#fff;padding:24px;border-radius:8px 8px 0 0"><strong style="font-size:22px">Green Grin Lawn &amp; Landscape</strong></div><div style="background:#fff;padding:28px;border:1px solid #d5e2d2;border-top:0;border-radius:0 0 8px 8px"><p style="margin-top:0">Hi ${escapeHtml(customer)},</p><h1 style="font-size:25px;color:#07351d">Your invoice is ready</h1><div style="background:#f2f8ef;border-left:4px solid #78c653;padding:16px;margin:22px 0"><p style="margin:0 0 8px"><strong>Service:</strong> ${escapeHtml(service)}</p><p style="margin:0 0 8px"><strong>Amount:</strong> ${escapeHtml(amount)}</p><p style="margin:0"><strong>Due:</strong> ${escapeHtml(due)}</p></div>${invoice.notes ? `<p><strong>Notes:</strong> ${escapeHtml(invoice.notes)}</p>` : ""}<p style="margin:26px 0"><a href="${escapeHtml(PORTAL_URL)}" style="display:inline-block;background:#78c653;color:#092114;text-decoration:none;font-weight:bold;padding:13px 20px;border-radius:6px">View Invoice</a></p><p style="color:#526458;font-size:14px">Green Grin Lawn &amp; Landscape</p></div></div></body></html>`
  };
}

async function sendInvoiceEmail(invoice) {
  if (!invoice || invoice.status !== "Sent") return null;
  if (!invoice.email) return { enabled: Boolean(RESEND_API_KEY), sent: false, skipped: true, reason: "Customer has no email address." };
  if (!RESEND_API_KEY) return { enabled: false, sent: false, skipped: true, reason: "Invoice email is not configured in Netlify." };
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "User-Agent": "Green-Grin-Portal/1.0"
      },
      body: JSON.stringify(invoiceEmailPayload(invoice))
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return { enabled: true, sent: false, error: data.message || "Email provider rejected the invoice." };
    return { enabled: true, sent: true, id: data.id || null };
  } catch (error) {
    return { enabled: true, sent: false, error: error.message || "Invoice email could not be sent." };
  }
}

async function saveInvoice(path, method, body) {
  const payload = invoicePayload(body);
  try {
    return await supabase(path, { method, body: JSON.stringify(payload) });
  } catch (error) {
    if (!isMissingPaymentColumn(error)) throw error;
    return await supabase(path, { method, body: JSON.stringify(legacyInvoicePayload(payload)) });
  }
}

async function notifyInvoice(invoice) {
  if (!invoice || invoice.status !== "Sent") return null;
  const customer = await sendPushToTarget(supabase, {
    customer_user_id: invoice.customer_user_id || null,
    customer_code: invoice.customer_code || "",
    email: invoice.email || ""
  }, {
    title: "New Green Grin invoice",
    body: `${invoice.service_line || invoice.notes || "Monthly service"} - $${Number(invoice.amount || 0).toFixed(2)}`,
    url: "/portal/",
    tag: `green-grin-invoice-${invoice.id}`
  });
  const owner = await sendPushToTarget(supabase, { owner_type: "admin" }, {
    title: "Invoice sent",
    body: `${invoice.customer_name || "Customer"} - $${Number(invoice.amount || 0).toFixed(2)}`,
    url: "/admin/",
    tag: `green-grin-owner-invoice-${invoice.id}`
  });
  return {
    customer,
    owner,
    sent: Number(customer?.sent || 0) + Number(owner?.sent || 0),
    failed: Number(customer?.failed || 0) + Number(owner?.failed || 0),
    total: Number(customer?.total || 0) + Number(owner?.total || 0),
    enabled: customer?.enabled !== false || owner?.enabled !== false
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, {});

  const setupError = requireSetup();
  if (setupError) return json(500, { error: setupError });

  const adminError = requireAdmin(event);
  if (adminError) return json(401, { error: adminError });

  try {
    if (event.httpMethod === "GET") {
      const invoices = await supabase("green_grin_invoices?select=*&active=eq.true&order=created_at.desc&limit=500");
      return json(200, { invoices });
    }

    const body = JSON.parse(event.body || "{}");

    if (event.httpMethod === "POST") {
      const rows = await saveInvoice("green_grin_invoices", "POST", body);
      const invoice = rows?.[0] || null;
      const push = body.notify_customer === true ? await notifyInvoice(invoice) : null;
      const email = body.notify_customer === true ? await sendInvoiceEmail(invoice) : null;
      return json(200, { invoice, push, email });
    }

    if (event.httpMethod === "PATCH") {
      if (!body.id) return json(400, { error: "Invoice id is required." });
      const rows = await saveInvoice(`green_grin_invoices?id=eq.${encodeURIComponent(body.id)}`, "PATCH", body);
      const invoice = rows?.[0] || null;
      const push = body.notify_customer === true ? await notifyInvoice(invoice) : null;
      const email = body.notify_customer === true ? await sendInvoiceEmail(invoice) : null;
      return json(200, { invoice, push, email });
    }

    if (event.httpMethod === "DELETE") {
      if (!body.id) return json(400, { error: "Invoice id is required." });
      await supabase(`green_grin_invoices?id=eq.${encodeURIComponent(body.id)}`, { method: "DELETE" });
      return json(200, { ok: true });
    }

    return json(405, { error: "Method not allowed." });
  } catch (error) {
    return json(500, { error: error.message });
  }
};

exports._test = { invoicePayload, legacyInvoicePayload, isMissingPaymentColumn, escapeHtml, invoiceEmailPayload, sendInvoiceEmail };
