const crypto = require("crypto");
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WEBHOOK_VERIFIER_TOKEN = process.env.HELCIM_WEBHOOK_VERIFIER_TOKEN || process.env.HELCIM_WEBHOOK_SECRET || "";
const HELCIM_API_TOKEN = process.env.HELCIM_API_TOKEN || process.env.Green_Grin_Portal_Payments || "";
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.GREEN_GRIN_INVOICE_FROM || "Green Grin Lawns <ken@greengrinlawns.com>";

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, webhook-id, webhook-timestamp, webhook-signature",
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

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function verifyWebhook(event) {
  if (!WEBHOOK_VERIFIER_TOKEN) return false;
  const webhookId = event.headers["webhook-id"] || event.headers["Webhook-Id"];
  const timestamp = event.headers["webhook-timestamp"] || event.headers["Webhook-Timestamp"];
  const supplied = String(event.headers["webhook-signature"] || event.headers["Webhook-Signature"] || "");
  if (!webhookId || !timestamp || !supplied) return false;
  const signed = `${webhookId}.${timestamp}.${event.body || ""}`;
  const key = Buffer.from(WEBHOOK_VERIFIER_TOKEN, "base64");
  const expected = crypto.createHmac("sha256", key).update(signed).digest("base64");
  return supplied.split(/\s+/).some((entry) => safeEqual(entry.replace(/^v\d+,/, ""), expected));
}

async function helcimTransaction(id) {
  const response = await fetch(`https://api.helcim.com/v2/card-transactions/${encodeURIComponent(id)}`, {
    headers: { accept: "application/json", "api-token": HELCIM_API_TOKEN }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Could not retrieve the Helcim transaction.");
  return data;
}

function paymentState(payload) {
  const raw = String(first(payload.status, payload.paymentStatus, payload.result, payload.eventType, payload.type, "")).toLowerCase();
  if (/(approval|approved|success|succeeded|paid|captured|completed)/.test(raw)) return "Paid";
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
  if (!WEBHOOK_VERIFIER_TOKEN || !HELCIM_API_TOKEN) return json(500, { error: "Helcim webhook verification is not configured." });
  if (!verifyWebhook(event)) return json(401, { error: "Webhook signature verification failed." });

  try {
    const body = JSON.parse(event.body || "{}");
    const webhookId = event.headers["webhook-id"] || event.headers["Webhook-Id"];
    const priorEvents = await supabase(`green_grin_payment_webhook_events?select=webhook_id&webhook_id=eq.${encodeURIComponent(webhookId)}&limit=1`).catch(() => []);
    if (priorEvents?.length) return json(200, { ok: true, duplicate: true });
    await supabase("green_grin_payment_webhook_events", { method: "POST", body: JSON.stringify({ webhook_id: webhookId, event_type: body.type || null, provider_transaction_ref: body.id ? String(body.id) : null, payload: body }) });
    if (body.type !== "cardTransaction" || !body.id) {
      await supabase(`green_grin_payment_webhook_events?webhook_id=eq.${encodeURIComponent(webhookId)}`, { method: "PATCH", body: JSON.stringify({ processed_at: new Date().toISOString() }) });
      return json(200, { ok: true, ignored: true });
    }
    const transaction = await helcimTransaction(body.id);
    const payload = transaction.data && typeof transaction.data === "object" ? { ...transaction, ...transaction.data } : transaction;
    const reference = paymentReference(payload);
    const invoiceRef = invoiceReference(payload);
    const state = paymentState(payload);
    if (!reference && !invoiceRef) return json(200, { ok: true, ignored: true, reason: "No invoice or payment reference was supplied." });

    const invoiceIsUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(invoiceRef);
    let filters = invoiceRef && invoiceIsUuid
      ? `id=eq.${encodeURIComponent(invoiceRef)}`
      : invoiceRef
        ? `source_estimate_number=eq.${encodeURIComponent(invoiceRef)}`
        : `provider_payment_ref=eq.${encodeURIComponent(reference)}`;
    if (!invoiceRef && reference) {
      const attempts = await supabase(`green_grin_payment_attempts?select=invoice_id&provider_transaction_ref=eq.${encodeURIComponent(reference)}&limit=1`).catch(() => []);
      if (attempts?.[0]?.invoice_id) filters = `id=eq.${encodeURIComponent(attempts[0].invoice_id)}`;
    }
    const invoices = await supabase(`green_grin_invoices?select=*&${filters}&limit=1`);
    const invoice = invoices?.[0];
    if (!invoice) {
      await supabase(`green_grin_payment_webhook_events?webhook_id=eq.${encodeURIComponent(webhookId)}`, { method: "PATCH", body: JSON.stringify({ processed_at: new Date().toISOString() }) });
      return json(200, { ok: true, ignored: true, reason: "Invoice was not found.", invoice_reference: invoiceRef || null, payment_reference: reference || null });
    }
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
    const receipt = state === "Paid" && !invoice.receipt_sent_at ? await sendReceipt(updated) : null;
    if (receipt?.sent) await supabase(`green_grin_invoices?id=eq.${encodeURIComponent(invoice.id)}`, { method: "PATCH", body: JSON.stringify({ receipt_sent_at: new Date().toISOString(), receipt_email_id: receipt.id || null }) });
    await supabase(`green_grin_payment_webhook_events?webhook_id=eq.${encodeURIComponent(webhookId)}`, { method: "PATCH", body: JSON.stringify({ processed_at: new Date().toISOString() }) });
    return json(200, { ok: true, duplicate: false, state, invoice_id: invoice.id, receipt });
  } catch (error) {
    return json(500, { error: error.message || "Payment webhook failed." });
  }
};

exports._test = { verifyWebhook, paymentState, paymentReference, invoiceReference };
