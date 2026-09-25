const PDF_NAME = "Mowing Service Agreement.pdf";

function pdfText(value) {
  return String(value ?? "").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)").replace(/[\r\n]+/g, " ").slice(0, 160);
}

function fieldName(value) {
  return pdfText(value).replace(/[^A-Za-z0-9_.-]/g, "_");
}

function stream(body) {
  const data = Buffer.from(body, "ascii");
  return `<< /Length ${data.length} >>\nstream\n${body}\nendstream`;
}

function buildPdfObjects(estimate = {}) {
  const customer = estimate.customer_name || "Customer";
  const rate = Number(estimate.rate_per_visit || estimate.mowing_rate_per_visit || 0).toFixed(2);
  const frequency = estimate.service_frequency || estimate.mowing_frequency || "As Requested";
  const objects = [];
  const add = (value) => { objects.push(value); return objects.length; };
  const root = add(null);
  const pages = add(null);
  const page1Content = add(stream(`BT /F1 18 Tf 54 748 Td (GREEN GRIN LAWNS) Tj /F1 12 Tf 0 -26 Td (We Cut, You Chill | Mowing Service Agreement) Tj /F1 10 Tf 0 -34 Td (CLIENT & PROPERTY INFORMATION) Tj 0 -20 Td (Client Name:) Tj 0 -30 Td (Service Address:) Tj 0 -30 Td (Billing Address:) Tj 0 -30 Td (Phone / Email:) Tj /F1 10 Tf 0 -38 Td (1. WORK TO BE PERFORMED) Tj 0 -22 Td ([ ] Lawn Maintenance Bundle - mowing, trimming, and blowing) Tj 0 -24 Td ([ ] Spring / Fall Clean-Up - leaf and debris removal) Tj 0 -24 Td (Other Custom Work:) Tj 0 -34 Td (Service Frequency: [ ] Weekly   [ ] Bi-Weekly   [ ] As Requested) Tj /F1 10 Tf 0 -40 Td (2. PRICE & PAYMENT) Tj 0 -22 Td (Rate per Visit: $${pdfText(rate)} USD) Tj 0 -24 Td (Billing: [ ] Per-Service   [ ] Monthly) Tj ET`));
  const page2Content = add(stream(`BT /F1 16 Tf 54 748 Td (TERMS & POLICIES) Tj /F1 9 Tf 0 -32 Td (3. Payment Terms: Invoices are sent by email. Monthly accounts are invoiced at) Tj 0 -14 Td (the beginning of the month for scheduled services. Unpaid balances 15 days past) Tj 0 -14 Td (the invoice date are subject to a $15.00 or 1.5% monthly late fee, whichever is greater.) Tj 0 -30 Td (4. Scheduling & Weather: Service dates may change for weather, seasonal growth,) Tj 0 -14 Td (holidays, route efficiency, or necessary equipment maintenance.) Tj 0 -30 Td (5. Property Access & Gates: Gates must be unlocked, paths clear, and pets indoors.) Tj 0 -30 Td (6. Yard Debris: Remove toys, rocks, hoses, and large sticks before service.) Tj 0 -30 Td (7. Pet Waste: Pet waste left on the lawn may result in an added cleanup charge.) Tj 0 -30 Td (8. Underground Systems & Property Damage: Notify us of irrigation, pet fences,) Tj 0 -14 Td (shallow wiring, or other concealed features before work begins.) Tj 0 -30 Td (9. Cancellation: Either party may cancel or change this agreement with 7-day notice.) Tj 0 -30 Td (10. Assignment & Subcontracting: Green Grin Lawns may assign or subcontract service.) Tj /F1 10 Tf 0 -40 Td (SIGNATURES & AUTHORIZATION) Tj 0 -24 Td (Customer signature:) Tj 0 -34 Td (Date:) Tj 0 -34 Td (Authorized representative signature:) Tj 0 -34 Td (Date:) Tj ET`));
  const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const page1 = add(null);
  const page2 = add(null);
  const acroForm = add(null);
  const widgetRefs = [];
  const checkboxAppearance = (body) => { const data = Buffer.from(body, "ascii"); return `<< /Type /XObject /Subtype /Form /FormType 1 /BBox [0 0 16 16] /Resources << >> /Length ${data.length} >>\nstream\n${body}\nendstream`; };
  const checkboxOn = add(checkboxAppearance("q 0 0 0 RG 1 w 3 3 10 10 re S 5 5 m 7 3 l 12 12 l S Q"));
  const checkboxOff = add(checkboxAppearance("q 0 0 0 RG 1 w 3 3 10 10 re S Q"));
  const textField = (name, rect, page) => { const ref = add(`<< /Type /Annot /Subtype /Widget /FT /Tx /T (${fieldName(name)}) /Rect [${rect.join(" ")}] /F 4 /P ${page} 0 R /DA (/F1 10 Tf 0 g) /Border [0 0 1] >>`); widgetRefs.push(ref); return ref; };
  const checkField = (name, rect, page) => { const ref = add(`<< /Type /Annot /Subtype /Widget /FT /Btn /T (${fieldName(name)}) /V /Off /AS /Off /AP << /N << /Off ${checkboxOff} 0 R /Yes ${checkboxOn} 0 R >> >> /Rect [${rect.join(" ")}] /F 4 /P ${page} 0 R /Border [0 0 1] >>`); widgetRefs.push(ref); return ref; };
  textField("customer_name", [150, 674, 540, 692], page1);
  textField("service_address", [150, 644, 540, 662], page1);
  textField("billing_address", [150, 614, 540, 632], page1);
  textField("phone_email", [150, 584, 540, 602], page1);
  checkField("lawn_maintenance_bundle", [55, 492, 70, 507], page1);
  checkField("spring_fall_cleanup", [55, 468, 70, 483], page1);
  textField("other_custom_work", [150, 430, 540, 448], page1);
  checkField("weekly", [125, 392, 140, 407], page1);
  checkField("biweekly", [205, 392, 220, 407], page1);
  checkField("as_requested", [305, 392, 320, 407], page1);
  textField("rate_per_visit", [165, 322, 280, 342], page1);
  checkField("per_service", [300, 292, 315, 307], page1);
  checkField("monthly", [410, 292, 425, 307], page1);
  textField("customer_signature", [170, 474, 360, 494], page2);
  textField("customer_date", [170, 440, 360, 460], page2);
  textField("authorized_signature", [220, 406, 540, 426], page2);
  textField("authorized_date", [170, 372, 360, 392], page2);
  const page1Annots = widgetRefs.slice(0, 13).map((ref) => `${ref} 0 R`).join(" ");
  const page2Annots = widgetRefs.slice(13).map((ref) => `${ref} 0 R`).join(" ");
  objects[page1 - 1] = `<< /Type /Page /Parent ${pages} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${page1Content} 0 R /Annots [${page1Annots}] >>`;
  objects[page2 - 1] = `<< /Type /Page /Parent ${pages} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${page2Content} 0 R /Annots [${page2Annots}] >>`;
  objects[pages - 1] = `<< /Type /Pages /Kids [${page1} 0 R ${page2} 0 R] /Count 2 >>`;
  objects[acroForm - 1] = `<< /Fields [${widgetRefs.map((ref) => `${ref} 0 R`).join(" ")}] /DR << /Font << /F1 ${font} 0 R >> >> /DA (/F1 10 Tf 0 g) >>`;
  objects[root - 1] = `<< /Type /Catalog /Pages ${pages} 0 R /AcroForm ${acroForm} 0 R /Lang (en-US) >>`;
  return objects;
}

function fillableMowingContractPdf(estimate = {}) {
  const objects = buildPdfObjects(estimate);
  const chunks = [Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n", "binary")];
  const offsets = [0];
  let position = chunks[0].length;
  objects.forEach((object, index) => {
    const chunk = Buffer.from(`${index + 1} 0 obj\n${object}\nendobj\n`, "ascii");
    offsets.push(position);
    chunks.push(chunk);
    position += chunk.length;
  });
  const xrefOffset = position;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objects.length; index += 1) xref += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  chunks.push(Buffer.from(xref, "ascii"));
  return { filename: PDF_NAME, content: Buffer.concat(chunks) };
}

module.exports = { fillableMowingContractPdf };
