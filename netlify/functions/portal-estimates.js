const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_PIN = process.env.GREEN_GRIN_ADMIN_PIN;
const { groupedTotals, normalizeCategory } = require("../../assets/green-grin-project-estimator.js");
const { normalizeContractSections } = require("../../assets/green-grin-contract.js");
const { isAdminRequest } = require("./portal-auth");

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-admin-pin",
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

const CONTRACT_TEMPLATE_TYPES = new Set(["landscaping", "mowing", "cleanup", "aeration", "custom"]);

function normalizeEstimateLines(value) {
  const rows = Array.isArray(value) ? value : [];
  return rows.slice(0, 100).map((item) => {
    const quantity = moneyNumber(item?.quantity);
    const unitCost = moneyNumber(item?.unit_cost);
    const markupPercent = Math.min(1000, moneyNumber(item?.markup_percent));
    const calculatedRate = unitCost * (1 + markupPercent / 100);
    const rate = moneyNumber(item?.rate ?? calculatedRate);
    const category = normalizeCategory(item?.category || "Material");
    return {
      catalog_id: clean(item?.catalog_id, 80),
      description: clean(item?.description || "Project item"),
      category,
      quantity,
      unit: clean(item?.unit || "each", 24),
      unit_cost: unitCost,
      markup_percent: markupPercent,
      rate,
      cost_total: moneyNumber(quantity * unitCost),
      amount: moneyNumber(quantity * rate),
      deposit_eligible: item?.deposit_eligible === true || ["Material", "Equipment"].includes(category)
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
  const initialPaymentPercent = Math.min(100, Math.max(0, moneyNumber(body.initial_payment_percent ?? current.initial_payment_percent ?? 0)));
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
    contract_template: CONTRACT_TEMPLATE_TYPES.has(body.contract_template)
      ? body.contract_template
      : (CONTRACT_TEMPLATE_TYPES.has(current.contract_template) ? current.contract_template : "landscaping"),
    contract_sections: body.contract_sections !== undefined
      ? normalizeContractSections(body.contract_sections)
      : normalizeContractSections(current.contract_sections),
    contract_consent_text: clean(body.contract_consent_text !== undefined ? body.contract_consent_text : current.contract_consent_text, 8000),
    status: statuses.includes(body.status) ? body.status : "Draft",
    line_items: lineItems,
    subtotal,
    internal_cost: internalCost,
    gross_profit: grossProfit,
    gross_margin: grossMargin,
    grouped_totals: customerGroups,
    deposit_amount: depositAmount,
    initial_payment_percent: initialPaymentPercent,
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

function jobPayloadFromEstimate(estimate) {
  const categoryByTemplate = {
    mowing: "Mowing",
    cleanup: "Cleanup",
    aeration: "Cleanup",
    landscaping: "Landscaping",
    custom: "Landscaping"
  };
  const itemSummary = (Array.isArray(estimate?.line_items) ? estimate.line_items : [])
    .map((item) => `${clean(item?.description || "Project item", 180)} (${moneyNumber(item?.quantity)} ${clean(item?.unit || "each", 24)})`)
    .join("; ");
  const quoteType = ({ residential: "Residential", commercial: "Commercial", hoa: "HOA / Multi-property" })[estimate?.calculation_inputs?.property_type] || "Residential";
  const notes = [
    `Created from approved estimate ${clean(estimate?.estimate_number, 40)}.`,
    `Quote type: ${quoteType}.`,
    clean(estimate?.project_scope, 3000),
    itemSummary ? `Work items: ${itemSummary}` : ""
  ].filter(Boolean).join("\n\n");
  return {
    source_estimate_id: estimate?.id || null,
    customer_user_id: estimate?.customer_user_id || null,
    customer_code: clean(estimate?.customer_code, 40),
    customer_name: clean(estimate?.customer_name || "Customer", 140),
    phone: clean(estimate?.phone, 40),
    email: clean(estimate?.email, 180).toLowerCase(),
    address: clean(estimate?.service_address, 300),
    service_type: clean(estimate?.project_title || "Approved project", 180),
    service_category: categoryByTemplate[estimate?.contract_template] || "Landscaping",
    schedule_frequency: "One-time",
    recurring_weekly: false,
    annual_price: moneyNumber(estimate?.total) || null,
    monthly_price: null,
    notes: clean(notes, 4000),
    status: "New"
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, {});
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return json(500, { error: "Supabase is not configured." });
  if (!isAdminRequest(event)) return json(401, { error: "Owner sign-in is required." });

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
      if (body.action === "convert-to-job") {
        const estimate = existing[0];
        if (!estimate.approved_at && !["Approved", "Converted"].includes(estimate.status)) {
          return json(409, { error: "The customer must approve this estimate before it becomes a job." });
        }
        if (estimate.project_job_id) {
          const linked = await supabase(`green_grin_jobs?select=*&id=eq.${encodeURIComponent(estimate.project_job_id)}&limit=1`);
          return json(200, { estimate, job: linked?.[0] || { id: estimate.project_job_id }, duplicate: true });
        }
        const linked = await supabase(`green_grin_jobs?select=*&source_estimate_id=eq.${encodeURIComponent(estimate.id)}&limit=1`).catch(() => []);
        if (linked?.[0]) {
          const repaired = await supabase(`green_grin_estimates?id=eq.${encodeURIComponent(estimate.id)}`, {
            method: "PATCH",
            body: JSON.stringify({ project_job_id: linked[0].id, status: "Converted", updated_at: new Date().toISOString() })
          });
          return json(200, { estimate: repaired?.[0] || estimate, job: linked[0], duplicate: true });
        }
        const jobPayload = jobPayloadFromEstimate(estimate);
        let created;
        try {
          created = await supabase("green_grin_jobs", { method: "POST", body: JSON.stringify(jobPayload) });
        } catch (error) {
          if (!/duplicate key|unique constraint/i.test(error.message || "")) throw error;
          created = await supabase(`green_grin_jobs?select=*&source_estimate_id=eq.${encodeURIComponent(estimate.id)}&limit=1`);
        }
        const job = created?.[0];
        if (!job?.id) throw new Error("The approved job could not be created.");
        const updated = await supabase(`green_grin_estimates?id=eq.${encodeURIComponent(estimate.id)}`, {
          method: "PATCH",
          body: JSON.stringify({ project_job_id: job.id, status: "Converted", updated_at: new Date().toISOString() })
        });
        return json(200, { estimate: updated?.[0] || estimate, job, duplicate: false });
      }
      const payload = estimatePayload(body, existing[0]);
      if (!payload.line_items.length) return json(400, { error: "Add at least one priced estimate item." });
      const rows = await supabase(`green_grin_estimates?id=eq.${encodeURIComponent(body.id)}`, { method: "PATCH", body: JSON.stringify(payload) });
      return json(200, { estimate: rows?.[0] || payload });
    }

    if (event.httpMethod === "DELETE") {
      if (!body.id) return json(400, { error: "Estimate id is required." });
      const rows = await supabase(`green_grin_estimates?id=eq.${encodeURIComponent(body.id)}`, { method: "PATCH", body: JSON.stringify({ status: "Declined", updated_at: new Date().toISOString() }) });
      return json(200, { ok: true, archived: true, estimate: rows?.[0] || null });
    }

    return json(405, { error: "Method not allowed." });
  } catch (error) {
    if (/source_estimate_id|green_grin_estimates|schema cache/i.test(error.message || "")) {
      return json(500, { error: "Project estimates are not ready in Supabase. Run the latest portal-setup.sql, wait 30 seconds, and try again." });
    }
    return json(500, { error: error.message });
  }
};

exports._test = { normalizeEstimateLines, estimatePayload, jobPayloadFromEstimate };

