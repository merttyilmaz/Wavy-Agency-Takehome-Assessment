import { describe, expect, it } from "vitest";
import { budgetLeft, earningsForViews, formatCents } from "@/lib/payout";

/**
 * The payout rule is the one piece of arithmetic that money depends on, and
 * it is pure, so it gets exhaustive edge cases rather than a happy path.
 */
describe("earningsForViews", () => {
  it("pays nothing below the first full thousand", () => {
    expect(earningsForViews(0, 250)).toBe(0);
    expect(earningsForViews(1, 250)).toBe(0);
    expect(earningsForViews(999, 250)).toBe(0);
  });

  it("floors to whole thousands, never rounds up", () => {
    expect(earningsForViews(1_000, 250)).toBe(250);
    expect(earningsForViews(1_999, 250)).toBe(250);
    expect(earningsForViews(2_000, 250)).toBe(500);
    expect(earningsForViews(15_432, 250)).toBe(3_750);
  });

  it("stays in whole cents for any integer payout rate", () => {
    for (const rate of [1, 7, 33, 250, 999]) {
      const value = earningsForViews(123_456, rate);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBe(123 * rate);
    }
  });

  it("treats negative or non-finite views as zero", () => {
    expect(earningsForViews(-5_000, 250)).toBe(0);
    expect(earningsForViews(Number.NaN, 250)).toBe(0);
  });
});

describe("budgetLeft", () => {
  it("never goes negative", () => {
    expect(budgetLeft(1_000, 400)).toBe(600);
    expect(budgetLeft(1_000, 1_000)).toBe(0);
    expect(budgetLeft(1_000, 4_000)).toBe(0);
  });
});

describe("formatCents", () => {
  it("renders integer cents as currency", () => {
    expect(formatCents(500_000)).toBe("$5,000.00");
    expect(formatCents(250)).toBe("$2.50");
    expect(formatCents(0)).toBe("$0.00");
  });
});
