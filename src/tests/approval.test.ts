import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { campaigns, submissions } from "@/server/db/schema";
import { approveSubmission, rejectSubmission } from "@/server/services/approval";
import { campaignBudget } from "@/server/services/budget";
import { isAppError } from "@/server/errors";
import {
  addMetric,
  makeCampaign,
  makeSubmission,
  makeUser,
  resetDb,
  testDb,
} from "./helpers";

beforeEach(resetDb);

describe("budget ceiling", () => {
  it("approves while the earnings fit inside the remaining budget", async () => {
    const creator = await makeUser("creator");
    const campaign = await makeCampaign({
      payoutPer1kViews: 100,
      totalBudget: 1_000,
    });
    const submission = await makeSubmission(campaign.id, creator.id);
    await addMetric(submission.id, 5_000); // 5 * 100 = 500 cents

    const result = await approveSubmission(testDb, submission.id);

    expect(result.earnings).toBe(500);
    expect(result.budgetLeft).toBe(500);
    expect(result.campaignCompleted).toBe(false);
  });

  it("refuses an approval that would push the campaign over budget", async () => {
    const creator = await makeUser("creator");
    const campaign = await makeCampaign({
      payoutPer1kViews: 100,
      totalBudget: 1_000,
    });

    const first = await makeSubmission(campaign.id, creator.id);
    await addMetric(first.id, 9_000); // 900 cents
    await approveSubmission(testDb, first.id);

    const second = await makeSubmission(campaign.id, creator.id);
    await addMetric(second.id, 5_000); // 500 cents, only 100 left

    await expect(approveSubmission(testDb, second.id)).rejects.toSatisfy(
      (error: unknown) => isAppError(error) && error.appCode === "BUDGET_EXCEEDED",
    );

    const [row] = await testDb
      .select({ status: submissions.status })
      .from(submissions)
      .where(eq(submissions.id, second.id));
    expect(row.status).toBe("pending");
  });

  it("reports the shortfall on the typed error so the UI can act on it", async () => {
    const creator = await makeUser("creator");
    const campaign = await makeCampaign({
      payoutPer1kViews: 100,
      totalBudget: 1_000,
    });

    const first = await makeSubmission(campaign.id, creator.id);
    await addMetric(first.id, 9_000);
    await approveSubmission(testDb, first.id);

    const second = await makeSubmission(campaign.id, creator.id);
    await addMetric(second.id, 5_000);

    const error = await approveSubmission(testDb, second.id).catch((e) => e);
    expect(isAppError(error)).toBe(true);
    expect(error.meta).toEqual({ required: 500, remaining: 100 });
  });

  it("completes the campaign once nothing is left", async () => {
    const creator = await makeUser("creator");
    const campaign = await makeCampaign({
      payoutPer1kViews: 100,
      totalBudget: 1_000,
    });

    const submission = await makeSubmission(campaign.id, creator.id);
    await addMetric(submission.id, 10_000); // exactly 1,000 cents

    const result = await approveSubmission(testDb, submission.id);
    expect(result.budgetLeft).toBe(0);
    expect(result.campaignCompleted).toBe(true);

    const [row] = await testDb
      .select({ status: campaigns.status })
      .from(campaigns)
      .where(eq(campaigns.id, campaign.id));
    expect(row.status).toBe("completed");
  });

  it("clamps reported spend at the budget when views keep growing", async () => {
    const creator = await makeUser("creator");
    const campaign = await makeCampaign({
      payoutPer1kViews: 100,
      totalBudget: 1_000,
    });

    const submission = await makeSubmission(campaign.id, creator.id);
    await addMetric(submission.id, 5_000, -1);
    await approveSubmission(testDb, submission.id);

    // Ingest keeps running after approval and views keep climbing.
    await addMetric(submission.id, 90_000, 0);

    const budget = await campaignBudget(testDb, campaign);
    expect(budget.spent).toBe(1_000);
    expect(budget.left).toBe(0);
  });
});

describe("concurrent approvals", () => {
  it("lets exactly one of two simultaneous approvals through", async () => {
    const creator = await makeUser("creator");
    const campaign = await makeCampaign({
      payoutPer1kViews: 100,
      totalBudget: 1_000,
    });

    // Each is worth 800 cents. Together 1,600 — the budget covers one.
    const a = await makeSubmission(campaign.id, creator.id);
    const b = await makeSubmission(campaign.id, creator.id);
    await addMetric(a.id, 8_000);
    await addMetric(b.id, 8_000);

    const results = await Promise.allSettled([
      approveSubmission(testDb, a.id),
      approveSubmission(testDb, b.id),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(
      isAppError((rejected[0] as PromiseRejectedResult).reason) &&
        ((rejected[0] as PromiseRejectedResult).reason as { appCode: string })
          .appCode,
    ).toBe("BUDGET_EXCEEDED");

    const rows = await testDb
      .select({ status: submissions.status })
      .from(submissions)
      .where(eq(submissions.campaignId, campaign.id));

    expect(rows.filter((r) => r.status === "approved")).toHaveLength(1);
    expect(rows.filter((r) => r.status === "pending")).toHaveLength(1);
  });

  it("never spends more than the budget under a burst of approvals", async () => {
    const creator = await makeUser("creator");
    const campaign = await makeCampaign({
      payoutPer1kViews: 100,
      totalBudget: 1_000, // room for two 500-cent submissions
    });

    const created = [];
    for (let i = 0; i < 6; i++) {
      const submission = await makeSubmission(campaign.id, creator.id);
      await addMetric(submission.id, 5_000); // 500 cents each
      created.push(submission);
    }

    const results = await Promise.allSettled(
      created.map((s) => approveSubmission(testDb, s.id)),
    );

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);

    const budget = await campaignBudget(testDb, campaign);
    expect(budget.spent).toBe(1_000);
    expect(budget.left).toBe(0);
  });

  it("does not let the same submission be approved twice", async () => {
    const creator = await makeUser("creator");
    const campaign = await makeCampaign({ totalBudget: 1_000_000 });
    const submission = await makeSubmission(campaign.id, creator.id);
    await addMetric(submission.id, 1_000);

    const results = await Promise.allSettled([
      approveSubmission(testDb, submission.id),
      approveSubmission(testDb, submission.id),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected");
    expect(
      ((rejected as PromiseRejectedResult).reason as { appCode: string })
        .appCode,
    ).toBe("SUBMISSION_NOT_PENDING");
  });
});

describe("rejection", () => {
  it("stores the reason and refuses a second review", async () => {
    const creator = await makeUser("creator");
    const campaign = await makeCampaign();
    const submission = await makeSubmission(campaign.id, creator.id);

    await rejectSubmission(testDb, submission.id, "Off-brief clip.");

    const [row] = await testDb
      .select()
      .from(submissions)
      .where(eq(submissions.id, submission.id));
    expect(row.status).toBe("rejected");
    expect(row.rejectionReason).toBe("Off-brief clip.");

    await expect(
      approveSubmission(testDb, submission.id),
    ).rejects.toSatisfy(
      (error: unknown) =>
        isAppError(error) && error.appCode === "SUBMISSION_NOT_PENDING",
    );
  });
});
