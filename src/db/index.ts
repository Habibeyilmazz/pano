import { AsyncLocalStorage } from "node:async_hooks";
import path from "node:path";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "./schema";

export type Db = PgliteDatabase<typeof schema>;
export type Tx = Db;
export { schema };

const migrationsFolder = path.join(process.cwd(), "drizzle");

async function open(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    const { default: postgres } = await import("postgres");
    const db = drizzle(postgres(url, { max: 10 }), { schema, casing: "snake_case" });
    await migrate(db, { migrationsFolder });
    // Same query-builder API; only the driver differs.
    return db as unknown as Db;
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const dir = process.env.PANO_DB ?? path.join(process.cwd(), ".data", "pglite");
  const db = drizzle(new PGlite(dir), { schema, casing: "snake_case" });
  await migrate(db, { migrationsFolder });
  return db;
}

// One instance per process: Next dev re-evaluates modules, PGlite must not be opened twice.
const g = globalThis as unknown as { __panoDb?: Promise<Db> };

const current = new AsyncLocalStorage<Db>();

/** Inside transaction(), every getDb() returns the transaction: PGlite has one connection, so a
 * query outside the open transaction would wait for it forever. */
export async function getDb(): Promise<Db> {
  const tx = current.getStore();
  if (tx) return tx;
  g.__panoDb ??= open();
  return g.__panoDb;
}

export async function transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
  const db = await getDb();
  if (current.getStore()) return fn(db);
  return db.transaction((tx) => current.run(tx as unknown as Db, () => fn(tx as unknown as Db)));
}
