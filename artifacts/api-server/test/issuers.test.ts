import assert from "node:assert/strict";
import test from "node:test";
import { ARKA_SCHEME_SEED, calculateArkaRightsTerms } from "../src/lib/arka-desk";
import {
  buildDashboard,
  buildHistory,
  buildIssuerDetail,
  buildIssuerSummaries,
  getSeededEventSnapshot,
  issuerExposuresForScheme,
  issuerIdFor,
} from "../src/lib/corporate-actions-v2";

type AnyRecord = Record<string, any>;

const TOTAL_ENTITLEMENT_FIXTURE = 27_500_031;

const desk: AnyRecord = {
  schemes: ARKA_SCHEME_SEED.map((seed) => ({
    id: seed.id,
    name: seed.schemeName,
    category: seed.category,
    aumCrore: Number(seed.aumPaise) / 1_000_000_000,
    navPaise: Number(seed.navPaise),
  })),
  totals: { totalEntitlementRights: TOTAL_ENTITLEMENT_FIXTURE },
};

test("issuers are ranked by house exposure and cover every held issuer", () => {
  const events = getSeededEventSnapshot();
  const summaries = buildIssuerSummaries(events, desk) as AnyRecord[];
  assert.ok(summaries.length > 0, "seed must produce issuers");
  for (let index = 1; index < summaries.length; index += 1) {
    assert.ok(
      summaries[index - 1].houseExposureAmount >= summaries[index].houseExposureAmount,
      "issuer list must be ranked by house exposure descending",
    );
  }
  const expectedIssuers = new Set(events.map((event: AnyRecord) => event.issuer));
  assert.equal(summaries.length, expectedIssuers.size, "every issuer that appears in the book must be listed");
  for (const summary of summaries) {
    assert.equal(summary.issuerId, issuerIdFor(summary.issuer));
  }
});

test("a scheme's issuer positions can never sum past the scheme's AUM", () => {
  const events = getSeededEventSnapshot();
  const summaries = buildIssuerSummaries(events, desk) as AnyRecord[];
  const totals = new Map<string, number>();
  for (const summary of summaries) {
    const detail = buildIssuerDetail(events, desk, summary.issuerId) as AnyRecord;
    assert.ok(detail, `detail must exist for ${summary.issuerId}`);
    for (const row of detail.perScheme) {
      totals.set(row.schemeId, (totals.get(row.schemeId) ?? 0) + row.valueAmount);
    }
  }
  for (const seed of ARKA_SCHEME_SEED) {
    const held = totals.get(seed.id) ?? 0;
    const aumRupees = Number(seed.aumPaise) / 100;
    assert.ok(held <= aumRupees, `${seed.schemeName} issuer positions (${held}) exceed its AUM (${aumRupees})`);
  }
});

test("tightest headroom equals the shared exposure figure the analysis view shows", () => {
  const events = getSeededEventSnapshot();
  const summaries = buildIssuerSummaries(events, desk) as AnyRecord[];
  let checked = 0;
  for (const summary of summaries) {
    const detail = buildIssuerDetail(events, desk, summary.issuerId) as AnyRecord;
    for (const row of detail.perScheme) {
      const scheme = (desk.schemes as AnyRecord[]).find((candidate) => candidate.id === row.schemeId);
      const shared = (issuerExposuresForScheme(events, scheme) as AnyRecord[]).find((candidate) => candidate.issuer === summary.issuer);
      if (shared) {
        assert.equal(row.headroomPercent, Number(shared.distanceToCapPercent), `${summary.issuer}/${row.schemeId} displayed headroom must be the shared exposure figure`);
      } else {
        assert.equal(row.headroomPercent, null, `${summary.issuer}/${row.schemeId} must not invent a headroom without a shared exposure row`);
      }
    }
    const perSchemeHeadrooms = (desk.schemes as AnyRecord[]).flatMap((scheme) => {
      const row = (issuerExposuresForScheme(events, scheme) as AnyRecord[]).find((candidate) => candidate.issuer === summary.issuer);
      return row ? [Number(row.distanceToCapPercent)] : [];
    });
    if (perSchemeHeadrooms.length === 0) {
      assert.equal(summary.tightestHeadroomPercent, null, `${summary.issuer} has no open exposure so headroom must be null`);
      continue;
    }
    assert.equal(
      summary.tightestHeadroomPercent,
      Math.min(...perSchemeHeadrooms),
      `${summary.issuer} tightest headroom must equal the minimum shared exposure figure`,
    );
    checked += 1;
  }
  assert.ok(checked > 0, "at least one issuer must have an open exposure to compare");
});

test("needs-you and needs-nothing always sum to the open event count", () => {
  const events = getSeededEventSnapshot();
  const dash = buildDashboard(events, desk) as AnyRecord;
  const openCount = events.filter((event: AnyRecord) => !["Closed", "Reconciled"].includes(event.status)).length;
  assert.equal(dash.needsYouCount + dash.needsNothingCount, openCount);
  assert.ok(dash.needsYouCount >= 0 && dash.needsNothingCount >= 0);
});

test("at-stake reuses the Stage 1 right value against the desk entitlement", () => {
  const events = getSeededEventSnapshot();
  const dash = buildDashboard(events, desk) as AnyRecord;
  const heroOpen = events.some((event: AnyRecord) => event.id === "evt-bharat-rights" && !["Closed", "Reconciled"].includes(event.status));
  assert.ok(heroOpen, "seed must keep the Bharat rights issue open");
  const expected = Number((TOTAL_ENTITLEMENT_FIXTURE * calculateArkaRightsTerms().rightValue).toFixed(2));
  assert.equal(dash.atStakeAmount, expected, "at-stake must be entitlement times the Stage 1 right value");
});

test("due-within-3-days is zero-safe and counts only live deadlines inside the window", () => {
  const asOf = new Date();
  const events = getSeededEventSnapshot(asOf);
  const farFuture = new Date(asOf.getTime() + 1000 * 24 * 60 * 60 * 1000);
  const afterEverything = buildDashboard(events, desk, farFuture) as AnyRecord;
  assert.equal(afterEverything.dueWithin3DaysCount, 0, "when every deadline has passed the count must be zero, not negative or crashing");
  const template = events.find((event: AnyRecord) => !["Closed", "Reconciled"].includes(event.status));
  assert.ok(template, "seed must contain an open event to clone");
  const inWindow: AnyRecord = {
    ...template,
    id: "EVT-TEST-DUE-3D",
    internalDeadlineAt: new Date(asOf.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString(),
  };
  const baseline = buildDashboard(events, desk, asOf) as AnyRecord;
  const withFixture = buildDashboard([inWindow, ...events], desk, asOf) as AnyRecord;
  assert.equal(withFixture.dueWithin3DaysCount, baseline.dueWithin3DaysCount + 1);
});

test("issuer detail carries the sentence, four blocks, and the same outcome figures as history", () => {
  const events = getSeededEventSnapshot();
  const summaries = buildIssuerSummaries(events, desk) as AnyRecord[];
  const top = summaries[0];
  const detail = buildIssuerDetail(events, desk, top.issuerId) as AnyRecord;
  assert.ok(detail.situation.length > 0, "detail must open with a computed sentence");
  assert.ok(detail.houseExposure && detail.perScheme.length > 0 && detail.events.length > 0 && detail.summary, "all four blocks must be present");
  for (let index = 1; index < detail.events.length; index += 1) {
    assert.ok(
      Date.parse(detail.events[index - 1].receivedAt) >= Date.parse(detail.events[index].receivedAt),
      "issuer events must be listed newest first",
    );
  }
  const history = buildHistory(events) as AnyRecord;
  for (const row of detail.events.filter((event: AnyRecord) => !event.open)) {
    const closed = history.closedEvents.find((candidate: AnyRecord) => candidate.eventId === row.eventId);
    assert.ok(closed, `closed issuer event ${row.eventId} must appear in analysis history`);
    assert.equal(row.capturedAmount, closed.capturedAmount, "issuer page must reuse the analysis captured figure");
    assert.equal(row.forfeitedAmount, closed.forfeitedAmount, "issuer page must reuse the analysis forfeited figure");
  }
  assert.equal(buildIssuerDetail(events, desk, "no-such-issuer"), null, "unknown issuers must return null, not fabricate data");
});

test("top house exposures on the dashboard mirror the issuer list ranking", () => {
  const events = getSeededEventSnapshot();
  const dash = buildDashboard(events, desk) as AnyRecord;
  const summaries = buildIssuerSummaries(events, desk) as AnyRecord[];
  assert.equal(dash.topHouseExposures.length, Math.min(5, summaries.length));
  dash.topHouseExposures.forEach((row: AnyRecord, index: number) => {
    assert.equal(row.issuerId, summaries[index].issuerId, "dashboard top exposures must be the issuer list's top rows");
    assert.equal(row.houseExposureAmount, summaries[index].houseExposureAmount);
    assert.equal(row.tightestHeadroomPercent, summaries[index].tightestHeadroomPercent);
  });
});
