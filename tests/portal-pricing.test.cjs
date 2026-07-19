const assert = require("assert");
const defaultPricing = require("../assets/green-grin-pricing-config.json");

process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";
process.env.GREEN_GRIN_ADMIN_PIN = "2468";

let savedRow = null;
global.fetch = async (url, options = {}) => {
  const requestUrl = String(url);
  let response = [];
  if (requestUrl.includes("select=version")) response = savedRow ? [{ version: savedRow.version }] : [];
  if (requestUrl.includes("select=config")) response = savedRow ? [savedRow] : [];
  if (options.method === "POST") {
    savedRow = JSON.parse(options.body)[0];
    response = [savedRow];
  }
  return {
    ok: true,
    text: async () => JSON.stringify(response)
  };
};

const { handler } = require("../netlify/functions/portal-pricing.js");

const event = (method, body) => ({
  httpMethod: method,
  headers: { "x-admin-pin": "2468" },
  body: body ? JSON.stringify(body) : undefined
});

(async () => {
  const defaultsResponse = await handler(event("GET"));
  const defaultsBody = JSON.parse(defaultsResponse.body);
  assert.equal(defaultsResponse.statusCode, 200);
  assert.deepEqual(defaultsBody.config, defaultPricing);
  assert.equal(defaultsBody.config.mowingBid.pricePer1000SqFtPerVisit, 10);
  assert.equal(defaultsBody.config.fertilizerBid.targetGrossMargin, 0.5);
  assert.equal(defaultsBody.config.fertilizerBid.pricePer1000SqFtPerVisit, 35);
  assert.equal(defaultsBody.config.fertilizerBid.applications.length, 5);

  const changed = JSON.parse(JSON.stringify(defaultPricing));
  changed.plans.fresh.minimumWeekly = 65;
  changed.mowingBid.minimumPerVisit = 60;
  changed.fertilizerBid.targetGrossMargin = 0.55;
  const saveResponse = await handler(event("PATCH", { config: changed }));
  const saveBody = JSON.parse(saveResponse.body);
  assert.equal(saveResponse.statusCode, 200);
  assert.equal(saveBody.config.plans.fresh.minimumWeekly, 65);
  assert.equal(saveBody.config.mowingBid.minimumPerVisit, 60);
  assert.equal(saveBody.config.fertilizerBid.targetGrossMargin, 0.55);
  assert.equal(saveBody.version, 2);

  delete savedRow.config.fertilizerBid;
  const legacyResponse = await handler(event("GET"));
  const legacyBody = JSON.parse(legacyResponse.body);
  assert.equal(legacyResponse.statusCode, 200);
  assert.equal(legacyBody.config.fertilizerBid.applications.length, 5);
  assert.equal(legacyBody.config.fertilizerBid.products.nitrex.analysis, "20-1-5");

  const bad = JSON.parse(JSON.stringify(defaultPricing));
  bad.annualAgreementDiscount = 1.5;
  const badResponse = await handler(event("PATCH", { config: bad }));
  assert.equal(badResponse.statusCode, 400);

  const badFertilizer = JSON.parse(JSON.stringify(defaultPricing));
  badFertilizer.fertilizerBid.products.nitrex.analysis = "invalid";
  const badFertilizerResponse = await handler(event("PATCH", { config: badFertilizer }));
  assert.equal(badFertilizerResponse.statusCode, 400);

  const wrongPinResponse = await handler({ ...event("GET"), headers: { "x-admin-pin": "nope" } });
  assert.equal(wrongPinResponse.statusCode, 401);

  console.log("Lawn Bidder pricing API tests passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
