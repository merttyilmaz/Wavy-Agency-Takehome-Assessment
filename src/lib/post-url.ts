import type { Platform } from "@/server/db/schema";

/**
 * "The URL has to look like a real post URL on one of the campaign's
 * platforms." These patterns are deliberately shallow — they check host and
 * path shape, not that the post exists. Anything stricter would reject valid
 * URLs (regional hosts, share links) without buying real safety.
 */
const POST_URL_PATTERNS: Record<Platform, RegExp[]> = {
  tiktok: [
    // https://www.tiktok.com/@handle/video/1234567890
    /^https?:\/\/(www\.)?tiktok\.com\/@[\w.-]{1,64}\/video\/\d{6,}\/?$/i,
    // https://vm.tiktok.com/ZMabcdef/
    /^https?:\/\/(vm|vt)\.tiktok\.com\/[\w-]{5,}\/?$/i,
  ],
  instagram: [
    // https://www.instagram.com/reel/Cabc123/ (also /p/ and /tv/)
    /^https?:\/\/(www\.)?instagram\.com\/(reel|reels|p|tv)\/[\w-]{5,}\/?$/i,
  ],
  youtube: [
    // https://www.youtube.com/shorts/abc123
    /^https?:\/\/(www\.|m\.)?youtube\.com\/shorts\/[\w-]{6,}\/?$/i,
    // https://www.youtube.com/watch?v=abc123
    /^https?:\/\/(www\.|m\.)?youtube\.com\/watch\?v=[\w-]{6,}(&\S*)?$/i,
    // https://youtu.be/abc123
    /^https?:\/\/youtu\.be\/[\w-]{6,}(\?\S*)?$/i,
  ],
};

/** True when `url` looks like a post URL on `platform`. */
export function isPostUrlForPlatform(url: string, platform: Platform): boolean {
  return POST_URL_PATTERNS[platform].some((re) => re.test(url.trim()));
}

/** The platform a URL belongs to, or null when it matches none. */
export function detectPlatform(url: string): Platform | null {
  for (const platform of Object.keys(POST_URL_PATTERNS) as Platform[]) {
    if (isPostUrlForPlatform(url, platform)) return platform;
  }
  return null;
}

/**
 * Normalises a post URL before it is stored, so that two spellings of the same
 * post collide on the unique index instead of both being accepted.
 * Lowercases the host, drops a trailing slash, and strips tracking params.
 */
export function normalizePostUrl(url: string): string {
  const trimmed = url.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return trimmed;
  }
  parsed.protocol = "https:";
  parsed.hostname = parsed.hostname.toLowerCase();
  parsed.hash = "";

  const keep = new Set(["v"]); // YouTube's video id is the only meaningful param
  for (const key of [...parsed.searchParams.keys()]) {
    if (!keep.has(key)) parsed.searchParams.delete(key);
  }

  let out = parsed.toString();
  if (out.endsWith("/") && parsed.pathname !== "/") out = out.slice(0, -1);
  return out;
}
