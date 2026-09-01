import assert from "node:assert/strict";
import test from "node:test";
import { ARKA_SCHEME_SEED, calculateArkaFixtureValues } from "../src/lib/arka-desk";

test("calculates the Bharat Renewables rights fixture from round business inputs", () => {
  const fixture = calculateArkaFixtureValues();
  assert.equal(fixture.terp, 114.1667);
  assert.equal(fixture.rightValue, 29.1667);
  assert.equal(fixture.dilution, 5.8333);
  assert.equal(fixture.totalRights, 2_640_000);
  assert.equal(fixture.totalExerciseCashCrore, 22.44);
});

test("uses round seed amounts rather than fitted values", () => {
  const fixture = calculateArkaFixtureValues();
  const focused = ARKA_SCHEME_SEED.find((scheme) => scheme.id === "arka-focused-25");
  const smallCap = ARKA_SCHEME_SEED.find((scheme) => scheme.id === "arka-small-cap");
  assert.ok(focused && smallCap?.cashBudgetPaise);
  assert.ok(fixture.focusedMaximumRights > 0);
  assert.equal(fixture.smallCapAffordableRights, Number(smallCap.cashBudgetPaise / 8_500n));
});