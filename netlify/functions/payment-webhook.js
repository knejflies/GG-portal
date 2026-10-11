const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WEBHOOK_SECRET = process.env.HELCIM_WEBHOOK_SECRET || "";
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.GREEN_GRIN_INVOICE_FROM || "Green Grin Lawns <ken@greengrinlawns.com>";

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-webhook-secret, x-helcim-webhook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
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

function clean(value, max = 240) {
  return String(value ?? "").trim().slice(0, max);
}

function first(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== "");
}

function authorized(event) {
  if (!WEBHOOK_SECRET) return true;
  const supplied = event.headers["x-webhook-secret"] || event.headers["x-helcim-webhook-secret"] || String(event.headers.authorization || "").replace(/^Bearer\s+/i, "");
  return supplied === WEBHOOK_SECRET;
}

function paymentState(payload) {
  const raw = String(first(payload.status, payload.paymentStatus, payload.result, payload.eventType, payload.type, "")).toLowerCase();
  if (/(approved|success|succeeded|paid|captured|completed)/.test(raw)) return "Paid";
  if (/(declined|failed|failure|error|cancelled|canceled)/.test(raw)) return "Failed";
  if (/(refund|chargeback)/.test(raw)) return "Refunded";
  return "Pending";
}

function paymentReference(payload) {
  return clean(first(payload.paymentId, payload.payment_id, payload.transactionId, payload.transaction_id, payload.id, payload.reference, payload.paymentReference), 160);
}

function invoiceReference(payload) {
  return clean(first(payload.invoiceId, payload.invoice_id, payload.metadata?.invoice_id, payload.customData?.invoice_id, payload.invoiceNumber, payload.invoice_number), 160);
}

async function sendReceipt(invoice) {
  if (!RESEND_API_KEY || !invoice?.email) return { sent: false, skipped: true, reason: !RESEND_API_KEY ? "Receipt email is not configured." : "Invoice has no email address." };
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json", "User-Agent": "Green-Grin-Portal/1.0" },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: [invoice.email],
      subject: `Payment received for Green Grin invoice${invoice.source_estimate_number ? ` ${invoice.source_estimate_number}` : ""}`,
      text: `Hi ${invoice.customer_name || "there"},\n\nPayment of $${Number(invoice.amount || 0).toFixed(2)} was received for your Green Grin service invoice.\n\nThank you,\nGreen Grin Lawns`,
      html: `<p>Hi ${String(invoice.customer_name || "there").replace(/[&<>]/g, "")},</p><p>Payment of <strong>$${Number(invoice.amount || 0).toFixed(2)}</strong> was received for your Green Grin service invoice.</p><p>Thank you,<br>Green Grin Lawns</p>`
    })
  });
  const data = await response.json().catch(() => ({}));
  return response.ok ? { sent: true, id: data.id || null } : { sent: false, error: data.message || "Receipt provider rejected the email." };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, {});
  if (event.httpMethod !== "POST") return json(405, { error: "POST is required." });
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return json(500, { error: "Supabase is not configured." });
  if (!authorized(event)) return json(401, { error: "Webhook authorization failed." });

  try {
    const body = JSON.parse(event.body || "{}");
    const payload = body.data && typeof body.data === "object" ? { ...body, ...body.data } : body;
    const reference = paymentReference(payload);
    const invoiceRef = invoiceReference(payload);
    const state = paymentState(payload);
    if (!reference && !invoiceRef) return json(202, { ok: true, ignored: true, reason: "No invoice or payment reference was supplied." });

    const filters = invoiceRef
      ? `id=eq.${encodeURIComponent(invoiceRef)}`
      : `provider_payment_ref=eq.${encodeURIComponent(reference)}`;
    const invoices = await supabase(`green_grin_invoices?select=*&${filters}&limit=1`);
    const invoice = invoices?.[0];
    if (!invoice) return json(202, { ok: true, ignored: true, reason: "Invoice was not found yet.", invoice_reference: invoiceRef || null, payment_reference: reference || null });
    if (invoice.status === "Paid" && (!reference || invoice.provider_payment_ref === reference)) return json(200, { ok: true, duplicate: true, invoice_id: invoice.id });

    const update = {
      provider: "Helcim",
      provider_payment_ref: reference || invoice.provider_payment_ref || null,
      charge_status: state,
      payment_reference: reference || invoice.payment_reference || null,
      ...(state === "Paid" ? { status: "Paid", payment_confirmed_at: new Date().toISOString() } : {})
    };
    const rows = await supabase(`green_grin_invoices?id=eq.${encodeURIComponent(invoice.id)}`, { method: "PATCH", body: JSON.stringify(update) });
    await supabase("green_grin_billing_audit_log", {
      method: "POST",
      body: JSON.stringify({ customer_user_id: invoice.customer_user_id || null, invoice_id: invoice.id, actor_type: "System", action: "payment_webhook", details: { state, payment_reference: reference || null, invoice_reference: invoiceRef || null } })
    }).catch(() => null);
    const updated = rows?.[0] || { ...invoice, ...update };
    const receipt = state === "Paid" ? await sendReceipt(updated) : null;
    return json(200, { ok: true, duplicate: false, state, invoice_id: invoice.id, receipt });
  } catch (error) {
    return json(500, { error: error.message || "Payment webhook failed." });
  }
};
