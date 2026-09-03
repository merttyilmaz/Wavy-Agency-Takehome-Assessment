import { and, eq, inArray, sql } from "drizzle-orm";
import type { DbOrTx } from "@/server/db";
import { campaigns, submissionMetrics, submissions } from "@/server/db/schema";
import { budgetLeft, earningsForViews } from "@/lib/payout";

/** Statuses that consume budget. */
export const PAYABLE_STATUSES = ["approved", "paid"] as const;

/**
 * Sum of `floor(views / 1000)` over every payable submission of a campaign,
 * taking the most recent metric row per submission.
 *
 * Returned as "view thousands" rather than cents so that the single
 * multiplication by payout_per_1k_views stays in `lib/payout.ts` and the SQL
 * does no money math.
 */
export async function payableViewThousands(
  tx: DbOrTx,
  campaignId: string,
  options: { excludeSubmissionId?: string } = {},
): Promise<number> {
  const excluded = options.excludeSubmissionId ?? null;

  const rows = await tx.execute<{ view_thousands: string }>(sql`
    SELECT COALESCE(SUM(FLOOR(latest.views / 1000)), 0)::bigint AS view_thousands
    FROM (
      SELECT DISTINCT ON (m.submission_id) m.submission_id, m.views
      FROM ${submissionMetrics} m
      JOIN ${submissions} s ON s.id = m.submission_id
      WHERE s.campaign_id = ${campaignId}
        AND s.status IN ('approved', 'paid')
        AND (${excluded}::uuid IS NULL OR s.id <> ${excluded}::uuid)
      ORDER BY m.submission_id, m.captured_at DESC
    ) AS latest
  `);

  const value = rows[0]?.view_thousands ?? "0";
  return Number(value);
}

/** Latest view count for one submission, or 0 when it has no metric row yet. */
export async function latestViewsForSubmission(
  tx: DbOrTx,
  submissionId: string,
): Promise<number> {
  const [row] = await tx
    .select({ views: submissionMetrics.views })
    .from(submissionMetrics)
    .where(eq(submissionMetrics.submissionId, submissionId))
    .orderBy(sql`${submissionMetrics.capturedAt} DESC`)
    .limit(1);

  return row?.views ?? 0;
}

export type CampaignBudget = {
  totalBudget: number;
  spent: number;
  left: number;
  approvedViews: number;
};

/**
 * Budget position of a campaign. `spent` is clamped to `totalBudget`: views
 * keep growing after approval, so accrued earnings can exceed the ceiling, and
 * the campaign still never pays out more than it holds.
 */
export async function campaignBudget(
  tx: DbOrTx,
  campaign: { id: string; totalBudget: number; payoutPer1kViews: number },
): Promise<CampaignBudget> {
  const [thousands, viewsRow] = await Promise.all([
    payableViewThousands(tx, campaign.id),
    tx.execute<{ views: string }>(sql`
      SELECT COALESCE(SUM(latest.views), 0)::bigint AS views
      FROM (
        SELECT DISTINCT ON (m.submission_id) m.submission_id, m.views
        FROM ${submissionMetrics} m
        JOIN ${submissions} s ON s.id = m.submission_id
        WHERE s.campaign_id = ${campaign.id}
          AND s.status IN ('approved', 'paid')
        ORDER BY m.submission_id, m.captured_at DESC
      ) AS latest
    `),
  ]);

  const accrued = thousands * campaign.payoutPer1kViews;
  const spent = Math.min(accrued, campaign.totalBudget);

  return {
    totalBudget: campaign.totalBudget,
    spent,
    left: budgetLeft(campaign.totalBudget, spent),
    approvedViews: Number(viewsRow[0]?.views ?? "0"),
  };
}

/**
 * Marks a campaign `completed` when nothing is left to pay out. Called after
 * every operation that can move the number: approval and ingest.
 */
export async function completeCampaignIfExhausted(
  tx: DbOrTx,
  campaign: { id: string; totalBudget: number; payoutPer1kViews: number },
): Promise<boolean> {
  const budget = await campaignBudget(tx, campaign);
  if (budget.left > 0) return false;

  await tx
    .update(campaigns)
    .set({ status: "completed", updatedAt: new Date() })
    .where(and(eq(campaigns.id, campaign.id), inArray(campaigns.status, ["active", "paused"])));

  return true;
}

export { earningsForViews };
