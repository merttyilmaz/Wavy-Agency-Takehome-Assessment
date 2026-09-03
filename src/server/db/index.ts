import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env.");
}

/**
 * A pooler in transaction mode (Neon's `-pooler` host, PgBouncer, Supabase's
 * port 6543) cannot serve prepared statements, so they are turned off when the
 * URL points at one. Locally, against plain Postgres, they stay on.
 */
const isPooled =
  /-pooler\./.test(connectionString) ||
  /[?&]pgbouncer=true/.test(connectionString) ||
  /:6543\//.test(connectionString);

// Next.js hot-reloads modules in dev; reuse the pool so we don't leak sockets.
const globalForDb = globalThis as unknown as {
  __wavyPg?: ReturnType<typeof postgres>;
};

const client =
  globalForDb.__wavyPg ??
  postgres(connectionString, {
    // Serverless functions are short-lived and numerous: one socket each.
    max: process.env.VERCEL ? 1 : 10,
    prepare: !isPooled,
  });

if (process.env.NODE_ENV !== "production") globalForDb.__wavyPg = client;

export const db = drizzle(client, { schema });
export type Db = typeof db;

/** A transaction handle. Services take this so they can be composed. */
export type DbOrTx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

export { schema };
