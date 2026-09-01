import {
  ApproveArkaDeskBody,
  ApproveArkaDeskResponse,
  GetArkaDeskResponse,
  SaveArkaDeskDecisionsBody,
  SaveArkaDeskDecisionsResponse,
  SubmitArkaDeskResponse,
} from "@workspace/api-zod";
import { Router, type IRouter } from "express";
import {
  approveArkaDesk,
  getArkaDesk,
  saveArkaDeskDecisions,
  submitArkaDesk,
} from "../lib/arka-desk";
import { requireActor } from "../lib/actor-context";

const router: IRouter = Router();

router.get("/desk", async (req, res): Promise<void> => {
  const actor = requireActor(req, res);
  if (!actor) return;
  res.json(GetArkaDeskResponse.parse(await getArkaDesk()));
});

router.post("/desk/decisions", async (req, res): Promise<void> => {
  const actor = requireActor(req, res, ["Fund Manager"]);
  if (!actor) return;
  const body = SaveArkaDeskDecisionsBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  try {
    const desk = await saveArkaDeskDecisions(body.data.decisions);
    res.json(SaveArkaDeskDecisionsResponse.parse(desk));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Could not save decisions." });
  }
});

router.post("/desk/submit", async (req, res): Promise<void> => {
  const actor = requireActor(req, res, ["Fund Manager"]);
  if (!actor) return;
  try {
    await submitArkaDesk(actor);
    res.json(SubmitArkaDeskResponse.parse(await getArkaDesk()));
  } catch (error) {
    res.status(409).json({ error: error instanceof Error ? error.message : "Could not submit decisions." });
  }
});

router.post("/desk/approval", async (req, res): Promise<void> => {
  const actor = requireActor(req, res, ["Compliance"]);
  if (!actor) return;
  const body = ApproveArkaDeskBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  try {
    const desk = await approveArkaDesk(actor, body.data.status);
    res.json(ApproveArkaDeskResponse.parse(desk));
  } catch (error) {
    res.status(409).json({ error: error instanceof Error ? error.message : "Could not check decisions." });
  }
});

export default router;