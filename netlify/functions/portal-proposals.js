const crypto = require("crypto");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_PIN = process.env.GREEN_GRIN_ADMIN_PIN;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.GREEN_GRIN_INVOICE_FROM || "Green Grin Lawn & Landscape <ken@greengrinlawns.com>";
const OWNER_EMAIL = process.env.GREEN_GRIN_OWNER_EMAIL || "ken@greengrinlawns.com";
const PROPOSAL_URL = process.env.GREEN_GRIN_PROPOSAL_URL || "https://portal.greengrinlawns.com/proposal/";
const { groupedTotals } = require("../../assets/green-grin-project-estimator.js");

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, x-admin-pin",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};

function json(statusCode, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

function hash(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function money(value) {
  return `$${Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function customerGroupedTotals(estimate = {}) {
  const lines = Array.isArray(estimate.line_items) ? estimate.line_items : [];
  if (!lines.length) return estimate.grouped_totals || {};
  const groups = groupedTotals(lines.map((item) => ({
    ...item,
    amount: Number(item.amount ?? (Number(item.quantity || 0) * Number(item.rate || 0)))
  })));
  const groupedSubtotal = Math.round(Object.values(groups).reduce((sum, amount) => sum + Number(amount || 0), 0) * 100) / 100;
  const subtotal = Math.round(Number(estimate.subtotal || 0) * 100) / 100;
  if (Math.abs(groupedSubtotal - subtotal) > 0.01) throw new Error("This proposal's project groups do not match its subtotal. Open and save the estimate again before sending it.");
  return groups;
}

function proposalPriceDisplay(estimate = {}) {
  const mode = estimate.price_display || estimate.calculation_inputs?.proposal_price_display;
  return mode === "grouped" ? "grouped" : "total_only";
}

function customerVisibleGroups(estimate = {}) {
  const groups = customerGroupedTotals(estimate);
  return proposalPriceDisplay(estimate) === "grouped" ? groups : {};
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

async function sendEmail(to, subject, html) {
  if (!RESEND_API_KEY) throw new Error("Proposal email is not configured. Add RESEND_API_KEY in Netlify.");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: EMAIL_FROM, to: [to], subject, html })
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message || "The proposal email could not be sent.");
  return data;
}

function publicEstimate(estimate) {
  return {
    id: estimate.id,
    estimate_number: estimate.estimate_number,
    customer_name: estimate.customer_name,
    email_hint: String(estimate.email || "").replace(/^(.{1,2}).*(@.*)$/, "$1***$2"),
    project_title: estimate.project_title,
    service_address: estimate.service_address,
    project_scope: estimate.project_scope,
    customer_notes: estimate.customer_notes,
    valid_until: estimate.valid_until,
    price_display: proposalPriceDisplay(estimate),
    grouped_totals: customerVisibleGroups(estimate),
    subtotal: Number(estimate.subtotal || 0),
    discount: Number(estimate.discount || 0),
    tax_amount: Number(estimate.tax_amount || 0),
    total: Number(estimate.total || 0),
    deposit_amount: Number(estimate.deposit_amount || 0),
    status: estimate.status,
    approved_at: estimate.approved_at,
    approved_by: estimate.approved_by
  };
}

async function estimateForToken(token) {
  if (!token || token.length < 24) return null;
  const rows = await supabase(`green_grin_estimates?select=*&proposal_token_hash=eq.${encodeURIComponent(hash(token))}&limit=1`);
  return rows?.[0] || null;
}

function proposalEmail(estimate, link) {
  const rows = Object.entries(customerVisibleGroups(estimate)).map(([label, amount]) => `<tr><td style="padding:10px;border-bottom:1px solid #d7e4d4">${escapeHtml(label)}</td><td style="padding:10px;border-bottom:1px solid #d7e4d4;text-align:right;font-weight:700">${money(amount)}</td></tr>`).join("");
  const groups = rows ? `<table style="width:100%;border-collapse:collapse">${rows}</table>` : "";
  return `<div style="font-family:Arial,sans-serif;max-width:650px;margin:auto;color:#102419"><h1 style="color:#07351d">Green Grin Lawn &amp; Landscape</h1><p>Hello ${escapeHtml(estimate.customer_name)},</p><p>Your proposal for <strong>${escapeHtml(estimate.project_title)}</strong> is ready.</p>${groups}<p style="font-size:22px;font-weight:800;text-align:right">Project total: ${money(estimate.total)}</p><p style="text-align:center;margin:30px 0"><a href="${escapeHtml(link)}" style="display:inline-block;padding:14px 22px;background:#78c653;color:#071b0f;text-decoration:none;border-radius:6px;font-weight:800">Review &amp; Approve Proposal</a></p><p style="color:#5c6e62">The secure link expires with the proposal. Extra work requires an approved change order.</p></div>`;
}

function documentSnapshot(estimate) {
  return {
    estimate_number: estimate.estimate_number,
    customer_name: estimate.customer_name,
    project_title: estimate.project_title,
    service_address: estimate.service_address,
    project_scope: estimate.project_scope,
    price_display: proposalPriceDisplay(estimate),
    grouped_totals: customerVisibleGroups(estimate),
    subtotal: Number(estimate.subtotal || 0),
    discount: Number(estimate.discount || 0),
    tax_amount: Number(estimate.tax_amount || 0),
    total: Number(estimate.total || 0),
    deposit_amount: Number(estimate.deposit_amount || 0),
    valid_until: estimate.valid_until,
    customer_notes: estimate.customer_notes,
    payment_terms: Number(estimate.total || 0) > 5000
      ? "Materials and reserved equipment due before ordering; half of remaining balance at midpoint; final balance at completion."
      : "Materials and reserved equipment due before ordering; remaining balance due at completion.",
    change_order_terms: "Additional work requires an approved change order."
  };
}

function signedProposalEmail(estimate, snapshot, signature) {
  const rows = Object.entries(snapshot.grouped_totals || {}).map(([label, amount]) => `<tr><td style="padding:10px;border-bottom:1px solid #d7e4d4">${escapeHtml(label)}</td><td style="padding:10px;border-bottom:1px solid #d7e4d4;text-align:right;font-weight:700">${money(amount)}</td></tr>`).join("");
  const groups = rows ? `<table style="width:100%;border-collapse:collapse;margin:18px 0">${rows}</table>` : "";
  const signatureImage = signature.signature_type === "drawn" && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(signature.signature_data || "")
    ? `<img src="${signature.signature_data}" alt="Customer signature" style="display:block;max-width:420px;max-height:130px;margin:12px 0;border-bottom:1px solid #7a8a7d" />`
    : `<p style="font-size:24px;font-style:italic;margin:12px 0">${escapeHtml(signature.signer_name)}</p>`;
  return `<div style="font-family:Arial,sans-serif;max-width:700px;margin:auto;color:#102419"><h1 style="color:#07351d">Signed Green Grin Proposal</h1><p><strong>${escapeHtml(snapshot.estimate_number)}</strong> was approved by ${escapeHtml(signature.signer_name)} on ${escapeHtml(new Date(signature.signed_at).toLocaleString("en-US"))}.</p><hr style="border:0;border-top:3px solid #78c653"><h2>${escapeHtml(snapshot.project_title)}</h2><p><strong>Customer:</strong> ${escapeHtml(snapshot.customer_name)}</p><p><strong>Project address:</strong> ${escapeHtml(snapshot.service_address || "")}</p><h3>Scope of work</h3><div style="white-space:pre-wrap;padding:15px;background:#f2f8ef;border-left:4px solid #78c653">${escapeHtml(snapshot.project_scope || "")}</div>${groups}<p style="font-size:24px;font-weight:800;text-align:right">Project total: ${money(snapshot.total)}</p><div style="padding:15px;border:1px solid #cad8c9"><strong>Payment terms</strong><p>${escapeHtml(snapshot.payment_terms)}</p><p>${escapeHtml(snapshot.change_order_terms)}</p></div>${snapshot.customer_notes ? `<p style="white-space:pre-wrap"><strong>Project notes</strong><br>${escapeHtml(snapshot.customer_notes)}</p>` : ""}<h3>Customer acceptance</h3>${signatureImage}<p>${escapeHtml(signature.consent_text)}</p><p style="font-size:12px;color:#5c6e62">Signed by ${escapeHtml(signature.signer_name)} (${escapeHtml(signature.signer_email || "No email")})<br>Document reference: ${escapeHtml(signature.document_hash)}</p></div>`;
}

function dateOffset(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

async function createProjectAndDeposit(estimate) {
  let jobId = estimate.project_job_id || null;
  let invoiceId = estimate.deposit_invoice_id || null;
  if (!jobId) {
    const jobs = await supabase("green_grin_jobs", {
      method: "POST",
      body: JSON.stringify({
        customer_code: estimate.customer_code || "",
        customer_user_id: estimate.customer_user_id || null,
        customer_name: estimate.customer_name,
        phone: estimate.phone || "",
        email: estimate.email || "",
        address: estimate.service_address || "",
        service_type: estimate.project_title || "Landscape project",
        status: "Awaiting Deposit",
        notes: `Approved proposal ${estimate.estimate_number}. ${estimate.project_scope || ""}`.slice(0, 8000)
      })
    });
    jobId = jobs?.[0]?.id || null;
  }
  if (!invoiceId && Number(estimate.deposit_amount || 0) > 0) {
    const amount = Number(estimate.deposit_amount || 0);
    const invoices = await supabase("green_grin_invoices", {
      method: "POST",
      body: JSON.stringify({
        customer_user_id: estimate.customer_user_id || null,
        customer_code: estimate.customer_code || "",
        customer_name: estimate.customer_name,
        phone: estimate.phone || "",
        email: estimate.email || "",
        amount,
        subtotal: amount,
        discount: 0,
        tax_rate: 0,
        tax_amount: 0,
        line_items: [{ description: `${estimate.project_title} material and equipment deposit`, category: "Material", quantity: 1, unit: "deposit", rate: amount, amount }],
        due_date: dateOffset(7),
        status: "Sent",
        service_line: `${estimate.project_title} deposit`,
        service_address: estimate.service_address || "",
        project_scope: estimate.project_scope || "",
        notes: `Deposit created from approved proposal ${estimate.estimate_number}. Work is scheduled after the deposit is received.`,
        source_estimate_id: estimate.id,
        source_estimate_number: estimate.estimate_number,
        active: true
      })
    });
    invoiceId = invoices?.[0]?.id || null;
  }
  return { jobId, invoiceId };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, {});
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return json(500, { error: "Supabase is not configured." });
  try {
    if (event.httpMethod === "GET") {
      const token = new URLSearchParams(event.rawQuery || "").get("token") || "";
      const estimate = await estimateForToken(token);
      if (!estimate) return json(404, { error: "This proposal link is invalid or has been replaced." });
      if (estimate.proposal_expires_at && new Date(estimate.proposal_expires_at) < new Date() && !estimate.approved_at) return json(410, { error: "This proposal has expired. Contact Green Grin for an updated copy." });
      return json(200, { estimate: publicEstimate(estimate) });
    }

    if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed." });
    const body = JSON.parse(event.body || "{}");

    if (body.action === "test-email") {
      if (!ADMIN_PIN || event.headers["x-admin-pin"] !== ADMIN_PIN) return json(401, { error: "Owner sign-in is required." });
      const delivery = await sendEmail(
        OWNER_EMAIL,
        "Green Grin email test",
        `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#102419"><h1 style="color:#07351d">Green Grin email is connected</h1><p>This test was sent from the live Green Grin portal through Resend.</p><p><strong>Sender:</strong> ${escapeHtml(EMAIL_FROM)}</p><p><strong>Delivered to:</strong> ${escapeHtml(OWNER_EMAIL)}</p><p style="color:#5c6e62">Tested ${escapeHtml(new Date().toLocaleString("en-US"))}</p></div>`
      );
      return json(200, { ok: true, id: delivery?.id || null, from: EMAIL_FROM, to: OWNER_EMAIL, message: `Test email accepted by Resend for ${OWNER_EMAIL}. Check Inbox and Spam.` });
    }

    if (body.action === "send") {
      if (!ADMIN_PIN || event.headers["x-admin-pin"] !== ADMIN_PIN) return json(401, { error: "Owner sign-in is required." });
      const rows = await supabase(`green_grin_estimates?select=*&id=eq.${encodeURIComponent(body.estimate_id || "")}&limit=1`);
      const estimate = rows?.[0];
      if (!estimate) return json(404, { error: "Estimate not found." });
      if (!estimate.email) return json(400, { error: "Add the customer's email before sending the proposal." });
      const token = crypto.randomBytes(32).toString("base64url");
      const expiry = estimate.valid_until ? new Date(`${estimate.valid_until}T23:59:59`).toISOString() : new Date(Date.now() + 30 * 86400000).toISOString();
      const link = `${PROPOSAL_URL}${PROPOSAL_URL.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`;
      await supabase(`green_grin_estimates?id=eq.${encodeURIComponent(estimate.id)}`, { method: "PATCH", body: JSON.stringify({ proposal_token_hash: hash(token), proposal_sent_at: new Date().toISOString(), proposal_expires_at: expiry, status: "Quoted", updated_at: new Date().toISOString() }) });
      await sendEmail(estimate.email, `Proposal ${estimate.estimate_number} from Green Grin`, proposalEmail(estimate, link));
      return json(200, { ok: true, link, message: `Proposal emailed to ${estimate.email}.` });
    }

    if (body.action === "signed-copy") {
      if (!ADMIN_PIN || event.headers["x-admin-pin"] !== ADMIN_PIN) return json(401, { error: "Owner sign-in is required." });
      const estimates = await supabase(`green_grin_estimates?select=*&id=eq.${encodeURIComponent(body.estimate_id || "")}&limit=1`);
      const estimate = estimates?.[0];
      if (!estimate) return json(404, { error: "Estimate not found." });
      const signatures = await supabase(`green_grin_estimate_signatures?select=*&estimate_id=eq.${encodeURIComponent(estimate.id)}&order=signed_at.desc&limit=1`);
      if (!signatures?.[0]) return json(404, { error: "No signed copy was found for this proposal." });
      return json(200, { estimate, signature: signatures[0] });
    }

    const estimate = await estimateForToken(body.token || "");
    if (!estimate) return json(404, { error: "This proposal link is invalid or has been replaced." });
    if (estimate.approved_at) return json(200, { ok: true, alreadyApproved: true, estimate: publicEstimate(estimate) });
    if (estimate.proposal_expires_at && new Date(estimate.proposal_expires_at) < new Date()) return json(410, { error: "This proposal has expired. Contact Green Grin for an updated copy." });

    if (body.action === "request-code") {
      if (!estimate.email) return json(400, { error: "This proposal does not have a customer email." });
      const code = String(crypto.randomInt(100000, 1000000));
      await supabase(`green_grin_estimates?id=eq.${encodeURIComponent(estimate.id)}`, { method: "PATCH", body: JSON.stringify({ proposal_code_hash: hash(`${body.token}:${code}`), proposal_code_expires_at: new Date(Date.now() + 15 * 60000).toISOString() }) });
      await sendEmail(estimate.email, `Your Green Grin approval code: ${code}`, `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto"><h1 style="color:#07351d">Green Grin Lawn &amp; Landscape</h1><p>Use this one-time code to approve proposal <strong>${escapeHtml(estimate.estimate_number)}</strong>:</p><p style="font-size:34px;letter-spacing:6px;font-weight:800">${code}</p><p>This code expires in 15 minutes.</p></div>`);
      return json(200, { ok: true, message: `Code sent to ${publicEstimate(estimate).email_hint}.` });
    }

    if (body.action === "sign") {
      const expected = hash(`${body.token}:${String(body.code || "").trim()}`);
      if (!estimate.proposal_code_hash || !safeEqual(expected, estimate.proposal_code_hash) || !estimate.proposal_code_expires_at || new Date(estimate.proposal_code_expires_at) < new Date()) return json(401, { error: "That approval code is incorrect or expired. Request a new code." });
      const signerName = String(body.signer_name || "").trim().slice(0, 140);
      if (!signerName || body.consent !== true) return json(400, { error: "Enter your name and agree to the proposal terms." });
      const signatureType = body.signature_type === "drawn" ? "drawn" : "typed";
      const signatureData = String(body.signature_data || signerName).slice(0, 300000);
      const snapshot = documentSnapshot(estimate);
      const documentHash = hash(JSON.stringify(snapshot));
      const signedAt = new Date().toISOString();
      const signature = { estimate_id: estimate.id, signer_name: signerName, signer_email: estimate.email || "", signature_type: signatureType, signature_data: signatureData, consent_text: "I approve this proposal, payment schedule, and change-order terms and authorize Green Grin Lawn & Landscape to perform the described work.", signed_at: signedAt, document_hash: documentHash, document_snapshot: snapshot, ip_address: String(event.headers["x-forwarded-for"] || "").split(",")[0].trim(), user_agent: String(event.headers["user-agent"] || "").slice(0, 500) };
      await supabase("green_grin_estimate_signatures", { method: "POST", body: JSON.stringify(signature) });
      const project = await createProjectAndDeposit(estimate);
      const updated = await supabase(`green_grin_estimates?id=eq.${encodeURIComponent(estimate.id)}`, { method: "PATCH", body: JSON.stringify({ status: "Approved", approved_at: signedAt, approved_by: signerName, approval_document_hash: documentHash, proposal_code_hash: null, proposal_code_expires_at: null, project_job_id: project.jobId, deposit_invoice_id: project.invoiceId, updated_at: signedAt }) });
      const ownerDelivery = await sendEmail(OWNER_EMAIL, `SIGNED: ${estimate.estimate_number} - ${estimate.customer_name}`, signedProposalEmail(estimate, snapshot, signature)).then((data) => ({ sent: true, id: data?.id || null })).catch((error) => ({ sent: false, error: error.message || "The owner copy could not be emailed." }));
      const customerDelivery = estimate.email
        ? await sendEmail(estimate.email, `Proposal ${estimate.estimate_number} approved`, `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto"><h1 style="color:#07351d">Thank you, ${escapeHtml(signerName)}.</h1><p>Your proposal for <strong>${escapeHtml(estimate.project_title)}</strong> was approved on ${new Date(signedAt).toLocaleString("en-US")}.</p><p>Green Grin will confirm materials, deposit, and scheduling with you.</p></div>`).then((data) => ({ sent: true, id: data?.id || null })).catch((error) => ({ sent: false, error: error.message || "The customer confirmation could not be emailed." }))
        : { sent: false, skipped: true, reason: "No customer email address." };
      return json(200, { ok: true, estimate: publicEstimate(updated?.[0] || { ...estimate, status: "Approved", approved_at: signedAt, approved_by: signerName }), deposit_created: Boolean(project.invoiceId), owner_email: ownerDelivery, customer_email: customerDelivery });
    }

    return json(400, { error: "Choose a valid proposal action." });
  } catch (error) {
    if (/schema cache|green_grin_estimate_signatures|proposal_/i.test(error.message || "")) return json(500, { error: "Proposal approvals are not ready in Supabase. Run the latest portal-setup.sql, wait 30 seconds, and try again." });
    return json(500, { error: error.message });
  }
};

exports._test = { hash, customerGroupedTotals, proposalPriceDisplay, customerVisibleGroups, publicEstimate, documentSnapshot, signedProposalEmail };
