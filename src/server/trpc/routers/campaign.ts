import { TRPCError } from "@trpc/server";
import { and, asc, count, desc, eq, ilike, sql } from "drizzle-orm";
import { z } from "zod";
import {
  createCampaignSchema,
  listCampaignsSchema,
  updateCampaignSchema,
} from "@/lib/validation/campaign";
import { campaigns, submissionMetrics, submissions } from "@/server/db/schema";
import { campaignBudget } from "@/server/services/budget";
import {
  adminProcedure,
  createTRPCRouter,
  protectedProcedure,
} from "../init";

const byIdSchema = z.object({ id: z.uuid() });

export const campaignRouter = createTRPCRouter({
  /** Admin campaign list. Paginated, searched and filtered in Postgres. */
  list: adminProcedure
    .input(listCampaignsSchema)
    .query(async ({ ctx, input }) => {
      const filters = [
        input.search ? ilike(campaigns.title, `%${input.search}%`) : undefined,
        input.status ? eq(campaigns.status, input.status) : undefined,
      ].filter(Boolean);

      const where = filters.length ? and(...filters) : undefined;

      const [rows, [total]] = await Promise.all([
        ctx.db
          .select({
            id: campaigns.id,
            title: campaigns.title,
            platforms: campaigns.platforms,
            payoutPer1kViews: campaigns.payoutPer1kViews,
            totalBudget: campaigns.totalBudget,
            status: campaigns.status,
            startsAt: campaigns.startsAt,
            endsAt: campaigns.endsAt,
            // The outer column is qualified explicitly: an unqualified `id`
            // would bind to the subquery's own table, not to the campaign.
            pendingCount: sql<number>`(
              SELECT COUNT(*)::int FROM ${submissions} s
              WHERE s.campaign_id = ${campaigns}.id AND s.status = 'pending'
            )`,
          })
          .from(campaigns)
          .where(where)
          .orderBy(desc(campaigns.createdAt))
          .limit(input.pageSize)
          .offset((input.page - 1) * input.pageSize),
        ctx.db.select({ value: count() }).from(campaigns).where(where),
      ]);

      const totalCount = total?.value ?? 0;

      return {
        items: rows,
        page: input.page,
        pageSize: input.pageSize,
        total: totalCount,
        pageCount: Math.max(1, Math.ceil(totalCount / input.pageSize)),
      };
    }),

  byId: adminProcedure.input(byIdSchema).query(async ({ ctx, input }) => {
    const [campaign] = await ctx.db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, input.id));

    if (!campaign) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Campaign not found." });
    }
    return campaign;
  }),

  create: adminProcedure
    .input(createCampaignSchema)
    .mutation(async ({ ctx, input }) => {
      const [created] = await ctx.db
        .insert(campaigns)
        .values({
          title: input.title,
          platforms: input.platforms,
          payoutPer1kViews: input.payoutPer1kViews,
          totalBudget: input.totalBudget,
          status: input.status,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
        })
        .returning();

      return created;
    }),

  update: adminProcedure
    .input(updateCampaignSchema)
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(campaigns)
        .set({
          title: input.data.title,
          platforms: input.data.platforms,
          payoutPer1kViews: input.data.payoutPer1kViews,
          totalBudget: input.data.totalBudget,
          status: input.data.status,
          startsAt: input.data.startsAt,
          endsAt: input.data.endsAt,
          updatedAt: new Date(),
        })
        .where(eq(campaigns.id, input.id))
        .returning();

      if (!updated) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Campaign not found.",
        });
      }
      return updated;
    }),

  /** Totals plus the daily views series used by the campaign overview. */
  overview: adminProcedure
    .input(byIdSchema)
    .query(async ({ ctx, input }) => {
      const [campaign] = await ctx.db
        .select()
        .from(campaigns)
        .where(eq(campaigns.id, input.id));

      if (!campaign) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Campaign not found.",
        });
      }

      const budget = await campaignBudget(ctx.db, campaign);

      // Metric rows hold cumulative views per submission, so the daily figure
      // is the difference from that submission's previous capture. The campaign
      // period is generated in full, which is what fills the days that have no
      // metric row with a zero instead of leaving a hole in the chart.
      const series = await ctx.db.execute<{ day: string; views: string }>(sql`
        WITH days AS (
          SELECT generate_series(
            ${campaign.startsAt.toISOString()}::date,
            LEAST(${campaign.endsAt.toISOString()}::date, CURRENT_DATE),
            INTERVAL '1 day'
          )::date AS day
        ),
        deltas AS (
          SELECT
            m.captured_at AS day,
            m.views - COALESCE(
              LAG(m.views) OVER (
                PARTITION BY m.submission_id ORDER BY m.captured_at
              ), 0
            ) AS delta
          FROM ${submissionMetrics} m
          JOIN ${submissions} s ON s.id = m.submission_id
          WHERE s.campaign_id = ${campaign.id}
            AND s.status IN ('approved', 'paid')
        ),
        daily AS (
          SELECT day, SUM(GREATEST(delta, 0))::bigint AS views
          FROM deltas
          GROUP BY day
        )
        SELECT days.day::text AS day, COALESCE(daily.views, 0)::bigint AS views
        FROM days
        LEFT JOIN daily ON daily.day = days.day
        ORDER BY days.day
      `);

      const [counts] = await ctx.db
        .select({
          pending: sql<number>`COUNT(*) FILTER (WHERE ${submissions.status} = 'pending')::int`,
          approved: sql<number>`COUNT(*) FILTER (WHERE ${submissions.status} IN ('approved','paid'))::int`,
          rejected: sql<number>`COUNT(*) FILTER (WHERE ${submissions.status} = 'rejected')::int`,
        })
        .from(submissions)
        .where(eq(submissions.campaignId, campaign.id));

      return {
        campaign,
        budget,
        counts: counts ?? { pending: 0, approved: 0, rejected: 0 },
        dailyViews: series.map((row) => ({
          day: row.day,
          views: Number(row.views),
        })),
      };
    }),

  /** Creator-facing browse. Only active campaigns are visible here. */
  listActive: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        id: campaigns.id,
        title: campaigns.title,
        platforms: campaigns.platforms,
        payoutPer1kViews: campaigns.payoutPer1kViews,
        totalBudget: campaigns.totalBudget,
        startsAt: campaigns.startsAt,
        endsAt: campaigns.endsAt,
      })
      .from(campaigns)
      .where(eq(campaigns.status, "active"))
      .orderBy(asc(campaigns.endsAt));

    return rows;
  }),
});
