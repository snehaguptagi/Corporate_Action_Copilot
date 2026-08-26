import { Router, type IRouter } from "express";
import {
  ApproveEventBody,
  ApproveEventParams,
  ApproveEventResponse,
  GetDashboardResponse,
  GetEventParams,
  GetEventResponse,
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
  UpdateEventBody,
  UpdateEventParams,
  UpdateEventResponse,
  UpdateInstructionBody,
  UpdateInstructionParams,
  UpdateInstructionResponse,
} from "@workspace/api-zod";
import {
  appendAudit,
  buildDashboard,
  getCorporateActionEvent,
  getCorporateActionEvents,
  saveCorporateActionEvent,
  toSummary,
} from "../lib/corporate-actions";

const router: IRouter = Router();

const parseParams = <T>(schema: { safeParse: (value: unknown) => { success: boolean; data?: T; error?: { message: string } } }, value: unknown, res: any): T | null => {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error?.message ?? "Invalid request" });
    return null;
  }
  return parsed.data as T;
};

async function findEventOrRespond(eventId: string, res: any) {
  const event = await getCorporateActionEvent(eventId);
  if (!event) {
    res.status(404).json({ error: "Corporate action event not found" });
    return null;
  }
  return event;
}

router.get("/dashboard", async (req, res): Promise<void> => {
  const events = await getCorporateActionEvents();
  req.log.info({ eventCount: events.length }, "Built corporate actions dashboard");
  res.json(GetDashboardResponse.parse(buildDashboard(events)));
});

router.get("/events", async (req, res): Promise<void> => {
  const query = parseParams(ListEventsQueryParams, req.query, res);
  if (!query) return;
  const search = query.search?.trim().toLowerCase();
  const events = (await getCorporateActionEvents()).filter((event) => {
    const haystack = `${event.reference} ${event.issuer} ${event.security} ${event.eventType}`.toLowerCase();
    return (
      (!query.status || event.status === query.status) &&
      (!query.risk || event.risk === query.risk) &&
      (!search || haystack.includes(search))
    );
  });
  res.json(ListEventsResponse.parse(events.map(toSummary)));
});

router.get("/events/:eventId", async (req, res): Promise<void> => {
  const params = parseParams(GetEventParams, req.params, res);
  if (!params) return;
  const event = await findEventOrRespond(params.eventId, res);
  if (!event) return;
  res.json(GetEventResponse.parse(event));
});

router.patch("/events/:eventId", async (req, res): Promise<void> => {
  const params = parseParams(UpdateEventParams, req.params, res);
  const body = parseParams(UpdateEventBody, req.body, res);
  if (!params || !body) return;
  const event = await findEventOrRespond(params.eventId, res);
  if (!event) return;

  for (const update of body.terms ?? []) {
    const term = event.terms.find((candidate: any) => candidate.key === update.key);
    if (term) {
      term.value = update.value;
      term.reviewStatus = "Validated";
    }
  }
  event.status = event.terms.every((term: any) => term.reviewStatus === "Validated")
    ? "Validated"
    : "Needs review";
  appendAudit(event, "Terms updated", "Analyst validated extracted event terms.");
  await saveCorporateActionEvent(event);
  res.json(UpdateEventResponse.parse(event));
});

router.post("/events/:eventId/election", async (req, res): Promise<void> => {
  const params = parseParams(SaveElectionParams, req.params, res);
  const body = parseParams(SaveElectionBody, req.body, res);
  if (!params || !body) return;
  const event = await findEventOrRespond(params.eventId, res);
  if (!event) return;
  const impact = event.impacts.find((candidate: any) => candidate.id === body.impactId);
  const option = event.options.find((candidate: any) => candidate.id === body.optionId);
  if (!impact || !option) {
    res.status(400).json({ error: "Impact or election option is invalid" });
    return;
  }
  impact.election = option.label;
  impact.status = "Election received";
  event.status = event.impacts.every((candidate: any) => candidate.election)
    ? "Ready for approval"
    : "Election required";
  event.tasks.forEach((task: any) => {
    if (task.category === "Election" && task.detail.includes(impact.fund)) task.status = "Resolved";
  });
  appendAudit(event, "Election recorded", `${impact.fund} selected “${option.label}”.`, "Fund Manager");
  await saveCorporateActionEvent(event);
  res.json(SaveElectionResponse.parse(event));
});

router.post("/events/:eventId/approval", async (req, res): Promise<void> => {
  const params = parseParams(ApproveEventParams, req.params, res);
  const body = parseParams(ApproveEventBody, req.body, res);
  if (!params || !body) return;
  const event = await findEventOrRespond(params.eventId, res);
  if (!event) return;
  event.impacts.forEach((impact: any) => {
    impact.approval = body.approved ? "Approved" : "Returned";
  });
  event.status = body.approved ? "Ready for instruction" : "Needs review";
  appendAudit(
    event,
    body.approved ? "Checker approval recorded" : "Checker returned event",
    body.note,
    "Team Lead",
  );
  await saveCorporateActionEvent(event);
  res.json(ApproveEventResponse.parse(event));
});

router.post("/events/:eventId/instruction", async (req, res): Promise<void> => {
  const params = parseParams(UpdateInstructionParams, req.params, res);
  const body = parseParams(UpdateInstructionBody, req.body, res);
  if (!params || !body) return;
  const event = await findEventOrRespond(params.eventId, res);
  if (!event) return;
  event.instruction.status = body.status;
  event.status = body.status.toLowerCase().includes("rejected")
    ? "Needs review"
    : "Instruction pending";
  appendAudit(event, "Simulated instruction updated", `DRAFT instruction status changed to ${body.status}.`);
  await saveCorporateActionEvent(event);
  res.json(UpdateInstructionResponse.parse(event));
});

router.post("/events/:eventId/reconciliation", async (req, res): Promise<void> => {
  const params = parseParams(SaveReconciliationParams, req.params, res);
  const body = parseParams(SaveReconciliationBody, req.body, res);
  if (!params || !body) return;
  const event = await findEventOrRespond(params.eventId, res);
  if (!event) return;
  event.reconciliation.actual = body.actual;
  event.reconciliation.difference = Number((body.actual - event.reconciliation.expected).toFixed(2));
  event.reconciliation.note = body.note;
  event.reconciliation.status =
    Math.abs(event.reconciliation.difference) <= event.reconciliation.tolerance
      ? "Matched"
      : "Break";
  event.status = event.reconciliation.status === "Matched" ? "Reconciled" : "Settlement break";
  appendAudit(event, "Settlement reconciled", body.note, "Reconciliation");
  await saveCorporateActionEvent(event);
  res.json(SaveReconciliationResponse.parse(event));
});

router.get("/tasks", async (_req, res): Promise<void> => {
  const tasks = (await getCorporateActionEvents()).flatMap((event) => event.tasks ?? []);
  res.json(ListTasksResponse.parse(tasks));
});

router.post("/tasks/:taskId/resolve", async (req, res): Promise<void> => {
  const params = parseParams(ResolveTaskParams, req.params, res);
  if (!params) return;
  const events = await getCorporateActionEvents();
  const event = events.find((candidate) => candidate.tasks?.some((task: any) => task.id === params.taskId));
  const task = event?.tasks.find((candidate: any) => candidate.id === params.taskId);
  if (!event || !task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  task.status = "Resolved";
  appendAudit(event, "Task resolved", task.title);
  await saveCorporateActionEvent(event);
  res.json(ResolveTaskResponse.parse(task));
});

router.get("/audit", async (req, res): Promise<void> => {
  const query = parseParams(ListAuditQueryParams, req.query, res);
  if (!query) return;
  const audit = (await getCorporateActionEvents())
    .flatMap((event) => event.audit ?? [])
    .filter((entry: any) => !query.eventId || entry.eventId === query.eventId)
    .sort((a: any, b: any) => b.timestamp.localeCompare(a.timestamp));
  res.json(ListAuditResponse.parse(audit));
});

export default router;