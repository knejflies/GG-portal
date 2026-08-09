const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_PIN = process.env.GREEN_GRIN_ADMIN_PIN;

const responseHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, x-admin-pin",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function json(statusCode, body) {
  return { statusCode, headers: responseHeaders, body: JSON.stringify(body) };
}

function routeCost(route, matrix) {
  let total = 0;
  for (let index = 1; index < route.length; index += 1) {
    const leg = Number(matrix[route[index - 1]]?.[route[index]]);
    if (!Number.isFinite(leg)) return Number.POSITIVE_INFINITY;
    total += leg;
  }
  return total;
}

function optimizePath(matrix) {
  if (!Array.isArray(matrix) || matrix.length < 2) return [];
  const remaining = new Set(Array.from({ length: matrix.length - 1 }, (_, index) => index + 1));
  const route = [0];

  while (remaining.size) {
    const current = route[route.length - 1];
    let next = null;
    let best = Number.POSITIVE_INFINITY;
    for (const candidate of remaining) {
      const duration = Number(matrix[current]?.[candidate]);
      if (Number.isFinite(duration) && duration < best) {
        best = duration;
        next = candidate;
      }
    }
    if (next === null) next = remaining.values().next().value;
    route.push(next);
    remaining.delete(next);
  }

  let improved = true;
  while (improved) {
    improved = false;
    const currentCost = routeCost(route, matrix);
    for (let start = 1; start < route.length - 1; start += 1) {
      for (let end = start + 1; end < route.length; end += 1) {
        const candidate = [
          ...route.slice(0, start),
          ...route.slice(start, end + 1).reverse(),
          ...route.slice(end + 1)
        ];
        if (routeCost(candidate, matrix) + 0.01 < currentCost) {
          route.splice(0, route.length, ...candidate);
          improved = true;
          break;
        }
      }
      if (improved) break;
    }
  }
  return route;
}

function summarizeRoute(route, durations, distances) {
  let seconds = 0;
  let meters = 0;
  for (let index = 1; index < route.length; index += 1) {
    seconds += Number(durations[route[index - 1]]?.[route[index]]) || 0;
    meters += Number(distances[route[index - 1]]?.[route[index]]) || 0;
  }
  return { total_drive_seconds: Math.round(seconds), total_distance_meters: Math.round(meters) };
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

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function geocode(address) {
  const query = String(address || "").trim();
  if (!query) throw new Error("A route stop is missing its address.");
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "us");
  url.searchParams.set("q", query);
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Green-Grin-Route-Planner/1.0 (ken@greengrinlawns.com)",
      Accept: "application/json"
    }
  });
  if (!response.ok) throw new Error("The address lookup service is temporarily unavailable.");
  const rows = await response.json();
  if (!rows?.[0]) throw new Error(`Could not locate: ${query}`);
  return { latitude: Number(rows[0].lat), longitude: Number(rows[0].lon), display_name: rows[0].display_name };
}

async function roadMatrix(points) {
  const coordinates = points.map((point) => `${point.longitude},${point.latitude}`).join(";");
  const url = `https://router.project-osrm.org/table/v1/driving/${coordinates}?annotations=duration,distance`;
  const response = await fetch(url, {
    headers: { "User-Agent": "Green-Grin-Route-Planner/1.0 (ken@greengrinlawns.com)" }
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.code !== "Ok" || !data?.durations || !data?.distances) {
    throw new Error("Road travel times could not be calculated right now. Try again in a minute.");
  }
  return data;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, {});
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed." });
  if (!ADMIN_PIN || event.headers["x-admin-pin"] !== ADMIN_PIN) return json(401, { error: "Owner sign-in is required." });
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return json(500, { error: "Supabase is not configured." });

  try {
    const body = JSON.parse(event.body || "{}");
    const jobIds = Array.isArray(body.job_ids) ? [...new Set(body.job_ids.map(String))] : [];
    if (!jobIds.length) return json(400, { error: "Select at least one job to optimize." });
    if (jobIds.length > 40) return json(400, { error: "Optimize up to 40 stops at a time." });

    const encodedIds = jobIds.map((id) => encodeURIComponent(id)).join(",");
    const jobs = await supabase(`green_grin_jobs?select=id,customer_name,address,latitude,longitude&id=in.(${encodedIds})`);
    const jobsById = new Map(jobs.map((job) => [job.id, job]));
    const orderedJobs = jobIds.map((id) => jobsById.get(id)).filter(Boolean);
    if (orderedJobs.length !== jobIds.length) return json(400, { error: "One or more selected jobs no longer exist." });

    let start;
    if (Number.isFinite(Number(body.start_latitude)) && Number.isFinite(Number(body.start_longitude))) {
      start = { latitude: Number(body.start_latitude), longitude: Number(body.start_longitude), display_name: String(body.start_address || "Starting point") };
    } else {
      start = await geocode(body.start_address);
      await wait(1050);
    }

    const points = [start];
    for (const job of orderedJobs) {
      let point;
      if (job.latitude !== null && job.latitude !== "" && job.longitude !== null && job.longitude !== "" && Number.isFinite(Number(job.latitude)) && Number.isFinite(Number(job.longitude))) {
        point = { latitude: Number(job.latitude), longitude: Number(job.longitude), display_name: job.address };
      } else {
        point = await geocode(job.address);
        await supabase(`green_grin_jobs?id=eq.${encodeURIComponent(job.id)}`, {
          method: "PATCH",
          body: JSON.stringify({ latitude: point.latitude, longitude: point.longitude })
        });
        await wait(1050);
      }
      points.push(point);
    }

    const matrix = await roadMatrix(points);
    const route = optimizePath(matrix.durations);
    if (route.length !== points.length || !Number.isFinite(routeCost(route, matrix.durations))) {
      throw new Error("Not every stop could be reached by road. Check the property addresses and try again.");
    }
    const summary = summarizeRoute(route, matrix.durations, matrix.distances);
    const optimizedJobIds = route.slice(1).map((pointIndex) => orderedJobs[pointIndex - 1].id);

    return json(200, {
      job_ids: optimizedJobIds,
      start,
      ...summary,
      note: "Order is optimized from the starting point using road travel estimates. Live traffic is not included."
    });
  } catch (error) {
    if (String(error.message).includes("latitude") || String(error.message).includes("longitude")) {
      return json(500, { error: "Route location fields are not ready. Run the latest portal-setup.sql in Supabase, then try again." });
    }
    return json(500, { error: error.message });
  }
};

exports._test = { optimizePath, routeCost, summarizeRoute };
