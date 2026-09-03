import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/server/db/schema";
import {
  campaigns,
  submissionMetrics,
  submissions,
  users,
} from "@/server/db/schema";

const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("TEST_DATABASE_URL is not set.");

/** Pool large enough for the concurrency tests to hold two transactions. */
export const testClient = postgres(url, { max: 8 });
export const testDb = drizzle(testClient, { schema });
export type TestDb = typeof testDb;

export async function resetDb() {
  await testDb.delete(submissionMetrics);
  await testDb.delete(submissions);
  await testDb.delete(campaigns);
  await testDb.delete(users);
}

const DAY_MS = 24 * 60 * 60 * 1000;
export const dayKey = (offset = 0) =>
  new Date(Date.now() + offset * DAY_MS).toISOString().slice(0, 10);
export const at = (offset = 0) => new Date(Date.now() + offset * DAY_MS);

let counter = 0;
const unique = () => `${Date.now()}-${counter++}`;

export async function makeUser(role: "admin" | "creator") {
  const [user] = await testDb
    .insert(users)
    .values({ email: `${role}-${unique()}@test.local`, role })
    .returning();
  return user;
}

export async function makeCampaign(
  overrides: Partial<typeof campaigns.$inferInsert> = {},
) {
  const [campaign] = await testDb
    .insert(campaigns)
    .values({
      title: `Campaign ${unique()}`,
      platforms: ["tiktok"],
      payoutPer1kViews: 100,
      totalBudget: 100_000,
      status: "active",
      startsAt: at(-10),
      endsAt: at(10),
      ...overrides,
    })
    .returning();
  return campaign;
}

export async function makeSubmission(
  campaignId: string,
  creatorId: string,
  overrides: Partial<typeof submissions.$inferInsert> = {},
) {
  const [submission] = await testDb
    .insert(submissions)
    .values({
      campaignId,
      creatorId,
      postUrl: `https://www.tiktok.com/@t/video/${Date.now()}${counter++}`,
      platform: "tiktok",
      status: "pending",
      ...overrides,
    })
    .returning();
  return submission;
}

export async function addMetric(
  submissionId: string,
  views: number,
  offset = 0,
) {
  const [row] = await testDb
    .insert(submissionMetrics)
    .values({
      submissionId,
      capturedAt: dayKey(offset),
      views,
      likes: Math.floor(views * 0.05),
      comments: Math.floor(views * 0.01),
    })
    .returning();
  return row;
}
