import type { CaseRecord, HarvestRun } from "./types";

export interface Database {
  migrate(): void;
  upsertCase(record: CaseRecord): void;
  getCase(id: string): CaseRecord | undefined;
  findByCanonicalKey(key: string): CaseRecord | undefined;
  listCases(filter: { status?: string; source?: string; category?: string }): CaseRecord[];
  saveRun(run: HarvestRun): void;
}

/**
 * Open SQLite at DATABASE_PATH. Create tables if missing.
 * Do not fall back to an in-memory database in production configuration.
 */
export function openDatabase(_path: string): Database {
  throw new Error("TODO: open better-sqlite3 and run migrations (Requirement 6)");
}
