import { rmSync } from "node:fs";

/** Deletes the throwaway SQLite databases the backend web servers used. */
export default function globalTeardown(): void {
  for (const dbPath of [process.env.E2E_GRAPH_DB_PATH, process.env.E2E_DEMO_GRAPH_DB_PATH]) {
    if (dbPath) rmSync(dbPath, { force: true });
  }
}
