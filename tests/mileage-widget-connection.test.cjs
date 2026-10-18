const assert = require("node:assert/strict");
const fs = require("node:fs");

process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
process.env.GREEN_GRIN_ADMIN_PIN = "2468";

global.fetch = async () => {
  throw new Error("A connection test must not read or write customer accounting data.");
};

const { handler } = require("../netlify/functions/portal-expenses.js");

(async () => {
  const connected = await handler({
    httpMethod: "POST",
    headers: { "x-admin-pin": "2468" },
    body: JSON.stringify({ action: "connection_test" })
  });
  assert.equal(connected.statusCode, 200);
  assert.deepEqual(JSON.parse(connected.body), { ok: true, message: "Mileage widget connected." });

  const rejected = await handler({
    httpMethod: "POST",
    headers: { "x-admin-pin": "wrong" },
    body: JSON.stringify({ action: "connection_test" })
  });
  assert.notEqual(rejected.statusCode, 200);

  const activity = fs.readFileSync("android-mileage-widget/app/src/main/java/com/greengrin/mileage/MainActivity.java", "utf8");
  const service = fs.readFileSync("android-mileage-widget/app/src/main/java/com/greengrin/mileage/MileageTrackingService.java", "utf8");
  const build = fs.readFileSync("android-mileage-widget/app/build.gradle", "utf8");
  assert.match(activity, /Test & Save Portal Connection/);
  assert.match(activity, /"connection_test"/);
  assert.match(activity, /setConnectTimeout\(15000\)/);
  assert.match(service, /setReadTimeout\(20000\)/);
  assert.match(service, /BigTextStyle/);
  assert.match(build, /versionCode 3/);

  console.log("Mileage widget portal connection checks passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
