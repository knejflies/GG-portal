const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_PIN = process.env.GREEN_GRIN_ADMIN_PIN;
const { requireAccounting } = require("./accounting-auth");
const { requireAdmin: requireOwner } = require("./portal-auth");

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
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return "Supabase is not configured yet.";
  return null;
}

function requireAdmin(event) {
  return requireOwner(event, "Wrong admin PIN.");
}

function clean(value, max = 300) { return String(value || "").trim().slice(0, max); }
const DEFAULT_GEOCODER_REGION = String(process.env.GREEN_GRIN_GEOCODER_DEFAULT_REGION || "Caldwell, Idaho").trim();
function geocodeDecision(result, requestedAddress) {
  if (!result) return { status: "Needs Correction", latitude: null, longitude: null, display_name: null };
  const display = String(result.display_name || "");
  const requestedNumber = String(requestedAddress || "").match(/^\s*(\d+[a-z]?)/i)?.[1];
  const resultHouseNumber = String(result.address?.house_number || "");
  const hasHouseNumber = !requestedNumber || (resultHouseNumber && new RegExp(`^${requestedNumber}$`, "i").test(resultHouseNumber)) || new RegExp(`\\b${requestedNumber.replace(/[a-z]/i, "[a-z]?")}\\b`, "i").test(display);
  const vagueRoadResult = ["road", "street", "path", "highway"].includes(String(result.type || "").toLowerCase()) && !resultHouseNumber;
  const latitude = Number(result.lat); const longitude = Number(result.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !hasHouseNumber || vagueRoadResult) return { status: "Needs Correction", latitude: null, longitude: null, display_name: display || null };
  return { status: "Located", latitude, longitude, display_name: display };
}
async function geocodeAddress(address) {
  const raw = clean(address);
  const hasRegion = /\b(idaho|id|oregon|or|washington|wa|utah|utah|montana|mt)\b/i.test(raw);
  const query = hasRegion ? raw : `${raw}, ${DEFAULT_GEOCODER_REGION}`;
  const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=8&addressdetails=1&countrycodes=us&q=${encodeURIComponent(query)}`, { headers: { "User-Agent": "Green-Grin-Portal/1.0 contact@greengrinlawns.com" } });
  if (!response.ok) return geocodeDecision(null, address);
  const rows = await response.json().catch(() => []);
  const requestedNumber = raw.match(/^\s*(\d+[a-z]?)/i)?.[1];
  const candidates = (rows || []).filter((row) => {
    const display = String(row.display_name || "");
    const house = String(row.address?.house_number || "");
    return !requestedNumber || house.toLowerCase() === requestedNumber.toLowerCase() || new RegExp(`\\b${requestedNumber.replace(/[a-z]/i, "[a-z]?")}\\b`, "i").test(display);
  });
  candidates.sort((a, b) => ((Number(b.importance) || 0) + (String(b.type).toLowerCase() === "house" ? .5 : 0)) - ((Number(a.importance) || 0) + (String(a.type).toLowerCase() === "house" ? .5 : 0)));
  return geocodeDecision(candidates[0], address);
}

async function savePropertyGeocode(propertyId, geocode) {
  const update = { latitude: geocode.latitude, longitude: geocode.longitude, geocode_status: geocode.status, geocode_display_name: geocode.display_name };
  try {
    return await supabase(`green_grin_properties?id=eq.${encodeURIComponent(propertyId)}`, { method: "PATCH", body: JSON.stringify(update) });
  } catch (error) {
    const message = error.message || "";
    if (/latitude|longitude/i.test(message)) return { unsupported: true, reason: "The property table needs latitude and longitude columns before map pins can be saved." };
    if (/geocode_display_name/i.test(message)) {
      const { geocode_display_name: omittedDisplayName, ...compatibleUpdate } = update;
      try {
        return await supabase(`green_grin_properties?id=eq.${encodeURIComponent(propertyId)}`, { method: "PATCH", body: JSON.stringify(compatibleUpdate) });
      } catch (statusError) {
        if (!/geocode_status/i.test(statusError.message || "")) throw statusError;
        const { geocode_status: omittedStatus, ...coordinateUpdate } = compatibleUpdate;
        return supabase(`green_grin_properties?id=eq.${encodeURIComponent(propertyId)}`, { method: "PATCH", body: JSON.stringify(coordinateUpdate) });
      }
    }
    if (/geocode_status/i.test(message)) {
      const { geocode_status: omittedStatus, ...compatibleUpdate } = update;
      try {
        return await supabase(`green_grin_properties?id=eq.${encodeURIComponent(propertyId)}`, { method: "PATCH", body: JSON.stringify(compatibleUpdate) });
      } catch (displayError) {
        if (!/geocode_display_name/i.test(displayError.message || "")) throw displayError;
        const { geocode_display_name: omittedDisplayName, ...coordinateUpdate } = compatibleUpdate;
        return supabase(`green_grin_properties?id=eq.${encodeURIComponent(propertyId)}`, { method: "PATCH", body: JSON.stringify(coordinateUpdate) });
      }
    }
    throw error;
  }
}

async function insertPropertyCompatible(payload) {
  try {
    return await supabase("green_grin_properties", { method: "POST", body: JSON.stringify(payload) });
  } catch (error) {
    const message = error.message || "";
    if (/latitude|longitude/i.test(message)) return { unsupported: true, reason: "The property table needs latitude and longitude columns before map pins can be saved." };
    if (/geocode_display_name/i.test(message)) {
      const { geocode_display_name: omittedDisplayName, ...compatiblePayload } = payload;
      try { return await supabase("green_grin_properties", { method: "POST", body: JSON.stringify(compatiblePayload) }); } catch (statusError) {
        if (!/geocode_status/i.test(statusError.message || "")) throw statusError;
        const { geocode_status: omittedStatus, ...coordinatePayload } = compatiblePayload;
        return supabase("green_grin_properties", { method: "POST", body: JSON.stringify(coordinatePayload) });
      }
    }
    if (/geocode_status/i.test(message)) {
      const { geocode_status: omittedStatus, ...compatiblePayload } = payload;
      try { return await supabase("green_grin_properties", { method: "POST", body: JSON.stringify(compatiblePayload) }); } catch (displayError) {
        if (!/geocode_display_name/i.test(displayError.message || "")) throw displayError;
        const { geocode_display_name: omittedDisplayName, ...coordinatePayload } = compatiblePayload;
        return supabase("green_grin_properties", { method: "POST", body: JSON.stringify(coordinatePayload) });
      }
    }
    throw error;
  }
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

async function archiveForCustomer({ customerUserId, phone, email }) {
  const archive = {
    archived_at: new Date().toISOString(),
    customer: null,
    properties: [],
    jobs: [],
    invoices: [],
    message_logs: [],
    chat_messages: []
  };

  if (customerUserId) {
    const customers = await supabase(`green_grin_customers?select=*&id=eq.${encodeURIComponent(customerUserId)}&limit=1`);
    archive.customer = customers?.[0] || null;
    archive.properties = await supabase(`green_grin_properties?select=*&customer_user_id=eq.${encodeURIComponent(customerUserId)}`);
    archive.chat_messages = await supabase(`green_grin_customer_chat?select=*&customer_user_id=eq.${encodeURIComponent(customerUserId)}&order=created_at.asc`).catch(() => []);
  }

  const jobMatches = [];
  if (customerUserId) jobMatches.push(`customer_user_id.eq.${encodeURIComponent(customerUserId)}`);
  if (phone) jobMatches.push(`phone.eq.${encodeURIComponent(phone)}`);
  if (email) jobMatches.push(`email.eq.${encodeURIComponent(email)}`);
  if (jobMatches.length) {
    archive.jobs = await supabase(`green_grin_jobs?select=*&or=(${jobMatches.join(",")})&order=created_at.desc`);
    archive.invoices = await supabase(`green_grin_invoices?select=*&or=(${jobMatches.join(",")})&order=created_at.desc`);
  }

  const jobIds = archive.jobs.map((job) => job.id).filter(Boolean);
  if (jobIds.length) {
    archive.message_logs = await supabase(`green_grin_message_log?select=*&job_id=in.(${jobIds.join(",")})&order=created_at.desc`);
  }

  archive.customer_code = archive.customer?.customer_code || archive.jobs.find((job) => job.customer_code)?.customer_code || null;
  archive.name = archive.customer?.full_name || archive.jobs[0]?.customer_name || "";
  archive.phone = archive.customer?.phone || phone || archive.jobs[0]?.phone || "";
  archive.email = archive.customer?.email || email || archive.jobs[0]?.email || "";
  return archive;
}

async function archiveCustomerRecords({ customerUserId, phone, email }) {
  if (customerUserId) {
    await supabase(`green_grin_customers?id=eq.${encodeURIComponent(customerUserId)}`, {
      method: "PATCH",
      body: JSON.stringify({ active: false, billing_status: "Archived" })
    });
    await supabase(`green_grin_properties?customer_user_id=eq.${encodeURIComponent(customerUserId)}`, {
      method: "PATCH",
      body: JSON.stringify({ active: false })
    }).catch(() => null);
    await supabase(`green_grin_jobs?customer_user_id=eq.${encodeURIComponent(customerUserId)}&status=neq.Completed`, {
      method: "PATCH",
      body: JSON.stringify({ status: "Archived" })
    }).catch(() => null);
    return;
  }
  if (phone) {
    await supabase(`green_grin_jobs?phone=eq.${encodeURIComponent(phone)}&status=neq.Completed`, { method: "PATCH", body: JSON.stringify({ status: "Archived" }) });
  }
  if (email) {
    await supabase(`green_grin_jobs?email=eq.${encodeURIComponent(email)}&status=neq.Completed`, { method: "PATCH", body: JSON.stringify({ status: "Archived" }) });
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, {});

  const setupError = requireSetup();
  if (setupError) return json(500, { error: setupError });

  try {
    if (event.httpMethod === "GET") {
      await requireAccounting(event, supabase);
      const customers = await supabase("green_grin_customers?select=*&active=eq.true&order=customer_code.asc.nullslast,created_at.desc&limit=300");
      const properties = await supabase("green_grin_properties?select=*&active=eq.true&order=created_at.desc&limit=500");
      const jobs = await supabase("green_grin_jobs?select=*&order=created_at.desc&limit=500");
      const devices = await supabase("green_grin_push_subscriptions?select=owner_email,customer_user_id,customer_code,updated_at&active=eq.true&owner_type=eq.customer&limit=1000").catch(() => []);
      const propertyByUser = new Map();
      for (const property of properties || []) {
        if (!propertyByUser.has(property.customer_user_id)) propertyByUser.set(property.customer_user_id, []);
        propertyByUser.get(property.customer_user_id).push(property);
      }
      const byKey = new Map();

      for (const customer of customers || []) {
        const key = customer.customer_code || customer.id || customer.email || customer.phone;
        const customerProperties = propertyByUser.get(customer.id) || [];
        const customerJobs = (jobs || []).filter((job) =>
          (customer.id && job.customer_user_id === customer.id) ||
          (customer.customer_code && job.customer_code === customer.customer_code) ||
          (customer.email && job.email === customer.email) ||
          (customer.phone && job.phone === customer.phone)
        );
        const blowoutOnly = !customerJobs.length && customerProperties.length > 0 && customerProperties.every((row) => String(row.property_name || "").trim().toLowerCase() === "sprinkler blowout property");
        if (blowoutOnly) continue;
        const newestJob = customerJobs[0] || {};
        // Legacy customers may have jobs but no property row yet. Keep those
        // customers visible on the map using the job's saved address/coords;
        // this is a read-only fallback until the canonical property is located.
        const jobCoordinates = Number.isFinite(Number(newestJob.latitude)) && Number.isFinite(Number(newestJob.longitude))
          ? { latitude: Number(newestJob.latitude), longitude: Number(newestJob.longitude), geocode_status: "Located" }
          : { latitude: null, longitude: null, geocode_status: "Pending" };
        const property = customerProperties[0] || (newestJob.address ? {
          id: null,
          customer_user_id: customer.id,
          address: newestJob.address,
          ...jobCoordinates,
          property_source: "job_fallback"
        } : {});
        const customerDevices = (devices || []).filter((device) =>
          (customer.id && device.customer_user_id === customer.id) ||
          (customer.customer_code && device.customer_code === customer.customer_code) ||
          (customer.email && String(device.owner_email || "").toLowerCase() === String(customer.email || "").toLowerCase())
        );
        const lastNotificationDevice = customerDevices
          .map((device) => device.updated_at)
          .filter(Boolean)
          .sort()
          .pop() || null;
        byKey.set(key, {
          id: customer.id || "",
          customer_user_id: customer.id || "",
          customer_code: customer.customer_code || "",
          name: customer.full_name || customer.email || customer.phone || "Customer",
          phone: customer.phone || "",
          email: customer.email || "",
          active: customer.active !== false,
          plan: customer.billing_plan || newestJob.service_type || "",
          requested_plan_id: customer.requested_plan_id || "",
          requested_plan: customer.requested_plan || "",
          requested_plan_at: customer.requested_plan_at || null,
          billing_status: customer.billing_status || "",
          monthly_price: customer.monthly_price || newestJob.monthly_price || null,
          annual_price: customer.annual_price || newestJob.annual_price || null,
          service_weekday: Number.isInteger(customer.service_weekday) ? customer.service_weekday : null,
          text_cleanup_reminders: customer.text_cleanup_reminders !== false,
          text_done_messages: customer.text_done_messages !== false,
          email_monthly_receipts: customer.email_monthly_receipts === true,
          notification_devices: customerDevices.length,
          notification_last_seen: lastNotificationDevice,
          property,
          jobs: customerJobs.slice(0, 12)
        });
      }

      return json(200, { customers: [...byKey.values()] });
    }

    const body = JSON.parse(event.body || "{}");
    const adminError = requireAdmin(event);
    if (adminError) return json(401, { error: adminError });
    if (event.httpMethod === "POST" && body.action === "locate-properties") {
      const refreshCoordinates = body.refresh !== false;
      const properties = await supabase("green_grin_properties?select=*&active=eq.true&address=not.is.null&order=created_at.desc&limit=1000");
      const jobs = await supabase("green_grin_jobs?select=customer_user_id,address,created_at&customer_user_id=not.is.null&address=not.is.null&order=created_at.desc&limit=1000");
      const normalizeAddress = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      const knownProperties = new Set((properties || []).map((property) => `${property.customer_user_id}:${normalizeAddress(property.address)}`));
      let located = 0; let needsCorrection = 0; let skipped = 0;
      for (const property of properties || []) {
        if (!refreshCoordinates && property.geocode_status === "Located" && Number.isFinite(Number(property.latitude)) && Number.isFinite(Number(property.longitude))) { skipped += 1; continue; }
        const geocode = await geocodeAddress(property.address);
        const saved = await savePropertyGeocode(property.id, geocode);
        if (saved?.unsupported) { skipped += 1; continue; }
        if (geocode.status === "Located") located += 1; else needsCorrection += 1;
      }
      // Backfill the canonical property record for older customers whose
      // history only contains a job address. This is idempotent by customer
      // and normalized address, so repeated Locate clicks stay safe.
      for (const job of jobs || []) {
        const address = clean(job.address, 300);
        if (!job.customer_user_id || !address) continue;
        const key = `${job.customer_user_id}:${normalizeAddress(address)}`;
        if (knownProperties.has(key)) continue;
        knownProperties.add(key);
        const geocode = await geocodeAddress(address);
        const inserted = await insertPropertyCompatible({ customer_user_id: job.customer_user_id, address, active: true, latitude: geocode.latitude, longitude: geocode.longitude, geocode_status: geocode.status, geocode_display_name: geocode.display_name });
        if (inserted?.unsupported) { skipped += 1; continue; }
        if (geocode.status === "Located") located += 1; else needsCorrection += 1;
      }
      return json(200, { located, needs_correction: needsCorrection, skipped, schema_update_required: skipped > 0 && located === 0 && needsCorrection === 0 });
    }
    const customerUserId = body.customer_user_id || null;
    const phone = body.phone || "";
    const email = body.email || "";

    if (!customerUserId && !phone && !email) {
      return json(400, { error: "Customer id, phone, or email is required." });
    }

    if (event.httpMethod === "PATCH") {
      if (!customerUserId) return json(400, { error: "Only account customers can be updated." });
      if (body.archive === true) {
        await archiveCustomerRecords({ customerUserId, phone, email });
        return json(200, { ok: true, archived: true });
      }
      const editableFields = {};
      if (Object.prototype.hasOwnProperty.call(body, "billing_plan")) editableFields.billing_plan = String(body.billing_plan || "").trim().slice(0, 160) || null;
      if (Object.prototype.hasOwnProperty.call(body, "monthly_price")) editableFields.monthly_price = body.monthly_price === "" || body.monthly_price === null ? null : Math.max(0, Number(body.monthly_price) || 0);
      if (Object.prototype.hasOwnProperty.call(body, "annual_price")) editableFields.annual_price = body.annual_price === "" || body.annual_price === null ? null : Math.max(0, Number(body.annual_price) || 0);
      if (Object.prototype.hasOwnProperty.call(body, "billing_status")) editableFields.billing_status = String(body.billing_status || "").trim().slice(0, 80) || "Active";
      if (Object.keys(editableFields).length) {
        const rows = await supabase(`green_grin_customers?id=eq.${encodeURIComponent(customerUserId)}`, { method: "PATCH", body: JSON.stringify(editableFields) });
        return json(200, { customer: rows?.[0] || null });
      }
      if (Object.prototype.hasOwnProperty.call(body, "service_weekday")) {
        const weekday = body.service_weekday === null || body.service_weekday === "" ? null : Number(body.service_weekday);
        if (weekday !== null && (!Number.isInteger(weekday) || weekday < 0 || weekday > 6)) {
          return json(400, { error: "Choose a valid service day." });
        }
        const rows = await supabase(`green_grin_customers?id=eq.${encodeURIComponent(customerUserId)}`, {
          method: "PATCH",
          body: JSON.stringify({ service_weekday: weekday })
        });
        return json(200, { customer: rows?.[0] || null });
      }
      const rows = await supabase(`green_grin_customers?id=eq.${encodeURIComponent(customerUserId)}`, {
        method: "PATCH",
        body: JSON.stringify({ active: false })
      });
      return json(200, { customer: rows?.[0] || null });
    }

    if (event.httpMethod === "DELETE") {
      const archive = await archiveForCustomer({ customerUserId, phone, email });
      await archiveCustomerRecords({ customerUserId, phone, email });
      return json(200, { ok: true, archived: true, authDeleted: false, archive });
    }

    return json(405, { error: "Method not allowed." });
  } catch (error) {
    return json(500, { error: error.message });
  }
};
