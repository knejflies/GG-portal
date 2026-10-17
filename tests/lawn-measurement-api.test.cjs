const assert = require("node:assert/strict");

process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_ANON_KEY = "anon";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
process.env.GREEN_GRIN_ADMIN_PIN = "1234";

function response(data, ok = true) {
  return { ok, json: async () => data };
}

function rectangle(lat, lng, widthFeet, heightFeet) {
  const latDelta = heightFeet / 364000;
  const lngDelta = widthFeet / (364000 * Math.cos(lat * Math.PI / 180));
  const ring = [[lng, lat], [lng + lngDelta, lat], [lng + lngDelta, lat + latDelta], [lng, lat + latDelta], [lng, lat]];
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } };
}

const { handler } = require("../netlify/functions/portal-lawn-measurements");
const lawn = rectangle(43.6629, -116.6874, 100, 50);

(async () => {
  const unauthorized = await handler({ httpMethod: "GET", headers: {}, rawQuery: "address=123" });
  assert.equal(unauthorized.statusCode, 401);

  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.includes("green_grin_properties")) return response([]);
    if (url.endsWith("green_grin_lawn_measurements")) {
      const payload = JSON.parse(options.body);
      return response([{ id: "measurement-1", ...payload }]);
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  const saved = await handler({
    httpMethod: "POST",
    headers: { "x-admin-pin": "1234" },
    body: JSON.stringify({ address: "123 Test St", latitude: 43.6629, longitude: -116.6874, geocode_confidence: 0.9, zones: [lawn], exclusions: [], gross_square_feet: 1, net_square_feet: 1 })
  });
  assert.equal(saved.statusCode, 200);
  const savedBody = JSON.parse(saved.body);
  assert.ok(savedBody.measurement.net_square_feet > 4900 && savedBody.measurement.net_square_feet < 5100, "server must recompute area rather than trust client totals");
  assert.equal(calls.filter((call) => call.url.endsWith("green_grin_lawn_measurements")).length, 1);

  global.fetch = async (url) => {
    if (url.includes("green_grin_properties")) return response([]);
    if (url.includes("supersedes_id=eq.measurement-1")) return response([{ ...savedBody.measurement, supersedes_id: "measurement-1", zones: [lawn], exclusions: [] }]);
    throw new Error(`A duplicate save should not insert: ${url}`);
  };
  const duplicate = await handler({
    httpMethod: "POST",
    headers: { "x-admin-pin": "1234" },
    body: JSON.stringify({ id: "measurement-1", address: "123 Test St", latitude: 43.6629, longitude: -116.6874, geocode_confidence: 0.9, zones: [lawn], exclusions: [] })
  });
  assert.equal(duplicate.statusCode, 200);
  assert.equal(JSON.parse(duplicate.body).duplicatePrevented, true);

  console.log("Lawn measurement API tests passed.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
