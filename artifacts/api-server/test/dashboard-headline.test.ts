import assert from "node:assert/strict";
import test from "node:test";
import { ARKA_SCHEME_SEED } from "../src/lib/arka-desk";
import { buildDashboard, getSeededEventSnapshot } from "../src/lib/corporate-actions-v2";

type AnyRecord = Record<string, any>;

const desk = { schemes: ARKA_SCHEME_SEED } as AnyRecord;

test("headline counts share the 24-hour window", () => {
  const dash = buildDashboard(getSeededEventSnapshot(), desk) as AnyRecord;
  assert.ok(
    dash.arrivalsAffectingSchemes24h <= dash.arrivalCount24h,
    `arrivalsAffectingSchemes24h (${dash.arrivalsAffectingSchemes24h}) must never exceed arrivalCount24h (${dash.arrivalCount24h}) because both describe the same 24-hour window`,
  );
});

test("an affecting notice outside the 24-hour window is not counted in either headline number", () => {
  const asOf = new Date();
  const events = getSeededEventSnapshot(asOf);
  const template = events.find((event: AnyRecord) => event.schemeImpacts?.some((impact: AnyRecord) => impact.affected));
  assert.ok(template, "seed must contain an affecting event to clone");
  const hour = 60 * 60 * 1000;
  const inside: AnyRecord = { ...template, id: "EVT-TEST-24H-IN", receivedAt: new Date(asOf.getTime() - 2 * hour).toISOString() };
  const outside: AnyRecord = { ...template, id: "EVT-TEST-24H-OUT", receivedAt: new Date(asOf.getTime() - 30 * hour).toISOString() };
  const baseline = buildDashboard(events, desk, asOf) as AnyRecord;
  const withFixtures = buildDashboard([inside, outside, ...events], desk, asOf) as AnyRecord;
  assert.equal(withFixtures.arrivalCount24h, baseline.arrivalCount24h + 1, "only the notice received inside 24 hours may enter the arrival count");
  assert.equal(withFixtures.arrivalsAffectingSchemes24h, baseline.arrivalsAffectingSchemes24h + 1, "only the affecting notice received inside 24 hours may enter the affecting count");
  assert.ok(withFixtures.arrivalsAffectingSchemes24h <= withFixtures.arrivalCount24h);
});

test("nearest funding deadline is in the future and belongs to an open event", () => {
  const events = getSeededEventSnapshot();
  const dash = buildDashboard(events, desk) as AnyRecord;
  assert.ok(dash.nearestDeadline, "seed should surface a nearest funding deadline");
  const matches = events.filter(
    (event: AnyRecord) => event.issuer === dash.nearestFundingIssuer && event.internalDeadline === dash.nearestDeadline,
  );
  assert.ok(matches.length > 0, "nearest deadline must correspond to a real event");
  for (const event of matches) {
    assert.ok(Date.parse(event.internalDeadlineAt) > Date.now(), "nearest deadline must be after now");
    assert.ok(!["Closed", "Reconciled"].includes(event.status), "nearest deadline must sit on an open event");
  }
});

test("closed or past-deadline funding events are never selected as nearest", () => {
  const asOf = new Date();
  const events = getSeededEventSnapshot(asOf);
  const template = events.find((event: AnyRecord) =>
    event.schemeImpacts?.some((impact: AnyRecord) => impact.affected && impact.direction === "Funding" && impact.cashAmount > 0));
  assert.ok(template, "seed must contain a funding event to clone");
  const pastAt = new Date(asOf.getTime() - 90 * 24 * 60 * 60 * 1000);
  const closedExpired: AnyRecord = {
    ...template,
    id: "EVT-TEST-CLOSED-EXPIRED",
    issuer: "Closed Expired Test Issuer Ltd",
    status: "Closed",
    internalDeadlineAt: pastAt.toISOString(),
    internalDeadline: "01 Jan 2020 · 15:00 IST",
  };
  // Still open, but the deadline has already passed: must also be excluded.
  const openExpired: AnyRecord = {
    ...template,
    id: "EVT-TEST-OPEN-EXPIRED",
    issuer: "Open Expired Test Issuer Ltd",
    status: "Validated",
    internalDeadlineAt: pastAt.toISOString(),
    internalDeadline: "01 Jan 2020 · 15:00 IST",
  };
  const dash = buildDashboard([closedExpired, openExpired, ...events], desk, asOf) as AnyRecord;
  assert.notEqual(dash.nearestFundingIssuer, "Closed Expired Test Issuer Ltd", "closed events must never be the nearest deadline");
  assert.notEqual(dash.nearestFundingIssuer, "Open Expired Test Issuer Ltd", "an open event whose deadline already passed must never be the nearest deadline");
  assert.ok(dash.nearestDeadline, "a real future deadline must still be surfaced");
});

test("early sightings form their own dashboard bucket and never leak into needs-nothing", () => {
  const events = getSeededEventSnapshot();
  const dash = buildDashboard(events, desk) as AnyRecord;
  const openSightings = events.filter((event: AnyRecord) =>
    !["Closed", "Reconciled"].includes(event.status) && event.isEarlySighting).length;
  assert.equal(dash.awaitingConfirmationCount, openSightings, "awaitingConfirmationCount must equal the open early sightings");
  assert.ok(dash.awaitingConfirmationCount >= 1, "seed contains at least one early sighting awaiting custodian confirmation");
});

test("a voluntary early sighting stays in the awaiting bucket, never needs-you", () => {
  const asOf = new Date();
  const events = getSeededEventSnapshot(asOf);
  const sighting: AnyRecord = {
    ...events.find((event: AnyRecord) => event.processingType === "Voluntary" && !["Closed", "Reconciled"].includes(event.status)),
    id: "EVT-TEST-SIGHTING", status: "Early sighting", isEarlySighting: true,
  };
  const baseline = buildDashboard(events, desk, asOf) as AnyRecord;
  const withSighting = buildDashboard([sighting, ...events], desk, asOf) as AnyRecord;
  assert.equal(withSighting.needsYouCount, baseline.needsYouCount, "a voluntary early sighting must not enter needs-you until the custodian confirms");
  assert.equal(withSighting.awaitingConfirmationCount, baseline.awaitingConfirmationCount + 1);
  assert.equal(withSighting.needsNothingCount, baseline.needsNothingCount, "the sighting must not inflate needs-nothing either");
  assert.ok(withSighting.needsNothingCount >= 0);
});
