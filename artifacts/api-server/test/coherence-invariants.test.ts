import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ARKA_EVENT, ARKA_SCHEME_SEED, calculateArkaFixtureValues } from "../src/lib/arka-desk";
import { countArrivalsInLast24Hours, deriveEventSignals, getSeededEventSnapshot, SEED_DATE_ANCHOR, sortCorporateActionEvents, syncCalculationInput } from "../src/lib/corporate-actions-v2";

const parseDisplayDate = (value: string) => {
  const [day, month, year] = value.split(" ");
  return new Date(`${month} ${day}, ${year} 12:00:00`);
};
const previousTradingDay = (date: Date) => {
  const prior = new Date(date);
  prior.setDate(prior.getDate() - 1);
  while ([0, 6].includes(prior.getDay())) prior.setDate(prior.getDate() - 1);
  return prior;
};

test("active India seed deadlines are future and audit history is past", () => {
  const now = Date.now();
  for (const event of getSeededEventSnapshot().filter((candidate) => !["Closed", "Reconciled", "Break identified"].includes(candidate.status))) {
    for (const deadline of [event.internalDeadlineAt, event.marketDeadlineAt]) {
      const timestamp = new Date(deadline);
      assert.ok(timestamp.getTime() - now >= 24 * 60 * 60 * 1000, `${event.id} deadline must be at least 24 hours away`);
    }
    for (const entry of event.audit) assert.ok(new Date(entry.timestamp).getTime() < now, `${event.id} audit must be past`);
  }
});

test("analysis seed has a full quarter of closed events and a combined-only concentration case", () => {
  const events = getSeededEventSnapshot();
  assert.ok(events.length >= 28 && events.length <= 34);
  assert.ok(events.filter((event) => ["Closed", "Reconciled"].includes(event.status)).length >= 14);
  const combined = events.filter((event) => event.teachingScenario === "Combined-only concentration breach");
  assert.equal(combined.length, 2);
  assert.ok(combined.every((event) => !event.schemeImpacts.some((impact: EventData) => impact.affected && impact.flag)));
});

test("seed source contains no hardcoded calendar date or timestamp literal", () => {
  const source = readFileSync(new URL("../src/lib/corporate-actions-v2.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\b20\d{2}-\d{2}-\d{2}(?:T\d{2}:\d{2})?/);
  assert.doesNotMatch(source, /\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+20\d{2}\b/);
});

test("seeded events include six source channels and one explicit disagreement", () => {
  const events = getSeededEventSnapshot();
  for (const event of events.filter((candidate) => !candidate.isEarlySighting)) {
    if (event.id === "evt-near-miss") {
      assert.equal(event.sourceRecords.length, 1);
      assert.equal(event.sourceRecords[0].provider, "Arka Mutual Fund POC");
      assert.match(event.sourceAgreement, /No live source evidence/);
      continue;
    }
    assert.equal(event.sourceRecords.length, 6);
    assert.equal(event.sourceRecords.find((source: any) => source.primary)?.provider, "SBI-SG");
    assert.equal(event.sourceRecords.find((source: any) => source.primary)?.messageType, "MT564");
  }
  const disagreement = events.find((event) => event.id === "evt-ind-dividend-review");
  assert.match(disagreement.sourceAgreement, /Refinitiv/);
  assert.match(disagreement.sourceAgreement, /NSE filing/);
  const sighting = events.find((event) => event.id === "evt-early-sighting");
  assert.equal(sighting?.sourceRecords.length, 1);
  assert.equal(sighting?.sourceRecords[0].messageType, "SEBI LODR filing");
  assert.equal(sighting?.isEarlySighting, true);
});

test("Arka calendar derives T+1 ex-date and ordered deadlines", () => {
  assert.equal(parseDisplayDate(ARKA_EVENT.exRightsDate).getTime(), previousTradingDay(parseDisplayDate(ARKA_EVENT.recordDate)).getTime());
  assert.ok(new Date(ARKA_EVENT.fundDeadline.replace("·", " ").replace(" IST", "")).getTime() < new Date(ARKA_EVENT.marketDeadline.replace("·", " ").replace(" IST", "")).getTime());
});

test("seeded INR amounts have no sub-paise precision", () => {
  const snapshot = JSON.stringify(getSeededEventSnapshot());
  for (const match of snapshot.matchAll(/"(?:amount|expectedCash|grossCash|netCash|actualCash|offerPrice|cashRate|subscriptionPrice)":(\d+(?:\.\d+)?)/g)) {
    assert.ok((match[1].split(".")[1] ?? "").length <= 2, `${match[0]} has sub-paise precision`);
  }
});

test("Arka dividend treatment is zero TDS and net equals gross", () => {
  const dividends = getSeededEventSnapshot().filter((event) => event.eventType === "Cash dividend");
  assert.ok(dividends.length > 0);
  for (const event of dividends) for (const impact of event.schemeImpacts?.filter((candidate: EventData) => candidate.affected) ?? []) {
    assert.equal(impact.withholdingRate, 0);
    assert.equal(impact.withholdingAmount, 0);
    assert.equal(impact.netCash, impact.grossCash);
  }
});

test("NAV impact units are distinct and fixture inputs are round", () => {
  const fixture = calculateArkaFixtureValues();
  assert.notEqual(fixture.dilution, fixture.rightValue);
  for (const scheme of ARKA_SCHEME_SEED) {
    assert.equal(scheme.aumPaise % 1n, 0n);
    assert.equal(scheme.navPaise % 1, 0);
  }
});

test("Arka eligibility fixture represents one honest ordered population", () => {
  assert.equal(ARKA_SCHEME_SEED.length, 10);
  assert.equal(ARKA_SCHEME_SEED.filter((scheme) => scheme.quantity > 0n).length, 7);
  assert.equal(ARKA_SCHEME_SEED.filter((scheme) => scheme.id !== "arka-value" && scheme.quantity > 0n).length, 6);
  assert.equal(ARKA_SCHEME_SEED.filter((scheme) => scheme.eligibilityStatus === "Eligible").length, 6);
  const banking = ARKA_SCHEME_SEED.find((scheme) => scheme.id === "arka-banking-financial");
  assert.equal(banking?.quantity, 0n);
});

test("Arka scheme seed has ten unique scheme categories and the expected rights totals", () => {
  assert.equal(ARKA_SCHEME_SEED.length, 10);
  assert.equal(new Set(ARKA_SCHEME_SEED.map((scheme) => scheme.category)).size, 10);
  const fixture = calculateArkaFixtureValues();
  assert.equal(fixture.totalRights, 2_640_000);
  assert.equal(fixture.totalExerciseCashCrore, 22.44);
});

test("every active event has arrival metadata and ten scheme impacts", () => {
  const events = getSeededEventSnapshot();
  for (const event of events) {
    assert.ok(event.receivedAt);
    assert.ok(event.source);
    assert.equal(event.schemeImpacts.length, ARKA_SCHEME_SEED.length);
  }
  for (const event of events.filter((current) => ["Stock split", "Bonus issue"].includes(current.eventType))) {
    assert.ok(event.schemeImpacts.every((impact: Record<string, unknown>) => impact.navImpactPaise === null));
  }
});

test("rolling 24-hour arrivals stay non-zero at every hour of day", () => {
  for (const hour of [2, 9, 23]) {
    const clock = new Date();
    clock.setHours(hour, 0, 0, 0);
    const events = getSeededEventSnapshot(clock);
    assert.ok(countArrivalsInLast24Hours(events, clock) >= 3);
  }
});

test("event attention is shown only for a concrete decision, constraint, or break", () => {
  const events = getSeededEventSnapshot();
  const byId = (id: string) => {
    const event = events.find((current) => current.id === id);
    assert.ok(event);
    return deriveEventSignals(event, SEED_DATE_ANCHOR);
  };
  assert.match(byId("evt-ind-scheme").attention ?? "", /^Decision due in \d+ days$/);
  assert.equal(byId("evt-bharat-rights").attention, "SEBI 10% headroom");
  assert.equal(byId("evt-ind-dividend-break").attention, "Settlement break");
  assert.equal(byId("evt-ind-split").attention, null);
  assert.equal(byId("evt-ind-bonus").attention, null);
});

test("materiality is exact NAV impact and value-neutral actions use cash impact instead of zero", () => {
  const events = getSeededEventSnapshot();
  const rights = events.find((event) => event.id === "evt-bharat-rights");
  const dividend = events.find((event) => event.id === "evt-ind-dividend-review");
  const split = events.find((event) => event.id === "evt-ind-split");
  assert.ok(rights && dividend && split);
  const expectedLargest = Math.max(...rights.schemeImpacts.filter((impact: Record<string, unknown>) => impact.affected).map((impact: Record<string, number>) => impact.navImpactPaise));
  assert.equal(deriveEventSignals(rights).materialityPaise, expectedLargest);
  assert.ok((deriveEventSignals(dividend).materialityPaise ?? 0) > 0);
  assert.equal(deriveEventSignals(dividend).cashImpactAmount, null);
  assert.equal(deriveEventSignals(split).materialityPaise, null);
  assert.equal(deriveEventSignals(split).cashImpactAmount, null);
});

test("priority order puts a due decision above constraints, breaks, and settled events", () => {
  const ordered = sortCorporateActionEvents(getSeededEventSnapshot(), SEED_DATE_ANCHOR);
  assert.equal(ordered[0].id, "evt-near-miss");
  assert.ok(ordered.findIndex((event) => event.id === "evt-bharat-rights") < ordered.findIndex((event) => event.id === "evt-ind-bonus"));
  assert.ok(ordered.findIndex((event) => event.id === "evt-ind-dividend-break") < ordered.findIndex((event) => event.id === "evt-ind-bonus"));
});

test("a smaller rupee dividend can have higher NAV materiality than a larger one", () => {
  const events = getSeededEventSnapshot();
  const small = events.find((event) => event.id === "evt-looks-small");
  const big = events.find((event) => event.id === "evt-looks-big");
  assert.ok(small && big);
  const smallCash = small.schemeImpacts.reduce((total: number, impact: EventData) => total + impact.cashAmount, 0);
  const bigCash = big.schemeImpacts.reduce((total: number, impact: EventData) => total + impact.cashAmount, 0);
  assert.ok(smallCash < bigCash);
  assert.ok((deriveEventSignals(small).materialityPaise ?? 0) > (deriveEventSignals(big).materialityPaise ?? 0));
  const ordered = sortCorporateActionEvents(events, SEED_DATE_ANCHOR);
  assert.equal(ordered.findIndex((event) => event.id === "evt-looks-big"), ordered.findIndex((event) => event.id === "evt-looks-small") + 1);
});

test("seeded events vary meaningfully in schemes impacted", () => {
  const counts = getSeededEventSnapshot().map((event) => event.schemeImpacts.filter((impact: EventData) => impact.affected).length).sort((a, b) => a - b);
  assert.ok(counts[Math.floor(counts.length / 2)] >= 2);
});

test("at least two seeded events explain a source disagreement and its winner", () => {
  const conflicted = getSeededEventSnapshot().filter((event) => event.sourceDisagreements?.length);
  assert.ok(conflicted.length >= 2);
  for (const event of conflicted) {
    assert.ok(event.sourceDisagreements.every((item: EventData) => item.winner.includes("wins because")));
    assert.match(event.sourceAgreement, /wins/);
  }
});

test("IST deadline and IST-midnight record date validate without changing calendar date", () => {
  const event: Record<string, any> = { calculationInputs: {} };
  syncCalculationInput(event, "marketDeadline", "15 Sep 2026 · 15:30 IST");
  syncCalculationInput(event, "recordDate", "15 Sep 2026 00:00 IST");
  assert.equal(event.calculationInputs.recordDate, "2026-09-15");
});