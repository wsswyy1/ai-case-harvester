import fs from "node:fs";
import path from "node:path";
import BetterSqlite3 from "better-sqlite3";
import { loadEnv } from "./env";
import {
  assertTransition,
  CaseRecordSchema,
  HarvestRunSchema,
  type CaseRecord,
  type CaseStatus,
  type HarvestRun,
  type SourceName,
  type UsecasecnCategory
} from "./types";

export interface CaseFilter {
  status?: CaseStatus | CaseStatus[];
  source?: SourceName;
  category?: UsecasecnCategory;
  minConfidence?: number;
  maxConfidence?: number;
  ids?: string[];
  limit?: number;
}

export interface Database {
  readonly path: string;
  migrate(): void;
  /** Insert or fully replace a case by id. */
  upsertCase(record: CaseRecord): void;
  getCase(id: string): CaseRecord | undefined;
  findBySourceId(source: SourceName, sourceId: string): CaseRecord | undefined;
  /** Primary (non-duplicate) record for a canonical key. */
  findByCanonicalKey(key: string): CaseRecord | undefined;
  listCases(filter?: CaseFilter): CaseRecord[];
  /**
   * Change status inside a transaction after checking the state machine.
   * Throws InvalidTransitionError if the move is not allowed.
   */
  transition(id: string, to: CaseStatus, patch?: Partial<CaseRecord>): CaseRecord;
  /** Update non-status fields. */
  patchCase(id: string, patch: Partial<Omit<CaseRecord, "id" | "status">>): CaseRecord;
  appendRelatedSource(id: string, url: string): void;
  saveRun(run: HarvestRun): void;
  getRun(id: string): HarvestRun | undefined;
  listRuns(limit?: number): HarvestRun[];
  transaction<T>(fn: () => T): T;
  close(): void;
}

export class DatabaseOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseOpenError";
  }
}

export class CaseNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Case ${id} was not found.`);
    this.name = "CaseNotFoundError";
  }
}

// ---------------------------------------------------------------------------
// Migrations. Append only; never edit an applied entry.
// ---------------------------------------------------------------------------

interface Migration {
  version: number;
  name: string;
  sql: string;
}

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: "create cases and harvest_runs",
    sql: `
      CREATE TABLE IF NOT EXISTS cases (
        id                TEXT PRIMARY KEY,
        source            TEXT NOT NULL CHECK (source IN ('hn','github','reddit')),
        source_id         TEXT NOT NULL,
        source_url        TEXT NOT NULL,
        project_url       TEXT,
        canonical_key     TEXT,
        title             TEXT NOT NULL,
        author            TEXT NOT NULL,
        excerpt           TEXT NOT NULL,
        discovered_urls   TEXT NOT NULL DEFAULT '[]',
        source_created_at TEXT NOT NULL,
        is_real_case      INTEGER,
        confidence        REAL,
        low_confidence    INTEGER NOT NULL DEFAULT 0,
        category          TEXT,
        tools             TEXT NOT NULL DEFAULT '[]',
        summary_zh        TEXT,
        rationale         TEXT,
        status            TEXT NOT NULL,
        note              TEXT,
        duplicate_of_id   TEXT REFERENCES cases(id),
        related_sources   TEXT NOT NULL DEFAULT '[]',
        reviewed_at       TEXT,
        reject_reason     TEXT,
        exported_at       TEXT,
        ingest_receipt_id TEXT,
        ingest_status     TEXT,
        ingest_error      TEXT,
        created_at        TEXT NOT NULL,
        updated_at        TEXT NOT NULL
      );

      CREATE UNIQUE INDEX IF NOT EXISTS cases_source_identity
        ON cases (source, source_id);

      CREATE UNIQUE INDEX IF NOT EXISTS cases_canonical_primary
        ON cases (canonical_key)
        WHERE canonical_key IS NOT NULL AND status <> 'duplicate';

      CREATE INDEX IF NOT EXISTS cases_status ON cases (status);

      CREATE TABLE IF NOT EXISTS harvest_runs (
        id          TEXT PRIMARY KEY,
        started_at  TEXT NOT NULL,
        finished_at TEXT,
        per_source  TEXT NOT NULL,
        totals      TEXT NOT NULL,
        partial     INTEGER NOT NULL DEFAULT 0,
        error       TEXT
      );
    `
  }
];

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

interface CaseRow {
  id: string;
  source: string;
  source_id: string;
  source_url: string;
  project_url: string | null;
  canonical_key: string | null;
  title: string;
  author: string;
  excerpt: string;
  discovered_urls: string;
  source_created_at: string;
  is_real_case: number | null;
  confidence: number | null;
  low_confidence: number;
  category: string | null;
  tools: string;
  summary_zh: string | null;
  rationale: string | null;
  status: string;
  note: string | null;
  duplicate_of_id: string | null;
  related_sources: string;
  reviewed_at: string | null;
  reject_reason: string | null;
  exported_at: string | null;
  ingest_receipt_id: string | null;
  ingest_status: string | null;
  ingest_error: string | null;
  created_at: string;
  updated_at: string;
}

function toRow(r: CaseRecord): CaseRow {
  return {
    id: r.id,
    source: r.source,
    source_id: r.sourceId,
    source_url: r.sourceUrl,
    project_url: r.projectUrl,
    canonical_key: r.canonicalKey,
    title: r.title,
    author: r.author,
    excerpt: r.excerpt,
    discovered_urls: JSON.stringify(r.discoveredUrls),
    source_created_at: r.sourceCreatedAt,
    is_real_case: r.isRealCase === null ? null : r.isRealCase ? 1 : 0,
    confidence: r.confidence,
    low_confidence: r.lowConfidence ? 1 : 0,
    category: r.category,
    tools: JSON.stringify(r.tools),
    summary_zh: r.summaryZh,
    rationale: r.rationale,
    status: r.status,
    note: r.note,
    duplicate_of_id: r.duplicateOfId,
    related_sources: JSON.stringify(r.relatedSources),
    reviewed_at: r.reviewedAt,
    reject_reason: r.rejectReason,
    exported_at: r.exportedAt,
    ingest_receipt_id: r.ingestReceiptId,
    ingest_status: r.ingestStatus,
    ingest_error: r.ingestError,
    created_at: r.createdAt,
    updated_at: r.updatedAt
  };
}

function fromRow(row: CaseRow): CaseRecord {
  return CaseRecordSchema.parse({
    id: row.id,
    source: row.source,
    sourceId: row.source_id,
    sourceUrl: row.source_url,
    projectUrl: row.project_url,
    canonicalKey: row.canonical_key,
    title: row.title,
    author: row.author,
    excerpt: row.excerpt,
    discoveredUrls: JSON.parse(row.discovered_urls),
    sourceCreatedAt: row.source_created_at,
    isRealCase: row.is_real_case === null ? null : row.is_real_case === 1,
    confidence: row.confidence,
    lowConfidence: row.low_confidence === 1,
    category: row.category,
    tools: JSON.parse(row.tools),
    summaryZh: row.summary_zh,
    rationale: row.rationale,
    status: row.status,
    note: row.note,
    duplicateOfId: row.duplicate_of_id,
    relatedSources: JSON.parse(row.related_sources),
    reviewedAt: row.reviewed_at,
    rejectReason: row.reject_reason,
    exportedAt: row.exported_at,
    ingestReceiptId: row.ingest_receipt_id,
    ingestStatus: row.ingest_status,
    ingestError: row.ingest_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  });
}

interface RunRow {
  id: string;
  started_at: string;
  finished_at: string | null;
  per_source: string;
  totals: string;
  partial: number;
  error: string | null;
}

function runFromRow(row: RunRow): HarvestRun {
  return HarvestRunSchema.parse({
    id: row.id,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    perSource: JSON.parse(row.per_source),
    totals: JSON.parse(row.totals),
    partial: row.partial === 1,
    error: row.error
  });
}

const CASE_COLUMNS = Object.keys(toRow(placeholderCase())) as (keyof CaseRow)[];

function placeholderCase(): CaseRecord {
  const now = new Date(0).toISOString();
  return {
    id: "x",
    source: "hn",
    sourceId: "x",
    sourceUrl: "https://example.invalid/",
    projectUrl: null,
    canonicalKey: null,
    title: "",
    author: "",
    excerpt: "",
    discoveredUrls: [],
    sourceCreatedAt: now,
    isRealCase: null,
    confidence: null,
    lowConfidence: false,
    category: null,
    tools: [],
    summaryZh: null,
    rationale: null,
    status: "harvested",
    note: null,
    duplicateOfId: null,
    relatedSources: [],
    reviewedAt: null,
    rejectReason: null,
    exportedAt: null,
    ingestReceiptId: null,
    ingestStatus: null,
    ingestError: null,
    createdAt: now,
    updatedAt: now
  };
}

// ---------------------------------------------------------------------------
// Open
// ---------------------------------------------------------------------------

export interface OpenOptions {
  /** Defaults to NODE_ENV from loadEnv(). */
  nodeEnv?: "development" | "production" | "test";
}

/**
 * Open SQLite at `dbPath`, creating the parent directory and any missing
 * tables. Existing rows are never dropped. In production an in-memory path is
 * refused, and open failures throw instead of falling back.
 */
export function openDatabase(dbPath: string, options: OpenOptions = {}): Database {
  const nodeEnv = options.nodeEnv ?? loadEnv().nodeEnv;
  const isMemory = dbPath === ":memory:" || dbPath.trim() === "" || dbPath.startsWith("file::memory:");
  if (isMemory && nodeEnv === "production") {
    throw new DatabaseOpenError(
      "Refusing to use an in-memory SQLite database in production. Set DATABASE_PATH to a file."
    );
  }

  let sqlite: BetterSqlite3.Database;
  try {
    if (!isMemory) fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
    sqlite = new BetterSqlite3(dbPath, { fileMustExist: false });
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");
    sqlite.pragma("busy_timeout = 5000");
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new DatabaseOpenError(`Could not open SQLite database at ${dbPath}: ${reason}`);
  }

  try {
    runMigrations(sqlite);
  } catch (err) {
    sqlite.close();
    throw err;
  }
  return createDatabase(sqlite, dbPath);
}

function runMigrations(sqlite: BetterSqlite3.Database): void {
  sqlite.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version    INTEGER PRIMARY KEY,
    name       TEXT NOT NULL,
    applied_at TEXT NOT NULL
  )`);
  const applied = new Set(
    sqlite
      .prepare<[], { version: number }>("SELECT version FROM schema_migrations")
      .all()
      .map((r) => r.version)
  );
  const record = sqlite.prepare(
    "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)"
  );
  const ordered = [...MIGRATIONS].sort((a, b) => a.version - b.version);
  for (const m of ordered) {
    if (applied.has(m.version)) continue;
    sqlite.transaction(() => {
      sqlite.exec(m.sql);
      record.run(m.version, m.name, new Date().toISOString());
    })();
  }
}

function createDatabase(sqlite: BetterSqlite3.Database, dbPath: string): Database {
  const insertOrReplace = sqlite.prepare(
    `INSERT INTO cases (${CASE_COLUMNS.join(", ")})
     VALUES (${CASE_COLUMNS.map((c) => `@${c}`).join(", ")})
     ON CONFLICT(id) DO UPDATE SET ${CASE_COLUMNS.filter((c) => c !== "id")
       .map((c) => `${c} = excluded.${c}`)
       .join(", ")}`
  );
  const selectById = sqlite.prepare<[string], CaseRow>("SELECT * FROM cases WHERE id = ?");
  const selectBySource = sqlite.prepare<[string, string], CaseRow>(
    "SELECT * FROM cases WHERE source = ? AND source_id = ?"
  );
  const selectByKey = sqlite.prepare<[string], CaseRow>(
    "SELECT * FROM cases WHERE canonical_key = ? AND status <> 'duplicate' LIMIT 1"
  );
  const upsertRun = sqlite.prepare(
    `INSERT INTO harvest_runs (id, started_at, finished_at, per_source, totals, partial, error)
     VALUES (@id, @started_at, @finished_at, @per_source, @totals, @partial, @error)
     ON CONFLICT(id) DO UPDATE SET
       finished_at = excluded.finished_at, per_source = excluded.per_source,
       totals = excluded.totals, partial = excluded.partial, error = excluded.error`
  );
  const selectRun = sqlite.prepare<[string], RunRow>("SELECT * FROM harvest_runs WHERE id = ?");
  const selectRuns = sqlite.prepare<[number], RunRow>(
    "SELECT * FROM harvest_runs ORDER BY started_at DESC LIMIT ?"
  );

  const mustGet = (id: string): CaseRecord => {
    const row = selectById.get(id);
    if (!row) throw new CaseNotFoundError(id);
    return fromRow(row);
  };

  const write = (record: CaseRecord): CaseRecord => {
    const valid = CaseRecordSchema.parse(record);
    insertOrReplace.run(toRow(valid));
    return valid;
  };

  const db: Database = {
    path: dbPath,

    migrate() {
      runMigrations(sqlite);
    },

    upsertCase(record) {
      write(record);
    },

    getCase(id) {
      const row = selectById.get(id);
      return row ? fromRow(row) : undefined;
    },

    findBySourceId(source, sourceId) {
      const row = selectBySource.get(source, sourceId);
      return row ? fromRow(row) : undefined;
    },

    findByCanonicalKey(key) {
      const row = selectByKey.get(key);
      return row ? fromRow(row) : undefined;
    },

    listCases(filter = {}) {
      const where: string[] = [];
      const params: Record<string, unknown> = {};
      if (filter.status) {
        const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
        if (statuses.length === 0) return [];
        where.push(`status IN (${statuses.map((_, i) => `@status${i}`).join(", ")})`);
        statuses.forEach((s, i) => (params[`status${i}`] = s));
      }
      if (filter.source) {
        where.push("source = @source");
        params.source = filter.source;
      }
      if (filter.category) {
        where.push("category = @category");
        params.category = filter.category;
      }
      if (filter.minConfidence !== undefined) {
        where.push("confidence >= @minConfidence");
        params.minConfidence = filter.minConfidence;
      }
      if (filter.maxConfidence !== undefined) {
        where.push("confidence <= @maxConfidence");
        params.maxConfidence = filter.maxConfidence;
      }
      if (filter.ids) {
        if (filter.ids.length === 0) return [];
        where.push(`id IN (${filter.ids.map((_, i) => `@id${i}`).join(", ")})`);
        filter.ids.forEach((id, i) => (params[`id${i}`] = id));
      }
      const limit = Math.max(1, Math.min(filter.limit ?? 500, 5000));
      const sql = `SELECT * FROM cases ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
                   ORDER BY created_at DESC, id ASC LIMIT ${limit}`;
      return sqlite
        .prepare<Record<string, unknown>, CaseRow>(sql)
        .all(params)
        .map(fromRow);
    },

    transition(id, to, patch = {}) {
      return sqlite.transaction(() => {
        const current = mustGet(id);
        assertTransition(current.status, to);
        return write({
          ...current,
          ...patch,
          id: current.id,
          status: to,
          updatedAt: new Date().toISOString()
        });
      })();
    },

    patchCase(id, patch) {
      return sqlite.transaction(() => {
        const current = mustGet(id);
        return write({
          ...current,
          ...patch,
          id: current.id,
          status: current.status,
          updatedAt: new Date().toISOString()
        });
      })();
    },

    appendRelatedSource(id, url) {
      sqlite.transaction(() => {
        const current = mustGet(id);
        if (current.relatedSources.includes(url) || current.sourceUrl === url) return;
        write({
          ...current,
          relatedSources: [...current.relatedSources, url],
          updatedAt: new Date().toISOString()
        });
      })();
    },

    saveRun(run) {
      const valid = HarvestRunSchema.parse(run);
      upsertRun.run({
        id: valid.id,
        started_at: valid.startedAt,
        finished_at: valid.finishedAt,
        per_source: JSON.stringify(valid.perSource),
        totals: JSON.stringify(valid.totals),
        partial: valid.partial ? 1 : 0,
        error: valid.error
      });
    },

    getRun(id) {
      const row = selectRun.get(id);
      return row ? runFromRow(row) : undefined;
    },

    listRuns(limit = 20) {
      return selectRuns.all(limit).map(runFromRow);
    },

    transaction(fn) {
      return sqlite.transaction(fn)();
    },

    close() {
      sqlite.close();
    }
  };
  return db;
}

// ---------------------------------------------------------------------------
// Process-wide handle for route handlers and the CLI
// ---------------------------------------------------------------------------

const globalForDb = globalThis as unknown as { __harvesterDb?: Database };

/** Shared database at DATABASE_PATH. Cached across Next.js dev reloads. */
export function getDatabase(): Database {
  if (!globalForDb.__harvesterDb) {
    const env = loadEnv();
    globalForDb.__harvesterDb = openDatabase(env.databasePath, { nodeEnv: env.nodeEnv });
  }
  return globalForDb.__harvesterDb;
}

/** Build a new case with defaults for every optional field. */
export function newCaseRecord(
  fields: Pick<
    CaseRecord,
    "id" | "source" | "sourceId" | "sourceUrl" | "title" | "author" | "excerpt" | "sourceCreatedAt"
  > &
    Partial<CaseRecord>
): CaseRecord {
  const now = new Date().toISOString();
  return { ...placeholderCase(), createdAt: now, updatedAt: now, ...fields };
}
