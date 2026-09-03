import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env.");
}

// Next.js hot-reloads modules in dev; reuse the pool so we don't leak sockets.
const globalForDb = globalThis as unknown as {
  __wavyPg?: ReturnType<typeof postgres>;
};

const client =
  globalForDb.__wavyPg ?? postgres(connectionString, { max: 10 });
if (process.env.NODE_ENV !== "production") globalForDb.__wavyPg = client;

export const db = drizzle(client, { schema });
export type Db = typeof db;

/** A transaction handle. Services take this so they can be composed. */
export type DbOrTx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

export { schema };
