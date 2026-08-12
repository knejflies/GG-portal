const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_PIN = process.env.GREEN_GRIN_ADMIN_PIN;
const { groupedTotals } = require("../../assets/green-grin-project-estimator.js");

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, x-admin-pin",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS"
};

function json(statusCode, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
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

function moneyNumber(value) {
  return Math.round(Math.max(0, Number(value) || 0) * 100) / 100;
}

function signedMoneyNumber(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function clean(value, maximum = 180) {
  return String(value || "").trim().slice(0, maximum);
}

function normalizeEstimateLines(value) {
  const rows = Array.isArray(value) ? value : [];
  return rows.slice(0, 100).map((item) => {
    const quantity = moneyNumber(item?.quantity);
    const unitCost = moneyNumber(item?.unit_cost);
    const markupPercent = Math.min(1000, moneyNumber(item?.markup_percent));
    const calculatedRate = unitCost * (1 + markupPercent / 100);
    const rate = moneyNumber(item?.rate ?? calculatedRate);
    return {
      catalog_id: clean(item?.catalog_id, 80),
      description: clean(item?.description || "Project item"),
      category: clean(item?.category || "Material", 40),
      quantity,
      unit: clean(item?.unit || "each", 24),
      unit_cost: unitCost,
      markup_percent: markupPercent,
      rate,
      cost_total: moneyNumber(quantity * unitCost),
      amount: moneyNumber(quantity * rate),
      deposit_eligible: item?.deposit_eligible === true || ["Material", "Equipment"].includes(clean(item?.category, 40))
    };
  }).filter((item) => item.description && item.quantity > 0);
}

function estimatePayload(body, current = {}) {
  const lineItems = normalizeEstimateLines(body.line_items);
  const subtotal = moneyNumber(lineItems.reduce((sum, item) => sum + item.amount, 0));
  const internalCost = moneyNumber(lineItems.reduce((sum, item) => sum + item.cost_total, 0));
  const discount = moneyNumber(body.discount);
  const taxRate = Math.min(100, moneyNumber(body.tax_rate));
  const taxable = Math.max(0, subtotal - discount);
  const taxAmount = moneyNumber(taxable * taxRate / 100);
  const total = moneyNumber(taxable + taxAmount);
  const grossProfit = signedMoneyNumber(taxable - internalCost);
  const grossMargin = taxable > 0 ? Math.round((grossProfit / taxable) * 10000) / 10000 : 0;
  const depositAmount = moneyNumber(lineItems.filter((item) => item.deposit_eligible).reduce((sum, item) => sum + item.amount, 0));
  const customerGroups = groupedTotals(lineItems);
  const groupedSubtotal = moneyNumber(Object.values(customerGroups).reduce((sum, amount) => sum + Number(amount || 0), 0));
  if (Math.abs(groupedSubtotal - subtotal) > 0.01) throw new Error("Project groups do not match the estimate subtotal. Review the estimate before sending it.");
  const statuses = ["Draft", "Quoted", "Approved", "Declined", "Converted"];
  return {
    estimate_number: clean(body.estimate_number || current.estimate_number || `EST-${Date.now().toString(36).toUpperCase()}`, 40),
    customer_user_id: body.customer_user_id || null,
    customer_code: clean(body.customer_code, 40),
    customer_name: clean(body.customer_name || "Customer", 140),
    phone: clean(body.phone, 40),
    email: clean(body.email, 180).toLowerCase(),
    project_title: clean(body.project_title || "Landscape project", 180),
    service_address: clean(body.service_address, 300),
    project_scope: clean(body.project_scope, 8000),
    valid_until: clean(body.valid_until, 10) || null,
    invoice_due_date: clean(body.invoice_due_date, 10) || null,
    customer_notes: clean(body.customer_notes, 4000),
    status: statuses.includes(body.status) ? body.status : "Draft",
    line_items: lineItems,
    subtotal,
    internal_cost: internalCost,
    gross_profit: grossProfit,
    gross_margin: grossMargin,
    grouped_totals: customerGroups,
    deposit_amount: depositAmount,
    contingency_percent: Math.min(100, moneyNumber(body.contingency_percent)),
    calculation_inputs: body.calculation_inputs && typeof body.calculation_inputs === "object" ? body.calculation_inputs : (current.calculation_inputs || {}),
    discount,
    tax_rate: taxRate,
    tax_amount: taxAmount,
    total,
    invoice_id: body.invoice_id !== undefined ? (body.invoice_id || null) : (current.invoice_id || null),
    invoice_number: clean(body.invoice_number !== undefined ? body.invoice_number : current.invoice_number, 80),
    invoiced_at: body.invoiced_at !== undefined ? (body.invoiced_at || null) : (current.invoiced_at || null),
    notes: clean(body.notes, 4000),
    updated_at: new Date().toISOString()
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, {});
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return json(500, { error: "Supabase is not configured." });
  if (!ADMIN_PIN || event.headers["x-admin-pin"] !== ADMIN_PIN) return json(401, { error: "Owner sign-in is required." });

  try {
    if (event.httpMethod === "GET") {
      const estimates = await supabase("green_grin_estimates?select=*&order=updated_at.desc&limit=500");
      return json(200, { estimates });
    }

    const body = JSON.parse(event.body || "{}");
    if (event.httpMethod === "POST") {
      const payload = estimatePayload(body);
      if (!payload.line_items.length) return json(400, { error: "Add at least one priced estimate item." });
      const rows = await supabase("green_grin_estimates", { method: "POST", body: JSON.stringify(payload) });
      return json(200, { estimate: rows?.[0] || payload });
    }

    if (event.httpMethod === "PATCH") {
      if (!body.id) return json(400, { error: "Estimate id is required." });
      const existing = await supabase(`green_grin_estimates?select=*&id=eq.${encodeURIComponent(body.id)}&limit=1`);
      if (!existing?.[0]) return json(404, { error: "Estimate not found." });
      const payload = estimatePayload(body, existing[0]);
      if (!payload.line_items.length) return json(400, { error: "Add at least one priced estimate item." });
      const rows = await supabase(`green_grin_estimates?id=eq.${encodeURIComponent(body.id)}`, { method: "PATCH", body: JSON.stringify(payload) });
      return json(200, { estimate: rows?.[0] || payload });
    }

    if (event.httpMethod === "DELETE") {
      if (!body.id) return json(400, { error: "Estimate id is required." });
      await supabase(`green_grin_estimates?id=eq.${encodeURIComponent(body.id)}`, { method: "DELETE" });
      return json(200, { ok: true });
    }

    return json(405, { error: "Method not allowed." });
  } catch (error) {
    if (/green_grin_estimates|schema cache/i.test(error.message || "")) {
      return json(500, { error: "Project estimates are not ready in Supabase. Run the latest portal-setup.sql, wait 30 seconds, and try again." });
    }
    return json(500, { error: error.message });
  }
};

exports._test = { normalizeEstimateLines, estimatePayload };
