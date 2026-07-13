const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_PIN = process.env.GREEN_GRIN_ADMIN_PIN;
const GEOCODER_URL = (process.env.GREEN_GRIN_GEOCODER_URL || "https://nominatim.openstreetmap.org").replace(/\/$/, "");

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-admin-pin, x-employee-pin",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS"
};

function json(statusCode, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

function requireSetup() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return "Supabase is not configured yet. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Netlify.";
  }
  return null;
}

function requireAdmin(event) {
  if (!ADMIN_PIN) return "Admin PIN is not configured yet. Add GREEN_GRIN_ADMIN_PIN in Netlify.";
  if (event.headers["x-admin-pin"] !== ADMIN_PIN) return "Wrong admin PIN.";
  return null;
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

async function activeEmployee(event) {
  const user = await optionalUser(event);
  if (user) {
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
    if (rows?.[0]) return rows[0];
  }

  const pin = event.headers["x-employee-pin"];
  if (!pin) return null;
  const rows = await supabase(`green_grin_employees?select=*&employee_pin=eq.${encodeURIComponent(pin)}&status=eq.Active&limit=1`);
  return rows?.[0] || null;
}

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function validCoordinate(value, min, max) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function distanceMeters(a, b) {
  const radius = 6371000;
  const toRadians = (degrees) => degrees * Math.PI / 180;
  const dLat = toRadians(Number(b.latitude) - Number(a.latitude));
  const dLng = toRadians(Number(b.longitude) - Number(a.longitude));
  const lat1 = toRadians(Number(a.latitude));
  const lat2 = toRadians(Number(b.latitude));
  const value = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

async function reverseGeocode(latitude, longitude) {
  const query = new URLSearchParams({
    format: "jsonv2",
    lat: String(latitude),
    lon: String(longitude),
    zoom: "18",
    addressdetails: "1"
  });
  const response = await fetch(`${GEOCODER_URL}/reverse?${query}`, {
    headers: {
      Accept: "application/json",
      "Accept-Language": "en",
      "User-Agent": "GreenGrinPortal/1.0 (https://portal.greengrinlawns.com)",
      Referer: "https://portal.greengrinlawns.com/"
    }
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.display_name) throw new Error("The address lookup could not identify this house. Enter the address manually and try again.");
  return data.display_name;
}

async function assignedRoute(routeId, employeeId) {
  const rows = await supabase(`green_grin_marketing_routes?select=*&id=eq.${encodeURIComponent(routeId)}&assigned_employee_id=eq.${encodeURIComponent(employeeId)}&status=eq.Active&limit=1`);
  return rows?.[0] || null;
}

async function employeeWorkspace(employee) {
  const employeeId = encodeURIComponent(employee.id);
  const routes = await supabase(`green_grin_marketing_routes?select=*&assigned_employee_id=eq.${employeeId}&status=eq.Active&order=created_at.desc&limit=50`);
  const leads = await supabase(`green_grin_marketing_leads?select=*&assigned_employee_id=eq.${employeeId}&order=created_at.desc&limit=500`);
  return { employee, routes, leads };
}

function setupError(error) {
  const message = String(error?.message || "");
  return message.includes("green_grin_marketing_") || message.includes("is_marketer") || message.includes("schema cache");
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, {});
  const configurationError = requireSetup();
  if (configurationError) return json(500, { error: configurationError });

  try {
    const params = new URLSearchParams(event.rawQuery || "");

    if (event.httpMethod === "GET" && params.get("admin") === "1") {
      const adminError = requireAdmin(event);
      if (adminError) return json(401, { error: adminError });
      const routes = await supabase("green_grin_marketing_routes?select=*&order=created_at.desc&limit=200");
      const leads = await supabase("green_grin_marketing_leads?select=*&order=created_at.desc&limit=1000");
      return json(200, { routes, leads });
    }

    if (event.httpMethod === "GET") {
      const employee = await activeEmployee(event);
      if (!employee) return json(401, { error: "Employee access was not found. Sign in or use your employee PIN." });
      if (!employee.is_marketer) return json(403, { error: "Marketing access has not been enabled for this employee." });
      return json(200, await employeeWorkspace(employee));
    }

    if (event.httpMethod === "POST") {
      const body = JSON.parse(event.body || "{}");
      if (body.action === "create-route") {
        const adminError = requireAdmin(event);
        if (adminError) return json(401, { error: adminError });
        if (!body.subdivision_name || !body.city || !body.assigned_employee_id) {
          return json(400, { error: "Subdivision, city, and marketer are required." });
        }
        const employeeRows = await supabase(`green_grin_employees?select=*&id=eq.${encodeURIComponent(body.assigned_employee_id)}&status=eq.Active&limit=1`);
        const employee = employeeRows?.[0];
        if (!employee?.is_marketer) return json(400, { error: "Choose an active employee with Marketer access." });
        const rows = await supabase("green_grin_marketing_routes", {
          method: "POST",
          body: JSON.stringify({
            subdivision_name: String(body.subdivision_name).trim(),
            city: String(body.city).trim(),
            state: String(body.state || "ID").trim().toUpperCase(),
            notes: String(body.notes || "").trim(),
            assigned_employee_id: employee.id,
            assigned_employee_name: employee.full_name || employee.email,
            status: "Active"
          })
        });
        return json(200, { route: rows?.[0] });
      }

      if (body.action === "capture-house") {
        const employee = await activeEmployee(event);
        if (!employee) return json(401, { error: "Employee access was not found. Sign in or use your employee PIN." });
        if (!employee.is_marketer) return json(403, { error: "Marketing access has not been enabled for this employee." });
        const latitude = validCoordinate(body.latitude, -90, 90);
        const longitude = validCoordinate(body.longitude, -180, 180);
        if (!body.route_id || latitude === null || longitude === null) {
          return json(400, { error: "An assigned route and current location are required." });
        }
        const route = await assignedRoute(body.route_id, employee.id);
        if (!route) return json(403, { error: "That subdivision is not assigned to this employee." });

        const recent = await supabase(`green_grin_marketing_leads?select=*&route_id=eq.${encodeURIComponent(route.id)}&order=created_at.desc&limit=250`);
        const duplicate = recent.find((lead) => distanceMeters({ latitude, longitude }, lead) < 12);
        if (duplicate) return json(200, { lead: duplicate, duplicate: true });

        const manualAddress = String(body.manual_address || "").trim();
        const address = manualAddress || await reverseGeocode(latitude, longitude);
        const rows = await supabase("green_grin_marketing_leads", {
          method: "POST",
          body: JSON.stringify({
            route_id: route.id,
            assigned_employee_id: employee.id,
            address,
            latitude,
            longitude,
            status: "New"
          })
        });
        return json(200, { lead: rows?.[0], duplicate: false });
      }

      return json(400, { error: "Unknown marketing action." });
    }

    if (event.httpMethod === "PATCH") {
      const body = JSON.parse(event.body || "{}");
      if (body.action === "route-status") {
        const adminError = requireAdmin(event);
        if (adminError) return json(401, { error: adminError });
        if (!body.id || !["Active", "Complete"].includes(body.status)) return json(400, { error: "A valid route status is required." });
        const rows = await supabase(`green_grin_marketing_routes?id=eq.${encodeURIComponent(body.id)}`, {
          method: "PATCH",
          body: JSON.stringify({ status: body.status, updated_at: new Date().toISOString() })
        });
        return json(200, { route: rows?.[0] });
      }

      if (body.action === "update-lead") {
        const employee = await activeEmployee(event);
        if (!employee) return json(401, { error: "Employee access was not found. Sign in or use your employee PIN." });
        if (!employee.is_marketer) return json(403, { error: "Marketing access has not been enabled for this employee." });
        const allowed = ["Contacted & Card", "Interested", "Not Interested"];
        if (!body.id || !allowed.includes(body.status)) return json(400, { error: "Choose a valid house result." });
        const existing = await supabase(`green_grin_marketing_leads?select=*&id=eq.${encodeURIComponent(body.id)}&assigned_employee_id=eq.${encodeURIComponent(employee.id)}&limit=1`);
        if (!existing?.[0]) return json(404, { error: "That house visit was not found." });
        const phone = normalizePhone(body.phone);
        const prospectName = String(body.prospect_name || "").trim();
        if (body.status === "Interested" && (!prospectName || phone.length < 10)) {
          return json(400, { error: "Interested leads need a name and valid phone number." });
        }
        const rows = await supabase(`green_grin_marketing_leads?id=eq.${encodeURIComponent(body.id)}`, {
          method: "PATCH",
          body: JSON.stringify({
            status: body.status,
            prospect_name: prospectName || null,
            phone: phone || null,
            email: String(body.email || "").trim().toLowerCase() || null,
            notes: String(body.notes || "").trim() || null,
            contacted_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
        });
        return json(200, { lead: rows?.[0] });
      }

      return json(400, { error: "Unknown marketing action." });
    }

    if (event.httpMethod === "DELETE") {
      const adminError = requireAdmin(event);
      if (adminError) return json(401, { error: adminError });
      const body = JSON.parse(event.body || "{}");
      if (!body.id) return json(400, { error: "Route id is required." });
      await supabase(`green_grin_marketing_routes?id=eq.${encodeURIComponent(body.id)}`, { method: "DELETE" });
      return json(200, { ok: true });
    }

    return json(405, { error: "Method not allowed." });
  } catch (error) {
    if (setupError(error)) {
      return json(500, { error: "Marketing setup is not ready in Supabase. Run the latest portal-setup.sql, wait about 30 seconds, and try again." });
    }
    return json(500, { error: error.message });
  }
};
