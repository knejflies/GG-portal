const assert = require("assert");

process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_ANON_KEY = "anon-test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-test";

const pricing = require("../assets/green-grin-pricing-config.json");
let savedRequest = null;

global.fetch = async (url, options = {}) => {
  const href = String(url);
  const method = options.method || "GET";
  if (href.includes("/auth/v1/user")) {
    return new Response(JSON.stringify({ id: "11111111-1111-1111-1111-111111111111", email: "customer@example.com" }), { status: 200 });
  }
  if (href.includes("green_grin_pricing_config")) {
    return new Response(JSON.stringify([{ config: pricing }]), { status: 200 });
  }
  if (href.includes("green_grin_customers?id=eq.") && method === "PATCH") {
    savedRequest = JSON.parse(options.body);
    return new Response(JSON.stringify([{ id: "11111111-1111-1111-1111-111111111111", ...savedRequest }]), { status: 200 });
  }
  if (href.includes("green_grin_customers?select=")) {
    return new Response(JSON.stringify([{
      id: "11111111-1111-1111-1111-111111111111",
      customer_code: "GG-0001",
      email: "customer@example.com",
      phone: "3602184710",
      active: true,
      ...savedRequest
    }]), { status: 200 });
  }
  if (href.includes("green_grin_customers?on_conflict=id")) {
    return new Response(JSON.stringify([{
      id: "11111111-1111-1111-1111-111111111111",
      customer_code: "GG-0001",
      email: "customer@example.com",
      phone: "3602184710",
      active: true,
      ...savedRequest
    }]), { status: 200 });
  }
  if (href.includes("green_grin_properties?select=")) {
    return new Response(JSON.stringify([{ id: "property-1", customer_user_id: "11111111-1111-1111-1111-111111111111" }]), { status: 200 });
  }
  return new Response(JSON.stringify([]), { status: 200 });
};

const { handler } = require("../netlify/functions/portal-account.js");

(async () => {
  const response = await handler({
    httpMethod: "PATCH",
    headers: { authorization: "Bearer customer-token" },
    body: JSON.stringify({ plan_request: "sharp" })
  });
  const body = JSON.parse(response.body);

  assert.strictEqual(response.statusCode, 200);
  assert.strictEqual(savedRequest.requested_plan_id, "sharp");
  assert.strictEqual(savedRequest.requested_plan, "Sharp Grin");
  assert.ok(savedRequest.requested_plan_at);
  assert.strictEqual(body.customer.requested_plan, "Sharp Grin");
  console.log("Customer plan request saves to the account and returns to the portal.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
