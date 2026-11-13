/**
 * CLI entry for `npm run harvest`.
 * Calls the same runHarvest() function as POST /api/harvest.
 *
 *   npm run harvest -- --sources hn,github --since-hours 48 --limit 10 --query "Claude"
 */
import fs from "node:fs";
import { parseArgs } from "node:util";
import { runHarvest } from "@/lib/harvest";
import { HarvestInputSchema, toHarvestOptions } from "@/lib/harvest-input";
import * as log from "@/lib/log";

function loadDotEnv(): void {
  // Next.js loads .env for the app; the CLI does the same with Node's built-in loader.
  if (fs.existsSync(".env")) process.loadEnvFile(".env");
}

async function main(): Promise<void> {
  loadDotEnv();

  const { values } = parseArgs({
    options: {
      sources: { type: "string" },
      since: { type: "string" },
      "since-hours": { type: "string" },
      limit: { type: "string" },
      query: { type: "string" },
      help: { type: "boolean", short: "h" }
    },
    strict: true
  });

  if (values.help) {
    console.log(
      "Usage: npm run harvest -- [--sources hn,github,reddit] [--since ISO | --since-hours N] [--limit N] [--query TEXT]"
    );
    return;
  }

  const input = HarvestInputSchema.safeParse({
    sources: values.sources?.split(",").map((s) => s.trim()).filter(Boolean),
    since: values.since,
    sinceHours: values["since-hours"] !== undefined ? Number(values["since-hours"]) : undefined,
    limit: values.limit !== undefined ? Number(values.limit) : undefined,
    query: values.query
  });
  if (!input.success) {
    log.error("Invalid arguments:", input.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    process.exitCode = 2;
    return;
  }

  const { run, errors } = await runHarvest(toHarvestOptions(input.data));
  log.info(JSON.stringify({ run, errors }, null, 2));
}

main().catch((err: unknown) => {
  log.error("Harvest failed:", log.safeErrorMessage(err));
  process.exitCode = 1;
});
