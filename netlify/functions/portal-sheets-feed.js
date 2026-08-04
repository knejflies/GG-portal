const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SHEETS_SYNC_KEY = process.env.GREEN_GRIN_SHEETS_SYNC_KEY;

const headers = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, x-sheets-key",
  "Access-Control-Allow-Methods": "GET, OPTIONS"
};

function json(statusCode, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

async function supabase(path) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json"
    }
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message || "Supabase request failed.");
  return data;
}

function paymentSummary(invoices) {
  const active = invoices.filter((invoice) => invoice.active !== false);
  const unpaid = active.filter((invoice) => !["Paid", "Draft"].includes(invoice.status));
  const paid = active.filter((invoice) => invoice.status === "Paid");
  const openBalance = unpaid.reduce((total, invoice) => total + Number(invoice.amount || 0), 0);
  const paidTotal = paid.reduce((total, invoice) => total + Number(invoice.amount || 0), 0);
  let status = "No invoices";
  if (unpaid.length) status = "Balance due";
  else if (paid.length) status = "Paid";
  else if (active.some((invoice) => invoice.status === "Draft")) status = "Draft only";
  return { status, openBalance, paidTotal, lastPaidAt: paid.map((invoice) => invoice.payment_confirmed_at || invoice.updated_at || invoice.created_at).filter(Boolean).sort().pop() || "" };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, {});
  if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed." });
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return json(500, { error: "Supabase is not configured." });
  if (!SHEETS_SYNC_KEY) return json(500, { error: "GREEN_GRIN_SHEETS_SYNC_KEY is not configured in Netlify." });
  if (event.headers["x-sheets-key"] !== SHEETS_SYNC_KEY) return json(401, { error: "Invalid Sheets sync key." });

  try {
    const [customers, properties, invoices] = await Promise.all([
      supabase("green_grin_customers?select=*&active=eq.true&order=customer_code.asc.nullslast,created_at.asc&limit=1000"),
      supabase("green_grin_properties?select=*&active=eq.true&order=created_at.desc&limit=1500"),
      supabase("green_grin_invoices?select=*&active=eq.true&order=created_at.desc&limit=3000")
    ]);

    const propertyByCustomer = new Map();
    for (const property of properties || []) {
      if (!propertyByCustomer.has(property.customer_user_id)) propertyByCustomer.set(property.customer_user_id, property);
    }

    const weekdayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const rows = (customers || []).map((customer) => {
      const customerInvoices = (invoices || []).filter((invoice) =>
        (invoice.customer_user_id && invoice.customer_user_id === customer.id) ||
        (invoice.customer_code && invoice.customer_code === customer.customer_code)
      );
      const payment = paymentSummary(customerInvoices);
      const property = propertyByCustomer.get(customer.id) || {};
      return {
        customer_id: customer.customer_code || "",
        name: customer.full_name || "",
        phone: customer.phone || "",
        email: customer.email || "",
        address: property.address || "",
        gate_code: property.gate_code || "",
        plan: customer.billing_plan || "",
        service_day: Number.isInteger(customer.service_weekday) ? weekdayNames[customer.service_weekday] : "",
        monthly_price: Number(customer.monthly_price || 0),
        payment_status: payment.status,
        open_balance: payment.openBalance,
        total_paid: payment.paidTotal,
        last_paid: payment.lastPaidAt,
        active: customer.active !== false ? "Yes" : "No"
      };
    });

    return json(200, { generated_at: new Date().toISOString(), rows });
  } catch (error) {
    return json(500, { error: error.message });
  }
};

exports._test = { paymentSummary };
