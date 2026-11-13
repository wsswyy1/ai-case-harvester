import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDatabase, type Database } from "@/lib/db";

/** Fresh SQLite file in the OS temp dir. Call cleanup() in afterEach. */
export function tempDb(): { db: Database; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "harvester-test-"));
  const db = openDatabase(path.join(dir, "test.db"), { nodeEnv: "test" });
  return {
    db,
    cleanup: () => {
      db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };
}
