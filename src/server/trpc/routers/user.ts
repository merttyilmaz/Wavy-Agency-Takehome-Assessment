import { cookies } from "next/headers";
import { z } from "zod";
import { asc } from "drizzle-orm";
import { users } from "@/server/db/schema";
import { SESSION_COOKIE, signUserId } from "@/server/auth";
import { createTRPCRouter, publicProcedure } from "../init";

/**
 * The dev-only user switcher from section 4.1. It is intentionally open: there
 * is no login to protect. Every procedure that matters re-checks role and
 * ownership server-side, so switching identity here grants nothing that a
 * hand-crafted cookie would not.
 */
export const userRouter = createTRPCRouter({
  me: publicProcedure.query(({ ctx }) => ctx.user),

  list: publicProcedure.query(({ ctx }) =>
    ctx.db
      .select({ id: users.id, email: users.email, role: users.role })
      .from(users)
      .orderBy(asc(users.role), asc(users.email)),
  ),

  switchTo: publicProcedure
    .input(z.object({ userId: z.uuid() }))
    .mutation(async ({ input }) => {
      const store = await cookies();
      store.set(SESSION_COOKIE, signUserId(input.userId), {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
        maxAge: 60 * 60 * 24 * 30,
      });
      return { ok: true };
    }),

  signOut: publicProcedure.mutation(async () => {
    const store = await cookies();
    store.delete(SESSION_COOKIE);
    return { ok: true };
  }),
});
