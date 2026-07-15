const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_PIN = process.env.GREEN_GRIN_ADMIN_PIN;
const DEFAULT_PRICING = require("../../assets/green-grin-pricing-config.json");

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, x-admin-pin",
  "Access-Control-Allow-Methods": "GET, PATCH, OPTIONS"
};

function json(statusCode, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

function requireAdmin(event) {
  if (!ADMIN_PIN) return "Admin PIN is not configured yet. Add GREEN_GRIN_ADMIN_PIN in Netlify.";
  if (event.headers["x-admin-pin"] !== ADMIN_PIN) return "Wrong admin PIN.";
  return null;
}

function configError() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return "Supabase is not configured yet.";
  return null;
}

async function supabase(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.message || data?.hint || "Supabase request failed.");
  return data;
}

function finiteNumber(value, name, options = {}) {
  const number = Number(value);
  const minimum = options.minimum ?? 0;
  const maximum = options.maximum ?? Number.MAX_SAFE_INTEGER;
  if (!Number.isFinite(number) || number < minimum || number > maximum) {
    throw new Error(`${name} must be between ${minimum} and ${maximum}.`);
  }
  return number;
}

function positiveInteger(value, name, maximum = 1000) {
  const number = finiteNumber(value, name, { minimum: 1, maximum });
  if (!Number.isInteger(number)) throw new Error(`${name} must be a whole number.`);
  return number;
}

function cleanName(value, fallback) {
  const name = String(value || "").trim().slice(0, 80);
  return name || fallback;
}

function cleanIncludes(value, fallback) {
  const items = Array.isArray(value) ? value : String(value || "").split("\n");
  const cleaned = items.map((item) => String(item || "").trim().slice(0, 100)).filter(Boolean).slice(0, 20);
  return cleaned.length ? cleaned : [...fallback];
}

function normalizePricing(input, nextVersion) {
  const source = input || {};
  const plans = source.plans || {};
  const addOns = source.addOns || {};
  const normalized = {
    version: positiveInteger(nextVersion, "Pricing version", 1000000),
    currency: "USD",
    roundWeeklyTo: finiteNumber(source.roundWeeklyTo, "Weekly rounding increment", { minimum: 0.01, maximum: 1000 }),
    mowingVisitsPerYear: positiveInteger(source.mowingVisitsPerYear, "Mowing visits per year", 365),
    annualAgreementDiscount: finiteNumber(source.annualAgreementDiscount, "Annual agreement discount", { minimum: 0, maximum: 1 }),
    monthlyPaymentsPerYear: positiveInteger(source.monthlyPaymentsPerYear, "Monthly payments per year", 24),
    manualReviewAboveLawnSqFt: finiteNumber(source.manualReviewAboveLawnSqFt, "Manual review threshold", { minimum: 1, maximum: 10000000 }),
    plans: {},
    addOns: {}
  };

  for (const planId of ["fresh", "sharp", "full"]) {
    const plan = plans[planId] || {};
    const fallback = DEFAULT_PRICING.plans[planId];
    normalized.plans[planId] = {
      name: cleanName(plan.name, fallback.name),
      minimumWeekly: finiteNumber(plan.minimumWeekly, `${fallback.name} minimum weekly price`, { minimum: 0, maximum: 100000 }),
      weeklyRatePerLawnSqFt: finiteNumber(plan.weeklyRatePerLawnSqFt, `${fallback.name} rate per square foot`, { minimum: 0, maximum: 1000 }),
      includes: cleanIncludes(plan.includes, fallback.includes)
    };
  }

  const lawn = addOns.lawnFertilization || {};
  normalized.addOns.lawnFertilization = {
    name: cleanName(lawn.name, DEFAULT_PRICING.addOns.lawnFertilization.name),
    minimumPerApplication: finiteNumber(lawn.minimumPerApplication, "Lawn fertilization minimum", { minimum: 0, maximum: 100000 }),
    ratePerLawnSqFtPerApplication: finiteNumber(lawn.ratePerLawnSqFtPerApplication, "Lawn fertilization square-foot rate", { minimum: 0, maximum: 1000 }),
    applicationsPerYear: positiveInteger(lawn.applicationsPerYear, "Lawn fertilization applications", 100)
  };

  const beds = addOns.bedPlantFertilization || {};
  normalized.addOns.bedPlantFertilization = {
    name: cleanName(beds.name, DEFAULT_PRICING.addOns.bedPlantFertilization.name),
    minimumPerVisit: finiteNumber(beds.minimumPerVisit, "Flowerbed fertilization minimum", { minimum: 0, maximum: 100000 }),
    ratePerBedSqFtPerVisit: finiteNumber(beds.ratePerBedSqFtPerVisit, "Flowerbed fertilization square-foot rate", { minimum: 0, maximum: 1000 }),
    visitsPerYear: positiveInteger(beds.visitsPerYear, "Flowerbed fertilization visits", 100)
  };

  return normalized;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
  const adminError = requireAdmin(event);
  if (adminError) return json(401, { error: adminError });
  const setupError = configError();
  if (setupError) return json(500, { error: setupError });

  try {
    if (event.httpMethod === "GET") {
      try {
        const rows = await supabase("green_grin_pricing_config?select=config,version,updated_at&id=eq.active&limit=1");
        if (rows?.[0]?.config) {
          return json(200, {
            config: rows[0].config,
            version: rows[0].version,
            updated_at: rows[0].updated_at,
            using_defaults: false
          });
        }
      } catch (error) {
        return json(200, {
          config: DEFAULT_PRICING,
          version: DEFAULT_PRICING.version,
          using_defaults: true,
          setup_required: true,
          warning: `Pricing settings are using supplied defaults until portal-setup.sql is run. ${error.message}`
        });
      }
      return json(200, {
        config: DEFAULT_PRICING,
        version: DEFAULT_PRICING.version,
        using_defaults: true
      });
    }

    if (event.httpMethod === "PATCH") {
      const body = JSON.parse(event.body || "{}");
      const currentRows = await supabase("green_grin_pricing_config?select=version&id=eq.active&limit=1").catch(() => []);
      const nextVersion = Math.max(1, Number(currentRows?.[0]?.version || body.config?.version || 0) + 1);
      const config = normalizePricing(body.config, nextVersion);
      const rows = await supabase("green_grin_pricing_config?on_conflict=id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify([{
          id: "active",
          version: config.version,
          config,
          updated_at: new Date().toISOString()
        }])
      });
      return json(200, {
        config: rows?.[0]?.config || config,
        version: rows?.[0]?.version || config.version,
        updated_at: rows?.[0]?.updated_at || new Date().toISOString()
      });
    }

    return json(405, { error: "Method not allowed." });
  } catch (error) {
    return json(400, { error: error.message || "Pricing settings could not be saved." });
  }
};
