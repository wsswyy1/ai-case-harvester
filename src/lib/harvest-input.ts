import { z } from "zod";
import { DEFAULT_SINCE_HOURS, MAX_LIMIT, type HarvestOptions } from "./harvest";
import { SourceNameSchema } from "./types";

/** Shared input contract for POST /api/harvest and the CLI. */
export const HarvestInputSchema = z
  .object({
    sources: z.array(SourceNameSchema).min(1).optional(),
    since: z.iso.datetime({ offset: true }).optional(),
    sinceHours: z.number().positive().max(24 * 90).optional(),
    limit: z.number().int().min(1).max(MAX_LIMIT).optional(),
    query: z.string().trim().min(1).max(200).optional()
  })
  .strict();

export type HarvestInput = z.infer<typeof HarvestInputSchema>;

export function toHarvestOptions(input: HarvestInput, now: Date = new Date()): HarvestOptions {
  const since = input.since
    ? new Date(input.since)
    : new Date(now.getTime() - (input.sinceHours ?? DEFAULT_SINCE_HOURS) * 3600_000);
  return { sources: input.sources, since, limit: input.limit, query: input.query };
}
