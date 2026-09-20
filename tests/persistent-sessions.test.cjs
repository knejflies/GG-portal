const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
process.env.GREEN_GRIN_ADMIN_PIN = "246810";

const root = path.resolve(__dirname, "..");
const sessionFunction = require(path.join(root, "netlify/functions/portal-session.js"));

async function call(body) {
  const response = await sessionFunction.handler({ httpMethod: "POST", body: JSON.stringify(body) });
  return { statusCode: response.statusCode, body: JSON.parse(response.body) };
}

(async () => {
  const wrong = await call({ action: "create", mode: "admin", pin: "wrong" });
  assert.equal(wrong.statusCode, 401);

  const created = await call({ action: "create", mode: "admin", pin: "246810" });
  assert.equal(created.statusCode, 200);
  assert.ok(created.body.token.includes("."));
  assert.equal(created.body.pin, undefined, "The PIN must not be stored in the device token response.");

  const restored = await call({ action: "restore", mode: "admin", token: created.body.token });
  assert.equal(restored.statusCode, 200);
  assert.equal(restored.body.pin, "246810");

  const tampered = `${created.body.token.slice(0, -1)}x`;
  const rejected = await call({ action: "restore", mode: "admin", token: tampered });
  assert.equal(rejected.statusCode, 401);

  const sessionAsset = fs.readFileSync(path.join(root, "assets/green-grin-session.js"), "utf8");
  assert.match(sessionAsset, /greenGrinPersistentSessionV1/);
  assert.match(sessionAsset, /localStorage\.setItem\(storageKey\(mode\), token\)/);

  for (const relative of ["admin/index.html", "employee/index.html", "portal/index.html", "portal.html"]) {
    const html = fs.readFileSync(path.join(root, relative), "utf8");
    assert.match(html, /green-grin-session\.js/, `${relative} must load persistent sessions.`);
    assert.match(html, /restorePersistentPortalPin/, `${relative} must restore a saved device session.`);
  }

  const employeeHtml = fs.readFileSync(path.join(root, "employee/index.html"), "utf8");
  assert.match(employeeHtml, /requestedView !== "timeclock"/);
  assert.match(employeeHtml, /employee-timeclock-card/);

  const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest-employee.webmanifest"), "utf8"));
  assert.ok(manifest.shortcuts.some((shortcut) => shortcut.url === "/employee/?view=timeclock"));

  const adminManifest = JSON.parse(fs.readFileSync(path.join(root, "manifest-admin.webmanifest"), "utf8"));
  assert.ok(adminManifest.shortcuts.some((shortcut) => shortcut.url === "/admin/?view=mileage"));
  assert.ok(adminManifest.shortcuts.some((shortcut) => shortcut.url === "/admin/?view=mileage&track=1"));

  const adminHtml = fs.readFileSync(path.join(root, "admin/index.html"), "utf8");
  assert.match(adminHtml, /requestedView === "mileage"/);
  assert.match(adminHtml, /startMileageGpsTracking/);
  assert.match(adminHtml, /watchPosition/);

  const serviceWorker = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");
  assert.match(serviceWorker, /green-grin-app-v47/);
  assert.match(serviceWorker, /green-grin-session\.js/);

  console.log("Persistent session and Android time-clock shortcut tests passed.");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
