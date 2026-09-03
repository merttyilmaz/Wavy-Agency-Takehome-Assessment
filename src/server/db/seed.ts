import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { campaigns, submissionMetrics, submissions, users } from "./schema";

const DAY_MS = 24 * 60 * 60 * 1000;

function day(offset: number): string {
  return new Date(Date.now() + offset * DAY_MS).toISOString().slice(0, 10);
}

function at(offset: number): Date {
  return new Date(Date.now() + offset * DAY_MS);
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");

  const client = postgres(url, { max: 1 });
  const db = drizzle(client, { schema });

  // Idempotent: wipe and rebuild. Cascades take the children.
  await db.delete(submissionMetrics);
  await db.delete(submissions);
  await db.delete(campaigns);
  await db.delete(users);

  const [admin, secondAdmin, alice, bob] = await db
    .insert(users)
    .values([
      { email: "admin@wavy.test", role: "admin" },
      { email: "admin2@wavy.test", role: "admin" },
      { email: "alice@creator.test", role: "creator" },
      { email: "bob@creator.test", role: "creator" },
    ])
    .returning();

  const [summerDrop, appLaunch, winterTeaser, archived] = await db
    .insert(campaigns)
    .values([
      {
        title: "Summer Drop — Short Form",
        platforms: ["tiktok", "instagram"],
        payoutPer1kViews: 250, // $2.50 / 1k views
        totalBudget: 500_000, // $5,000
        status: "active",
        startsAt: at(-20),
        endsAt: at(20),
      },
      {
        title: "App Launch Clips",
        platforms: ["youtube", "tiktok"],
        payoutPer1kViews: 400,
        totalBudget: 120_000,
        status: "active",
        startsAt: at(-8),
        endsAt: at(30),
      },
      {
        title: "Winter Teaser (draft)",
        platforms: ["instagram"],
        payoutPer1kViews: 180,
        totalBudget: 250_000,
        status: "draft",
        startsAt: at(10),
        endsAt: at(45),
      },
      {
        title: "Spring Campaign (paused)",
        platforms: ["tiktok", "instagram", "youtube"],
        payoutPer1kViews: 300,
        totalBudget: 80_000,
        status: "paused",
        startsAt: at(-60),
        endsAt: at(-10),
      },
    ])
    .returning();

  const inserted = await db
    .insert(submissions)
    .values([
      {
        campaignId: summerDrop.id,
        creatorId: alice.id,
        postUrl: "https://www.tiktok.com/@alice/video/7300000000000000001",
        platform: "tiktok",
        status: "approved",
        reviewedAt: at(-14),
      },
      {
        campaignId: summerDrop.id,
        creatorId: bob.id,
        postUrl: "https://www.instagram.com/reel/Cbob0000001",
        platform: "instagram",
        status: "approved",
        reviewedAt: at(-12),
      },
      {
        campaignId: summerDrop.id,
        creatorId: bob.id,
        postUrl: "https://www.tiktok.com/@bob/video/7300000000000000002",
        platform: "tiktok",
        status: "pending",
      },
      {
        campaignId: summerDrop.id,
        creatorId: alice.id,
        postUrl: "https://www.tiktok.com/@alice/video/7300000000000000003",
        platform: "tiktok",
        status: "rejected",
        rejectionReason: "Clip does not show the product.",
        reviewedAt: at(-9),
      },
      {
        campaignId: appLaunch.id,
        creatorId: alice.id,
        postUrl: "https://www.youtube.com/shorts/alicelaunch1",
        platform: "youtube",
        status: "pending",
      },
      {
        campaignId: appLaunch.id,
        creatorId: bob.id,
        postUrl: "https://www.youtube.com/shorts/boblaunch01",
        platform: "youtube",
        status: "approved",
        reviewedAt: at(-3),
      },
    ])
    .returning();

  // A few days of history for the approved ones, with a deliberate gap so the
  // overview chart has days without metrics to fill in.
  const approved = inserted.filter((s) => s.status === "approved");
  const metricRows: (typeof submissionMetrics.$inferInsert)[] = [];

  for (const [index, submission] of approved.entries()) {
    let views = 0;
    for (const offset of [-10, -9, -8, -6, -5, -2, -1]) {
      views += 4_000 + index * 1_500 + Math.abs(offset) * 400;
      metricRows.push({
        submissionId: submission.id,
        capturedAt: day(offset),
        views,
        likes: Math.floor(views * 0.06),
        comments: Math.floor(views * 0.008),
      });
    }
  }

  await db.insert(submissionMetrics).values(metricRows);

  console.log("Seeded:");
  console.log(`  users      ${[admin, secondAdmin, alice, bob].length}`);
  console.log(
    `  campaigns  ${[summerDrop, appLaunch, winterTeaser, archived].length}`,
  );
  console.log(`  submissions ${inserted.length}`);
  console.log(`  metrics     ${metricRows.length}`);
  console.log("");
  console.log(`  admin login id:   ${admin.id} (${admin.email})`);
  console.log(`  creator login id: ${alice.id} (${alice.email})`);

  await client.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
