import {
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

/* ---------------------------------------------------------------- enums -- */

export const userRoleEnum = pgEnum("user_role", ["admin", "creator"]);

export const platformEnum = pgEnum("platform", [
  "tiktok",
  "instagram",
  "youtube",
]);

export const campaignStatusEnum = pgEnum("campaign_status", [
  "draft",
  "active",
  "paused",
  "completed",
]);

export const submissionStatusEnum = pgEnum("submission_status", [
  "pending",
  "approved",
  "rejected",
  "paid",
]);

/* ---------------------------------------------------------------- tables -- */

export const users = pgTable(
  "user",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    role: userRoleEnum("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("user_email_unique").on(t.email)],
);

export const campaigns = pgTable(
  "campaign",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    // A campaign accepts clips on one or more platforms.
    platforms: platformEnum("platforms").array().notNull(),
    // Money is stored as integer cents everywhere. No floats.
    payoutPer1kViews: integer("payout_per_1k_views").notNull(),
    totalBudget: integer("total_budget").notNull(),
    status: campaignStatusEnum("status").notNull().default("draft"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("campaign_status_idx").on(t.status),
    // Supports the admin list's case-insensitive title search.
    index("campaign_title_lower_idx").on(sql`lower(${t.title})`),
  ],
);

export const submissions = pgTable(
  "submission",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    creatorId: uuid("creator_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    postUrl: text("post_url").notNull(),
    platform: platformEnum("platform").notNull(),
    status: submissionStatusEnum("status").notNull().default("pending"),
    rejectionReason: text("rejection_reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  },
  (t) => [
    // "The same URL can't end up on the same campaign twice." Enforced by the
    // database, not just by the procedure, so a race can't slip a duplicate in.
    uniqueIndex("submission_campaign_post_url_unique").on(
      t.campaignId,
      t.postUrl,
    ),
    index("submission_campaign_status_idx").on(t.campaignId, t.status),
    index("submission_creator_idx").on(t.creatorId),
  ],
);

export const submissionMetrics = pgTable(
  "submission_metric",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => submissions.id, { onDelete: "cascade" }),
    capturedAt: date("captured_at").notNull(),
    views: integer("views").notNull(),
    likes: integer("likes").notNull(),
    comments: integer("comments").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // One row per submission per day. This is what makes a repeated ingest run
    // for the same day a no-op instead of a duplicate.
    uniqueIndex("submission_metric_submission_day_unique").on(
      t.submissionId,
      t.capturedAt,
    ),
    index("submission_metric_captured_at_idx").on(t.capturedAt),
  ],
);

/* ------------------------------------------------------------- relations -- */

export const usersRelations = relations(users, ({ many }) => ({
  submissions: many(submissions),
}));

export const campaignsRelations = relations(campaigns, ({ many }) => ({
  submissions: many(submissions),
}));

export const submissionsRelations = relations(submissions, ({ one, many }) => ({
  campaign: one(campaigns, {
    fields: [submissions.campaignId],
    references: [campaigns.id],
  }),
  creator: one(users, {
    fields: [submissions.creatorId],
    references: [users.id],
  }),
  metrics: many(submissionMetrics),
}));

export const submissionMetricsRelations = relations(
  submissionMetrics,
  ({ one }) => ({
    submission: one(submissions, {
      fields: [submissionMetrics.submissionId],
      references: [submissions.id],
    }),
  }),
);

/* ----------------------------------------------------------------- types -- */

export type User = typeof users.$inferSelect;
export type Campaign = typeof campaigns.$inferSelect;
export type Submission = typeof submissions.$inferSelect;
export type SubmissionMetric = typeof submissionMetrics.$inferSelect;

export type UserRole = (typeof userRoleEnum.enumValues)[number];
export type Platform = (typeof platformEnum.enumValues)[number];
export type CampaignStatus = (typeof campaignStatusEnum.enumValues)[number];
export type SubmissionStatus = (typeof submissionStatusEnum.enumValues)[number];
