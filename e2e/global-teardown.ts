import { rmSync } from "node:fs";

/** Deletes the throwaway SQLite database the backend web server used. */
export default function globalTeardown(): void {
  const dbPath = process.env.E2E_GRAPH_DB_PATH;
  if (dbPath) rmSync(dbPath, { force: true });
}
