import { Database } from "bun:sqlite";

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
  const schemaPath = new URL("../../db/schema.sql", import.meta.url);
  const sql = Bun.file(schemaPath).text();
  void sql.then((s) => database.exec(s));
}
