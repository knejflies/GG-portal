const crypto = require("crypto");
const { requireAccounting } = require("./accounting-auth");
const { isAdminRequest } = require("./portal-auth");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_PIN = process.env.GREEN_GRIN_ADMIN_PIN;
const HELCIM_API_TOKEN = process.env.HELCIM_API_TOKEN || process.env.Green_Grin_Portal_Payments || "";
const HELCIM_API_URL = "https://api.helcim.com/v2";
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const RECEIPT_FROM = process.env.GREEN_GRIN_INVOICE_FROM || "Green Grin Lawns <ken@greengrinlawns.com>";
const PORTAL_URL = process.env.GREEN_GRIN_PORTAL_URL || "https://portal.greengrinlawns.com/portal/";
const EMAIL_LOGO_URL = process.env.GREEN_GRIN_EMAIL_LOGO_URL || "https://portal.greengrinlawns.com/assets/green-grin-logo.png";
const OWNER_EMAIL = process.env.GREEN_GRIN_ADMIN_EMAIL || "ken@greengrinlawns.com";

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-admin-pin",
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
  if (!response.ok) throw new Error(data?.message || "Payment storage request failed.");
  return data;
}

async function verifyUser(event) {
  const token = String(event.headers.authorization || event.headers.Authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Please sign in again.");
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` }
  });
  const user = await response.json().catch(() => null);
  if (!response.ok || !user?.id) throw new Error("Your sign-in expired. Please sign in again.");
  return user;
}

async function helcim(path, options = {}) {
  const response = await fetch(`${HELCIM_API_URL}${path}`, {
    ...options,
    headers: {
      accept: "application/json",
      "api-token": HELCIM_API_TOKEN,
      "content-type": "application/json",
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data?.errors ? JSON.stringify(data.errors) : data?.message;
    throw new Error(detail || `Payment provider returned ${response.status}.`);
  }
  return data;
}

function setupError() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) return "Supabase is not configured.";
  if (!HELCIM_API_TOKEN) return "Helcim is not configured. Add HELCIM_API_TOKEN in Netlify (the existing Green_Grin_Portal_Payments variable is also supported).";
  return null;
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function validateCheckoutResponse(rawData, returnedHash, secretToken) {
  const serialized = typeof rawData === "string" ? rawData : JSON.stringify(rawData || {});
  const expected = crypto.createHash("sha256").update(serialized + secretToken).digest("hex");
  return safeEqual(expected.toLowerCase(), String(returnedHash || "").toLowerCase());
}

function maskedCardNumber(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.slice(-4);
}

function safeTransactionRecord(transaction = {}) {
  const { cardToken, cardNumber, cardHolderName, ...safe } = transaction || {};
  return safe;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

async function sendReceiptOnce(invoice) {
  if (!invoice?.id || !invoice.email || !RESEND_API_KEY) return { sent: false, skipped: true, reason: !invoice?.email ? "Customer has no email address." : "Receipt email is not configured." };
  const currentRows = await supabase(`green_grin_invoices?select=id,receipt_sent_at&id=eq.${encodeURIComponent(invoice.id)}&limit=1`).catch(() => []);
  if (currentRows?.[0]?.receipt_sent_at) return { sent: false, skipped: true, duplicate: true, reason: "Receipt was already sent." };
  const amount = `$${Number(invoice.amount || 0).toFixed(2)}`;
  const customer = invoice.customer_name || "there";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json", "User-Agent": "Green-Grin-Portal/1.0" },
    body: JSON.stringify({
      from: RECEIPT_FROM,
      to: [invoice.email],
      subject: `Green Grin payment receipt - ${amount}`,
      text: `Hi ${customer},\n\nYour ${amount} card payment was approved and your Green Grin invoice is paid.\n\nView your account: ${PORTAL_URL}\n\nThank you,\nGreen Grin Lawns`,
      html: `<div style="max-width:640px;margin:auto;font-family:Arial,sans-serif;color:#102419"><div style="text-align:center;padding:20px"><img src="${escapeHtml(EMAIL_LOGO_URL)}" alt="Green Grin Lawns" style="max-width:360px;width:100%;height:auto"></div><div style="border:1px solid #d5e2d2;border-top:4px solid #78c653;padding:28px"><p>Hi ${escapeHtml(customer)},</p><h1 style="color:#07351d">Payment received</h1><p>Your card payment of <strong>${escapeHtml(amount)}</strong> was approved. This invoice is paid.</p><p><a href="${escapeHtml(PORTAL_URL)}" style="display:inline-block;background:#78c653;color:#092114;text-decoration:none;font-weight:bold;padding:13px 20px;border-radius:6px">View your account</a></p><p>Thank you,<br>Green Grin Lawns</p></div></div>`
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { sent: false, error: data.message || "Receipt provider rejected the email." };
  await supabase(`green_grin_invoices?id=eq.${encodeURIComponent(invoice.id)}`, { method: "PATCH", body: JSON.stringify({ receipt_sent_at: new Date().toISOString(), receipt_email_id: data.id || null }) });
  return { sent: true, id: data.id || null };
}

async function sendPaymentFailureNotice(invoice, reason) {
  if (!RESEND_API_KEY) return { sent: false, skipped: true };
  const amount = `$${Number(invoice.amount || 0).toFixed(2)}`;
  const recipients = [invoice.email, OWNER_EMAIL].filter(Boolean);
  const results = [];
  for (const recipient of [...new Set(recipients)]) {
    const customerCopy = recipient.toLowerCase() === String(invoice.email || "").toLowerCase();
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json", "User-Agent": "Green-Grin-Portal/1.0" },
      body: JSON.stringify({
        from: RECEIPT_FROM,
        to: [recipient],
        subject: customerCopy ? "Green Grin payment needs attention" : `Green Grin automatic payment failed - ${invoice.customer_name || "Customer"}`,
        text: customerCopy
          ? `Hi ${invoice.customer_name || "there"},\n\nWe could not complete the ${amount} payment for your Green Grin invoice. No successful payment was recorded. Please sign in to review or replace your payment method.\n\n${PORTAL_URL}\n\nGreen Grin Lawns`
          : `The ${amount} automatic payment for ${invoice.customer_name || "Customer"} did not complete. Invoice: ${invoice.id}. Reason: ${reason || "Payment declined."}`
      })
    });
    const data = await response.json().catch(() => ({}));
    results.push({ recipient, sent: response.ok, id: data.id || null, error: response.ok ? null : data.message || "Email failed." });
  }
  return { sent: results.some((item) => item.sent), results };
}

function cleanConsent(body) {
  const mode = body.billing_mode === "Automatic" ? "Automatic" : "Review first";
  const services = Array.isArray(body.authorized_services)
    ? [...new Set(body.authorized_services.map((value) => String(value).trim()).filter(Boolean))].slice(0, 20)
    : ["Mowing"];
  if (!body.consent) throw new Error("Check the authorization box before connecting a payment method.");
  if (!services.length) throw new Error("Choose at least one authorized service.");
  return {
    billing_mode: mode,
    authorized_services: services,
    max_cycle_charge: body.max_cycle_charge === "" || body.max_cycle_charge == null ? null : Math.max(0, Number(body.max_cycle_charge) || 0),
    max_extra_price: body.max_extra_price === "" || body.max_extra_price == null ? null : Math.max(0, Number(body.max_extra_price) || 0),
    advance_notice_days: Math.min(30, Math.max(0, Math.round(Number(body.advance_notice_days) || 0))),
    authorization_version: "helcim-card-v1",
    accepted_text: "I authorize Green Grin Lawns to charge the saved payment method for the selected services under the limits shown. I may revoke authorization before a future charge."
  };
}

function authorizationDecision(authorization, invoice) {
  const items = Array.isArray(invoice?.line_items) ? invoice.line_items : [];
  const allowed = new Set((authorization?.authorized_services || []).map((value) => String(value).toLowerCase()));
  const outside = items.find((item) => allowed.size && !allowed.has(String(item.category || "Service").toLowerCase()));
  const extras = items.filter((item) => String(item.category || "").toLowerCase() !== "mowing");
  const overExtra = extras.find((item) => authorization?.max_extra_price != null && Number(item.amount ?? (Number(item.quantity || 0) * Number(item.rate || 0))) > Number(authorization.max_extra_price));
  const overCycle = authorization?.max_cycle_charge != null && Number(invoice?.amount || 0) > Number(authorization.max_cycle_charge);
  return {
    approved: !outside && !overExtra && !overCycle,
    reason: outside ? `${outside.category || "A service"} is outside the customer authorization.` : overExtra ? "An added service exceeds the authorized limit." : overCycle ? "The invoice exceeds the authorized billing-cycle limit." : null
  };
}

async function customerPaymentState(user) {
  const [properties, methods, authorizations] = await Promise.all([
    supabase(`green_grin_properties?select=*&customer_user_id=eq.${encodeURIComponent(user.id)}&active=eq.true&order=created_at.asc&limit=1`),
    supabase(`green_grin_payment_methods?select=id,property_id,provider,brand,last_four,expiry_month,expiry_year,status,verified_at&customer_user_id=eq.${encodeURIComponent(user.id)}&status=eq.Active&order=verified_at.desc&limit=5`).catch(() => []),
    supabase(`green_grin_billing_authorizations?select=*&customer_user_id=eq.${encodeURIComponent(user.id)}&status=neq.Revoked&order=created_at.desc&limit=5`).catch(() => [])
  ]);
  return { property: properties?.[0] || null, payment_method: methods?.[0] || null, authorization: authorizations?.[0] || null };
}

async function initializeAutopay(user, body) {
  const state = await customerPaymentState(user);
  if (!state.property?.id) throw new Error("Add your service property before connecting AutoPay.");
  const consent = cleanConsent(body);
  const existing = state.authorization;
  const request = {
    paymentType: "verify",
    amount: 0,
    currency: "USD",
    paymentMethod: "cc",
    language: "en",
    ...(existing?.provider_customer_ref ? { customerCode: existing.provider_customer_ref } : { displayContactFields: 1 })
  };
  const checkout = await helcim("/helcim-pay/initialize", { method: "POST", body: JSON.stringify(request) });
  if (!checkout.checkoutToken || !checkout.secretToken) throw new Error("Helcim did not return a checkout session.");
  const now = Date.now();
  await supabase("green_grin_payment_setup_sessions", {
    method: "POST",
    body: JSON.stringify({
      checkout_token: checkout.checkoutToken,
      secret_token: checkout.secretToken,
      customer_user_id: user.id,
      property_id: state.property.id,
      consent,
      expires_at: new Date(now + 60 * 60 * 1000).toISOString()
    })
  });
  return { checkout_token: checkout.checkoutToken, expires_at: new Date(now + 60 * 60 * 1000).toISOString() };
}

async function confirmAutopay(user, body) {
  const checkoutToken = String(body.checkout_token || "");
  const rows = await supabase(`green_grin_payment_setup_sessions?select=*&checkout_token=eq.${encodeURIComponent(checkoutToken)}&customer_user_id=eq.${encodeURIComponent(user.id)}&limit=1`);
  const session = rows?.[0];
  if (!session) throw new Error("Payment setup session was not found.");
  if (session.completed_at) return customerPaymentState(user);
  if (new Date(session.expires_at).getTime() < Date.now()) throw new Error("Payment setup expired. Start it again.");
  const message = typeof body.response === "string" ? JSON.parse(body.response) : body.response;
  const rawData = message?.rawDataResponse ?? message?.data;
  const returnedHash = message?.hash;
  if (!validateCheckoutResponse(rawData, returnedHash, session.secret_token)) throw new Error("Helcim response validation failed.");
  const transaction = typeof rawData === "string" ? JSON.parse(rawData) : rawData;
  if (!/^approv(?:ed|al)$/i.test(String(transaction?.status || transaction?.statusAuth || ""))) throw new Error("Helcim did not approve the payment-method verification.");
  if (!transaction?.cardToken) throw new Error("Helcim did not return a reusable card token.");

  await supabase(`green_grin_payment_methods?customer_user_id=eq.${encodeURIComponent(user.id)}&property_id=eq.${encodeURIComponent(session.property_id)}&status=eq.Active`, {
    method: "PATCH", body: JSON.stringify({ status: "Replaced", updated_at: new Date().toISOString() })
  }).catch(() => null);
  const methodRows = await supabase("green_grin_payment_methods", {
    method: "POST",
    body: JSON.stringify({
      customer_user_id: user.id,
      property_id: session.property_id,
      provider: "Helcim",
      provider_customer_ref: transaction.customerCode || null,
      provider_method_ref: transaction.cardToken,
      brand: transaction.cardType || "Card",
      last_four: maskedCardNumber(transaction.cardNumber),
      expiry_month: transaction.cardExpiry ? Number(String(transaction.cardExpiry).slice(0, 2)) || null : null,
      expiry_year: transaction.cardExpiry ? Number(String(transaction.cardExpiry).slice(-2)) || null : null,
      status: "Active",
      verified_at: new Date().toISOString()
    })
  });
  const method = methodRows?.[0];
  const consent = session.consent || {};
  const authorizationPayload = {
    customer_user_id: user.id,
    property_id: session.property_id,
    billing_mode: consent.billing_mode || "Review first",
    authorized_services: consent.authorized_services || ["Mowing"],
    max_cycle_charge: consent.max_cycle_charge ?? null,
    max_extra_price: consent.max_extra_price ?? null,
    advance_notice_days: consent.advance_notice_days || 0,
    provider: "helcim",
    provider_customer_ref: transaction.customerCode || null,
    payment_method_ref: method?.id || null,
    authorization_version: consent.authorization_version || "helcim-card-v1",
    authorized_at: new Date().toISOString(),
    revoked_at: null,
    status: "Active",
    consent_snapshot: consent,
    updated_at: new Date().toISOString()
  };
  const authRows = await supabase(`green_grin_billing_authorizations?select=id&property_id=eq.${encodeURIComponent(session.property_id)}&status=neq.Revoked&limit=1`);
  if (authRows?.[0]) {
    await supabase(`green_grin_billing_authorizations?id=eq.${encodeURIComponent(authRows[0].id)}`, { method: "PATCH", body: JSON.stringify(authorizationPayload) });
  } else {
    await supabase("green_grin_billing_authorizations", { method: "POST", body: JSON.stringify(authorizationPayload) });
  }
  await supabase(`green_grin_payment_setup_sessions?checkout_token=eq.${encodeURIComponent(checkoutToken)}`, { method: "PATCH", body: JSON.stringify({ completed_at: new Date().toISOString() }) });
  await supabase("green_grin_billing_audit_log", { method: "POST", body: JSON.stringify({ customer_user_id: user.id, property_id: session.property_id, actor_type: "Customer", action: "payment_method.authorized", details: { provider: "Helcim", brand: method?.brand, last_four: method?.last_four, authorization_version: authorizationPayload.authorization_version } }) });
  return customerPaymentState(user);
}

async function revokeAutopay(user) {
  const state = await customerPaymentState(user);
  if (!state.property?.id) throw new Error("No service property was found.");
  const now = new Date().toISOString();
  await Promise.all([
    supabase(`green_grin_billing_authorizations?customer_user_id=eq.${encodeURIComponent(user.id)}&property_id=eq.${encodeURIComponent(state.property.id)}&status=neq.Revoked`, { method: "PATCH", body: JSON.stringify({ status: "Revoked", revoked_at: now, updated_at: now }) }),
    supabase(`green_grin_payment_methods?customer_user_id=eq.${encodeURIComponent(user.id)}&property_id=eq.${encodeURIComponent(state.property.id)}&status=eq.Active`, { method: "PATCH", body: JSON.stringify({ status: "Revoked", updated_at: now }) })
  ]);
  await supabase("green_grin_billing_audit_log", { method: "POST", body: JSON.stringify({ customer_user_id: user.id, property_id: state.property.id, actor_type: "Customer", action: "payment_method.revoked", details: { provider: "Helcim" } }) });
  return customerPaymentState(user);
}

async function chargeInvoice(event, body, options = {}) {
  if (!options.system) {
    await requireAccounting(event, supabase);
    if (!isAdminRequest(event)) throw new Error("Wrong admin PIN.");
  }
  const invoiceRows = await supabase(`green_grin_invoices?select=*&id=eq.${encodeURIComponent(body.invoice_id || "")}&active=eq.true&limit=1`);
  const invoice = invoiceRows?.[0];
  if (!invoice) throw new Error("Invoice was not found.");
  if (String(invoice.status).toLowerCase() === "paid") return { duplicate: true, invoice };
  const authRows = await supabase(`green_grin_billing_authorizations?select=*&property_id=eq.${encodeURIComponent(invoice.property_id || "")}&status=eq.Active&limit=1`);
  const authorization = authRows?.[0];
  if (!authorization) throw new Error("This property does not have active payment authorization.");
  const decision = authorizationDecision(authorization, invoice);
  if (!decision.approved) throw new Error(decision.reason);
  const methodRows = await supabase(`green_grin_payment_methods?select=*&id=eq.${encodeURIComponent(authorization.payment_method_ref || "")}&status=eq.Active&limit=1`);
  const method = methodRows?.[0];
  if (!method?.provider_method_ref) throw new Error("The saved payment method is unavailable.");
  const existing = await supabase(`green_grin_payment_attempts?select=*&invoice_id=eq.${encodeURIComponent(invoice.id)}&state=in.(Processing,Approved)&order=created_at.desc&limit=1`);
  if (existing?.[0]) return { duplicate: true, attempt: existing[0], invoice };
  const attemptRows = await supabase(`green_grin_payment_attempts?select=attempt_number&invoice_id=eq.${encodeURIComponent(invoice.id)}&order=attempt_number.desc&limit=1`);
  const attemptNumber = Number(attemptRows?.[0]?.attempt_number || 0) + 1;
  const idempotencyKey = crypto.randomUUID();
  const created = await supabase("green_grin_payment_attempts", { method: "POST", body: JSON.stringify({ invoice_id: invoice.id, property_id: invoice.property_id, authorization_id: authorization.id, payment_method_id: method.id, attempt_number: attemptNumber, idempotency_key: idempotencyKey, amount: Number(invoice.amount || 0), state: "Processing" }) });
  const attempt = created?.[0];
  try {
    const transaction = await helcim("/payment/purchase", {
      method: "POST",
      headers: { "idempotency-key": idempotencyKey },
      body: JSON.stringify({ ipAddress: String(event.headers["x-nf-client-connection-ip"] || "127.0.0.1"), ecommerce: true, currency: "USD", amount: Number(invoice.amount || 0), customerCode: method.provider_customer_ref || undefined, cardData: { cardToken: method.provider_method_ref } })
    });
    const approved = /^approved$/i.test(String(transaction.status || ""));
    const state = approved ? "Approved" : "Failed";
    await supabase(`green_grin_payment_attempts?id=eq.${encodeURIComponent(attempt.id)}`, { method: "PATCH", body: JSON.stringify({ state, provider_transaction_ref: String(transaction.transactionId || ""), provider_response: safeTransactionRecord(transaction), completed_at: new Date().toISOString(), error_message: approved ? null : String(transaction.errors || "Payment was declined.") }) });
    const update = approved
      ? { status: "Paid", charge_status: "Paid", provider: "Helcim", provider_payment_ref: String(transaction.transactionId || ""), payment_method: "Helcim card", payment_reference: String(transaction.transactionId || ""), payment_confirmed_at: new Date().toISOString() }
      : { charge_status: "Failed", provider: "Helcim", provider_payment_ref: String(transaction.transactionId || "") };
    const updated = await supabase(`green_grin_invoices?id=eq.${encodeURIComponent(invoice.id)}`, { method: "PATCH", body: JSON.stringify(update) });
    await supabase("green_grin_billing_audit_log", { method: "POST", body: JSON.stringify({ customer_user_id: invoice.customer_user_id, property_id: invoice.property_id, invoice_id: invoice.id, actor_type: "Owner", action: approved ? "payment.approved" : "payment.failed", details: { attempt_id: attempt.id, transaction_id: transaction.transactionId || null, amount: invoice.amount } }) });
    const paidInvoice = updated?.[0] || { ...invoice, ...update };
    const receipt = approved ? await sendReceiptOnce(paidInvoice).catch((error) => ({ sent: false, error: error.message || "Receipt email failed." })) : null;
    const failure_notice = !approved ? await sendPaymentFailureNotice(paidInvoice, transaction.errors).catch((error) => ({ sent: false, error: error.message })) : null;
    return { duplicate: false, approved, invoice: paidInvoice, transaction_id: transaction.transactionId || null, receipt, failure_notice, error: approved ? null : transaction.errors || "Payment was declined." };
  } catch (error) {
    await supabase(`green_grin_payment_attempts?id=eq.${encodeURIComponent(attempt.id)}`, { method: "PATCH", body: JSON.stringify({ state: "Failed", completed_at: new Date().toISOString(), error_message: String(error.message || error).slice(0, 1000) }) }).catch(() => null);
    await supabase(`green_grin_invoices?id=eq.${encodeURIComponent(invoice.id)}`, { method: "PATCH", body: JSON.stringify({ charge_status: "Failed", provider: "Helcim" }) }).catch(() => null);
    throw error;
  }
}

async function runAutomaticPayments(now = new Date()) {
  const error = setupError();
  if (error) throw new Error(error);
  const today = now.toISOString().slice(0, 10);
  const authorizations = await supabase("green_grin_billing_authorizations?select=property_id,advance_notice_days&status=eq.Active&billing_mode=eq.Automatic&limit=500");
  const authorizationByProperty = new Map((authorizations || []).map((row) => [row.property_id, row]));
  if (!authorizationByProperty.size) return { checked: 0, charged: 0, failed: 0, skipped: 0, results: [] };
  const invoices = await supabase(`green_grin_invoices?select=*&active=eq.true&status=eq.Sent&due_date=lte.${encodeURIComponent(today)}&order=due_date.asc&limit=500`);
  const due = (invoices || []).filter((invoice) => authorizationByProperty.has(invoice.property_id));
  const results = [];
  for (const invoice of due) {
    const authorization = authorizationByProperty.get(invoice.property_id);
    const noticeDays = Number(authorization.advance_notice_days || 0);
    const sentAt = invoice.sent_at ? new Date(invoice.sent_at) : new Date(invoice.created_at);
    const eligibleAt = new Date(sentAt.getTime() + noticeDays * 86400000);
    if (eligibleAt > now) {
      results.push({ invoice_id: invoice.id, status: "Skipped", reason: `Advance notice ends ${eligibleAt.toISOString()}.` });
      continue;
    }
    try {
      const result = await chargeInvoice({ headers: { "x-nf-client-connection-ip": "127.0.0.1" } }, { invoice_id: invoice.id }, { system: true });
      results.push({ invoice_id: invoice.id, status: result.approved || result.duplicate ? "Paid" : "Failed", transaction_id: result.transaction_id || null, error: result.error || null });
    } catch (error) {
      results.push({ invoice_id: invoice.id, status: "Failed", error: error.message || "Automatic payment failed." });
    }
  }
  return {
    checked: due.length,
    charged: results.filter((row) => row.status === "Paid").length,
    failed: results.filter((row) => row.status === "Failed").length,
    skipped: results.filter((row) => row.status === "Skipped").length,
    results
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, {});
  const error = setupError();
  if (error) return json(500, { error });
  try {
    const body = event.httpMethod === "POST" ? JSON.parse(event.body || "{}") : {};
    if (body.action === "charge-invoice") return json(200, await chargeInvoice(event, body));
    const user = await verifyUser(event);
    if (event.httpMethod === "GET") return json(200, await customerPaymentState(user));
    if (event.httpMethod === "POST" && body.action === "initialize-autopay") return json(200, await initializeAutopay(user, body));
    if (event.httpMethod === "POST" && body.action === "confirm-autopay") return json(200, await confirmAutopay(user, body));
    if (event.httpMethod === "POST" && body.action === "revoke-autopay") return json(200, await revokeAutopay(user));
    return json(405, { error: "Method not allowed." });
  } catch (error) {
    const statusCode = /sign in|expired/i.test(error.message) ? 401 : /Wrong admin PIN/i.test(error.message) ? 403 : 400;
    return json(statusCode, { error: error.message || "Payment setup failed." });
  }
};

exports._test = { validateCheckoutResponse, maskedCardNumber, safeTransactionRecord, cleanConsent, authorizationDecision, escapeHtml };
exports._internal = { runAutomaticPayments, chargeInvoice };
