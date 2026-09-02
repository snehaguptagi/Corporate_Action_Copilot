import { Router, type IRouter } from "express";
import { GetLastDiscoveryResponse, SearchLiveCorporateActionsBody, SearchLiveCorporateActionsResponse } from "@workspace/api-zod";
import { db, discoverySearchesTable } from "@workspace/db";
import { searchLiveCorporateActions } from "../lib/live-discovery";
import { requireActor } from "../lib/actor-context";

const router: IRouter = Router();

const LATEST_SEARCH_ID = "latest";

router.post("/discovery/search", async (req, res): Promise<void> => {
  if (!requireActor(req, res)) return;
  const parsed = SearchLiveCorporateActionsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const result = SearchLiveCorporateActionsResponse.parse(await searchLiveCorporateActions(parsed.data.query));
    try {
      await db.insert(discoverySearchesTable)
        .values({ id: LATEST_SEARCH_ID, data: result, searchedAt: new Date() })
        .onConflictDoUpdate({ target: discoverySearchesTable.id, set: { data: result, searchedAt: new Date() } });
    } catch (persistError) {
      // The search itself succeeded; do not turn a persistence failure into a 502.
      console.error("Failed to persist last discovery search", persistError);
    }
    res.json(result);
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : "Live discovery failed." });
  }
});

router.get("/discovery/last", async (req, res): Promise<void> => {
  if (!requireActor(req, res)) return;
  try {
    const rows = await db.select().from(discoverySearchesTable);
    const latest = rows.find((row) => row.id === LATEST_SEARCH_ID);
    const parsed = GetLastDiscoveryResponse.safeParse(latest ? { searched: true, result: latest.data } : { searched: false });
    if (!parsed.success) {
      console.error("Stored discovery search failed validation", parsed.error);
      res.json({ searched: false });
      return;
    }
    res.json(parsed.data);
  } catch (error) {
    console.error("Failed to load last discovery search", error);
    res.json({ searched: false });
  }
});

export default router;
