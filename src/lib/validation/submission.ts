import { z } from "zod";
import { PLATFORMS } from "@/lib/constants";

/**
 * The client validates the URL shape against the campaign's platforms too, but
 * the platform list is only known server-side at the point of insert, so the
 * cross-check lives in the procedure. This schema covers what can be checked
 * without the campaign row.
 */
export const createSubmissionSchema = z.object({
  campaignId: z.uuid(),
  platform: z.enum(PLATFORMS),
  postUrl: z
    .url("Enter a valid URL")
    .max(500, "URL is too long")
    .refine(
      (value) => /^https?:\/\//i.test(value),
      "URL must start with http:// or https://",
    ),
});

export type CreateSubmissionInput = z.infer<typeof createSubmissionSchema>;

export const approveSubmissionSchema = z.object({
  submissionId: z.uuid(),
});

export const rejectSubmissionSchema = z.object({
  submissionId: z.uuid(),
  // "Rejecting requires a reason."
  reason: z
    .string()
    .trim()
    .min(5, "Give a reason of at least 5 characters")
    .max(500, "Reason must be at most 500 characters"),
});

export type RejectSubmissionInput = z.infer<typeof rejectSubmissionSchema>;
