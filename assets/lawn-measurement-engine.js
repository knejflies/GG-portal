/* Draft-only geometry helpers for the salesman lawn measurement workflow.
 * The server should repeat these calculations before a measurement is approved.
 */

const EARTH_RADIUS_METERS = 6371008.8;
const SQ_METERS_TO_SQ_FEET = 10.7639104167;

function asPoint(value) {
  if (Array.isArray(value)) return { lng: Number(value[0]), lat: Number(value[1]) };
  return { lng: Number(value?.lng ?? value?.longitude), lat: Number(value?.lat ?? value?.latitude) };
}

function validPoint(point) {
  return Number.isFinite(point.lng) && Number.isFinite(point.lat) && Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180;
}

function ringAreaSquareMeters(ring) {
  const points = (Array.isArray(ring) ? ring : []).map(asPoint).filter(validPoint);
  if (points.length < 3) return 0;
  let total = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const lng1 = current.lng * Math.PI / 180;
    const lng2 = next.lng * Math.PI / 180;
    const lat1 = current.lat * Math.PI / 180;
    const lat2 = next.lat * Math.PI / 180;
    total += (lng2 - lng1) * (2 + Math.sin(lat1) + Math.sin(lat2));
  }
  return Math.abs(total * EARTH_RADIUS_METERS ** 2 / 2);
}

function polygonAreaSquareFeet(polygon) {
  const rings = Array.isArray(polygon) ? polygon : [];
  if (!rings.length) return 0;
  const gross = ringAreaSquareMeters(rings[0]);
  const exclusions = rings.slice(1).reduce((sum, ring) => sum + ringAreaSquareMeters(ring), 0);
  return Math.max(0, (gross - exclusions) * SQ_METERS_TO_SQ_FEET);
}

function featureAreaSquareFeet(feature) {
  const geometry = feature?.geometry || feature;
  if (!geometry || geometry.type !== "Polygon") return 0;
  return polygonAreaSquareFeet(geometry.coordinates);
}

function measurementTotals(zones = [], exclusions = []) {
  const grossSquareFeet = zones.reduce((sum, zone) => sum + featureAreaSquareFeet(zone), 0);
  const excludedSquareFeet = exclusions.reduce((sum, item) => sum + featureAreaSquareFeet(item), 0);
  return {
    grossSquareFeet: Math.round(grossSquareFeet),
    excludedSquareFeet: Math.round(excludedSquareFeet),
    netSquareFeet: Math.max(0, Math.round(grossSquareFeet - excludedSquareFeet))
  };
}

function segmentsIntersect(a, b, c, d) {
  const cross = (p, q, r) => (q.lng - p.lng) * (r.lat - p.lat) - (q.lat - p.lat) * (r.lng - p.lng);
  const orientation = (p, q, r) => Math.sign(cross(p, q, r));
  return orientation(a, b, c) * orientation(a, b, d) < 0 && orientation(c, d, a) * orientation(c, d, b) < 0;
}

function selfIntersects(ring) {
  const points = (ring || []).map(asPoint).filter(validPoint);
  const count = points.length;
  if (count < 4) return false;
  for (let first = 0; first < count; first += 1) {
    const firstEnd = (first + 1) % count;
    for (let second = first + 1; second < count; second += 1) {
      const secondEnd = (second + 1) % count;
      if (first === second || firstEnd === second || secondEnd === first) continue;
      if (segmentsIntersect(points[first], points[firstEnd], points[second], points[secondEnd])) return true;
    }
  }
  return false;
}

function validateMeasurement({ zones = [], exclusions = [], geocodeConfidence = 0, imageryResolutionMeters = null }) {
  const errors = [];
  const warnings = [];
  if (!zones.length) errors.push("Draw at least one lawn zone.");
  [...zones, ...exclusions].forEach((feature, index) => {
    const ring = feature?.geometry?.coordinates?.[0];
    if (!ring || ring.length < 4) errors.push(`Shape ${index + 1} needs at least three corners.`);
    else if (selfIntersects(ring)) errors.push(`Shape ${index + 1} crosses itself.`);
  });
  if (geocodeConfidence < 0.85) warnings.push("Address match needs confirmation before saving.");
  if (imageryResolutionMeters != null && imageryResolutionMeters > 0.6) warnings.push("Imagery is too soft for automatic outlining; keep the manual review step.");
  const totals = measurementTotals(zones, exclusions);
  if (totals.netSquareFeet <= 0) errors.push("Exclusions remove the entire measured lawn area.");
  return { valid: errors.length === 0, errors, warnings, totals };
}

if (typeof module !== "undefined") module.exports = { ringAreaSquareMeters, polygonAreaSquareFeet, featureAreaSquareFeet, measurementTotals, selfIntersects, validateMeasurement };

