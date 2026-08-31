import assert from "node:assert/strict";
import { once } from "node:events";
import test, { after, afterEach, before, beforeEach, describe } from "node:test";
import { inArray } from "drizzle-orm";
import { corporateActionEventsTable, db, pool } from "@workspace/db";
import app from "../src/app";
import { demoUsers } from "../src/lib/corporate-actions-v2";

process.env.CORPORATE_ACTIONS_POC = "true";

type EventData = Record<string, any>;
type Session = { cookie: string };

const runId = crypto.randomUUID().replaceAll("-", "").slice(0, 10);
const eventId = `test-${runId}-rights`;
const createdEventIds = new Set<string>([eventId]);

let server: ReturnType<typeof app.listen>;
let baseUrl: string;
let analystSession: Session;
let reviewerSession: Session;

function rightsFixture(): EventData {
  return {
    id: eventId,
    reference: `TEST-${runId}-RIGHTS`,
    issuer: "Test Rights Issuer",
    security: "ISIN FR001400TEST · TRS",
    eventType: "Rights issue",
    processingType: "Voluntary",
    status: "Validated",
    settlementStage: "Validated",
    risk: "High",
    marketDeadline: "30 Aug 2026 · 17:30 CEST",
    internalDeadline: "30 Aug 2026 · 14:00 CEST",
    affectedAccounts: 0,
    amount: 0,
    currency: "EUR",
    notice: {
      documentName: "test-rights-notice.pdf",
      source: "API workflow test",
      receivedAt: "2026-08-26T08:00:00.000Z",
      version: "v1",
      role: "New",
      excerpt: "One right for every five shares at EUR 8.50.",
      pages: [{ page: 1, text: "Rights ratio: 1 for 5. Subscription price: EUR 8.50." }],
    },
    terms: [
      { key: "rightsRatio", label: "Rights ratio", value: "1 for 5", page: "p. 1", evidence: "Rights ratio: 1 for 5.", confidence: 1, reviewStatus: "Validated" },
      { key: "subscriptionPrice", label: "Subscription price", value: "EUR 8.50", page: "p. 1", evidence: "Subscription price: EUR 8.50.", confidence: 1, reviewStatus: "Validated" },
    ],
    positions: [
      { id: "test-position-1", fund: "Test Fund", account: "TEST-001", isin: "FR001400TEST", securityId: "SEC-TEST", eligibleQuantity: 100_000, positionDate: "2026-08-24", eligibilityStatus: "Eligible", dataQualityWarning: "" },
        { id: "test-position-2", fund: "Test Fund", account: "TEST-002", isin: "FR001400TEST", securityId: "SEC-TEST", eligibleQuantity: 50_000, positionDate: "2026-08-24", eligibilityStatus: "Eligible", dataQualityWarning: "" },
    ],
    securityMaster: { securityId: "SEC-TEST", isin: "FR001400TEST", ticker: "TRS", securityName: "Test Rights Security", currency: "EUR", market: "France", status: "Active" },
    requiredTermKeys: ["rightsRatio", "subscriptionPrice"],
    calculationInputs: { ratioNumerator: 1, ratioDenominator: 5, subscriptionPrice: 8.5, currency: "EUR" },
    impacts: [],
    options: [
      { id: "exercise", label: "Exercise rights", description: "Subscribe for new shares.", result: "Funding is required.", default: false },
      { id: "lapse", label: "Allow rights to lapse", description: "Take no action.", result: "Rights expire.", default: true },
    ],
    instruction: { status: "DRAFT", destination: "Synthetic gateway", reference: "DRAFT-TEST", generatedAt: "", content: "DRAFT ONLY", simulated: false, approvalActor: "" },
    reconciliation: {
      expected: 0, expectedCash: 0, expectedSecurityQuantity: 0, expectedCurrency: "EUR", expectedSettlementDate: "2026-09-05", expectedAccount: "TEST-001",
      actual: 0, actualCash: 0, actualSecurityQuantity: 0, actualCurrency: "EUR", actualSettlementDate: "", actualAccount: "",
      difference: 0, tolerance: 0.01, status: "Not due", classification: "Not due", note: "", investigationSteps: [],
    },
    tasks: [],
    audit: [],
    calculation: { rounding: "Round down", assumptions: "Test fixture", sourceRule: "TEST-CONTROL" },
    validation: { missingTerms: [], isReady: true },
  };
}

async function signIn(actorId: string): Promise<Session> {
  const response = await fetch(`${baseUrl}/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ actorId }),
  });
  assert.equal(response.status, 200, `Could not sign in ${actorId}`);
  const cookie = response.headers.get("set-cookie")?.split(";", 1)[0];
  assert.ok(cookie, "Expected a signed session cookie");
  return { cookie };
}

async function request(path: string, init: RequestInit = {}, session?: Session): Promise<{ status: number; body: any }> {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  if (session) headers.set("cookie", session.cookie);
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  return { status: response.status, body: await response.json() };
}

async function resetFixture(): Promise<void> {
  await db.delete(corporateActionEventsTable).where(inArray(corporateActionEventsTable.id, [eventId]));
  await db.insert(corporateActionEventsTable).values({ id: eventId, data: rightsFixture() });
}

before(async () => {
  server = app.listen(0);
  await once(server, "listening");
  const address = server.address();

  assert.ok(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}/api`;
  analystSession = await signIn("USR-001");
  reviewerSession = await signIn("USR-002");
});

beforeEach(resetFixture);

afterEach(resetFixture);

after(async () => {
  await db.delete(corporateActionEventsTable).where(inArray(corporateActionEventsTable.id, [...createdEventIds]));
  server.close();
  await once(server, "close");
  await pool.end();
});

describe("corporate-action API workflow", { concurrency: false }, () => {
  test("derives workflow roles from signed sessions and blocks maker self-approval", async () => {
    const unauthenticated = await request(`/events/${eventId}/calculate`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    assert.equal(unauthenticated.status, 401);

    const calculated = await request(`/events/${eventId}/calculate`, {
      method: "POST",
      body: JSON.stringify({}),
    }, analystSession);
    assert.equal(calculated.status, 200);
    assert.deepEqual(
      calculated.body.impacts.map((impact: EventData) => ({
        account: impact.account,
        expectedCash: impact.expectedCash,
        expectedSecurityQuantity: impact.expectedSecurityQuantity,
      })),
      [
        { account: "TEST-001", expectedCash: 170_000, expectedSecurityQuantity: 20_000 },
        { account: "TEST-002", expectedCash: 85_000, expectedSecurityQuantity: 10_000 },
      ],
    );
    const impact = calculated.body.impacts[0];

    const election = await request(`/events/${eventId}/election`, {
      method: "POST",
      body: JSON.stringify({
        impactId: impact.id,
        optionId: "exercise",
        quantityElected: 20_000,
        comment: "Exercise full entitlement.",
      }),
    }, analystSession);
    assert.equal(election.status, 200);
    assert.equal(election.body.status, "Election required");

    const secondElection = await request(`/events/${eventId}/election`, {
      method: "POST",
      body: JSON.stringify({
        impactId: calculated.body.impacts[1].id,
        optionId: "exercise",
        quantityElected: 10_000,
        comment: "Exercise full entitlement.",
      }),
    }, analystSession);
    assert.equal(secondElection.status, 200);
    assert.equal(secondElection.body.status, "Awaiting approval");

    const spoofedReviewer = await request(`/events/${eventId}/approval`, {
      method: "POST",
      body: JSON.stringify({
        approved: true,
        note: "Role in the payload must be ignored.",
        actorId: "USR-002",
        actorRole: "Reviewer",
      }),
    }, analystSession);
    assert.equal(spoofedReviewer.status, 403);

    const aisha = demoUsers.find((user) => user.id === "USR-001");
    assert.ok(aisha);
    const originalRole = aisha.role;
    aisha.role = "Reviewer";
    try {
      const selfApproval = await request(`/events/${eventId}/approval`, {
        method: "POST",
        body: JSON.stringify({ approved: true, note: "Self approval must be rejected." }),
      }, analystSession);
      assert.equal(selfApproval.status, 409);
      assert.match(selfApproval.body.error, /Maker-checker control failed/);
    } finally {
      aisha.role = originalRole;
    }

    const approved = await request(`/events/${eventId}/approval`, {
      method: "POST",
      body: JSON.stringify({ approved: true, note: "Independent checker approval." }),
    }, reviewerSession);
    assert.equal(approved.status, 200);
    assert.equal(approved.body.status, "Approved");
    assert.equal(approved.body.audit[0].actor, "Daniel Reed");
    assert.equal(approved.body.audit[0].actorId, "USR-002");
    assert.equal(approved.body.audit[0].actorRole, "Reviewer");
  });

  test("records server-resolved identity on term and intake audit entries", async () => {
    const updated = await request(`/events/${eventId}`, {
      method: "PATCH",
      body: JSON.stringify({ terms: [{ key: "subscriptionPrice", value: "EUR 8.50" }] }),
    }, analystSession);
    assert.equal(updated.status, 200);
    assert.equal(updated.body.audit[0].actor, "Aisha Mehta");
    assert.equal(updated.body.audit[0].actorId, "USR-001");
    assert.equal(updated.body.audit[0].actorRole, "Operations Analyst");

    const intake = await request("/intake", {
      method: "POST",
      body: JSON.stringify({ sampleId: "rights-issue", fileName: `rights-${runId}.pdf`, source: "API workflow test" }),
    }, analystSession);
    assert.equal(intake.status, 201);
    createdEventIds.add(intake.body.id);
    assert.equal(intake.body.audit[0].actor, "Aisha Mehta");
    assert.equal(intake.body.audit[0].actorId, "USR-001");
    assert.equal(intake.body.audit[0].actorRole, "Operations Analyst");

    const invalidSample = await request("/intake", {
      method: "POST",
      body: JSON.stringify({ sampleId: "unknown-notice", fileName: "unknown.pdf", source: "API workflow test" }),
    }, analystSession);
    assert.equal(invalidSample.status, 400);
    assert.match(invalidSample.body.error, /invalid enum value/i);
  });
});
