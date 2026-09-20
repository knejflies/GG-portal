(function calendarModule(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.GreenGrinCalendar = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCalendarApi() {
  const DAY_MS = 86400000;

  function dateKey(value) {
    if (!value) return "";
    if (value instanceof Date) {
      if (!Number.isFinite(value.getTime())) return "";
      const year = value.getFullYear();
      const month = String(value.getMonth() + 1).padStart(2, "0");
      const day = String(value.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    }
    return String(value).slice(0, 10);
  }

  function dateAtNoon(value) {
    const key = dateKey(value);
    const date = new Date(`${key}T12:00:00`);
    return Number.isFinite(date.getTime()) ? date : null;
  }

  function monthKey(value) {
    if (typeof value === "string" && /^\d{4}-\d{2}$/.test(value)) return value;
    const date = value instanceof Date ? value : new Date(value || Date.now());
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }

  function monthDays(value) {
    const key = monthKey(value);
    const [year, month] = key.split("-").map(Number);
    const total = new Date(year, month, 0).getDate();
    return Array.from({ length: total }, (_, index) => `${key}-${String(index + 1).padStart(2, "0")}`);
  }

  function jobRunsOnDate(job, targetDate) {
    const start = dateKey(job?.schedule_start_date || job?.scheduled_date || job?.preferred_date);
    const target = dateKey(targetDate);
    if (!start || !target) return false;
    if (!job?.recurring_weekly) return start === target;
    const startDate = dateAtNoon(start);
    const targetDateValue = dateAtNoon(target);
    const endDate = dateAtNoon(job.schedule_end_date);
    if (!startDate || !targetDateValue || targetDateValue < startDate) return false;
    if (endDate && targetDateValue > endDate) return false;
    return Math.round((targetDateValue.getTime() - startDate.getTime()) / DAY_MS) % 7 === 0;
  }

  function isFertilizer(value) {
    return /fertiliz|fertiliser|fertilizer|\bfert\b/i.test(String(value || ""));
  }

  function joinedJob(log) {
    const value = log?.green_grin_jobs;
    return Array.isArray(value) ? (value[0] || {}) : (value || {});
  }

  function invoiceStatus(invoice) {
    return String(invoice?.status || "Draft").trim() || "Draft";
  }

  function customerIdentity(value = {}) {
    return String(value.customer_code || value.customer_user_id || `${value.customer_name || "Customer"}|${value.address || value.service_address || ""}`);
  }

  function buildMonth(source = {}, value = new Date()) {
    const key = monthKey(value);
    const days = monthDays(key);
    const eventsByDate = Object.fromEntries(days.map((day) => [day, []]));
    const jobs = Array.isArray(source.jobs) ? source.jobs : [];
    const invoices = Array.isArray(source.invoices) ? source.invoices : [];
    const completions = Array.isArray(source.completions) ? source.completions : [];

    jobs.forEach((job) => {
      days.forEach((day) => {
        if (!jobRunsOnDate(job, day)) return;
        const fertilizer = isFertilizer(job.service_type);
        eventsByDate[day].push({
          id: job.id || "",
          date: day,
          kind: fertilizer ? "fertilizer-scheduled" : "service",
          title: job.customer_name || "Customer",
          detail: job.service_type || "Scheduled service",
          status: job.status || "Scheduled",
          customerCode: job.customer_code || "",
          address: job.address || ""
        });
      });
    });

    invoices.forEach((invoice) => {
      const day = dateKey(invoice.due_date);
      if (!eventsByDate[day] || invoice.active === false) return;
      const status = invoiceStatus(invoice);
      const paid = status.toLowerCase() === "paid";
      eventsByDate[day].push({
        id: invoice.id || "",
        date: day,
        kind: paid ? "payment-paid" : "payment-due",
        title: invoice.customer_name || "Customer",
        detail: invoice.service_line || invoice.notes || "Invoice",
        status: paid ? "Paid" : status,
        amount: Number(invoice.amount || 0),
        customerCode: invoice.customer_code || ""
      });
    });

    completions.forEach((log) => {
      const job = joinedJob(log);
      const day = dateKey(log.created_at);
      if (!eventsByDate[day] || String(log.template || "").toLowerCase() !== "completed" || !isFertilizer(job.service_type)) return;
      eventsByDate[day].push({
        id: log.id || "",
        jobId: job.id || log.job_id || "",
        date: day,
        kind: "fertilizer-completed",
        title: job.customer_name || "Customer",
        detail: job.service_type || "Fertilizer treatment",
        status: "Completed",
        customerCode: job.customer_code || "",
        address: job.address || "",
        actorName: log.actor_name || ""
      });
    });

    Object.values(eventsByDate).forEach((events) => {
      const order = { "payment-due": 0, "fertilizer-scheduled": 1, service: 2, "fertilizer-completed": 3, "payment-paid": 4 };
      events.sort((a, b) => (order[a.kind] ?? 9) - (order[b.kind] ?? 9) || a.title.localeCompare(b.title));
    });

    const [year, month] = key.split("-").map(Number);
    const leadingBlanks = new Date(year, month - 1, 1).getDay();
    const cells = [...Array(leadingBlanks).fill(null), ...days.map((day) => ({ date: day, events: eventsByDate[day] }))];
    while (cells.length % 7) cells.push(null);

    const allEvents = days.flatMap((day) => eventsByDate[day]);
    return { month: key, days, eventsByDate, cells, allEvents };
  }

  function fertilizerHistory(source = {}) {
    const completions = Array.isArray(source.completions) ? source.completions : [];
    const latest = new Map();
    completions.forEach((log) => {
      const job = joinedJob(log);
      if (String(log.template || "").toLowerCase() !== "completed" || !isFertilizer(job.service_type)) return;
      const record = {
        customerKey: customerIdentity(job),
        customerCode: job.customer_code || "",
        customerName: job.customer_name || "Customer",
        address: job.address || "",
        service: job.service_type || "Fertilizer treatment",
        completedAt: log.created_at || "",
        completedDate: dateKey(log.created_at),
        actorName: log.actor_name || ""
      };
      const previous = latest.get(record.customerKey);
      if (!previous || String(record.completedAt) > String(previous.completedAt)) latest.set(record.customerKey, record);
    });
    return [...latest.values()].sort((a, b) => String(b.completedAt).localeCompare(String(a.completedAt)));
  }

  return { buildMonth, dateKey, fertilizerHistory, isFertilizer, jobRunsOnDate, monthDays, monthKey };
});
