import { TRPCError } from "@trpc/server";

/**
 * Typed application errors. The code travels to the client in
 * `error.data.appCode`, so the UI can act on a specific failure instead of
 * pattern-matching on a message string.
 */
export const APP_ERROR_CODES = [
  "BUDGET_EXCEEDED",
  "CAMPAIGN_NOT_ACTIVE",
  "DUPLICATE_SUBMISSION",
  "SUBMISSION_NOT_PENDING",
  "PLATFORM_NOT_ALLOWED",
  "INVALID_POST_URL",
] as const;

export type AppErrorCode = (typeof APP_ERROR_CODES)[number];

export class AppError extends Error {
  constructor(
    readonly appCode: AppErrorCode,
    message: string,
    readonly meta?: Record<string, number | string>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

const TRPC_CODE_BY_APP_CODE: Record<
  AppErrorCode,
  "CONFLICT" | "BAD_REQUEST" | "PRECONDITION_FAILED"
> = {
  BUDGET_EXCEEDED: "CONFLICT",
  CAMPAIGN_NOT_ACTIVE: "PRECONDITION_FAILED",
  DUPLICATE_SUBMISSION: "CONFLICT",
  SUBMISSION_NOT_PENDING: "CONFLICT",
  PLATFORM_NOT_ALLOWED: "BAD_REQUEST",
  INVALID_POST_URL: "BAD_REQUEST",
};

/** Wraps an AppError so tRPC serialises it with the app code attached. */
export function toTRPCError(error: AppError): TRPCError {
  return new TRPCError({
    code: TRPC_CODE_BY_APP_CODE[error.appCode],
    message: error.message,
    cause: error,
  });
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
