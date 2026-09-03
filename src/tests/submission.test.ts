import { beforeEach, describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { createCaller } from "@/server/trpc/root";
import type { User } from "@/server/db/schema";
import { makeCampaign, makeUser, resetDb, testDb } from "./helpers";

const callerFor = (user: User | null) => createCaller({ db: testDb, user });

const appCodeOf = async (promise: Promise<unknown>) => {
  const error = await promise.catch((e) => e);
  expect(error).toBeInstanceOf(TRPCError);
  return ((error as TRPCError).cause as { appCode?: string } | undefined)
    ?.appCode;
};

beforeEach(resetDb);

describe("submission.create", () => {
  it("rejects a URL that is not a post on the chosen platform", async () => {
    const creator = await makeUser("creator");
    const campaign = await makeCampaign({ platforms: ["tiktok"] });

    expect(
      await appCodeOf(
        callerFor(creator).submission.create({
          campaignId: campaign.id,
          platform: "tiktok",
          postUrl: "https://www.tiktok.com/@handle",
        }),
      ),
    ).toBe("INVALID_POST_URL");
  });

  it("rejects a platform the campaign does not accept", async () => {
    const creator = await makeUser("creator");
    const campaign = await makeCampaign({ platforms: ["tiktok"] });

    expect(
      await appCodeOf(
        callerFor(creator).submission.create({
          campaignId: campaign.id,
          platform: "youtube",
          postUrl: "https://www.youtube.com/shorts/abc123def",
        }),
      ),
    ).toBe("PLATFORM_NOT_ALLOWED");
  });

  it("rejects a campaign that is not active", async () => {
    const creator = await makeUser("creator");
    const campaign = await makeCampaign({ status: "draft" });

    expect(
      await appCodeOf(
        callerFor(creator).submission.create({
          campaignId: campaign.id,
          platform: "tiktok",
          postUrl: "https://www.tiktok.com/@handle/video/7300000000000000010",
        }),
      ),
    ).toBe("CAMPAIGN_NOT_ACTIVE");
  });

  it("refuses the same URL twice on one campaign, including different spellings", async () => {
    const creator = await makeUser("creator");
    const campaign = await makeCampaign({ platforms: ["tiktok"] });
    const caller = callerFor(creator);

    await caller.submission.create({
      campaignId: campaign.id,
      platform: "tiktok",
      postUrl: "https://www.tiktok.com/@handle/video/7300000000000000011",
    });

    expect(
      await appCodeOf(
        caller.submission.create({
          campaignId: campaign.id,
          platform: "tiktok",
          postUrl:
            "https://www.tiktok.com/@handle/video/7300000000000000011/?utm_source=share",
        }),
      ),
    ).toBe("DUPLICATE_SUBMISSION");
  });

  it("lets the same URL go to a different campaign", async () => {
    const creator = await makeUser("creator");
    const a = await makeCampaign({ platforms: ["tiktok"] });
    const b = await makeCampaign({ platforms: ["tiktok"] });
    const caller = callerFor(creator);
    const url = "https://www.tiktok.com/@handle/video/7300000000000000012";

    await caller.submission.create({
      campaignId: a.id,
      platform: "tiktok",
      postUrl: url,
    });
    const second = await caller.submission.create({
      campaignId: b.id,
      platform: "tiktok",
      postUrl: url,
    });

    expect(second.campaignId).toBe(b.id);
  });

  it("only one of two simultaneous identical submissions is stored", async () => {
    const creator = await makeUser("creator");
    const campaign = await makeCampaign({ platforms: ["tiktok"] });
    const caller = callerFor(creator);
    const url = "https://www.tiktok.com/@handle/video/7300000000000000013";

    const results = await Promise.allSettled([
      caller.submission.create({
        campaignId: campaign.id,
        platform: "tiktok",
        postUrl: url,
      }),
      caller.submission.create({
        campaignId: campaign.id,
        platform: "tiktok",
        postUrl: url,
      }),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });
});
