const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEFAULT_PRICING = require("../../assets/green-grin-pricing-config.json");

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS"
};

function json(statusCode, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

function startingMonthly(plan, pricing) {
  const weekly = Number(plan.minimumWeekly || 0);
  const visits = Number(pricing.mowingVisitsPerYear || 0);
  const discount = Number(pricing.annualAgreementDiscount || 0);
  const payments = Number(pricing.monthlyPaymentsPerYear || 12);
  return Math.round((weekly * visits * (1 - discount)) / payments);
}

function publicPlans(pricing) {
  return ["fresh", "sharp", "full"].map((id, index) => {
    const plan = pricing.plans[id] || DEFAULT_PRICING.plans[id];
    return {
      id,
      number: String(index + 1).padStart(2, "0"),
      name: plan.name,
      starting_monthly: startingMonthly(plan, pricing),
      includes: Array.isArray(plan.includes) ? plan.includes : []
    };
  });
}

async function loadPricing() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return DEFAULT_PRICING;
  const response = await fetch(`${SUPABASE_URL}/rest/v1/green_grin_pricing_config?select=config&id=eq.active&limit=1`, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
    }
  });
  if (!response.ok) return DEFAULT_PRICING;
  const rows = await response.json().catch(() => []);
  return rows?.[0]?.config || DEFAULT_PRICING;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
  if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed." });

  try {
    const pricing = await loadPricing();
    return json(200, {
      plans: publicPlans(pricing),
      pricing_version: pricing.version || 1,
      disclaimer: "Starting prices assume a standard property and annual agreement. Green Grin confirms final pricing after reviewing the property."
    });
  } catch (_error) {
    return json(200, {
      plans: publicPlans(DEFAULT_PRICING),
      pricing_version: DEFAULT_PRICING.version,
      disclaimer: "Starting prices assume a standard property and annual agreement. Green Grin confirms final pricing after reviewing the property."
    });
  }
};

exports._test = { publicPlans, startingMonthly };
