/**
 * Payout math. Pure, integer-only, no database access — the one place the
 * "cents" rule lives so it can be unit tested on its own.
 */

/**
 * Earnings for a single approved submission:
 *   floor(views / 1000) * payout_per_1k_views
 *
 * `views` comes from the most recent metric row; a submission with no metric
 * row yet has earned nothing.
 */
export function earningsForViews(
  views: number,
  payoutPer1kViews: number,
): number {
  if (!Number.isFinite(views) || views <= 0) return 0;
  return Math.floor(views / 1000) * payoutPer1kViews;
}

/** Budget left, never negative. */
export function budgetLeft(totalBudget: number, spent: number): number {
  return Math.max(0, totalBudget - spent);
}

/** Formats integer cents as a currency string. */
export function formatCents(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(cents / 100);
}
