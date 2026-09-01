import assert from "node:assert/strict";
import test from "node:test";
import { calculateArkaFixtureValues } from "../src/lib/arka-desk";

test("calculates the Bharat Renewables rights fixture exactly", () => {
  const fixture = calculateArkaFixtureValues();
  assert.equal(fixture.terp, 114.1667);
  assert.equal(fixture.rightValue, 29.1667);
  assert.equal(fixture.dilution, 5.8333);
  assert.equal(fixture.totalRights, 2_640_000);
  assert.equal(fixture.totalExerciseCashCrore, 22.44);
});

test("solves both binding Arka scheme constraints", () => {
  const fixture = calculateArkaFixtureValues();
  assert.equal(fixture.focusedMaximumRights, 1_027_007);
  assert.equal(fixture.smallCapAffordableRights, 211_764);
});