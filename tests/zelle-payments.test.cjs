const assert = require("assert");
const fs = require("fs");

process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_ANON_KEY = "test-anon";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";

const accountModule = require("../netlify/functions/portal-account.js");
const invoiceModule = require("../netlify/functions/portal-invoices.js");
const configModule = require("../netlify/functions/portal-config.js");

const invoice = {
  id: "12345678-abcd-4321-aaaa-987654321000",
  customer_user_id: "user-1",
  customer_code: "GG-0042",
  customer_name: "Test Customer",
  phone: "2085551111",
  email: "customer@example.com",
  amount: 381,
  status: "Payment Pending",
  payment_method: "Zelle",
  payment_reference: "GG-12345678",
  payment_reported_at: "2026-07-18T12:00:00.000Z",
  payment_url: "zelle-reported:2026-07-18T12:00:00.000Z"
};

assert.equal(accountModule._test.invoicePaymentReference(invoice), "GG-12345678");
assert.equal(accountModule._test.invoiceBelongsToCustomer(invoice, { id: "user-1" }, {}), true);
assert.equal(accountModule._test.invoiceBelongsToCustomer(invoice, { id: "other", email: "customer@example.com" }, {}), true);
assert.equal(accountModule._test.invoiceBelongsToCustomer(invoice, { id: "other" }, { customer_code: "GG-0042" }), true);
assert.equal(accountModule._test.invoiceBelongsToCustomer(invoice, { id: "other" }, { phone: "(208) 555-1111" }), true);
assert.equal(accountModule._test.invoiceBelongsToCustomer(invoice, { id: "other", email: "wrong@example.com" }, { customer_code: "GG-9999", phone: "2085559999" }), false);

const pendingPayload = invoiceModule._test.invoicePayload(invoice);
assert.equal(pendingPayload.status, "Payment Pending");
assert.equal(pendingPayload.payment_method, "Zelle");
assert.equal(pendingPayload.payment_reference, "GG-12345678");
assert.equal(pendingPayload.payment_url, invoice.payment_url);
assert.equal(pendingPayload.payment_confirmed_at, null);

const paidPayload = invoiceModule._test.invoicePayload({ ...invoice, status: "Paid" });
assert.ok(paidPayload.payment_confirmed_at, "Paid invoices should receive a confirmation timestamp");
const legacyPayload = invoiceModule._test.legacyInvoicePayload(pendingPayload);
assert.equal(Object.prototype.hasOwnProperty.call(legacyPayload, "payment_method"), false);
assert.equal(legacyPayload.payment_url, invoice.payment_url, "legacy fallback should preserve payment report state");
assert.equal(invoiceModule._test.isMissingPaymentColumn(new Error("payment_reference is missing from schema cache")), true);

(async () => {
  const configResponse = await configModule.handler();
  const config = JSON.parse(configResponse.body);
  assert.equal(config.zelleRecipientName, "Green Grin Lawns");
  assert.equal(config.zellePhone, "2087408837");
  assert.equal(config.zelleEmail, "ken@greengrinlawns.com");

  const files = ["portal.html", "admin/index.html", "employee/index.html", "portal/index.html"];
  const requiredMarkers = [
    "function zellePaymentReference(invoice)",
    "function isZellePaymentPending(invoice)",
    'data-zelle-report="',
    "I Sent This Zelle Payment",
    "Payment Pending",
    "Verify the bank deposit"
  ];
  for (const file of files) {
    const html = fs.readFileSync(file, "utf8");
    for (const marker of requiredMarkers) {
      assert.ok(html.includes(marker), `${file} is missing ${marker}`);
    }
  }

  const setupSql = fs.readFileSync("portal-setup.sql", "utf8");
  for (const column of ["payment_method", "payment_reference", "payment_reported_at", "payment_confirmed_at"]) {
    assert.ok(setupSql.includes(column), `portal-setup.sql is missing ${column}`);
  }

  const customer = {
    id: "user-1",
    customer_code: "GG-0042",
    email: "customer@example.com",
    full_name: "Test Customer",
    phone: "2085551111",
    active: true
  };
  let apiInvoice = { ...invoice, status: "Sent", payment_method: "", payment_reference: "", payment_reported_at: null, payment_url: "" };
  let paymentPatchCount = 0;
  global.fetch = async (url, options = {}) => {
    const requestUrl = String(url);
    let response = [];
    if (requestUrl.endsWith("/auth/v1/user")) {
      response = { id: "user-1", email: "customer@example.com", user_metadata: {} };
    } else if (requestUrl.includes("green_grin_customers?select=*&id=eq.")) {
      response = [customer];
    } else if (requestUrl.includes("green_grin_customers?on_conflict=id") && options.method === "POST") {
      response = [customer];
    } else if (requestUrl.includes("green_grin_invoices?select=*&id=eq.")) {
      response = [apiInvoice];
    } else if (requestUrl.includes("green_grin_invoices?id=eq.") && options.method === "PATCH") {
      const update = JSON.parse(options.body || "{}");
      if (update.status === "Payment Pending") paymentPatchCount += 1;
      apiInvoice = { ...apiInvoice, ...update };
      response = [apiInvoice];
    } else if (requestUrl.includes("green_grin_properties?select=")) {
      response = [{ id: "property-1", customer_user_id: "user-1", active: true }];
    } else if (requestUrl.includes("green_grin_jobs?select=")) {
      response = [];
    } else if (requestUrl.includes("green_grin_invoices?select=*&active=eq.true&status=neq.Draft")) {
      response = [apiInvoice];
    }
    return { ok: true, json: async () => response };
  };

  const reportEvent = {
    httpMethod: "PATCH",
    headers: { authorization: "Bearer customer-token" },
    body: JSON.stringify({ zelle_payment: { invoice_id: apiInvoice.id } })
  };
  const reportResponse = await accountModule.handler(reportEvent);
  const reportBody = JSON.parse(reportResponse.body);
  assert.equal(reportResponse.statusCode, 200);
  assert.equal(reportBody.invoices[0].status, "Payment Pending");
  assert.equal(reportBody.invoices[0].payment_method, "Zelle");
  assert.equal(reportBody.invoices[0].payment_reference, "GG-12345678");
  assert.ok(reportBody.invoices[0].payment_reported_at);
  assert.equal(paymentPatchCount, 1);

  const repeatedResponse = await accountModule.handler(reportEvent);
  assert.equal(repeatedResponse.statusCode, 200);
  assert.equal(paymentPatchCount, 1, "repeated payment reports should be idempotent");

  apiInvoice = {
    ...apiInvoice,
    status: "Sent",
    customer_user_id: "another-user",
    customer_code: "GG-9999",
    email: "other@example.com",
    phone: "2085559999",
    payment_url: ""
  };
  const forbiddenResponse = await accountModule.handler(reportEvent);
  assert.equal(forbiddenResponse.statusCode, 404, "customers must not report another account's invoice");

  console.log("Zelle payment flow tests passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
