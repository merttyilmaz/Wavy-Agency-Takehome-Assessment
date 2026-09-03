import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";
import { db, type Db } from "@/server/db";
import type { User } from "@/server/db/schema";

export type TrpcContext = {
  db: Db;
  user: User | null;
};

/** Used by the Next.js request handler. */
export async function createTRPCContext(): Promise<TrpcContext> {
  const { getCurrentUser } = await import("@/server/auth");
  return { db, user: await getCurrentUser() };
}

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        // Field errors are handed straight to react-hook-form.
        zodError:
          error.cause instanceof ZodError
            ? z4FieldErrors(error.cause)
            : null,
        // Typed application errors (see errors.ts) the UI can branch on.
        appCode:
          typeof error.cause === "object" &&
          error.cause !== null &&
          "appCode" in error.cause
            ? (error.cause as { appCode: string }).appCode
            : null,
      },
    };
  },
});

function z4FieldErrors(error: ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

export const createTRPCRouter = t.router;
export const createCallerFactory = t.createCallerFactory;

export const publicProcedure = t.procedure;

/** Any signed-in user. */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Sign in first." });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

/** Admins only. */
export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admins only." });
  }
  return next({ ctx });
});

/** Creators only. Ownership is additionally checked per row in the router. */
export const creatorProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "creator") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Creators only." });
  }
  return next({ ctx });
});
