const assert = require("node:assert/strict");
const engine = require("../assets/lawn-measurement-engine");

function rectangle(lat, lng, widthFeet, heightFeet) {
  const latDelta = heightFeet / 364000;
  const lngDelta = widthFeet / (364000 * Math.cos(lat * Math.PI / 180));
  const ring = [[lng, lat], [lng + lngDelta, lat], [lng + lngDelta, lat + latDelta], [lng, lat + latDelta], [lng, lat]];
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } };
}

const lawn = rectangle(43.6629, -116.6874, 100, 50);
const bed = rectangle(43.66292, -116.68735, 20, 10);
const totals = engine.measurementTotals([lawn], [bed]);
assert.ok(totals.grossSquareFeet > 4900 && totals.grossSquareFeet < 5100, `expected about 5,000 gross sq ft, got ${totals.grossSquareFeet}`);
assert.ok(totals.excludedSquareFeet > 190 && totals.excludedSquareFeet < 210, `expected about 200 excluded sq ft, got ${totals.excludedSquareFeet}`);
assert.ok(totals.netSquareFeet > 4700 && totals.netSquareFeet < 4900, `expected about 4,800 net sq ft, got ${totals.netSquareFeet}`);

const valid = engine.validateMeasurement({ zones: [lawn], exclusions: [bed], geocodeConfidence: 0.9 });
assert.equal(valid.valid, true);

const crossing = { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[[-116.68, 43.66], [-116.67, 43.67], [-116.68, 43.67], [-116.67, 43.66], [-116.68, 43.66]]] } };
assert.equal(engine.validateMeasurement({ zones: [crossing] }).valid, false);

const outside = rectangle(43.7, -116.6, 20, 10);
const outsideResult = engine.validateMeasurement({ zones: [lawn], exclusions: [outside], geocodeConfidence: 0.9 });
assert.equal(outsideResult.valid, false);
assert.match(outsideResult.errors.join(" "), /inside a lawn zone/i);

console.log("Lawn measurement geometry tests passed.");
