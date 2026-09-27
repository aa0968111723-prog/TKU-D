import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export type Sql = DatabaseSync;

let singleton: Sql | null = null;

export function dataDir(): string {
  const dir = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), "data"));
  mkdirSync(dir, { recursive: true });
  mkdirSync(path.join(dir, "files"), { recursive: true });
  return dir;
}

export function openDatabase(file = path.join(dataDir(), "edupsy.sqlite")): Sql {
  if (file !== ":memory:") mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA busy_timeout = 5000");
  migrate(db);
  return db;
}

export function db(): Sql {
  if (!singleton) singleton = openDatabase();
  return singleton;
}

export function resetDatabaseForTests(file: string): Sql {
  singleton = null;
  return openDatabase(file);
}

function migrate(database: Sql): void {
  database.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`);
  const file = path.join(process.cwd(), "db", "migrations", "001_init.sql");
  if (!existsSync(file)) throw new Error(`Missing migration: ${file}`);
  const applied = database.prepare("SELECT id FROM schema_migrations WHERE id = ?").get("001_init");
  if (!applied) {
    database.exec(readFileSync(file, "utf8"));
    database.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)").run("001_init", new Date().toISOString());
  }
}

export function rows<T>(database: Sql, sql: string, ...params: unknown[]): T[] {
  return database.prepare(sql).all(...(params as Array<string | number | bigint | null>)) as T[];
}

export function one<T>(database: Sql, sql: string, ...params: unknown[]): T | null {
  return (database.prepare(sql).get(...(params as Array<string | number | bigint | null>)) as T | undefined) ?? null;
}

export function run(database: Sql, sql: string, ...params: unknown[]): void {
  database.prepare(sql).run(...(params as Array<string | number | bigint | null>));
}

export function transaction<T>(database: Sql, fn: () => T): T {
  database.exec("BEGIN");
  try {
    const value = fn();
    database.exec("COMMIT");
    return value;
  } catch (error) {
    try {
      database.exec("ROLLBACK");
    } catch {
      /* already closed */
    }
    throw error;
  }
}
