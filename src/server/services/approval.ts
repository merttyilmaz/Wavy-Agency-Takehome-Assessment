import { eq, sql } from "drizzle-orm";
import type { Db } from "@/server/db";
import { campaigns, submissions } from "@/server/db/schema";
import { AppError } from "@/server/errors";
import { earningsForViews } from "@/lib/payout";
import {
  campaignBudget,
  completeCampaignIfExhausted,
  latestViewsForSubmission,
  payableViewThousands,
} from "./budget";

export type ApprovalResult = {
  submissionId: string;
  earnings: number;
  budgetLeft: number;
  campaignCompleted: boolean;
};

/**
 * Approve a pending submission without letting a campaign pay out more than
 * `total_budget`.
 *
 * Concurrency: the whole check-then-write runs in one transaction that starts
 * by taking a row lock on the campaign with `SELECT ... FOR UPDATE`. Two admins
 * approving at the same moment are serialised on that lock — the second one
 * only reads the budget after the first has committed, so it sees the money the
 * first one just spent and fails with BUDGET_EXCEEDED. First come, first
 * served, decided by Postgres rather than by wall-clock ordering in Node.
 *
 * See NOTES.md for the alternatives that were considered.
 */
export async function approveSubmission(
  db: Db,
  submissionId: string,
): Promise<ApprovalResult> {
  return db.transaction(async (tx) => {
    // 1. Read the submission first so we know which campaign to lock.
    const [submission] = await tx
      .select()
      .from(submissions)
      .where(eq(submissions.id, submissionId));

    if (!submission) {
      throw new AppError("SUBMISSION_NOT_PENDING", "Submission not found.");
    }

    // 2. Serialise every approval for this campaign on the campaign row.
    const locked = await tx.execute<{
      id: string;
      total_budget: number;
      payout_per_1k_views: number;
      status: string;
    }>(sql`
      SELECT id, total_budget, payout_per_1k_views, status
      FROM ${campaigns}
      WHERE id = ${submission.campaignId}
      FOR UPDATE
    `);

    const campaign = locked[0];
    if (!campaign) {
      throw new AppError("CAMPAIGN_NOT_ACTIVE", "Campaign not found.");
    }

    // 3. Re-read the submission's status now that we hold the lock. A racing
    //    approval may have already taken it.
    const [current] = await tx
      .select({ status: submissions.status })
      .from(submissions)
      .where(eq(submissions.id, submissionId));

    if (current?.status !== "pending") {
      throw new AppError(
        "SUBMISSION_NOT_PENDING",
        `Submission is already ${current?.status ?? "gone"}.`,
      );
    }

    const campaignShape = {
      id: campaign.id,
      totalBudget: Number(campaign.total_budget),
      payoutPer1kViews: Number(campaign.payout_per_1k_views),
    };

    if (campaign.status === "completed") {
      throw new AppError(
        "CAMPAIGN_NOT_ACTIVE",
        "This campaign is completed and cannot take more approvals.",
      );
    }

    // 4. What this submission would cost, and what is already committed.
    const views = await latestViewsForSubmission(tx, submissionId);
    const earnings = earningsForViews(views, campaignShape.payoutPer1kViews);

    const committedThousands = await payableViewThousands(tx, campaignShape.id);
    const committed = committedThousands * campaignShape.payoutPer1kViews;

    if (committed + earnings > campaignShape.totalBudget) {
      throw new AppError(
        "BUDGET_EXCEEDED",
        "Approving this submission would exceed the campaign budget.",
        {
          required: earnings,
          remaining: Math.max(0, campaignShape.totalBudget - committed),
        },
      );
    }

    // 5. Commit the approval.
    await tx
      .update(submissions)
      .set({
        status: "approved",
        rejectionReason: null,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(submissions.id, submissionId));

    const campaignCompleted = await completeCampaignIfExhausted(
      tx,
      campaignShape,
    );
    const budget = await campaignBudget(tx, campaignShape);

    return {
      submissionId,
      earnings,
      budgetLeft: budget.left,
      campaignCompleted,
    };
  });
}

/** Reject a pending submission. A reason is required by the input schema. */
export async function rejectSubmission(
  db: Db,
  submissionId: string,
  reason: string,
): Promise<{ submissionId: string }> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({ status: submissions.status })
      .from(submissions)
      .where(eq(submissions.id, submissionId))
      .for("update");

    if (!current) {
      throw new AppError("SUBMISSION_NOT_PENDING", "Submission not found.");
    }
    if (current.status !== "pending") {
      throw new AppError(
        "SUBMISSION_NOT_PENDING",
        `Submission is already ${current.status}.`,
      );
    }

    await tx
      .update(submissions)
      .set({
        status: "rejected",
        rejectionReason: reason,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(submissions.id, submissionId));

    return { submissionId };
  });
}
