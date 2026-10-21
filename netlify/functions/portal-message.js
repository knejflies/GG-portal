const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_PIN = process.env.GREEN_GRIN_ADMIN_PIN;
const { requireAdmin: requireOwner } = require("./portal-auth");
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.GREEN_GRIN_INVOICE_FROM || "Green Grin Lawns <ken@greengrinlawns.com>";
const { pushReady, sendPushToTarget } = require("./push-helper");

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, x-admin-pin, x-employee-pin, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};

function json(statusCode, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

function requireAdmin(event) {
  return requireOwner(event, "Wrong admin PIN.");
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

async function optionalUser(event) {
  const auth = event.headers.authorization || event.headers.Authorization || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token || !SUPABASE_ANON_KEY) return null;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`
    }
  });
  const user = await response.json().catch(() => null);
  return response.ok && user?.id ? user : null;
}

async function employeeAccountForEvent(event) {
  const user = await optionalUser(event);
  if (!user) return null;
  const email = encodeURIComponent((user.email || "").toLowerCase());
  let rows = await supabase(`green_grin_employees?select=*&user_id=eq.${encodeURIComponent(user.id)}&status=eq.Active&limit=1`);
  if (!rows?.length && email) {
    rows = await supabase(`green_grin_employees?select=*&email=eq.${email}&status=eq.Active&limit=1`);
    if (rows?.[0] && !rows[0].user_id) {
      rows = await supabase(`green_grin_employees?id=eq.${encodeURIComponent(rows[0].id)}`, {
        method: "PATCH",
        body: JSON.stringify({ user_id: user.id })
      });
    }
  }
  return rows?.[0] || null;
}

async function employeePinForEvent(event) {
  const pin = event.headers["x-employee-pin"];
  if (!pin) return null;
  const rows = await supabase(`green_grin_employees?select=*&employee_pin=eq.${encodeURIComponent(pin)}&status=eq.Active&limit=1`);
  return rows?.[0] || null;
}

async function employeeMessageActor(event, template) {
  if (!["arrived", "completed"].includes(template)) return null;
  return await employeeAccountForEvent(event) || await employeePinForEvent(event);
}

function requireSupabaseSetup() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return "Supabase is not configured yet.";
  if (!pushReady()) return "App notification keys are not configured yet.";
  return null;
}

function messageFor(template, job) {
  const name = job.customer_name ? ` ${job.customer_name}` : "";
  const service = job.service_type || "yard service";
  if (template === "objects") {
    return `Hi${name}, Green Grin is scheduled for your ${service}. Please pick up toys, hoses, pet waste, and yard objects so we can work safely and leave a clean finish.`;
  }
  if (template === "completed") {
    return `Hi${name}, Green Grin finished your yard today. Thanks for choosing us.`;
  }
  if (template === "arrived") {
    return `Hi${name}, Green Grin has arrived for your ${service} and is starting work.`;
  }
  return `Hi${name}, Green Grin has an update about your ${service}.`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>\"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[char]));
}

async function sendCompletionEmail(job) {
  if (!job?.email) return { sent: false, skipped: true, reason: "Customer has no email address." };
  if (!RESEND_API_KEY) return { sent: false, skipped: true, reason: "Email is not configured in Netlify." };
  const customer = job.customer_name || "there";
  const service = job.service_type || "yard service";
  const address = job.address || job.service_address || "your property";
  const date = new Date().toLocaleDateString();
  const text = `Hi ${customer},\n\nGreen Grin finished your ${service} at ${address} on ${date}. Thanks for choosing us.\n\nGreen Grin Lawns`;
  try {
    const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json", "User-Agent": "Green-Grin-Portal/1.0" }, body: JSON.stringify({ from: EMAIL_FROM, to: [job.email], subject: `Green Grin finished your ${service}`, text, html: `<p>Hi ${escapeHtml(customer)},</p><p>Green Grin finished your <strong>${escapeHtml(service)}</strong> at ${escapeHtml(address)} on <strong>${escapeHtml(date)}</strong>.</p><p>Thanks for choosing us.<br>Green Grin Lawns</p>` }) });
    const data = await response.json().catch(() => ({}));
    return response.ok ? { sent: true, id: data.id || null } : { sent: false, error: data.message || "Email provider rejected the completion email." };
  } catch (error) { return { sent: false, error: error.message || "Completion email could not be sent." }; }
}

function fertilizerJob(job) {
  return /fertiliz|fertiliser|\bfert\b/i.test(String(job?.service_type || ""));
}

function fertilizerRecord(body, job) {
  const amount = String(body.application_amount || "").trim().slice(0, 80);
  if (!amount || !fertilizerJob(job)) return null;
  const product = String(body.application_product || "").trim().slice(0, 120);
  return {
    expense_type: "fertilizer_application",
    expense_date: new Date().toISOString().slice(0, 10),
    vendor: `Fertilizer - ${job.customer_name || "Customer"}`.slice(0, 120),
    category: "Materials",
    amount: 0,
    payment_method: "Application record",
    notes: [`Applied amount: ${amount}`, product ? `Product: ${product}` : "", job.customer_code ? `Customer code: ${job.customer_code}` : ""].filter(Boolean).join(" | ").slice(0, 800),
    active: true
  };
}

function normalizeAddress(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function completedServiceDate(body, job) {
  const value = String(body.service_date || body.route_date || job.scheduled_date || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : new Date().toISOString().slice(0, 10);
}

function completedServicePrice(body, job) {
  const requested = Number(body.customer_price);
  if (Number.isFinite(requested) && requested > 0) return Number(requested.toFixed(2));
  // A one-time job's approved price is safe to carry forward. A recurring
  // job's annual/monthly total is not a per-visit price, so it must be
  // supplied explicitly at completion to prevent accidental overbilling.
  if (!job.recurring_weekly) {
    const oneTime = Number(job.customer_price ?? job.annual_price ?? job.total);
    if (Number.isFinite(oneTime) && oneTime > 0) return Number(oneTime.toFixed(2));
  }
  return null;
}

function serviceCategoryForJob(job) {
  const type = String(job?.service_type || "").toLowerCase();
  if (/fertil|spray|chemical/.test(type)) return "Fertilizer";
  if (/aerat|cleanup|clean-up|blowout|irrigation/.test(type)) return "Cleanup";
  if (/landscap|hardscap|project/.test(type)) return "Landscaping";
  return "Mowing";
}

function completionSourceKey(job, serviceDate) {
  return `job-completed:${job.id}:${serviceDate}`;
}

async function propertyForCompletedJob(job) {
  if (!job?.customer_user_id) return { property: null, reason: "Job has no linked customer property." };
  const rows = await supabase(`green_grin_properties?select=id,customer_user_id,address,active&customer_user_id=eq.${encodeURIComponent(job.customer_user_id)}&active=eq.true&limit=50`);
  const target = normalizeAddress(job.address || job.service_address);
  const exact = rows.filter((row) => target && normalizeAddress(row.address) === target);
  if (exact.length === 1) return { property: exact[0], reason: null };
  if (!target && rows.length === 1) return { property: rows[0], reason: null };
  return { property: null, reason: exact.length > 1 ? "Multiple properties match this job address." : "No active property matches this job address." };
}

async function completedServiceEntry(job, body) {
  if (!job?.id || !job.customer_user_id) return { entry: null, reason: "Job is not linked to a customer." };
  const serviceDate = completedServiceDate(body, job);
  const sourceKey = completionSourceKey(job, serviceDate);
  const existing = await supabase(`green_grin_service_entries?select=*&source_key=eq.${encodeURIComponent(sourceKey)}&limit=1`).catch(() => []);
  if (existing?.[0]) return { entry: existing[0], duplicate: true, reason: null };
  const price = completedServicePrice(body, job);
  if (price === null) return { entry: null, reason: "Set customer_price for this visit before billing a recurring job." };
  const match = await propertyForCompletedJob(job);
  if (!match.property) return { entry: null, reason: match.reason };
  const payload = {
    property_id: match.property.id,
    customer_user_id: job.customer_user_id,
    job_id: job.id,
    service_date: serviceDate,
    service_category: serviceCategoryForJob(job),
    description: `${job.service_type || "Yard service"} visit`,
    quantity: 1,
    unit: "visit",
    customer_price: price,
    status: "Completed",
    internal_notes: { source: "job_completion", job_id: job.id },
    material_cost: 0,
    include_internal_notes: false,
    source_key: sourceKey
  };
  try {
    const inserted = await supabase("green_grin_service_entries", { method: "POST", body: JSON.stringify(payload) });
    return { entry: inserted?.[0] || payload, duplicate: false, reason: null };
  } catch (error) {
    // A retry can race the unique source_key index. Read back the winner and
    // keep completion successful rather than creating a second billable item.
    const retry = await supabase(`green_grin_service_entries?select=*&source_key=eq.${encodeURIComponent(sourceKey)}&limit=1`).catch(() => []);
    if (retry?.[0]) return { entry: retry[0], duplicate: true, reason: null };
    return { entry: null, reason: error.message || "Service entry could not be recorded." };
  }
}

function pushTitle(template) {
  if (template === "objects") return "Yard cleanup reminder";
  if (template === "completed") return "Service completed";
  if (template === "arrived") return "Green Grin has arrived";
  return "Green Grin update";
}

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "");
}

async function customerPushTarget(job) {
  const target = {
    customer_user_id: job.customer_user_id || null,
    customer_code: job.customer_code || "",
    email: job.email || ""
  };
  const filters = [];
  if (job.customer_user_id) filters.push(`id.eq.${encodeURIComponent(job.customer_user_id)}`);
  if (job.customer_code) filters.push(`customer_code.eq.${encodeURIComponent(job.customer_code)}`);
  if (job.email) filters.push(`email.eq.${encodeURIComponent(String(job.email).toLowerCase())}`);
  const rawPhone = String(job.phone || "").trim();
  const digitsPhone = normalizePhone(rawPhone);
  if (rawPhone) filters.push(`phone.eq.${encodeURIComponent(rawPhone)}`);
  if (digitsPhone && digitsPhone !== rawPhone) filters.push(`phone.eq.${encodeURIComponent(digitsPhone)}`);

  if (filters.length) {
    const rows = await supabase(`green_grin_customers?select=id,customer_code,email,phone&or=(${filters.join(",")})&limit=5`).catch(() => []);
    const customer = rows?.find((row) => row.id === job.customer_user_id)
      || rows?.find((row) => row.customer_code && row.customer_code === job.customer_code)
      || rows?.find((row) => row.email && String(row.email).toLowerCase() === String(job.email || "").toLowerCase())
      || rows?.find((row) => normalizePhone(row.phone) && normalizePhone(row.phone) === digitsPhone)
      || rows?.[0];
    if (customer) {
      target.customer_user_id = target.customer_user_id || customer.id || null;
      target.customer_code = target.customer_code || customer.customer_code || "";
      target.email = target.email || customer.email || "";
    }
  }

  return target;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, {});

  const setupError = requireSupabaseSetup();
  if (setupError) return json(500, { error: setupError });

  try {
    if (event.httpMethod === "GET") {
      const params = new URLSearchParams(event.rawQuery || "");
      if (params.get("admin") !== "1") return json(400, { error: "Admin log view is required." });
      const adminError = requireAdmin(event);
      if (adminError) return json(401, { error: adminError });
      const logs = await supabase("green_grin_message_log?select=*,green_grin_jobs(customer_name,address,service_type)&order=created_at.desc&limit=1000");
      return json(200, { logs });
    }

    if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed." });

    const body = JSON.parse(event.body || "{}");
    if (body.action === "resend-completion-email") {
      const adminError = requireAdmin(event);
      if (adminError) return json(401, { error: adminError });
      if (!body.id) return json(400, { error: "Job id is required." });
      const jobs = await supabase(`green_grin_jobs?select=*&id=eq.${encodeURIComponent(body.id)}&limit=1`);
      const job = jobs?.[0];
      if (!job) return json(404, { error: "Job not found." });
      const email = await sendCompletionEmail(job);
      await supabase("green_grin_message_log", { method: "POST", body: JSON.stringify({ job_id: job.id, phone: job.email || "", template: email.sent ? "completed-email-sent" : "completed-email-failed", message: email.sent ? `Resent completion email for ${job.customer_name || "Customer"}.` : `Resent completion email failed: ${email.error || email.reason || "Unknown error."}`, actor_type: "Owner", actor_name: "Owner", twilio_sid: email.id || null }) }).catch(() => null);
      return json(200, { ok: true, email });
    }
    if (!body.id || !body.template) return json(400, { error: "Job id and template are required." });
    const employeeActor = await employeeMessageActor(event, body.template);
    const adminError = employeeActor ? null : requireAdmin(event);
    if (adminError) return json(401, { error: adminError });

    const id = encodeURIComponent(body.id);
    const jobs = await supabase(`green_grin_jobs?select=*&id=eq.${id}&limit=1`);
    const job = jobs?.[0];
    if (!job) return json(404, { error: "Job not found." });
    if (body.template === "arriving") return json(400, { error: "On-the-way messages are turned off." });
    if (employeeActor && job.assigned_employee_id !== employeeActor.id) {
      const routeDate = String(body.route_date || new Date().toISOString().slice(0, 10));
      const routeRows = await supabase(`green_grin_daily_route_assignments?select=id&job_id=eq.${id}&assigned_employee_id=eq.${encodeURIComponent(employeeActor.id)}&route_date=eq.${encodeURIComponent(routeDate)}&limit=1`);
      if (!routeRows?.length) return json(403, { error: "This job is not assigned to your route for that date." });
    }

    const message = messageFor(body.template, job);
    const status = body.template === "completed" && !job.recurring_weekly ? "Completed" : job.status;
    const notificationTag = `green-grin-${job.id}-${body.template}-${Date.now()}`;
    const customerPush = await sendPushToTarget(supabase, await customerPushTarget(job), {
      title: pushTitle(body.template),
      body: message,
      url: "/portal/",
      tag: notificationTag
    });
    const completionEmail = body.template === "completed" ? await sendCompletionEmail(job) : null;
    let ownerPush = null;
    if (body.template === "completed") {
      ownerPush = await sendPushToTarget(supabase, { owner_type: "admin" }, {
        title: "Job marked done",
        body: `${employeeActor ? employeeActor.full_name || employeeActor.email || "Employee" : "Owner"} marked ${job.customer_name || "a customer"} done.`,
        url: "/admin/",
        tag: `green-grin-admin-${job.id}-done-${Date.now()}`
      });
    }

    await supabase(`green_grin_jobs?id=eq.${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        status,
        last_message_template: body.template,
        last_message_sent_at: new Date().toISOString()
      })
    });

    await supabase("green_grin_message_log", {
      method: "POST",
      body: JSON.stringify({
        job_id: job.id,
        phone: job.phone || job.email || "",
        template: body.template,
        message,
        actor_type: employeeActor ? "Employee" : "Owner",
        actor_name: employeeActor ? employeeActor.full_name || employeeActor.email : "Owner",
        actor_employee_id: employeeActor?.id || null,
        twilio_sid: null
      })
    }).catch(() => null);
    if (completionEmail) {
      await supabase("green_grin_message_log", { method: "POST", body: JSON.stringify({ job_id: job.id, phone: job.email || "", template: completionEmail.sent ? "completed-email-sent" : "completed-email-failed", message: completionEmail.sent ? message : `${message} Failure: ${completionEmail.error || completionEmail.reason || "Unknown error."}`, actor_type: employeeActor ? "Employee" : "Owner", actor_name: employeeActor ? employeeActor.full_name || employeeActor.email : "Owner", actor_employee_id: employeeActor?.id || null, twilio_sid: completionEmail.id || null }) }).catch(() => null);
    }
    const serviceEntry = body.template === "completed" ? await completedServiceEntry(job, body) : null;
    const applicationRecord = body.template === "completed" ? fertilizerRecord(body, job) : null;
    if (applicationRecord) await supabase("green_grin_expenses", { method: "POST", body: JSON.stringify(applicationRecord) });

    return json(200, {
      ok: true,
      push: ownerPush ? { customer: customerPush, owner: ownerPush } : customerPush,
      email: completionEmail,
      service_entry: serviceEntry
    });
  } catch (error) {
    return json(500, { error: error.message });
  }
};

exports._test = {
  normalizeAddress,
  completedServiceDate,
  completedServicePrice,
  serviceCategoryForJob,
  completionSourceKey
};
