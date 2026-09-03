export const PLATFORMS = ["tiktok", "instagram", "youtube"] as const;
export const CAMPAIGN_STATUSES = [
  "draft",
  "active",
  "paused",
  "completed",
] as const;
export const SUBMISSION_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "paid",
] as const;

export const PLATFORM_LABELS: Record<(typeof PLATFORMS)[number], string> = {
  tiktok: "TikTok",
  instagram: "Instagram",
  youtube: "YouTube",
};

export const PAGE_SIZE = 10;
