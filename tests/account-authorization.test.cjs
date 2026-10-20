const assert = require("node:assert/strict");

process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_ANON_KEY = "test-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";

const account = require("../netlify/functions/portal-account.js");

(async () => {
  const missing = await account.handler({ httpMethod: "GET", headers: {} });
  assert.equal(missing.statusCode, 401);
  assert.match(JSON.parse(missing.body).error, /sign in/i);

  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: false, json: async () => ({ message: "invalid token" }) });
  try {
    const expired = await account.handler({ httpMethod: "GET", headers: { authorization: "Bearer expired" } });
    assert.equal(expired.statusCode, 401);
    assert.match(JSON.parse(expired.body).error, /expired/i);
  } finally {
    global.fetch = originalFetch;
  }

  console.log("Customer account authorization tests passed.");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
