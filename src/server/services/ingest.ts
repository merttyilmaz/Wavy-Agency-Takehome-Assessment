import { eq, sql } from "drizzle-orm";
import type { Db } from "@/server/db";
import { campaigns, submissionMetrics, submissions } from "@/server/db/schema";
import { completeCampaignIfExhausted } from "./budget";

export type IngestFailure = { submissionId: string; error: string };

export type IngestReport = {
  day: string;
  processed: number;
  inserted: number;
  skipped: number;
  failed: IngestFailure[];
};

/** YYYY-MM-DD in UTC — the `captured_at` key for a run. */
export function toDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Stand-in for the third-party stats APIs. Deterministic per (submission, day)
 * so a re-run computes the same numbers, and monotonic because the growth is
 * always added to the previous day's figures.
 */
export function fakeDailyGrowth(
  submissionId: string,
  day: string,
  previous: { views: number; likes: number; comments: number },
) {
  let hash = 0;
  const seed = `${submissionId}:${day}`;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }

  const base = previous.views === 0 ? 1_500 : Math.ceil(previous.views * 0.12);
  const viewDelta = base + (hash % 4_000);

  return {
    views: previous.views + viewDelta,
    likes: previous.likes + Math.floor(viewDelta * 0.06),
    comments: previous.comments + Math.floor(viewDelta * 0.008),
  };
}

export type IngestOptions = {
  /** Day to capture. Defaults to today (UTC). */
  day?: Date;
  /**
   * Test seam: throw for a given submission to prove one failure does not stop
   * the run.
   */
  onSubmission?: (submissionId: string) => void | Promise<void>;
};

/**
 * Fakes a daily metrics sync.
 *
 *  - one `submission_metric` row per approved submission per day
 *  - views only ever go up (growth is added to the previous row)
 *  - a second run for the same day changes nothing (unique index on
 *    (submission_id, captured_at) + ON CONFLICT DO NOTHING)
 *  - each submission is its own transaction, so one failure is reported and
 *    the rest still finish
 */
export async function runIngest(
  db: Db,
  options: IngestOptions = {},
): Promise<IngestReport> {
  const day = toDayKey(options.day ?? new Date());

  const targets = await db
    .select({
      id: submissions.id,
      campaignId: submissions.campaignId,
    })
    .from(submissions)
    .where(eq(submissions.status, "approved"))
    .orderBy(submissions.createdAt);

  const report: IngestReport = {
    day,
    processed: 0,
    inserted: 0,
    skipped: 0,
    failed: [],
  };

  const touchedCampaigns = new Set<string>();

  for (const target of targets) {
    report.processed += 1;
    try {
      await options.onSubmission?.(target.id);

      const inserted = await db.transaction(async (tx) => {
        // Latest row so far. Ordering by captured_at (not created_at) keeps the
        // sequence correct when a backfill runs out of order.
        const [previous] = await tx
          .select({
            views: submissionMetrics.views,
            likes: submissionMetrics.likes,
            comments: submissionMetrics.comments,
          })
          .from(submissionMetrics)
          .where(eq(submissionMetrics.submissionId, target.id))
          .orderBy(sql`${submissionMetrics.capturedAt} DESC`)
          .limit(1);

        const next = fakeDailyGrowth(
          target.id,
          day,
          previous ?? { views: 0, likes: 0, comments: 0 },
        );

        const rows = await tx
          .insert(submissionMetrics)
          .values({
            submissionId: target.id,
            capturedAt: day,
            views: next.views,
            likes: next.likes,
            comments: next.comments,
          })
          .onConflictDoNothing({
            target: [
              submissionMetrics.submissionId,
              submissionMetrics.capturedAt,
            ],
          })
          .returning({ id: submissionMetrics.id });

        return rows.length > 0;
      });

      if (inserted) {
        report.inserted += 1;
        touchedCampaigns.add(target.campaignId);
      } else {
        report.skipped += 1;
      }
    } catch (error) {
      report.failed.push({
        submissionId: target.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Growing views can push a campaign to its ceiling outside of an approval.
  for (const campaignId of touchedCampaigns) {
    try {
      const [campaign] = await db
        .select({
          id: campaigns.id,
          totalBudget: campaigns.totalBudget,
          payoutPer1kViews: campaigns.payoutPer1kViews,
        })
        .from(campaigns)
        .where(eq(campaigns.id, campaignId));

      if (campaign) await completeCampaignIfExhausted(db, campaign);
    } catch (error) {
      report.failed.push({
        submissionId: `campaign:${campaignId}`,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return report;
}
