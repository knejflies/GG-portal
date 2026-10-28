const crypto = require("node:crypto");
const { requireAdmin } = require("./portal-auth");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.GREEN_GRIN_INVOICE_FROM || "Green Grin Lawns <ken@greengrinlawns.com>";
const SITE_URL = (process.env.URL || process.env.DEPLOY_PRIME_URL || "https://portal.greengrinlawns.com").replace(/\/$/, "");
const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type, x-admin-pin, Authorization", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const json = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) });
const hash = (value) => crypto.createHash("sha256").update(String(value)).digest("hex");
const clean = (value, max = 8000) => String(value ?? "").trim().slice(0, max);
const html = (value) => clean(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#039;");
function setupError() { return !SUPABASE_URL || !SERVICE_KEY ? "Supabase is not configured. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Netlify." : null; }
async function db(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...options, headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json", Prefer: "return=representation", ...(options.headers || {}) } });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message || data?.hint || "Database request failed.");
  return data;
}
function bodyOf(event) { try { return JSON.parse(event.body || "{}"); } catch (_) { return {}; } }
async function sendEmail(employee, job, agreement, token) {
  if (!employee?.email || !RESEND_API_KEY) return { sent: false, skipped: true, reason: employee?.email ? "Email is not configured in Netlify." : "Assigned employee has no email." };
  const link = `${SITE_URL}/employee-agreement.html?token=${encodeURIComponent(token)}`;
  const subject = `Work agreement: ${job.service_type || "Job"} at ${job.address || "assigned property"}`;
  const text = [`Hi ${employee.full_name || "there"},`, "", "Please review and sign this work agreement.", `Service: ${job.service_type || "Job"}`, `Customer: ${job.customer_name || "Customer"}`, `Address: ${job.address || ""}`, `Due date: ${agreement.due_date || "To be scheduled"}`, "", `Scope:\n${agreement.scope}`, "", `Sign here: ${link}`, "", "Green Grin Lawns"].join("\n");
  const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: EMAIL_FROM, to: [employee.email], subject, text, html: `<p>Hi ${html(employee.full_name || "there")},</p><p>Please review and sign this work agreement.</p><p><strong>${html(job.service_type || "Job")}</strong><br>${html(job.customer_name || "Customer")}<br>${html(job.address || "")}<br>Due: ${html(agreement.due_date || "To be scheduled")}</p><h3>Scope</h3><p style="white-space:pre-wrap">${html(agreement.scope)}</p><p><a href="${link}">Review and sign agreement</a></p><p>Green Grin Lawns</p>` }) });
  const data = await response.json().catch(() => ({}));
  return response.ok ? { sent: true, id: data.id || null, link } : { sent: false, error: data.message || "Email provider rejected the agreement." };
}
exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers, body: "" };
  const missing = setupError(); if (missing) return json(503, { error: missing });
  try {
    const body = bodyOf(event);
    if (event.httpMethod === "GET") {
      const params = event.queryStringParameters || {};
      if (params.token) {
        const rows = await db(`green_grin_job_agreements?select=*&token_hash=eq.${encodeURIComponent(hash(params.token))}&limit=1`);
        if (!rows.length) return json(404, { error: "Agreement link is invalid or expired." });
        const agreement = rows[0];
        const jobs = await db(`green_grin_jobs?select=id,customer_name,address,service_type,scheduled_date,notes&id=eq.${encodeURIComponent(agreement.job_id)}&limit=1`);
        const employees = await db(`green_grin_employees?select=full_name,email&id=eq.${encodeURIComponent(agreement.employee_id)}&limit=1`);
        return json(200, { agreement: { ...agreement, token_hash: undefined, signature_data: agreement.status === "Signed" ? agreement.signature_data : undefined }, job: jobs[0] || {}, employee: employees[0] || {} });
      }
      const authError = requireAdmin(event); if (authError) return json(403, { error: authError });
      const rows = await db(`green_grin_job_agreements?select=*&${params.job_id ? `job_id=eq.${encodeURIComponent(params.job_id)}&` : ""}order=created_at.desc`);
      return json(200, { agreements: rows });
    }
    if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed." });
    if (body.action === "send") {
      const authError = requireAdmin(event); if (authError) return json(403, { error: authError });
      if (!body.job_id) return json(400, { error: "A job is required." });
      const jobs = await db(`green_grin_jobs?select=*&id=eq.${encodeURIComponent(body.job_id)}&limit=1`);
      const job = jobs[0]; if (!job) return json(404, { error: "Job not found." });
      if (!job.assigned_employee_id) return json(400, { error: "Assign an employee or subcontractor before sending a work agreement." });
      const employees = await db(`green_grin_employees?select=*&id=eq.${encodeURIComponent(job.assigned_employee_id)}&status=eq.Active&limit=1`);
      const employee = employees[0]; if (!employee) return json(400, { error: "Assigned employee is not active." });
      const token = crypto.randomBytes(32).toString("base64url");
      const agreement = { job_id: job.id, employee_id: employee.id, agreement_title: clean(body.title, 200) || `Work Agreement - ${job.service_type || "Job"}`, scope: clean(body.scope, 8000) || clean(job.notes || job.service_type || "Complete the assigned work safely and to Green Grin standards."), pay_amount: body.pay_amount === "" || body.pay_amount == null ? null : Number(body.pay_amount), due_date: clean(body.due_date, 20) || (job.scheduled_date ? String(job.scheduled_date).slice(0, 10) : null), token_hash: hash(token), status: "Sent", sent_at: new Date().toISOString(), signed_at: null, signer_name: null, signature_type: null, signature_data: null, consent_text: null };
      const existing = await db(`green_grin_job_agreements?select=id&job_id=eq.${encodeURIComponent(job.id)}&limit=1`);
      const saved = existing.length ? (await db(`green_grin_job_agreements?id=eq.${encodeURIComponent(existing[0].id)}`, { method: "PATCH", body: JSON.stringify(agreement) }))[0] : (await db("green_grin_job_agreements", { method: "POST", body: JSON.stringify(agreement) }))[0];
      const email = await sendEmail(employee, job, saved, token);
      return json(200, { ok: true, agreement: { ...saved, token_hash: undefined }, employee: { id: employee.id, full_name: employee.full_name, email: employee.email }, email, link: `${SITE_URL}/employee-agreement.html?token=${encodeURIComponent(token)}` });
    }
    if (body.action === "sign") {
      if (!body.token || !clean(body.signer_name, 160) || !body.consent || !clean(body.signature_data, 3000)) return json(400, { error: "Name, consent, and signature are required." });
      const rows = await db(`green_grin_job_agreements?select=*&token_hash=eq.${encodeURIComponent(hash(body.token))}&limit=1`); if (!rows.length) return json(404, { error: "Agreement link is invalid or expired." });
      const current = rows[0]; if (current.status === "Signed") return json(200, { ok: true, alreadySigned: true, agreement: current });
      const signed = (await db(`green_grin_job_agreements?id=eq.${encodeURIComponent(current.id)}`, { method: "PATCH", body: JSON.stringify({ status: "Signed", signed_at: new Date().toISOString(), signer_name: clean(body.signer_name, 160), signer_email: clean(body.signer_email, 320) || null, signature_type: clean(body.signature_type, 30) || "typed", signature_data: clean(body.signature_data, 3000), consent_text: "I agree to complete the work described in this agreement.", ip_address: event.headers?.client-ip || event.headers?.["x-forwarded-for"] || null, user_agent: event.headers?.["user-agent"] || null, updated_at: new Date().toISOString() }) }))[0];
      return json(200, { ok: true, agreement: signed });
    }
    return json(400, { error: "Unknown agreement action." });
  } catch (error) { return json(500, { error: error.message || "Agreement request failed.", hint: "Run migrations/employee-job-agreements.sql in Supabase if the table is missing." }); }
};
