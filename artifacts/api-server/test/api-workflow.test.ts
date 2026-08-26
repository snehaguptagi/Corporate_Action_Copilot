import assert from "node:assert/strict";
import { once } from "node:events";
import test, { after, afterEach, before, describe } from "node:test";
import { inArray } from "drizzle-orm";
import {
  corporateActionEventsTable,
  db,
  pool,
} from "@workspace/db";
import app from "../src/app";
import {
  calculateDividend,
  calculateRights,
  calculateSplit,
  calculateTender,
} from "../src/lib/calculations";
import { getCorporateActionEvent } from "../src/lib/corporate-actions";

type EventData = Record<string, any>;

const runId = crypto.randomUUID().replaceAll("-", "").slice(0, 10);
const fixtureIds = {
  dividend: `test-${runId}-dividend`,
  split: `test-${runId}-split`,
  rights: `test-${runId}-rights`,
  tender: `test-${runId}-tender`,
};

let server: ReturnType<typeof app.listen>;
let baseUrl: string;
let fixtures: Record<keyof typeof fixtureIds, EventData>;

function cloneFixture(
  source: EventData,
  id: string,
  status: string,
): EventData {
  const event = structuredClone(source);
  event.id = id;
  event.reference = `TEST-${runId}-${source.reference}`;
  event.status = status;
  event.tasks = event.tasks.map((task: EventData, index: number) => ({
    ...task,
    id: `${id}-task-${index}`,
    eventId: id,
    status: "Open",
  }));
  event.audit = [];
  return event;
}

function makeFixtures(
  dividend: EventData,
  split: EventData,
  rights: EventData,
  tender: EventData,
): Record<keyof typeof fixtureIds, EventData> {
  const dividendFixture = cloneFixture(
    dividend,
    fixtureIds.dividend,
    "Needs review",
  );
  const splitFixture = cloneFixture(
    split,
    fixtureIds.split,
    "Ready for settlement",
  );
  const rightsFixture = cloneFixture(
    rights,
    fixtureIds.rights,
    "Election required",
  );
  rightsFixture.impacts.forEach((impact: EventData) => {
    impact.election = null;
    impact.approval = "Pending";
    impact.status = "Awaiting election";
  });
  rightsFixture.instruction.status = "Draft — not submitted";

  const tenderFixture = cloneFixture(
    tender,
    fixtureIds.tender,
    "Instruction pending",
  );
  tenderFixture.instruction.status = "Draft — ready for checker";
  tenderFixture.impacts.forEach((impact: EventData) => {
    impact.election = tenderFixture.options.find(
      (option: EventData) => option.id === "tender",
    )?.label;
  });
  tenderFixture.reconciliation = {
    expected: 68_000,
    actual: 0,
    difference: -68_000,
    tolerance: 1,
    status: "Not due",
    note: "Tender acceptance outcome is pending.",
  };
  tenderFixture.impacts.forEach((impact: EventData) => {
    impact.approval = "Approved";
  });

  return {
    dividend: dividendFixture,
    split: splitFixture,
    rights: rightsFixture,
    tender: tenderFixture,
  };
}

async function resetFixtures(): Promise<void> {
  await db
    .delete(corporateActionEventsTable)
    .where(inArray(corporateActionEventsTable.id, Object.values(fixtureIds)));
  await db.insert(corporateActionEventsTable).values(
    Object.values(fixtures).map((event) => ({ id: event.id, data: event })),
  );
}

async function request(
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; body: any }> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init.headers,
    },
  });
  const body = await response.json();
  return { status: response.status, body };
}

before(async () => {
  const [dividend, split, rights, tender] = await Promise.all([
    getCorporateActionEvent("evt-aurora-div"),
    getCorporateActionEvent("evt-delta-split"),
    getCorporateActionEvent("evt-verdant-rights"),
    getCorporateActionEvent("evt-meridian-tender"),
  ]);
  assert.ok(dividend && split && rights && tender, "Expected seeded POC events");
  fixtures = makeFixtures(dividend, split, rights, tender);
  await resetFixtures();

  server = app.listen(0);
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}/api`;
});

afterEach(async () => {
  await resetFixtures();
});

after(async () => {
  await db
    .delete(corporateActionEventsTable)
    .where(inArray(corporateActionEventsTable.id, Object.values(fixtureIds)));
  server.close();
  await once(server, "close");
  await pool.end();
});

describe("corporate-action API workflow", { concurrency: false }, () => {
  test("returns impact amounts calculated from recorded terms and decisions", async () => {
    const [dividend, split, rights, tender] = await Promise.all([
      request(`/events/${fixtureIds.dividend}`),
      request(`/events/${fixtureIds.split}`),
      request(`/events/${fixtureIds.rights}`),
      request(`/events/${fixtureIds.tender}`),
    ]);

    assert.deepEqual(
      dividend.body.impacts.map((impact: EventData) => impact.expected),
      dividend.body.impacts.map((impact: EventData) =>
        calculateDividend(impact.eligibleQuantity, 0.425),
      ),
    );
    assert.deepEqual(
      split.body.impacts.map((impact: EventData) => impact.expected),
      split.body.impacts.map((impact: EventData) =>
        calculateSplit(impact.eligibleQuantity, 4, 1),
      ),
    );
    assert.deepEqual(
      rights.body.impacts.map((impact: EventData) => impact.expected),
      [0, 0],
    );
    assert.deepEqual(
      tender.body.impacts.map((impact: EventData) => impact.expected),
      tender.body.impacts.map((impact: EventData) =>
        calculateTender(impact.eligibleQuantity, 0.2, 8.5),
      ),
    );
  });

  test("blocks malformed requests and prevents approval or instruction before prerequisites", async () => {
    const invalidElection = await request(
      `/events/${fixtureIds.rights}/election`,
      {
        method: "POST",
        body: JSON.stringify({
          impactId: fixtures.rights.impacts[0].id,
          optionId: "not-a-real-option",
        }),
      },
    );
    assert.equal(invalidElection.status, 400);

    const prematureApproval = await request(
      `/events/${fixtureIds.rights}/approval`,
      {
        method: "POST",
        body: JSON.stringify({
          approved: true,
          note: "This must be rejected before elections.",
        }),
      },
    );
    assert.equal(prematureApproval.status, 409);

    const prematureInstruction = await request(
      `/events/${fixtureIds.rights}/instruction`,
      {
        method: "POST",
        body: JSON.stringify({ status: "Simulated — pending" }),
      },
    );
    assert.equal(prematureInstruction.status, 409);
  });

  test("sets voluntary expected amounts to zero for lapse and decline elections", async () => {
    for (const impact of fixtures.rights.impacts) {
      const election = await request(
        `/events/${fixtureIds.rights}/election`,
        {
          method: "POST",
          body: JSON.stringify({
            impactId: impact.id,
            optionId: "lapse",
          }),
        },
      );
      assert.equal(election.status, 200);
      assert.equal(
        election.body.impacts.find(
          (candidate: EventData) => candidate.id === impact.id,
        ).expected,
        0,
      );
    }

    const declinedTender = await request(
      `/events/${fixtureIds.tender}/election`,
      {
        method: "POST",
        body: JSON.stringify({
          impactId: fixtures.tender.impacts[0].id,
          optionId: "decline",
        }),
      },
    );
    assert.equal(declinedTender.status, 200);
    assert.equal(declinedTender.body.impacts[0].expected, 0);
    assert.equal(declinedTender.body.reconciliation.expected, 0);
  });

  test("fails closed for ambiguous, negative, and zero calculation terms", async () => {
    const invalidTerms = [
      { key: "maximum", value: "20% or 30% of position" },
      { key: "maximum", value: "-20% of position" },
      { key: "maximum", value: "0% of position" },
      { key: "offerPrice", value: "AUD -8.50" },
    ];

    for (const term of invalidTerms) {
      const updatedTerms = await request(`/events/${fixtureIds.tender}`, {
        method: "PATCH",
        body: JSON.stringify({ terms: [term] }),
      });
      assert.equal(updatedTerms.status, 422, term.value);
      assert.match(updatedTerms.body.error, /valid tender/i);

      const approval = await request(`/events/${fixtureIds.tender}/approval`, {
        method: "POST",
        body: JSON.stringify({ approved: true, note: "Must be blocked." }),
      });
      assert.equal(approval.status, 409, term.value);

      const instruction = await request(
        `/events/${fixtureIds.tender}/instruction`,
        {
          method: "POST",
          body: JSON.stringify({ status: "Simulated — pending" }),
        },
      );
      assert.equal(instruction.status, 409, term.value);
      await resetFixtures();
    }
  });

  test("requires fresh checker approval after an elected value or term changes", async () => {
    const electionChange = await request(
      `/events/${fixtureIds.tender}/election`,
      {
        method: "POST",
        body: JSON.stringify({
          impactId: fixtures.tender.impacts[0].id,
          optionId: "decline",
        }),
      },
    );
    assert.equal(electionChange.status, 200);
    assert.equal(electionChange.body.impacts[0].expected, 0);
    assert.equal(electionChange.body.impacts[0].approval, "Pending");
    assert.equal(electionChange.body.instruction.status, "Draft — not submitted");

    const blockedAfterElection = await request(
      `/events/${fixtureIds.tender}/instruction`,
      {
        method: "POST",
        body: JSON.stringify({ status: "Simulated — pending" }),
      },
    );
    assert.equal(blockedAfterElection.status, 409);

    const reapprovedElection = await request(
      `/events/${fixtureIds.tender}/approval`,
      {
        method: "POST",
        body: JSON.stringify({
          approved: true,
          note: "Checker reviewed the declined tender.",
        }),
      },
    );
    assert.equal(reapprovedElection.status, 200);

    const instructedAfterReapproval = await request(
      `/events/${fixtureIds.tender}/instruction`,
      {
        method: "POST",
        body: JSON.stringify({ status: "Simulated — pending" }),
      },
    );
    assert.equal(instructedAfterReapproval.status, 200);

    await resetFixtures();
    const termChange = await request(`/events/${fixtureIds.tender}`, {
      method: "PATCH",
      body: JSON.stringify({
        terms: [{ key: "offerPrice", value: "AUD 9.00" }],
      }),
    });
    assert.equal(termChange.status, 200);
    assert.equal(termChange.body.impacts[0].approval, "Pending");
    assert.equal(termChange.body.instruction.status, "Draft — not submitted");

    const blockedAfterTermChange = await request(
      `/events/${fixtureIds.tender}/instruction`,
      {
        method: "POST",
        body: JSON.stringify({ status: "Simulated — pending" }),
      },
    );
    assert.equal(blockedAfterTermChange.status, 409);

    await resetFixtures();
    for (const impact of fixtures.rights.impacts) {
      const election = await request(
        `/events/${fixtureIds.rights}/election`,
        {
          method: "POST",
          body: JSON.stringify({ impactId: impact.id, optionId: "subscribe" }),
        },
      );
      assert.equal(election.status, 200);
    }
    const approval = await request(`/events/${fixtureIds.rights}/approval`, {
      method: "POST",
      body: JSON.stringify({
        approved: true,
        note: "Checker approved the original deadline.",
      }),
    });
    assert.equal(approval.status, 200);

    const deadlineAmendment = await request(`/events/${fixtureIds.rights}`, {
      method: "PATCH",
      body: JSON.stringify({
        terms: [{ key: "deadline", value: "30 Aug 2026 · 17:30 CEST" }],
      }),
    });
    assert.equal(deadlineAmendment.status, 200);
    assert.ok(
      deadlineAmendment.body.impacts.every(
        (impact: EventData) => impact.approval === "Pending",
      ),
    );

    const blockedAfterDeadlineAmendment = await request(
      `/events/${fixtureIds.rights}/instruction`,
      {
        method: "POST",
        body: JSON.stringify({ status: "Simulated — pending" }),
      },
    );
    assert.equal(blockedAfterDeadlineAmendment.status, 409);
  });

  test("completes the gated election, approval, and simulated instruction path with audit evidence", async () => {
    for (const impact of fixtures.rights.impacts) {
      const election = await request(
        `/events/${fixtureIds.rights}/election`,
        {
          method: "POST",
          body: JSON.stringify({
            impactId: impact.id,
            optionId: "subscribe",
          }),
        },
      );
      assert.equal(election.status, 200);
    }

    const approval = await request(`/events/${fixtureIds.rights}/approval`, {
      method: "POST",
      body: JSON.stringify({
        approved: true,
        note: "All fund elections reviewed by the checker.",
      }),
    });
    assert.equal(approval.status, 200);
    assert.equal(approval.body.status, "Ready for instruction");

    const instruction = await request(
      `/events/${fixtureIds.rights}/instruction`,
      {
        method: "POST",
        body: JSON.stringify({ status: "Simulated — pending" }),
      },
    );
    assert.equal(instruction.status, 200);
    assert.equal(instruction.body.status, "Instruction pending");

    const audit = await request(`/audit?eventId=${fixtureIds.rights}`);
    assert.equal(audit.status, 200);
    assert.deepEqual(
      audit.body.slice(0, 2).map((entry: EventData) => entry.action),
      ["Simulated instruction updated", "Checker approval recorded"],
    );
  });

  test("marks an out-of-tolerance settlement as a reconciliation break", async () => {
    const reconciliation = await request(
      `/events/${fixtureIds.tender}/reconciliation`,
      {
        method: "POST",
        body: JSON.stringify({
          actual: 67_000,
          note: "Custodian booked less cash than expected.",
        }),
      },
    );
    assert.equal(reconciliation.status, 200);
    assert.equal(reconciliation.body.reconciliation.difference, -1_000);
    assert.equal(reconciliation.body.reconciliation.status, "Break");
    assert.equal(reconciliation.body.status, "Settlement break");
  });

  test("resolves an exception task and exposes its audit entry", async () => {
    const tasks = await request("/tasks");
    const exception = tasks.body.find(
      (task: EventData) =>
        task.eventId === fixtureIds.rights && task.category === "Election",
    );
    assert.ok(exception);

    const resolved = await request(`/tasks/${exception.id}/resolve`, {
      method: "POST",
    });
    assert.equal(resolved.status, 200);
    assert.equal(resolved.body.status, "Resolved");

    const audit = await request(`/audit?eventId=${fixtureIds.rights}`);
    assert.ok(
      audit.body.some((entry: EventData) => entry.action === "Task resolved"),
    );
  });
});