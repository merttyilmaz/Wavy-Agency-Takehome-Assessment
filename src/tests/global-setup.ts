import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/**
 * Runs once before the suite: points the process at the test database and
 * brings it up to the committed migrations. Tests run against real Postgres —
 * row locks, unique indexes and `FOR UPDATE` are the things under test, and a
 * mock would not have them.
 */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL is not set. Copy .env.example to .env and run `docker compose up -d`.",
    );
  }

  const client = postgres(url, { max: 1, onnotice: () => {} });
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  await client.end();
}
