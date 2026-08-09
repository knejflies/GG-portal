const assert = require("node:assert/strict");
const { optimizePath, routeCost, summarizeRoute } = require("../netlify/functions/portal-route-optimize.js")._test;

const durations = [
  [0, 10, 40, 60],
  [10, 0, 12, 45],
  [40, 12, 0, 8],
  [60, 45, 8, 0]
];
const distances = durations.map((row) => row.map((value) => value * 100));
const route = optimizePath(durations);

assert.deepEqual(route, [0, 1, 2, 3]);
assert.equal(routeCost(route, durations), 30);
assert.deepEqual(summarizeRoute(route, durations, distances), {
  total_drive_seconds: 30,
  total_distance_meters: 3000
});

const twoOptMatrix = [
  [0, 1, 2, 9],
  [1, 0, 8, 2],
  [2, 8, 0, 1],
  [9, 2, 1, 0]
];
const improved = optimizePath(twoOptMatrix);
assert.equal(improved[0], 0);
assert.deepEqual([...improved.slice(1)].sort(), [1, 2, 3]);
assert.ok(routeCost(improved, twoOptMatrix) <= 5);

console.log("Route optimizer tests passed.");
