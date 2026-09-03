import { z } from "zod";
import { CAMPAIGN_STATUSES, PAGE_SIZE, PLATFORMS } from "@/lib/constants";

/**
 * One schema, used by react-hook-form on the client and by the tRPC procedure
 * on the server. The server never trusts the client to have run it.
 */
export const campaignInputSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(3, "Title must be at least 3 characters")
      .max(120, "Title must be at most 120 characters"),
    platforms: z
      .array(z.enum(PLATFORMS))
      .min(1, "Pick at least one platform")
      .refine(
        (values) => new Set(values).size === values.length,
        "Platforms must be unique",
      ),
    payoutPer1kViews: z
      .int("Payout must be a whole number of cents")
      .min(1, "Payout must be at least 1 cent")
      .max(1_000_000, "Payout looks too large"),
    totalBudget: z
      .int("Budget must be a whole number of cents")
      .min(1, "Budget must be at least 1 cent")
      .max(1_000_000_000, "Budget looks too large"),
    status: z.enum(CAMPAIGN_STATUSES),
    // superjson carries Date over the wire, so both sides parse the same type.
    startsAt: z.date(),
    endsAt: z.date(),
  })
  .refine((v) => v.endsAt > v.startsAt, {
    message: "End date must be after the start date",
    path: ["endsAt"],
  });

export type CampaignInput = z.input<typeof campaignInputSchema>;
export type CampaignValues = z.output<typeof campaignInputSchema>;

export const createCampaignSchema = campaignInputSchema;

export const updateCampaignSchema = z.object({
  id: z.uuid(),
  data: campaignInputSchema,
});

export const listCampaignsSchema = z.object({
  page: z.int().min(1).default(1),
  pageSize: z.int().min(1).max(50).default(PAGE_SIZE),
  search: z.string().trim().max(120).optional(),
  status: z.enum(CAMPAIGN_STATUSES).optional(),
});

export type ListCampaignsInput = z.infer<typeof listCampaignsSchema>;
