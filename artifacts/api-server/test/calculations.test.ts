import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateDividend,
  calculateMixedMerger,
  calculateRights,
  calculateSplit,
  calculateTender,
  roundCalculation,
} from "../src/lib/calculations";

test("calculates a cash dividend to currency precision", () => {
  assert.equal(calculateDividend(220_000, 0.425), 93_500);
  assert.equal(calculateDividend(3, 0.335), 1.01);
});

test("calculates a stock split entitlement", () => {
  assert.equal(calculateSplit(80_000, 4, 1), 320_000);
  assert.equal(calculateSplit(12.5, 3, 2), 18.75);
});

test("calculates rights funding and retains fractional rights when requested", () => {
  assert.deepEqual(calculateRights(12_000, 1, 5, 12.4), {
    rights: 2_400,
    funding: 29_760,
  });
  assert.deepEqual(
    calculateRights(13, 1, 5, 12.4, { retainFractionalEntitlements: true }),
    { rights: 2.6, funding: 32.24 },
  );
});

test("calculates tender proceeds at the maximum accepted percentage", () => {
  assert.equal(calculateTender(40_000, 0.2, 8.5), 68_000);
  assert.equal(calculateTender(12_345, 0.125, 4.2), 6_481.13);
});

test("calculates the cash and share legs of a mixed merger", () => {
  assert.deepEqual(calculateMixedMerger(10_000, 0.35, 2.175), {
    shares: 3_500,
    cash: 21_750,
  });
  assert.deepEqual(calculateMixedMerger(7, 0.3333333, 0.125), {
    shares: 2.333333,
    cash: 0.88,
  });
});

test("rounds fractional entitlements consistently", () => {
  assert.equal(roundCalculation(1.005, 2), 1.01);
  assert.equal(roundCalculation(10.075, 2), 10.08);
  assert.equal(roundCalculation(2.3333337, 6), 2.333334);
  assert.equal(roundCalculation(0, 2), 0);
});