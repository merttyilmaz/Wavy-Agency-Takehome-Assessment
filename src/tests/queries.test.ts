import { beforeEach, describe, expect, it } from "vitest";
import { createCaller } from "@/server/trpc/root";
import type { User } from "@/server/db/schema";
import {
  addMetric,
  makeCampaign,
  makeSubmission,
  makeUser,
  resetDb,
  testDb,
} from "./helpers";

const callerFor = (user: User | null) => createCaller({ db: testDb, user });

beforeEach(resetDb);

/**
 * These cover the correlated subqueries in the list and overview queries.
 * They exist because an unqualified outer column silently bound to the inner
 * table instead, which returned plausible-looking zeroes rather than an error.
 */
describe("campaign.list", () => {
  it("counts pending submissions per campaign", async () => {
    const admin = await makeUser("admin");
    const creator = await makeUser("creator");

    const withPending = await makeCampaign({ title: "Has pending" });
    const withoutPending = await makeCampaign({ title: "No pending" });

    await makeSubmission(withPending.id, creator.id, { status: "pending" });
    await makeSubmission(withPending.id, creator.id, { status: "pending" });
    await makeSubmission(withPending.id, creator.id, { status: "approved" });
    await makeSubmission(withoutPending.id, creator.id, { status: "rejected" });

    const result = await callerFor(admin).campaign.list({
      page: 1,
      pageSize: 10,
    });

    const byId = new Map(result.items.map((c) => [c.id, c.pendingCount]));
    expect(byId.get(withPending.id)).toBe(2);
    expect(byId.get(withoutPending.id)).toBe(0);
  });

  it("searches on title and filters by status, paginating on the server", async () => {
    const admin = await makeUser("admin");
    await makeCampaign({ title: "Summer drop", status: "active" });
    await makeCampaign({ title: "Summer teaser", status: "draft" });
    await makeCampaign({ title: "Winter drop", status: "active" });

    const caller = callerFor(admin);

    const searched = await caller.campaign.list({
      page: 1,
      pageSize: 10,
      search: "summer",
    });
    expect(searched.total).toBe(2);

    const filtered = await caller.campaign.list({
      page: 1,
      pageSize: 10,
      status: "active",
    });
    expect(filtered.total).toBe(2);

    const both = await caller.campaign.list({
      page: 1,
      pageSize: 10,
      search: "drop",
      status: "active",
    });
    expect(both.total).toBe(2);

    const firstPage = await caller.campaign.list({ page: 1, pageSize: 2 });
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.pageCount).toBe(2);

    const secondPage = await caller.campaign.list({ page: 2, pageSize: 2 });
    expect(secondPage.items).toHaveLength(1);
  });
});

describe("submission.mine", () => {
  it("reads the latest metric row and estimates earnings from it", async () => {
    const creator = await makeUser("creator");
    const campaign = await makeCampaign({ payoutPer1kViews: 250 });

    const approved = await makeSubmission(campaign.id, creator.id, {
      status: "approved",
    });
    await addMetric(approved.id, 4_000, -2);
    await addMetric(approved.id, 12_500, -1); // latest: 12 * 250 = 3,000

    const pending = await makeSubmission(campaign.id, creator.id, {
      status: "pending",
    });
    await addMetric(pending.id, 50_000, -1);

    const rows = await callerFor(creator).submission.mine();
    const byId = new Map(rows.map((row) => [row.id, row]));

    expect(byId.get(approved.id)!.views).toBe(12_500);
    expect(byId.get(approved.id)!.estimatedEarnings).toBe(3_000);

    // A pending submission shows its views but has not earned anything.
    expect(byId.get(pending.id)!.views).toBe(50_000);
    expect(byId.get(pending.id)!.estimatedEarnings).toBe(0);
  });
});

describe("campaign.overview", () => {
  it("emits a point for every day of the period, including days with no metrics", async () => {
    const admin = await makeUser("admin");
    const creator = await makeUser("creator");
    const DAY = 24 * 60 * 60 * 1000;

    const campaign = await makeCampaign({
      payoutPer1kViews: 100,
      totalBudget: 10_000_000,
      startsAt: new Date(Date.now() - 4 * DAY),
      endsAt: new Date(Date.now() + 4 * DAY),
    });

    const submission = await makeSubmission(campaign.id, creator.id, {
      status: "approved",
    });
    // A gap on day -2: no metric row was captured.
    await addMetric(submission.id, 1_000, -3);
    await addMetric(submission.id, 5_000, -1);

    const overview = await callerFor(admin).campaign.overview({
      id: campaign.id,
    });

    // Period start through today, inclusive.
    expect(overview.dailyViews).toHaveLength(5);
    expect(overview.dailyViews.every((p) => typeof p.views === "number")).toBe(
      true,
    );

    const byDay = new Map(overview.dailyViews.map((p) => [p.day, p.views]));
    const key = (offset: number) =>
      new Date(Date.now() + offset * DAY).toISOString().slice(0, 10);

    expect(byDay.get(key(-3))).toBe(1_000); // first capture
    expect(byDay.get(key(-2))).toBe(0); // no metric row that day
    expect(byDay.get(key(-1))).toBe(4_000); // delta, not the running total

    expect(overview.budget.approvedViews).toBe(5_000);
    expect(overview.budget.spent).toBe(500);
    expect(overview.counts.approved).toBe(1);
  });
});
