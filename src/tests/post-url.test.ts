import { describe, expect, it } from "vitest";
import {
  detectPlatform,
  isPostUrlForPlatform,
  normalizePostUrl,
} from "@/lib/post-url";

describe("isPostUrlForPlatform", () => {
  it("accepts real post URL shapes", () => {
    expect(
      isPostUrlForPlatform(
        "https://www.tiktok.com/@handle/video/7300000000000000001",
        "tiktok",
      ),
    ).toBe(true);
    expect(
      isPostUrlForPlatform("https://www.instagram.com/reel/Cabc12345", "instagram"),
    ).toBe(true);
    expect(
      isPostUrlForPlatform("https://www.youtube.com/shorts/abc123def", "youtube"),
    ).toBe(true);
    expect(isPostUrlForPlatform("https://youtu.be/abc123def", "youtube")).toBe(
      true,
    );
  });

  it("rejects a profile or home page", () => {
    expect(isPostUrlForPlatform("https://www.tiktok.com/@handle", "tiktok")).toBe(
      false,
    );
    expect(isPostUrlForPlatform("https://instagram.com/", "instagram")).toBe(
      false,
    );
  });

  it("rejects a URL that belongs to a different platform", () => {
    const url = "https://www.tiktok.com/@handle/video/7300000000000000001";
    expect(isPostUrlForPlatform(url, "instagram")).toBe(false);
    expect(isPostUrlForPlatform(url, "youtube")).toBe(false);
  });

  it("detects the owning platform", () => {
    expect(detectPlatform("https://youtu.be/abc123def")).toBe("youtube");
    expect(detectPlatform("https://example.com/video/1")).toBeNull();
  });
});

describe("normalizePostUrl", () => {
  it("collapses spellings of the same post so duplicates collide", () => {
    const a = normalizePostUrl(
      "  HTTP://WWW.TikTok.com/@handle/video/7300000000000000001/?utm_source=x  ",
    );
    const b = normalizePostUrl(
      "https://www.tiktok.com/@handle/video/7300000000000000001",
    );
    expect(a).toBe(b);
  });

  it("keeps the YouTube video id but drops tracking params", () => {
    expect(
      normalizePostUrl("https://www.youtube.com/watch?v=abc123def&si=track"),
    ).toBe("https://www.youtube.com/watch?v=abc123def");
  });
});
