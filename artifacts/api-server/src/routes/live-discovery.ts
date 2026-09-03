import { Router, type IRouter } from "express";
import { GetLastDiscoveryResponse, SearchLiveCorporateActionsBody, SearchLiveCorporateActionsResponse } from "@workspace/api-zod";
import { db, discoverySearchesTable } from "@workspace/db";
import { searchLiveCorporateActions, type LiveDiscoveryWindow } from "../lib/live-discovery";
import { requireActor } from "../lib/actor-context";

const router: IRouter = Router();

const KNOWN_WINDOWS: LiveDiscoveryWindow[] = ["today", "week", "month"];

router.post("/discovery/search", async (req, res): Promise<void> => {
  if (!requireActor(req, res)) return;
  const parsed = SearchLiveCorporateActionsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const window: LiveDiscoveryWindow = KNOWN_WINDOWS.includes(parsed.data.window as LiveDiscoveryWindow)
    ? (parsed.data.window as LiveDiscoveryWindow)
    : "week";
  try {
    const result = SearchLiveCorporateActionsResponse.parse(await searchLiveCorporateActions(parsed.data.query, window));
    try {
      // One stored search per window, so each tab remembers its own last fetch.
      await db.insert(discoverySearchesTable)
        .values({ id: window, data: result, searchedAt: new Date() })
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
    const searches = rows
      .filter((row) => KNOWN_WINDOWS.includes(row.id as LiveDiscoveryWindow))
      .map((row) => row.data);
    const parsed = GetLastDiscoveryResponse.safeParse({ searches });
    if (!parsed.success) {
      console.error("Stored discovery searches failed validation", parsed.error);
      res.json({ searches: [] });
      return;
    }
    res.json(parsed.data);
  } catch (error) {
    console.error("Failed to load last discovery searches", error);
    res.json({ searches: [] });
  }
});

export default router;
