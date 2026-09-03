import { beforeEach, describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { createCaller } from "@/server/trpc/root";
import type { User } from "@/server/db/schema";
import {
  makeCampaign,
  makeSubmission,
  makeUser,
  resetDb,
  testDb,
} from "./helpers";

/**
 * These go through the real router, not the services, because the thing under
 * test is the middleware and the ownership filter — the layer a hand-crafted
 * input would hit.
 */
function callerFor(user: User | null) {
  return createCaller({ db: testDb, user });
}

const codeOf = async (promise: Promise<unknown>) => {
  const error = await promise.catch((e) => e);
  expect(error).toBeInstanceOf(TRPCError);
  return (error as TRPCError).code;
};

beforeEach(resetDb);

describe("anonymous callers", () => {
  it("cannot reach anything behind a session", async () => {
    const caller = callerFor(null);
    expect(await codeOf(caller.campaign.list({ page: 1, pageSize: 10 }))).toBe(
      "UNAUTHORIZED",
    );
    expect(await codeOf(caller.submission.mine())).toBe("UNAUTHORIZED");
    expect(await codeOf(caller.campaign.listActive())).toBe("UNAUTHORIZED");
  });
});

describe("creators", () => {
  it("cannot reach admin procedures", async () => {
    const creator = await makeUser("creator");
    const campaign = await makeCampaign();
    const caller = callerFor(creator);

    expect(await codeOf(caller.campaign.list({ page: 1, pageSize: 10 }))).toBe(
      "FORBIDDEN",
    );
    expect(await codeOf(caller.campaign.byId({ id: campaign.id }))).toBe(
      "FORBIDDEN",
    );
    expect(await codeOf(caller.campaign.overview({ id: campaign.id }))).toBe(
      "FORBIDDEN",
    );
    expect(
      await codeOf(
        caller.campaign.create({
          title: "Nope",
          platforms: ["tiktok"],
          payoutPer1kViews: 100,
          totalBudget: 1_000,
          status: "active",
          startsAt: new Date(),
          endsAt: new Date(Date.now() + 86_400_000),
        }),
      ),
    ).toBe("FORBIDDEN");
    expect(
      await codeOf(
        caller.submission.reviewQueue({ campaignId: campaign.id, status: "pending" }),
      ),
    ).toBe("FORBIDDEN");
  });

  it("cannot approve or reject, even with a valid submission id", async () => {
    const creator = await makeUser("creator");
    const campaign = await makeCampaign();
    const submission = await makeSubmission(campaign.id, creator.id);
    const caller = callerFor(creator);

    expect(
      await codeOf(caller.submission.approve({ submissionId: submission.id })),
    ).toBe("FORBIDDEN");
    expect(
      await codeOf(
        caller.submission.reject({
          submissionId: submission.id,
          reason: "let me through",
        }),
      ),
    ).toBe("FORBIDDEN");
  });

  it("cannot read another creator's submission by id", async () => {
    const alice = await makeUser("creator");
    const bob = await makeUser("creator");
    const campaign = await makeCampaign();
    const bobsSubmission = await makeSubmission(campaign.id, bob.id);

    // Alice hand-crafts the input with Bob's real submission id.
    expect(
      await codeOf(callerFor(alice).submission.mineById({ id: bobsSubmission.id })),
    ).toBe("NOT_FOUND");

    // Bob still gets his own row.
    const own = await callerFor(bob).submission.mineById({ id: bobsSubmission.id });
    expect(own.id).toBe(bobsSubmission.id);
  });

  it("only ever lists its own submissions", async () => {
    const alice = await makeUser("creator");
    const bob = await makeUser("creator");
    const campaign = await makeCampaign();
    await makeSubmission(campaign.id, alice.id);
    await makeSubmission(campaign.id, bob.id);
    await makeSubmission(campaign.id, bob.id);

    expect(await callerFor(alice).submission.mine()).toHaveLength(1);
    expect(await callerFor(bob).submission.mine()).toHaveLength(2);
  });

  it("cannot submit on behalf of someone else — the creator comes from the session", async () => {
    const alice = await makeUser("creator");
    const campaign = await makeCampaign({ platforms: ["tiktok"], status: "active" });

    const created = await callerFor(alice).submission.create({
      campaignId: campaign.id,
      platform: "tiktok",
      postUrl: "https://www.tiktok.com/@alice/video/7300000000000000009",
    });

    expect(created.creatorId).toBe(alice.id);
  });
});

describe("admins", () => {
  it("cannot use the creator-only procedures", async () => {
    const admin = await makeUser("admin");
    const caller = callerFor(admin);

    expect(await codeOf(caller.submission.mine())).toBe("FORBIDDEN");
  });

  it("can review submissions across creators", async () => {
    const admin = await makeUser("admin");
    const creator = await makeUser("creator");
    const campaign = await makeCampaign();
    await makeSubmission(campaign.id, creator.id);

    const queue = await callerFor(admin).submission.reviewQueue({
      campaignId: campaign.id,
      status: "pending",
    });
    expect(queue).toHaveLength(1);
  });
});
