import type { HarvestQuery, HarvestRun } from "./types";

/**
 * collect → normalize → classify → dedupe → persist.
 * Same function is used by POST /api/harvest and `npm run harvest`.
 */
export async function runHarvest(_query: HarvestQuery): Promise<HarvestRun> {
  throw new Error("TODO: implement harvest orchestration (task 8)");
}
