import { Router, type IRouter } from "express";
import {
  ApproveEventBody,
  ApproveEventParams,
  ApproveEventResponse,
  CalculateEventBody,
  CalculateEventParams,
  CalculateEventResponse,
  CreateIntakeBody,
  CreateIntakeResponse,
  CreateIntakeDraftBody,
  CreateIntakeDraftResponse,
  CreateCaseFromIntakeDraftParams,
  CreateCaseFromIntakeDraftResponse,
  ExtractIntakeDraftParams,
  ExtractIntakeDraftResponse,
  GetDashboardResponse,
  GetSchemeParams,
  GetSchemeResponse,
  GetEventParams,
  GetEventResponse,
  GetIntakeDraftParams,
  GetIntakeDraftResponse,
  ListAuditQueryParams,
  ListAuditResponse,
  ListEventsQueryParams,
  ListEventsResponse,
  ListTasksResponse,
  ResolveTaskParams,
  ResolveTaskResponse,
  SaveElectionBody,
  SaveElectionParams,
  SaveElectionResponse,
  SaveReconciliationBody,
  SaveReconciliationParams,
  SaveReconciliationResponse,
  SignInSessionBody,
  UpdateEventBody,
  UpdateEventParams,
  UpdateEventResponse,
  UpdateInstructionBody,
  UpdateInstructionParams,
  UpdateInstructionResponse,
  ValidateIntakeDraftBody,
  ValidateIntakeDraftParams,
  ValidateIntakeDraftResponse,
} from "@workspace/api-zod";
import {
  appendAudit,
  applyTermUpdates,
  approveControlledEvent,
  buildDashboard,
  calculateEventImpacts,
  createIntakeEvent,
  getCorporateActionEvent,
  getCorporateActionEvents,
  reconcileEvent,
  recordElection,
  saveCorporateActionEvent,
  simulateInstruction,
  sortCorporateActionEvents,
  toSummary,
} from "../lib/corporate-actions-v2";
import { ARKA_SCHEME_SEED, getArkaDesk } from "../lib/arka-desk";
import {
  createCaseFromIntakeDraft,
  createIntakeDraft,
  extractIntakeDraft,
  getIntakeDraft,
  validateIntakeDraft,
} from "../lib/source-intake";
import { getAuthenticatedActor, isPocEnvironment, requireActor, signInDemoActor } from "../lib/actor-context";

const router: IRouter = Router();

function withCurrentResponseFields(event: any) {
  const fallbackInstant = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();
  const validInstant = (value: unknown, days: number) =>
    typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : fallbackInstant(days);
  event.marketDeadlineAt = validInstant(event.marketDeadlineAt, 15);
  event.internalDeadlineAt = validInstant(event.internalDeadlineAt, 14);
  event.sourceRecords ??= [{
    id: `${event.id}-manual`,
    channel: "Manual upload",
    provider: "Arka Mutual Fund",
    messageType: "PDF",
    receivedAt: event.receivedAt,
    assertedFields: {},
    primary: true,
  }];
  event.sourceAgreement ??= "No second source has been received yet.";
  return event;
}

const parse = <T>(schema: { safeParse: (value: unknown) => { success: boolean; data?: T; error?: { message: string } } }, value: unknown, res: any): T | null => {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error?.message ?? "Invalid request" });
    return null;
  }
  return parsed.data as T;
};

async function findEvent(eventId: string, res: any) {
  const event = await getCorporateActionEvent(eventId);
  if (!event) {
    res.status(404).json({ error: "Corporate action event not found" });
    return null;
  }
  return withCurrentResponseFields(event);
}

const workflowError = (res: any, error: unknown) => {
  res.status(409).json({ error: error instanceof Error ? error.message : "Workflow control blocked this action." });
};

router.get("/dashboard", async (_req, res): Promise<void> => {
  const events = await getCorporateActionEvents();
  res.json(GetDashboardResponse.parse(buildDashboard(events)));
});

router.get("/schemes/:schemeId", async (req, res): Promise<void> => {
  const params = parse(GetSchemeParams, req.params, res);
  if (!params) return;
  try {
    const [desk, events] = await Promise.all([getArkaDesk(), getCorporateActionEvents()]);
    const scheme = desk.schemes.find((candidate: any) => candidate.id === params.schemeId);
    const seed = ARKA_SCHEME_SEED.find((candidate) => candidate.id === params.schemeId);
    if (!scheme || !seed) {
      res.status(404).json({ error: "Scheme not found." });
      return;
    }
    const openEvents = events.filter((event) => !["Closed", "Reconciled"].includes(event.status));
    const contributions = openEvents.flatMap((event) => {
      const impact = event.schemeImpacts.find((candidate: any) => candidate.schemeId === scheme.id);
      if (!impact?.affected) return [];
      return [{
        eventId: event.id,
        eventName: `${event.issuer} ${event.eventType.toLowerCase()}`,
        eventType: event.eventType,
        navImpactPaise: impact.navImpactPaise ?? 0,
        cashAmount: impact.cashAmount ?? 0,
        cashDirection: impact.direction,
        deadline: event.internalDeadline,
        status: event.status,
      }];
    });
    const fundingNeeded = contributions
      .filter((contribution) => contribution.cashDirection === "Funding")
      .reduce((total, contribution) => total + contribution.cashAmount, 0);
    const cashAvailable = Number(seed.cashBudgetPaise ?? 0n) / 100;
    const shortfall = Math.max(0, fundingNeeded - cashAvailable);
    const rightsEvent = openEvents.find((event) => event.eventType === "Rights issue" && event.schemeImpacts.some((impact: any) => impact.schemeId === scheme.id && impact.affected));
    const rightsImpact = rightsEvent?.schemeImpacts.find((impact: any) => impact.schemeId === scheme.id);
    const currentExposure = scheme.holdingQuantity > 0 ? Number(((scheme.holdingQuantity * 120) / (Number(seed.aumPaise) / 100) * 100).toFixed(2)) : 0;
    const postActionExposure = rightsImpact?.navImpactPaise != null ? scheme.capUsagePercent : currentExposure;
    const holdings = openEvents.flatMap((event) => {
      const impact = event.schemeImpacts.find((candidate: any) => candidate.schemeId === scheme.id);
      const position = event.positions?.find((candidate: any) => candidate.fund === scheme.name);
      if (!impact?.affected || !position) return [];
      return [{
        eventId: event.id,
        eventName: `${event.issuer} ${event.eventType.toLowerCase()}`,
        issuer: event.issuer,
        security: event.security,
        isin: event.securityMaster?.isin ?? "",
        quantity: position.eligibleQuantity ?? position.settledQuantity ?? 0,
        asOfDate: position.positionDate,
      }];
    });
    const totalNavImpact = contributions.reduce((total, contribution) => total + contribution.navImpactPaise, 0);
    const navImpactPercent = scheme.navPaise > 0 ? Number((totalNavImpact / scheme.navPaise * 100).toFixed(2)) : 0;
    const hasCapBreach = contributions.some((contribution) => contribution.eventType === "Rights issue") && postActionExposure > 10;
    const situation = contributions.length === 0
      ? `Nothing is affecting ${scheme.name} right now.`
      : `${contributions.length} corporate action${contributions.length === 1 ? "" : "s"} ${contributions.length === 1 ? "is" : "are"} moving ${scheme.name} this month. Together they cost ${totalNavImpact.toFixed(2)} paise per unit, ${navImpactPercent.toFixed(2)}% of NAV.${hasCapBreach ? " One of them breaches the SEBI single-issuer cap." : ""}`;
    res.json(GetSchemeResponse.parse({
      id: scheme.id,
      name: scheme.name,
      category: scheme.category,
      situation,
      contributions,
      funding: {
        needed: fundingNeeded,
        available: cashAvailable,
        shortfall,
        status: shortfall > 0 ? "Short" : "Comfortable",
      },
      headroom: {
        issuer: rightsEvent?.issuer ?? "Largest issuer",
        currentPercent: currentExposure,
        distanceToCapPercent: Math.max(0, 10 - currentExposure),
        postActionPercent: postActionExposure,
        capPercent: 10,
        maximumRights: rightsImpact?.flag === "SEBI 10% headroom" ? (scheme.maxRightsByCap ?? 0) : 0,
      },
      holdings,
    }));
  } catch (error) {
    workflowError(res, error);
  }
});

router.get("/session", (req, res): void => {
  const actor = getAuthenticatedActor(req);
  if (!actor) {
    res.status(401).json({ error: "No authenticated operational identity." });
    return;
  }
  res.json(actor);
});

router.post("/session", async (req, res): Promise<void> => {
  if (!isPocEnvironment()) {
    res.status(404).json({ error: "Demo operator sessions are unavailable outside the POC environment." });
    return;
  }
  const body = parse(SignInSessionBody, req.body, res);
  if (!body) return;
  const actor = signInDemoActor(res, body.actorId);
  if (!actor) {
    res.status(400).json({ error: "Choose a valid operational operator." });
    return;
  }
  res.json(actor);
});

router.get("/events", async (req, res): Promise<void> => {
  const query = parse(ListEventsQueryParams, req.query, res);
  if (!query) return;
  const search = query.search?.trim().toLowerCase();
  const events = (await getCorporateActionEvents()).filter((event) => {
    const haystack = `${event.reference} ${event.issuer} ${event.security} ${event.eventType}`.toLowerCase();
    return (!query.status || event.status === query.status)
      && (!query.eventType || event.eventType === query.eventType)
      && (!search || haystack.includes(search));
  });
  res.json(ListEventsResponse.parse(sortCorporateActionEvents(events.map(withCurrentResponseFields)).map(toSummary)));
});

router.post("/intake", async (req, res): Promise<void> => {
  const body = parse(CreateIntakeBody, req.body, res);
  if (!body) return;
  const actor = requireActor(req, res, ["Fund Manager"]);
  if (!actor) return;
  try {
    const event = await createIntakeEvent(body.sampleId, body.fileName, body.source, actor);
    res.status(201).json(CreateIntakeResponse.parse(event));
  } catch (error) {
    workflowError(res, error);
  }
});

router.post("/intake/drafts", async (req, res): Promise<void> => {
  const body = parse(CreateIntakeDraftBody, req.body, res);
  if (!body) return;
  const actor = requireActor(req, res, ["Fund Manager"]);
  if (!actor) return;
  try {
    const draft = await createIntakeDraft(body, actor);
    res.status(201).json(CreateIntakeDraftResponse.parse(draft));
  } catch (error) {
    workflowError(res, error);
  }
});

router.get("/intake/drafts/:draftId", async (req, res): Promise<void> => {
  const params = parse(GetIntakeDraftParams, req.params, res);
  if (!params) return;
  const actor = requireActor(req, res);
  if (!actor) return;
  const draft = await getIntakeDraft(params.draftId);
  if (!draft) {
    res.status(404).json({ error: "Intake draft not found." });
    return;
  }
  res.json(GetIntakeDraftResponse.parse(draft));
});

router.post("/intake/drafts/:draftId/extract", async (req, res): Promise<void> => {
  const params = parse(ExtractIntakeDraftParams, req.params, res);
  if (!params) return;
  const actor = requireActor(req, res, ["Fund Manager"]);
  if (!actor) return;
  try {
    const draft = await extractIntakeDraft(params.draftId, actor);
    res.json(ExtractIntakeDraftResponse.parse(draft));
  } catch (error) {
    workflowError(res, error);
  }
});

router.post("/intake/drafts/:draftId/validate", async (req, res): Promise<void> => {
  const params = parse(ValidateIntakeDraftParams, req.params, res);
  const body = parse(ValidateIntakeDraftBody, req.body, res);
  if (!params || !body) return;
  const actor = requireActor(req, res, ["Fund Manager"]);
  if (!actor) return;
  try {
    const draft = await validateIntakeDraft(params.draftId, body.terms, actor);
    res.json(ValidateIntakeDraftResponse.parse(draft));
  } catch (error) {
    workflowError(res, error);
  }
});

router.post("/intake/drafts/:draftId/create-case", async (req, res): Promise<void> => {
  const params = parse(CreateCaseFromIntakeDraftParams, req.params, res);
  if (!params) return;
  const actor = requireActor(req, res, ["Fund Manager"]);
  if (!actor) return;
  try {
    const event = await createCaseFromIntakeDraft(params.draftId, actor);
    res.status(201).json(CreateCaseFromIntakeDraftResponse.parse(event));
  } catch (error) {
    workflowError(res, error);
  }
});

router.get("/events/:eventId", async (req, res): Promise<void> => {
  const params = parse(GetEventParams, req.params, res);
  if (!params) return;
  const event = await findEvent(params.eventId, res);
  if (event) res.json(GetEventResponse.parse(event));
});

router.patch("/events/:eventId", async (req, res): Promise<void> => {
  const params = parse(UpdateEventParams, req.params, res);
  const body = parse(UpdateEventBody, req.body, res);
  if (!params || !body) return;
  const actor = requireActor(req, res, ["Fund Manager"]);
  if (!actor) return;
  const event = await findEvent(params.eventId, res);
  if (!event) return;
  try {
    applyTermUpdates(event, body.terms ?? [], actor, body.reason ?? "");
    await saveCorporateActionEvent(event);
    res.json(UpdateEventResponse.parse(event));
  } catch (error) {
    workflowError(res, error);
  }
});

router.post("/events/:eventId/calculate", async (req, res): Promise<void> => {
  const params = parse(CalculateEventParams, req.params, res);
  const body = parse(CalculateEventBody, req.body, res);
  if (!params || !body) return;
  const actor = requireActor(req, res, ["Fund Manager"]);
  if (!actor) return;
  const event = await findEvent(params.eventId, res);
  if (!event) return;
  try {
    calculateEventImpacts(event, actor);
    await saveCorporateActionEvent(event);
    res.json(CalculateEventResponse.parse(event));
  } catch (error) {
    workflowError(res, error);
  }
});

router.post("/events/:eventId/election", async (req, res): Promise<void> => {
  const params = parse(SaveElectionParams, req.params, res);
  const body = parse(SaveElectionBody, req.body, res);
  if (!params || !body) return;
  const actor = requireActor(req, res, ["Fund Manager"]);
  if (!actor) return;
  const event = await findEvent(params.eventId, res);
  if (!event) return;
  try {
    recordElection(event, body, actor);
    await saveCorporateActionEvent(event);
    res.json(SaveElectionResponse.parse(event));
  } catch (error) {
    workflowError(res, error);
  }
});

router.post("/events/:eventId/approval", async (req, res): Promise<void> => {
  const params = parse(ApproveEventParams, req.params, res);
  const body = parse(ApproveEventBody, req.body, res);
  if (!params || !body) return;
  const actor = requireActor(req, res, ["Compliance"]);
  if (!actor) return;
  const event = await findEvent(params.eventId, res);
  if (!event) return;
  try {
    if (
      body.approved &&
      (!event.terms.every((term: any) => term.reviewStatus === "Validated") ||
        !event.schemeImpacts.filter((impact: any) => impact.affected).every(
          (impact: any) => event.options.length === 0 || impact.election,
        ))
    ) {
      res.status(409).json({
        error: "All validated terms and required elections must be complete before approval.",
      });
      return;
    }
    approveControlledEvent(event, body.approved, body.note, actor);
    await saveCorporateActionEvent(event);
    res.json(ApproveEventResponse.parse(event));
  } catch (error) {
    workflowError(res, error);
  }
});

router.post("/events/:eventId/instruction", async (req, res): Promise<void> => {
  const params = parse(UpdateInstructionParams, req.params, res);
  const body = parse(UpdateInstructionBody, req.body, res);
  if (!params || !body) return;
  const actor = requireActor(req, res, ["Fund Manager"]);
  if (!actor) return;
  const event = await findEvent(params.eventId, res);
  if (!event) return;
  try {
    if (
      !body.status.toLowerCase().includes("rejected") &&
      !event.schemeImpacts.filter((impact: any) => impact.affected).every(
        (impact: any) =>
          event.options.length === 0 ||
          impact.approval === "Approved",
      )
    ) {
      throw new Error(
        "Checker approval is required before a simulated instruction can be recorded.",
      );
    }
    simulateInstruction(event, body.status, actor);
    await saveCorporateActionEvent(event);
    res.json(UpdateInstructionResponse.parse(event));
  } catch (error) {
    workflowError(res, error);
  }
});

router.post("/events/:eventId/reconciliation", async (req, res): Promise<void> => {
  const params = parse(SaveReconciliationParams, req.params, res);
  const body = parse(SaveReconciliationBody, req.body, res);
  if (!params || !body) return;
  const actor = requireActor(req, res, ["Fund Manager"]);
  if (!actor) return;
  const event = await findEvent(params.eventId, res);
  if (!event) return;
  try {
    reconcileEvent(event, body, actor);
    await saveCorporateActionEvent(event);
    res.json(SaveReconciliationResponse.parse(event));
  } catch (error) {
    workflowError(res, error);
  }
});

router.get("/tasks", async (_req, res): Promise<void> => {
  const tasks = (await getCorporateActionEvents()).flatMap((event) => event.tasks ?? []);
  res.json(ListTasksResponse.parse(tasks));
});

router.post("/tasks/:taskId/resolve", async (req, res): Promise<void> => {
  const params = parse(ResolveTaskParams, req.params, res);
  if (!params) return;
  const actor = requireActor(req, res);
  if (!actor) return;
  const events = await getCorporateActionEvents();
  const event = events.find((candidate) => candidate.tasks?.some((current: any) => current.id === params.taskId));
  const currentTask = event?.tasks.find((current: any) => current.id === params.taskId);
  if (!event || !currentTask) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  currentTask.status = "Resolved";
  appendAudit(event, "Task resolved", currentTask.title, actor, { previousValue: "Open", newValue: "Resolved" });
  await saveCorporateActionEvent(event);
  res.json(ResolveTaskResponse.parse(currentTask));
});

router.get("/audit", async (req, res): Promise<void> => {
  const query = parse(ListAuditQueryParams, req.query, res);
  if (!query) return;
  const entries = (await getCorporateActionEvents())
    .flatMap((event) => event.audit ?? [])
    .filter((entry: any) => !query.eventId || entry.eventId === query.eventId)
    .sort((a: any, b: any) => b.timestamp.localeCompare(a.timestamp));
  res.json(ListAuditResponse.parse(entries));
});

export default router;