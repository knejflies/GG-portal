(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.GreenGrinBookkeeping = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function asDate(value) {
    if (!value) return null;
    const text = String(value);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(text)
      ? new Date(`${text}T12:00:00`)
      : new Date(text);
    return Number.isFinite(date.getTime()) ? date : null;
  }

  function periodBounds(period, now = new Date()) {
    const current = asDate(now) || new Date();
    if (period === "year") {
      return {
        start: new Date(current.getFullYear(), 0, 1),
        end: new Date(current.getFullYear() + 1, 0, 1)
      };
    }
    if (period === "all") return { start: null, end: null };
    return {
      start: new Date(current.getFullYear(), current.getMonth(), 1),
      end: new Date(current.getFullYear(), current.getMonth() + 1, 1)
    };
  }

  function isInPeriod(value, bounds) {
    if (!bounds.start && !bounds.end) return true;
    const date = asDate(value);
    if (!date) return false;
    return (!bounds.start || date >= bounds.start) && (!bounds.end || date < bounds.end);
  }

  function paidDate(invoice) {
    return invoice?.payment_confirmed_at || invoice?.updated_at || invoice?.created_at || null;
  }

  function invoiceDate(invoice) {
    return invoice?.created_at || invoice?.due_date || null;
  }

  function expenseDate(expense) {
    return expense?.expense_date || expense?.created_at || null;
  }

  function summarize(invoices = [], expenses = [], options = {}) {
    const period = options.period || "month";
    const bounds = periodBounds(period, options.now || new Date());
    const activeInvoices = (Array.isArray(invoices) ? invoices : []).filter((invoice) => invoice?.active !== false);
    const activeExpenses = (Array.isArray(expenses) ? expenses : []).filter((expense) => expense?.active !== false);
    const paid = activeInvoices.filter((invoice) => String(invoice?.status || "").toLowerCase() === "paid");
    const paidRevenue = paid
      .filter((invoice) => isInPeriod(paidDate(invoice), bounds))
      .reduce((sum, invoice) => sum + Math.max(0, Number(invoice?.amount) || 0), 0);
    const loggedExpenses = activeExpenses
      .filter((expense) => isInPeriod(expenseDate(expense), bounds))
      .reduce((sum, expense) => sum + Math.max(0, Number(expense?.amount) || 0), 0);
    const billed = activeInvoices
      .filter((invoice) => isInPeriod(invoiceDate(invoice), bounds))
      .reduce((sum, invoice) => sum + Math.max(0, Number(invoice?.amount) || 0), 0);
    const outstanding = activeInvoices
      .filter((invoice) => String(invoice?.status || "").toLowerCase() !== "paid" && String(invoice?.status || "").toLowerCase() !== "draft")
      .reduce((sum, invoice) => sum + Math.max(0, Number(invoice?.amount) || 0), 0);
    return {
      period,
      billed,
      paidRevenue,
      loggedExpenses,
      netCash: paidRevenue - loggedExpenses,
      outstanding,
      paidCount: paid.filter((invoice) => isInPeriod(paidDate(invoice), bounds)).length,
      expenseCount: activeExpenses.filter((expense) => isInPeriod(expenseDate(expense), bounds)).length
    };
  }

  return { asDate, periodBounds, isInPeriod, paidDate, expenseDate, summarize };
});
