const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_PIN = process.env.GREEN_GRIN_ADMIN_PIN;
const { validateMeasurement } = require("../../assets/lawn-measurement-engine");

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-admin-pin, x-employee-pin",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};

function json(statusCode, body) { return { statusCode, headers, body: JSON.stringify(body) }; }
function clean(value, max = 300) { return String(value || "").trim().slice(0, max); }
function coordinate(value, min, max) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}
function normalizedAddress(value) { return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
function addressPattern(value) {
  const tokens = normalizedAddress(value).split(" ").filter(Boolean).slice(0, 4);
  return tokens.length ? `*${tokens.join("*")}*` : "";
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
  if (!response.ok) throw new Error(data?.message || data?.hint || "Supabase request failed.");
  return data;
}

async function userFromRequest(event) {
  const token = String(event.headers.authorization || event.headers.Authorization || "").replace(/^Bearer\s+/i, "");
  if (!token || !SUPABASE_ANON_KEY) return null;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } });
  const user = await response.json().catch(() => null);
  return response.ok && user?.id ? user : null;
}

async function measurementActor(event) {
  if (ADMIN_PIN && event.headers["x-admin-pin"] === ADMIN_PIN) return { type: "Owner", id: null, name: "Owner" };
  const user = await userFromRequest(event);
  let employees = [];
  if (user) employees = await supabase(`green_grin_employees?select=id,full_name,status&user_id=eq.${encodeURIComponent(user.id)}&status=eq.Active&limit=1`);
  if (!employees.length && event.headers["x-employee-pin"]) employees = await supabase(`green_grin_employees?select=id,full_name,status&employee_pin=eq.${encodeURIComponent(event.headers["x-employee-pin"])}&status=eq.Active&limit=1`);
  return employees[0] ? { type: "Employee", id: employees[0].id, name: employees[0].full_name || "Employee" } : null;
}

function shapeCollection(value, maxShapes = 40) {
  return (Array.isArray(value) ? value : []).slice(0, maxShapes).map((feature) => {
    const ring = (feature?.geometry?.coordinates?.[0] || []).slice(0, 250).map((point) => [Number(point?.[0]), Number(point?.[1])]).filter((point) => Number.isFinite(point[0]) && Number.isFinite(point[1]) && Math.abs(point[0]) <= 180 && Math.abs(point[1]) <= 90);
    if (ring.length && (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1])) ring.push([...ring[0]]);
    return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } };
  });
}

async function matchingProperty(address) {
  const query = normalizedAddress(address);
  if (!query) return null;
  const rows = await supabase(`green_grin_properties?select=id,customer_user_id,address&active=eq.true&address=ilike.${encodeURIComponent(addressPattern(query))}&limit=5`);
  return rows.find((row) => query.includes(normalizedAddress(row.address)) || normalizedAddress(row.address).includes(query)) || rows[0] || null;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, {});
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return json(500, { error: "Supabase is not configured." });
  try {
    const actor = await measurementActor(event);
    if (!actor) return json(401, { error: "Owner or active employee sign-in is required." });
    const params = new URLSearchParams(event.rawQuery || "");

    if (event.httpMethod === "GET") {
      const propertyId = clean(params.get("property_id"), 80);
      const address = clean(params.get("address"));
      let filter = "is_current=eq.true";
      if (propertyId) filter += `&property_id=eq.${encodeURIComponent(propertyId)}`;
      else if (address) filter += `&address=ilike.${encodeURIComponent(addressPattern(address))}`;
      else return json(400, { error: "Property or address is required." });
      const measurements = await supabase(`green_grin_lawn_measurements?select=*&${filter}&order=created_at.desc&limit=10`);
      return json(200, { measurements });
    }

    if (event.httpMethod === "POST") {
      const body = JSON.parse(event.body || "{}");
      const address = clean(body.address);
      if (!address) return json(400, { error: "Property address is required." });
      const zones = shapeCollection(body.zones);
      const exclusions = shapeCollection(body.exclusions);
      const validation = validateMeasurement({ zones, exclusions, geocodeConfidence: Number(body.geocode_confidence || 0) });
      if (!validation.valid) return json(400, { error: validation.errors[0], errors: validation.errors });
      const property = body.property_id ? { id: clean(body.property_id, 80) } : await matchingProperty(address);
      const priorId = clean(body.id, 80) || null;
      if (priorId) {
        const retry = await supabase(`green_grin_lawn_measurements?select=*&supersedes_id=eq.${encodeURIComponent(priorId)}&gross_square_feet=eq.${validation.totals.grossSquareFeet}&excluded_square_feet=eq.${validation.totals.excludedSquareFeet}&net_square_feet=eq.${validation.totals.netSquareFeet}&order=created_at.desc&limit=1`);
        const duplicate = retry.find((row) => JSON.stringify(row.zones || []) === JSON.stringify(zones) && JSON.stringify(row.exclusions || []) === JSON.stringify(exclusions));
        if (duplicate) return json(200, { measurement: duplicate, warnings: validation.warnings, duplicatePrevented: true });
      }
      const payload = {
        property_id: property?.id || null,
        address,
        latitude: coordinate(body.latitude, -90, 90),
        longitude: coordinate(body.longitude, -180, 180),
        geocode_confidence: Math.max(0, Math.min(1, Number(body.geocode_confidence) || 0)),
        zones,
        exclusions,
        gross_square_feet: validation.totals.grossSquareFeet,
        excluded_square_feet: validation.totals.excludedSquareFeet,
        net_square_feet: validation.totals.netSquareFeet,
        status: ["Draft", "Reviewed", "Approved"].includes(body.status) ? body.status : "Reviewed",
        imagery_provider: "Esri World Imagery",
        measured_by_type: actor.type,
        measured_by_employee_id: actor.id,
        measured_by_name: actor.name,
        supersedes_id: priorId,
        is_current: true,
        updated_at: new Date().toISOString()
      };
      const rows = await supabase("green_grin_lawn_measurements", { method: "POST", body: JSON.stringify(payload) });
      if (priorId) await supabase(`green_grin_lawn_measurements?id=eq.${encodeURIComponent(priorId)}`, { method: "PATCH", body: JSON.stringify({ is_current: false, updated_at: new Date().toISOString() }) });
      return json(200, { measurement: rows?.[0] || payload, warnings: validation.warnings });
    }
    return json(405, { error: "Method not allowed." });
  } catch (error) {
    if (/green_grin_lawn_measurements|schema cache|relation .* does not exist/i.test(error.message || "")) return json(500, { error: "Lawn measurements are not ready in the database. Run lawn-measurements.sql and try again." });
    return json(500, { error: error.message || "The lawn measurement could not be saved." });
  }
};
