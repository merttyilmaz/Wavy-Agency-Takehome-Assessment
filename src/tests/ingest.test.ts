import { beforeEach, describe, expect, it } from "vitest";
import { asc, eq } from "drizzle-orm";
import { campaigns, submissionMetrics } from "@/server/db/schema";
import { runIngest } from "@/server/services/ingest";
import {
  makeCampaign,
  makeSubmission,
  makeUser,
  resetDb,
  testDb,
} from "./helpers";

beforeEach(resetDb);

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY_MS);

describe("runIngest", () => {
  it("writes one row per approved submission per day", async () => {
    const creator = await makeUser("creator");
    const campaign = await makeCampaign({ totalBudget: 10_000_000 });

    const approved = await makeSubmission(campaign.id, creator.id, {
      status: "approved",
    });
    await makeSubmission(campaign.id, creator.id, { status: "pending" });
    await makeSubmission(campaign.id, creator.id, { status: "rejected" });

    const report = await runIngest(testDb);

    expect(report.processed).toBe(1);
    expect(report.inserted).toBe(1);

    const rows = await testDb
      .select()
      .from(submissionMetrics)
      .where(eq(submissionMetrics.submissionId, approved.id));
    expect(rows).toHaveLength(1);
  });

  it("leaves the data as it was when run twice for the same day", async () => {
    const creator = await makeUser("creator");
    const campaign = await makeCampaign({ totalBudget: 10_000_000 });
    await makeSubmission(campaign.id, creator.id, { status: "approved" });

    await runIngest(testDb);
    const before = await testDb.select().from(submissionMetrics);

    const second = await runIngest(testDb);
    const after = await testDb.select().from(submissionMetrics);

    expect(second.inserted).toBe(0);
    expect(second.skipped).toBe(1);
    expect(after).toEqual(before);
  });

  it("only ever moves views up across consecutive days", async () => {
    const creator = await makeUser("creator");
    const campaign = await makeCampaign({ totalBudget: 100_000_000 });
    const submission = await makeSubmission(campaign.id, creator.id, {
      status: "approved",
    });

    for (const offset of [4, 3, 2, 1, 0]) {
      await runIngest(testDb, { day: daysAgo(offset) });
    }

    const rows = await testDb
      .select({ views: submissionMetrics.views })
      .from(submissionMetrics)
      .where(eq(submissionMetrics.submissionId, submission.id))
      .orderBy(asc(submissionMetrics.capturedAt));

    expect(rows).toHaveLength(5);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].views).toBeGreaterThan(rows[i - 1].views);
    }
  });

  it("finishes the run and reports the failure when one submission blows up", async () => {
    const creator = await makeUser("creator");
    const campaign = await makeCampaign({ totalBudget: 10_000_000 });

    const first = await makeSubmission(campaign.id, creator.id, {
      status: "approved",
    });
    const second = await makeSubmission(campaign.id, creator.id, {
      status: "approved",
    });
    const third = await makeSubmission(campaign.id, creator.id, {
      status: "approved",
    });

    const report = await runIngest(testDb, {
      onSubmission: (id) => {
        if (id === second.id) throw new Error("upstream API timed out");
      },
    });

    expect(report.processed).toBe(3);
    expect(report.inserted).toBe(2);
    expect(report.failed).toEqual([
      { submissionId: second.id, error: "upstream API timed out" },
    ]);

    const written = await testDb.select().from(submissionMetrics);
    expect(written.map((r) => r.submissionId).sort()).toEqual(
      [first.id, third.id].sort(),
    );
  });

  it("completes a campaign whose growing views exhaust the budget", async () => {
    const creator = await makeUser("creator");
    const campaign = await makeCampaign({
      payoutPer1kViews: 100_000,
      totalBudget: 100_000,
      status: "active",
    });
    await makeSubmission(campaign.id, creator.id, { status: "approved" });

    await runIngest(testDb);

    const [row] = await testDb
      .select({ status: campaigns.status })
      .from(campaigns)
      .where(eq(campaigns.id, campaign.id));
    expect(row.status).toBe("completed");
  });
});
