import assert from "node:assert/strict";
import test from "node:test";
import { ARKA_EVENT, ARKA_SCHEME_SEED, calculateArkaFixtureValues } from "../src/lib/arka-desk";
import { countArrivalsOnDate, deriveEventSignals, getSeededEventSnapshot, SEED_DATE_ANCHOR, sortCorporateActionEvents, syncCalculationInput } from "../src/lib/corporate-actions-v2";

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
  for (const event of getSeededEventSnapshot()) {
    for (const deadline of [event.internalDeadlineAt, event.marketDeadlineAt]) {
      const timestamp = new Date(deadline);
      assert.ok(timestamp.getTime() - now >= 24 * 60 * 60 * 1000, `${event.id} deadline must be at least 24 hours away`);
    }
    for (const entry of event.audit) assert.ok(new Date(entry.timestamp).getTime() < now, `${event.id} audit must be past`);
  }
});

test("seeded events include six source channels and one explicit disagreement", () => {
  const events = getSeededEventSnapshot();
  for (const event of events) {
    assert.equal(event.sourceRecords.length, 6);
    assert.equal(event.sourceRecords.find((source: any) => source.primary)?.provider, "SBI-SG");
    assert.equal(event.sourceRecords.find((source: any) => source.primary)?.messageType, "MT564");
  }
  const disagreement = events.find((event) => event.id === "evt-ind-dividend-review");
  assert.match(disagreement.sourceAgreement, /Refinitiv/);
  assert.match(disagreement.sourceAgreement, /NSE filing/);
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

test("every active event has a distinct deadline, arrival metadata, and ten scheme impacts", () => {
  const events = getSeededEventSnapshot();
  assert.equal(new Set(events.map((event) => event.marketDeadline)).size, events.length);
  for (const event of events) {
    assert.ok(event.receivedAt);
    assert.ok(event.source);
    assert.equal(event.schemeImpacts.length, ARKA_SCHEME_SEED.length);
  }
  for (const event of events.filter((current) => ["Stock split", "Bonus issue"].includes(current.eventType))) {
    assert.ok(event.schemeImpacts.every((impact: Record<string, unknown>) => impact.navImpactPaise === null));
  }
});

test("today arrival count is derived from receivedAt", () => {
  const events = getSeededEventSnapshot();
  const before = countArrivalsOnDate(events, SEED_DATE_ANCHOR);
  assert.equal(before, 3);
  events[0].receivedAt = "2026-08-20T08:45:00.000Z";
  assert.equal(countArrivalsOnDate(events, SEED_DATE_ANCHOR), before - 1);
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
  assert.equal(deriveEventSignals(dividend).materialityPaise, null);
  assert.equal(deriveEventSignals(dividend).cashImpactAmount, 1_912_500);
  assert.equal(deriveEventSignals(split).materialityPaise, null);
  assert.equal(deriveEventSignals(split).cashImpactAmount, null);
});

test("priority order puts a due decision above constraints, breaks, and settled events", () => {
  const ordered = sortCorporateActionEvents(getSeededEventSnapshot(), SEED_DATE_ANCHOR);
  assert.equal(ordered[0].id, "evt-ind-scheme");
  assert.ok(ordered.findIndex((event) => event.id === "evt-bharat-rights") < ordered.findIndex((event) => event.id === "evt-ind-bonus"));
  assert.ok(ordered.findIndex((event) => event.id === "evt-ind-dividend-break") < ordered.findIndex((event) => event.id === "evt-ind-bonus"));
});

test("IST deadline and IST-midnight record date validate without changing calendar date", () => {
  const event: Record<string, any> = { calculationInputs: {} };
  syncCalculationInput(event, "marketDeadline", "15 Sep 2026 · 15:30 IST");
  syncCalculationInput(event, "recordDate", "15 Sep 2026 00:00 IST");
  assert.equal(event.calculationInputs.recordDate, "2026-09-15");
});