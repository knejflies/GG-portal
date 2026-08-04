const GREEN_GRIN_SHEET_NAME = 'Customers';
const GREEN_GRIN_HEADERS = [
  'Customer ID', 'Name', 'Phone', 'Email', 'Address', 'Gate Code', 'Plan',
  'Service Day', 'Monthly Price', 'Payment Status', 'Open Balance',
  'Total Paid', 'Last Paid', 'Active'
];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Green Grin')
    .addItem('Refresh customers now', 'refreshGreenGrinCustomers')
    .addItem('Install daily refresh', 'installGreenGrinRefresh')
    .addToUi();
}

function refreshGreenGrinCustomers() {
  const properties = PropertiesService.getScriptProperties();
  const siteUrl = String(properties.getProperty('GREEN_GRIN_SITE_URL') || '').replace(/\/$/, '');
  const syncKey = properties.getProperty('GREEN_GRIN_SHEETS_SYNC_KEY') || '';
  if (!siteUrl || !syncKey) {
    throw new Error('Add GREEN_GRIN_SITE_URL and GREEN_GRIN_SHEETS_SYNC_KEY in Apps Script Settings > Script properties.');
  }

  const response = UrlFetchApp.fetch(siteUrl + '/.netlify/functions/portal-sheets-feed', {
    method: 'get',
    headers: { 'x-sheets-key': syncKey },
    muteHttpExceptions: true
  });
  const payload = JSON.parse(response.getContentText() || '{}');
  if (response.getResponseCode() !== 200) throw new Error(payload.error || 'Green Grin customer refresh failed.');

  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName(GREEN_GRIN_SHEET_NAME) || spreadsheet.insertSheet(GREEN_GRIN_SHEET_NAME);
  const rows = (payload.rows || []).map((row) => [
    row.customer_id, row.name, row.phone, row.email, row.address, row.gate_code,
    row.plan, row.service_day, row.monthly_price, row.payment_status,
    row.open_balance, row.total_paid, row.last_paid ? new Date(row.last_paid) : '', row.active
  ]);

  sheet.clearContents();
  sheet.getRange(1, 1, 1, GREEN_GRIN_HEADERS.length).setValues([GREEN_GRIN_HEADERS]);
  sheet.getRange('A:A').setNumberFormat('@');
  sheet.getRange('C:C').setNumberFormat('@');
  if (rows.length) sheet.getRange(2, 1, rows.length, GREEN_GRIN_HEADERS.length).setValues(rows);
  sheet.setFrozenRows(1);
  sheet.getRange('I:I').setNumberFormat('$0.00');
  sheet.getRange('K:L').setNumberFormat('$0.00');
  sheet.getRange('M:M').setNumberFormat('m/d/yyyy h:mm am/pm');
  sheet.autoResizeColumns(1, GREEN_GRIN_HEADERS.length);
  sheet.getRange(1, 1, 1, GREEN_GRIN_HEADERS.length).setFontWeight('bold').setBackground('#123324').setFontColor('#ffffff');
}

function installGreenGrinRefresh() {
  ScriptApp.getProjectTriggers()
    .filter((trigger) => trigger.getHandlerFunction() === 'refreshGreenGrinCustomers')
    .forEach((trigger) => ScriptApp.deleteTrigger(trigger));
  ScriptApp.newTrigger('refreshGreenGrinCustomers').timeBased().everyDays(1).atHour(6).create();
  refreshGreenGrinCustomers();
}
