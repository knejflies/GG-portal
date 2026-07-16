const fs = require("fs");

const files = {
  "admin/index.html": "/manifest-admin.webmanifest",
  "employee/index.html": "/manifest-employee.webmanifest",
  "portal/index.html": "/manifest-customer.webmanifest",
  "portal.html": "/manifest-customer.webmanifest"
};

for (const [file, expectedManifest] of Object.entries(files)) {
  const html = fs.readFileSync(file, "utf8");
  const manifest = html.match(/<link rel="manifest" href="([^"]+)"/i)?.[1];
  if (manifest !== expectedManifest) {
    throw new Error(`${file}: expected ${expectedManifest}, found ${manifest || "no manifest"}`);
  }
  for (const requiredMarkup of [
    'data-tab="plans"',
    'id="customer-plan-options"',
    'id="customer-plan-result"',
    'data-request-plan'
  ]) {
    if (!html.includes(requiredMarkup)) throw new Error(`${file}: missing customer plan markup ${requiredMarkup}`);
  }
  const inlineScripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1])
    .filter((code) => code.trim());
  for (const code of inlineScripts) new Function(code);
  console.log(`${file}: ${inlineScripts.length} inline script(s) passed syntax validation.`);
}
