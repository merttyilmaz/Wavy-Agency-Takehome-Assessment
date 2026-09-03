import { TRPCError } from "@trpc/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import {
  approveSubmissionSchema,
  createSubmissionSchema,
  rejectSubmissionSchema,
} from "@/lib/validation/submission";
import { campaigns, submissionMetrics, submissions, users } from "@/server/db/schema";
import { AppError, isAppError, toTRPCError } from "@/server/errors";
import { approveSubmission, rejectSubmission } from "@/server/services/approval";
import { earningsForViews } from "@/lib/payout";
import { isPostUrlForPlatform, normalizePostUrl } from "@/lib/post-url";
import {
  adminProcedure,
  createTRPCRouter,
  creatorProcedure,
} from "../init";

/**
 * Latest metric row per submission, as a correlated subquery. The outer column
 * is qualified explicitly — an unqualified `id` would bind to the subquery's
 * own table instead of correlating to the outer submission.
 */
const latestViews = sql<number>`COALESCE((
  SELECT m.views FROM ${submissionMetrics} m
  WHERE m.submission_id = ${submissions}.id
  ORDER BY m.captured_at DESC
  LIMIT 1
), 0)::int`;

export const submissionRouter = createTRPCRouter({
  /** A creator submits a clip URL to a campaign. */
  create: creatorProcedure
    .input(createSubmissionSchema)
    .mutation(async ({ ctx, input }) => {
      const [campaign] = await ctx.db
        .select()
        .from(campaigns)
        .where(eq(campaigns.id, input.campaignId));

      if (!campaign) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Campaign not found.",
        });
      }

      try {
        if (campaign.status !== "active") {
          throw new AppError(
            "CAMPAIGN_NOT_ACTIVE",
            "This campaign is not accepting submissions.",
          );
        }

        if (!campaign.platforms.includes(input.platform)) {
          throw new AppError(
            "PLATFORM_NOT_ALLOWED",
            "This campaign does not accept that platform.",
          );
        }

        const postUrl = normalizePostUrl(input.postUrl);
        if (!isPostUrlForPlatform(postUrl, input.platform)) {
          throw new AppError(
            "INVALID_POST_URL",
            "That does not look like a post URL on the selected platform.",
          );
        }

        const [created] = await ctx.db
          .insert(submissions)
          .values({
            campaignId: campaign.id,
            creatorId: ctx.user.id,
            postUrl,
            platform: input.platform,
            status: "pending",
          })
          // The unique index on (campaign_id, post_url) is the real guard; this
          // turns the constraint violation into a typed, empty result.
          .onConflictDoNothing({
            target: [submissions.campaignId, submissions.postUrl],
          })
          .returning();

        if (!created) {
          throw new AppError(
            "DUPLICATE_SUBMISSION",
            "That URL has already been submitted to this campaign.",
          );
        }

        return created;
      } catch (error) {
        if (isAppError(error)) throw toTRPCError(error);
        throw error;
      }
    }),

  /**
   * A creator's own submissions. `creatorId` is taken from the session, never
   * from the input, so there is no id for a caller to tamper with.
   */
  mine: creatorProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        id: submissions.id,
        postUrl: submissions.postUrl,
        platform: submissions.platform,
        status: submissions.status,
        rejectionReason: submissions.rejectionReason,
        createdAt: submissions.createdAt,
        campaignId: campaigns.id,
        campaignTitle: campaigns.title,
        payoutPer1kViews: campaigns.payoutPer1kViews,
        views: latestViews,
      })
      .from(submissions)
      .innerJoin(campaigns, eq(campaigns.id, submissions.campaignId))
      .where(eq(submissions.creatorId, ctx.user.id))
      .orderBy(desc(submissions.createdAt));

    return rows.map((row) => ({
      ...row,
      // Estimated because only approved and paid submissions actually earn.
      estimatedEarnings:
        row.status === "approved" || row.status === "paid"
          ? earningsForViews(row.views, row.payoutPer1kViews)
          : 0,
    }));
  }),

  /**
   * A single submission a creator owns. Exists to show that ownership is
   * enforced on the row, not on the route.
   */
  mineById: creatorProcedure
    .input(z.object({ id: z.uuid() }))
    .query(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .select()
        .from(submissions)
        .where(
          and(
            eq(submissions.id, input.id),
            eq(submissions.creatorId, ctx.user.id),
          ),
        );

      if (!row) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Submission not found.",
        });
      }
      return row;
    }),

  /** Admin review queue for one campaign. */
  reviewQueue: adminProcedure
    .input(
      z.object({
        campaignId: z.uuid(),
        status: z
          .enum(["pending", "approved", "rejected", "paid"])
          .default("pending"),
      }),
    )
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select({
          id: submissions.id,
          postUrl: submissions.postUrl,
          platform: submissions.platform,
          status: submissions.status,
          rejectionReason: submissions.rejectionReason,
          createdAt: submissions.createdAt,
          creatorEmail: users.email,
          views: latestViews,
        })
        .from(submissions)
        .innerJoin(users, eq(users.id, submissions.creatorId))
        .where(
          and(
            eq(submissions.campaignId, input.campaignId),
            eq(submissions.status, input.status),
          ),
        )
        .orderBy(desc(submissions.createdAt));

      return rows;
    }),

  approve: adminProcedure
    .input(approveSubmissionSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await approveSubmission(ctx.db, input.submissionId);
      } catch (error) {
        if (isAppError(error)) throw toTRPCError(error);
        throw error;
      }
    }),

  reject: adminProcedure
    .input(rejectSubmissionSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await rejectSubmission(ctx.db, input.submissionId, input.reason);
      } catch (error) {
        if (isAppError(error)) throw toTRPCError(error);
        throw error;
      }
    }),
});
