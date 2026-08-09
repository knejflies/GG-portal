const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_PIN = process.env.GREEN_GRIN_ADMIN_PIN;

async function bookkeeperFromRequest(event, supabase) {
  const auth = event.headers.authorization || event.headers.Authorization || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (token) {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${token}` }
    });
    const user = await response.json().catch(() => null);
    if (response.ok && user?.id) {
      const rows = await supabase(`green_grin_employees?select=*&user_id=eq.${encodeURIComponent(user.id)}&status=eq.Active&role=eq.Bookkeeper&limit=1`);
      if (rows?.[0]) return rows[0];
    }
  }

  const pin = event.headers["x-employee-pin"] || "";
  if (pin) {
    const rows = await supabase(`green_grin_employees?select=*&employee_pin=eq.${encodeURIComponent(pin)}&status=eq.Active&role=eq.Bookkeeper&limit=1`);
    if (rows?.[0]) return rows[0];
  }
  return null;
}

async function requireAccounting(event, supabase) {
  if (ADMIN_PIN && event.headers["x-admin-pin"] === ADMIN_PIN) return { role: "Owner" };
  const employee = await bookkeeperFromRequest(event, supabase);
  if (employee) return { role: "Bookkeeper", employee };
  throw new Error("Accounting access is required.");
}

module.exports = { requireAccounting, bookkeeperFromRequest };
