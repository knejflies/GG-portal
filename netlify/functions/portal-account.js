const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEFAULT_PRICING = require("../../assets/green-grin-pricing-config.json");
const { sendPushToTarget } = require("./push-helper");

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, PATCH, OPTIONS"
};

function json(statusCode, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

function requireSetup() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return "Supabase account login is not fully configured yet.";
  }
  return null;
}

async function verifyUser(event) {
  const auth = event.headers.authorization || event.headers.Authorization || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Please sign in again.");

  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`
    }
  });
  const user = await response.json().catch(() => null);
  if (!response.ok || !user?.id) throw new Error("Your sign-in expired. Please sign in again.");
  return user;
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

async function activePricing() {
  const rows = await supabase("green_grin_pricing_config?select=config&id=eq.active&limit=1").catch(() => []);
  return rows?.[0]?.config || DEFAULT_PRICING;
}

function isMissingPreferenceColumn(error) {
  return /text_cleanup_reminders|text_done_messages|email_monthly_receipts|schema cache/i.test(error?.message || "");
}

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function invoicePaymentReference(invoice) {
  const raw = String(invoice?.id || "").replace(/-/g, "");
  return raw ? `GG-${raw.slice(0, 8).toUpperCase()}` : "GG-PAYMENT";
}

function invoiceBelongsToCustomer(invoice, user, customer) {
  const invoiceEmail = String(invoice?.email || "").trim().toLowerCase();
  const userEmail = String(user?.email || "").trim().toLowerCase();
  return Boolean(
    invoice?.customer_user_id === user?.id ||
    (invoice?.customer_code && invoice.customer_code === customer?.customer_code) ||
    (invoiceEmail && userEmail && invoiceEmail === userEmail) ||
    (normalizePhone(invoice?.phone) && normalizePhone(invoice?.phone) === normalizePhone(customer?.phone))
  );
}

function isMissingPaymentColumn(error) {
  return /payment_method|payment_reference|payment_reported_at|payment_confirmed_at|schema cache/i.test(error?.message || "");
}

function normalizePaymentMethod(value) {
  const method = String(value || "").trim().toLowerCase();
  if (method === "zelle") return "Zelle";
  if (method === "venmo") return "Venmo";
  return "";
}

async function reportPayment(user, invoiceId, requestedMethod) {
  const method = normalizePaymentMethod(requestedMethod);
  if (!method) return { error: "Choose Zelle or Venmo as the payment method.", statusCode: 400 };
  const customer = await ensureCustomer(user);
  const rows = await supabase(`green_grin_invoices?select=*&id=eq.${encodeURIComponent(invoiceId)}&active=eq.true&limit=1`);
  const invoice = rows?.[0];
  if (!invoice || !invoiceBelongsToCustomer(invoice, user, customer)) {
    return { error: "Invoice not found for this account.", statusCode: 404 };
  }
  if (String(invoice.status || "").toLowerCase() === "paid") {
    return { error: "This invoice is already marked paid.", statusCode: 409 };
  }
  const alreadyPending = String(invoice.status || "").toLowerCase() === "payment pending" ||
    /^(zelle|venmo)-reported:/.test(String(invoice.payment_url || ""));
  if (alreadyPending) return { account: await loadAccount(user), push: null };

  const reportedAt = new Date().toISOString();
  const reference = invoice.payment_reference || invoicePaymentReference(invoice);
  const paymentUpdate = {
    status: "Payment Pending",
    payment_method: method,
    payment_reference: reference,
    payment_reported_at: reportedAt,
    payment_confirmed_at: null,
    payment_url: `${method.toLowerCase()}-reported:${reportedAt}`
  };
  try {
    await supabase(`green_grin_invoices?id=eq.${encodeURIComponent(invoice.id)}`, {
      method: "PATCH",
      body: JSON.stringify(paymentUpdate)
    });
  } catch (error) {
    if (!isMissingPaymentColumn(error)) throw error;
    await supabase(`green_grin_invoices?id=eq.${encodeURIComponent(invoice.id)}`, {
      method: "PATCH",
      body: JSON.stringify({ status: paymentUpdate.status, payment_url: paymentUpdate.payment_url })
    });
  }

  const push = await sendPushToTarget(supabase, { owner_type: "admin" }, {
    title: `${method} payment reported`,
    body: `${customer.full_name || invoice.customer_name || "Customer"} reported a $${Number(invoice.amount || 0).toFixed(2)} ${method} payment for ${reference}. Verify the payment before marking paid.`,
    url: "/admin/",
    tag: `green-grin-${method.toLowerCase()}-${invoice.id}`
  }).catch(() => null);

  return {
    account: await loadAccount(user),
    push,
    payment_report: { invoice_id: invoice.id, method, reference, reported_at: reportedAt }
  };
}

function codeNumber(code) {
  const match = String(code || "").match(/GG-(\d{4})$/);
  return match ? Number(match[1]) : 0;
}

async function nextCustomerCode() {
  const customers = await supabase("green_grin_customers?select=customer_code&customer_code=not.is.null&order=customer_code.desc&limit=1");
  const jobs = await supabase("green_grin_jobs?select=customer_code&customer_code=not.is.null&order=customer_code.desc&limit=1");
  let counters = [];
  try {
    counters = await supabase("green_grin_counters?select=*&name=eq.customer_code&limit=1");
  } catch (_error) {
    counters = [];
  }
  const current = counters?.[0]?.last_value || 0;
  const next = Math.max(current, codeNumber(customers?.[0]?.customer_code), codeNumber(jobs?.[0]?.customer_code)) + 1;
  try {
    await supabase("green_grin_counters?on_conflict=name", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({ name: "customer_code", last_value: next })
    });
  } catch (_error) {
    // The SQL setup creates this counter table. If it is missing, still issue a code from the current max.
  }
  return `GG-${String(next).padStart(4, "0")}`;
}

async function existingCustomerCodeForUser(user) {
  const email = (user.email || "").toLowerCase();
  if (!email) return "";
  const jobRows = await supabase(`green_grin_jobs?select=customer_code&email=eq.${encodeURIComponent(email)}&customer_code=not.is.null&order=created_at.desc&limit=1`).catch(() => []);
  if (jobRows?.[0]?.customer_code) return jobRows[0].customer_code;
  const invoiceRows = await supabase(`green_grin_invoices?select=customer_code&email=eq.${encodeURIComponent(email)}&customer_code=not.is.null&order=created_at.desc&limit=1`).catch(() => []);
  return invoiceRows?.[0]?.customer_code || "";
}

async function linkExistingRecords(user, customer) {
  const email = (user.email || customer.email || "").toLowerCase();
  const phone = normalizePhone(customer.phone);
  if (!email && !phone) return;
  const linked = {
    customer_user_id: user.id,
    customer_code: customer.customer_code || null
  };
  if (email) {
    await supabase(`green_grin_jobs?email=eq.${encodeURIComponent(email)}`, {
      method: "PATCH",
      body: JSON.stringify(linked)
    }).catch(() => null);
    await supabase(`green_grin_invoices?email=eq.${encodeURIComponent(email)}`, {
      method: "PATCH",
      body: JSON.stringify(linked)
    }).catch(() => null);
    await supabase(`green_grin_push_subscriptions?owner_type=eq.customer&owner_email=eq.${encodeURIComponent(email)}`, {
      method: "PATCH",
      body: JSON.stringify({ ...linked, updated_at: new Date().toISOString() })
    }).catch(() => null);
  }
  if (phone) {
    await supabase(`green_grin_jobs?phone=eq.${encodeURIComponent(phone)}`, {
      method: "PATCH",
      body: JSON.stringify(linked)
    }).catch(() => null);
    await supabase(`green_grin_invoices?phone=eq.${encodeURIComponent(phone)}`, {
      method: "PATCH",
      body: JSON.stringify(linked)
    }).catch(() => null);
  }
}

async function ensureCustomer(user) {
  const existing = await supabase(`green_grin_customers?select=*&id=eq.${encodeURIComponent(user.id)}&limit=1`);
  const existingCustomer = existing?.[0];
  const linkedCode = existingCustomer?.customer_code || await existingCustomerCodeForUser(user) || await nextCustomerCode();
  const baseProfile = {
    id: user.id,
    customer_code: linkedCode,
    email: user.email || "",
    full_name: user.user_metadata?.name || user.email?.split("@")[0] || "",
    phone: normalizePhone(existingCustomer?.phone || user.user_metadata?.phone),
    billing_status: existingCustomer?.billing_status || "Not connected"
  };
  const profile = {
    ...baseProfile,
    text_cleanup_reminders: existingCustomer?.text_cleanup_reminders ?? true,
    text_done_messages: existingCustomer?.text_done_messages ?? true,
    email_monthly_receipts: existingCustomer?.email_monthly_receipts ?? false
  };

  try {
    const rows = await supabase("green_grin_customers?on_conflict=id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify(profile)
    });
    const customer = rows?.[0] || profile;
    await linkExistingRecords(user, customer);
    return customer;
  } catch (error) {
    if (!isMissingPreferenceColumn(error)) throw error;
    const rows = await supabase("green_grin_customers?on_conflict=id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify(baseProfile)
    });
    const customer = rows?.[0] || baseProfile;
    await linkExistingRecords(user, customer);
    return customer;
  }
}

async function loadAccount(user) {
  const customer = await ensureCustomer(user);
  if (customer.active === false) {
    throw new Error("This customer account is inactive. Please contact Green Grin.");
  }
  let properties = await supabase(`green_grin_properties?select=*&customer_user_id=eq.${encodeURIComponent(user.id)}&active=eq.true&order=created_at.asc&limit=1`);

  if (!properties?.length) {
    properties = await supabase("green_grin_properties", {
      method: "POST",
      body: JSON.stringify({
        customer_user_id: user.id,
        address: "",
        gate_code: "",
        pets: "",
        yard_notes: "",
        service_preferences: ""
      })
    });
  }

  const matches = [`customer_user_id.eq.${encodeURIComponent(user.id)}`];
  if (user.email) matches.push(`email.eq.${encodeURIComponent(user.email)}`);
  if (customer.phone) matches.push(`phone.eq.${encodeURIComponent(customer.phone)}`);

  const jobs = await supabase(`green_grin_jobs?select=*&or=(${matches.join(",")})&order=created_at.desc&limit=40`);
  const invoiceMatches = [`customer_user_id.eq.${encodeURIComponent(user.id)}`];
  if (customer.customer_code) invoiceMatches.push(`customer_code.eq.${encodeURIComponent(customer.customer_code)}`);
  if (user.email) invoiceMatches.push(`email.eq.${encodeURIComponent(user.email)}`);
  if (customer.phone) invoiceMatches.push(`phone.eq.${encodeURIComponent(customer.phone)}`);
  const invoices = await supabase(`green_grin_invoices?select=*&active=eq.true&status=neq.Draft&or=(${invoiceMatches.join(",")})&order=created_at.desc&limit=40`);
  const jobIds = jobs.map((job) => job.id).filter(Boolean);
  const logs = jobIds.length
    ? await supabase(`green_grin_message_log?select=*&job_id=in.(${jobIds.join(",")})&order=created_at.desc&limit=30`)
    : [];

  return { user: { id: user.id, email: user.email }, customer, property: properties?.[0] || null, jobs, invoices, logs };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, {});

  const setupError = requireSetup();
  if (setupError) return json(500, { error: setupError });

  try {
    const user = await verifyUser(event);

    if (event.httpMethod === "GET") {
      return json(200, await loadAccount(user));
    }

    if (event.httpMethod === "PATCH") {
      const body = JSON.parse(event.body || "{}");

      const paymentReport = body.payment_report || (body.zelle_payment?.invoice_id
        ? { invoice_id: body.zelle_payment.invoice_id, method: "Zelle" }
        : null);
      if (paymentReport?.invoice_id) {
        const result = await reportPayment(user, paymentReport.invoice_id, paymentReport.method);
        if (result.error) return json(result.statusCode || 400, { error: result.error });
        return json(200, { ...result.account, push: result.push, payment_report: result.payment_report || null });
      }

      if (Object.prototype.hasOwnProperty.call(body, "plan_request")) {
        const planId = String(body.plan_request || "").trim().toLowerCase();
        if (!["fresh", "sharp", "full"].includes(planId)) {
          return json(400, { error: "Choose a valid Green Grin service plan." });
        }
        const pricing = await activePricing();
        const requestedPlan = pricing?.plans?.[planId]?.name || DEFAULT_PRICING.plans[planId].name;
        await supabase(`green_grin_customers?id=eq.${encodeURIComponent(user.id)}`, {
          method: "PATCH",
          body: JSON.stringify({
            requested_plan_id: planId,
            requested_plan: requestedPlan,
            requested_plan_at: new Date().toISOString()
          })
        });
      }

      if (body.profile) {
        const normalizedPhone = normalizePhone(body.profile.phone);
        if (normalizedPhone.length < 10) {
          return json(400, { error: "A valid phone number is required." });
        }
        const profileUpdate = {
          full_name: body.profile.full_name || "",
          phone: normalizedPhone,
          billing_plan: body.profile.billing_plan || null
        };
        if (Object.prototype.hasOwnProperty.call(body.profile, "text_cleanup_reminders")) {
          profileUpdate.text_cleanup_reminders = !!body.profile.text_cleanup_reminders;
        }
        if (Object.prototype.hasOwnProperty.call(body.profile, "text_done_messages")) {
          profileUpdate.text_done_messages = !!body.profile.text_done_messages;
        }
        if (Object.prototype.hasOwnProperty.call(body.profile, "email_monthly_receipts")) {
          profileUpdate.email_monthly_receipts = !!body.profile.email_monthly_receipts;
        }
        try {
          await supabase(`green_grin_customers?id=eq.${encodeURIComponent(user.id)}`, {
            method: "PATCH",
            body: JSON.stringify(profileUpdate)
          });
        } catch (error) {
          if (!isMissingPreferenceColumn(error)) throw error;
          delete profileUpdate.text_cleanup_reminders;
          delete profileUpdate.text_done_messages;
          delete profileUpdate.email_monthly_receipts;
          await supabase(`green_grin_customers?id=eq.${encodeURIComponent(user.id)}`, {
            method: "PATCH",
            body: JSON.stringify(profileUpdate)
          });
        }
        const linkedRows = await supabase(`green_grin_customers?select=*&id=eq.${encodeURIComponent(user.id)}&limit=1`).catch(() => []);
        await linkExistingRecords(user, linkedRows?.[0] || { email: user.email, phone: profileUpdate.phone });
      }

      if (body.property) {
        const property = {
          customer_user_id: user.id,
          address: body.property.address || "",
          gate_code: body.property.gate_code || "",
          pets: body.property.pets || "",
          yard_notes: body.property.yard_notes || "",
          service_preferences: body.property.service_preferences || "",
          active: true
        };

        if (body.property.id) {
          await supabase(`green_grin_properties?id=eq.${encodeURIComponent(body.property.id)}&customer_user_id=eq.${encodeURIComponent(user.id)}`, {
            method: "PATCH",
            body: JSON.stringify(property)
          });
        } else {
          await supabase("green_grin_properties", {
            method: "POST",
            body: JSON.stringify(property)
          });
        }
      }

      return json(200, await loadAccount(user));
    }

    return json(405, { error: "Method not allowed." });
  } catch (error) {
    return json(500, { error: error.message });
  }
};

exports._test = { invoicePaymentReference, invoiceBelongsToCustomer, isMissingPaymentColumn, normalizePaymentMethod };
