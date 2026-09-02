import { Router, type IRouter } from "express";
import { SearchLiveCorporateActionsBody, SearchLiveCorporateActionsResponse } from "@workspace/api-zod";
import { searchLiveCorporateActions } from "../lib/live-discovery";
import { requireActor } from "../lib/actor-context";

const router: IRouter = Router();

router.post("/discovery/search", async (req, res): Promise<void> => {
  if (!requireActor(req, res)) return;
  const parsed = SearchLiveCorporateActionsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    res.json(SearchLiveCorporateActionsResponse.parse(await searchLiveCorporateActions(parsed.data.query)));
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : "Live discovery failed." });
  }
});

export default router;