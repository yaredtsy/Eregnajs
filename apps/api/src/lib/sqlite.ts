import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";

let db: Database | null = null;

export function getRunsDb(): Database {
  if (db) return db;
  const path = process.env.EREGNA_RUNS_DB_PATH ?? "./eregna-runs.sqlite";
  db = new Database(path, { create: true });
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA synchronous = NORMAL");
  db.exec("PRAGMA foreign_keys = ON");
  initialise(db);
  return db;
}

function initialise(database: Database): void {
  // Synchronous on purpose: callers query immediately after getRunsDb(),
  // so the schema must be applied before this function returns.
  const schemaPath = new URL("../../db/schema.sql", import.meta.url);
  database.exec(readFileSync(schemaPath, "utf8"));
  migrate(database);
}

// schema.sql only CREATEs IF NOT EXISTS — existing db files need ALTERs.
function migrate(database: Database): void {
  const cols = database
    .prepare("PRAGMA table_info(agent_runs)")
    .all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === "owner_id")) {
    database.exec("ALTER TABLE agent_runs ADD COLUMN owner_id TEXT");
    database.exec(
      "CREATE INDEX IF NOT EXISTS agent_runs_owner_id_started_at ON agent_runs(owner_id, started_at DESC)",
    );
  }
}
