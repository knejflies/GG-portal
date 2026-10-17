const { _internal } = require("./portal-payments");

exports.handler = async () => {
  try {
    const summary = await _internal.runAutomaticPayments(new Date());
    console.log(JSON.stringify({ event: "green_grin_automatic_payments", ...summary }));
    return { statusCode: 200, body: JSON.stringify(summary) };
  } catch (error) {
    console.error(JSON.stringify({ event: "green_grin_automatic_payments_failed", error: error.message || String(error) }));
    return { statusCode: 500, body: JSON.stringify({ error: error.message || "Automatic billing failed." }) };
  }
};
