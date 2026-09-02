import test from "node:test";
import assert from "node:assert/strict";
import { canonicalNumber, collectStage1Figures, validateJudgementText } from "../src/lib/judgement";

const allowedFrom = (...values: number[]): Set<string> => {
  const allowed = new Set<string>();
  for (const value of values) {
    allowed.add(String(value));
    allowed.add(String(Number(value.toFixed(2))));
  }
  return allowed;
};

test("canonicalNumber strips Indian grouping and normalizes decimals", () => {
  assert.equal(canonicalNumber("7,72,993"), "772993");
  assert.equal(canonicalNumber("2,51,00,000.00"), "25100000");
  assert.equal(canonicalNumber("10.77"), "10.77");
});

test("validator accepts prose that cites only Stage 1 figures", () => {
  const allowed = allowedFrom(772993, 25100000, 10.77, 10);
  const verdict = validateJudgementText(
    "Selling the excess 7,72,993 rights recovers part of the 2,51,00,000 INR at stake. Exposure lands at 10.77% against the 10% cap. Act on this event first.",
    allowed,
  );
  assert.equal(verdict.ok, true);
  assert.deepEqual(verdict.offending, []);
});

test("validator rejects a deliberately hallucinated figure", () => {
  const allowed = allowedFrom(772993, 25100000, 10.77, 10);
  const verdict = validateJudgementText(
    "Selling the excess 7,72,993 rights recovers about 2,25,00,000 INR of the 2,51,00,000 at stake.",
    allowed,
  );
  assert.equal(verdict.ok, false);
  assert.deepEqual(verdict.offending, ["2,25,00,000"]);
});

test("validator has no numeric exceptions: small integers, percentages and years all reject unless present in Stage 1", () => {
  const allowed = allowedFrom(500000);
  assert.equal(validateJudgementText("The cap is 11%.", allowed).ok, false);
  assert.equal(validateJudgementText("A 25% discount applies.", allowed).ok, false);
  assert.equal(validateJudgementText("The deadline is in 2028.", allowed).ok, false);
  assert.equal(validateJudgementText("Three of your 10 schemes are affected.", allowed).ok, false);
  assert.equal(validateJudgementText("Roughly 48,500 units are at stake.", allowed).ok, false);
  assert.equal(validateJudgementText("Half a million units: 5,00,000.", allowed).ok, true);
});

test("dates and counts pass only because the Stage 1 snapshot itself contains them", () => {
  const event = {
    issuer: "Bharat Renewables", eventType: "Rights issue", reference: "CA-2026-0091",
    status: "Approved", processingType: "Voluntary",
    internalDeadline: "12 Sep 2026", marketDeadline: "17 Sep 2026",
    schemeImpacts: [
      { affected: true, schemeId: "s1", schemeName: "A", eligibleQuantity: 100, direction: "Funding", cashAmount: 200, navImpactPaise: 1.5 },
      { affected: false, schemeId: "s2" }, { affected: false, schemeId: "s3" },
    ],
    options: [],
  };
  const { allowed } = collectStage1Figures(event as any, { schemes: [] } as any);
  assert.equal(validateJudgementText("Decide by 12 Sep 2026; 1 of 3 schemes is affected.", allowed).ok, true);
  assert.equal(validateJudgementText("Decide by 14 Sep 2026.", allowed).ok, false);
  assert.equal(validateJudgementText("This affects 4 schemes.", allowed).ok, false);
});

test("collectStage1Figures harvests scheme impacts, desk cash and options into the allow-list", () => {
  const event = {
    issuer: "Bharat Renewables",
    eventType: "Rights issue",
    reference: "CA-2026-0091",
    status: "Approved",
    processingType: "Voluntary",
    internalDeadline: "12 Sep 2026",
    marketDeadline: "17 Sep 2026",
    schemeImpacts: [{
      affected: true,
      schemeId: "sch-focused-25",
      schemeName: "Arka Focused 25",
      eligibleQuantity: 1545000,
      direction: "Funding",
      cashAmount: 25100000,
      navImpactPaise: 14.2,
      entitlement: 772993,
    }],
    options: [{ label: "Exercise", result: "Subscribe in full." }],
    validation: { missingTerms: ["RE trading window"] },
  };
  const desk = { schemes: [{ id: "sch-focused-25", name: "Arka Focused 25", cashAvailableCrore: 1.8, maxRightsByCap: 480000 }] };
  const { lines, allowed } = collectStage1Figures(event as any, desk as any);
  assert.equal(allowed.has("772993"), true);
  assert.equal(allowed.has("25100000"), true);
  assert.equal(allowed.has("18000000"), true);
  assert.equal(allowed.has("480000"), true);
  assert.equal(lines.some((line) => line.includes("Terms still missing")), true);
  assert.equal(validateJudgementText("Exercising all 7,72,993 rights needs 2,51,00,000 INR against 1,80,00,000 available, so sell down to the permitted 4,80,000.", allowed).ok, true);
  assert.equal(validateJudgementText("This frees up 9,99,999 INR.", allowed).ok, false);
});
