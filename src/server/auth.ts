import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { users, type User } from "@/server/db/schema";

export const SESSION_COOKIE = "wavy_session";

/**
 * Deliberately not a real auth system — the brief asks for a signed cookie
 * holding a userId plus a dev user switcher. The signature is what stops the
 * cookie being edited by hand to impersonate another user; everything else
 * (role, ownership) is re-checked server-side against the database on every
 * request.
 */
function secret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET is not set.");
  return value;
}

export function signUserId(userId: string): string {
  const mac = createHmac("sha256", secret()).update(userId).digest("hex");
  return `${userId}.${mac}`;
}

export function verifySignedUserId(value: string | undefined): string | null {
  if (!value) return null;
  const separator = value.lastIndexOf(".");
  if (separator <= 0) return null;

  const userId = value.slice(0, separator);
  const provided = Buffer.from(value.slice(separator + 1), "hex");
  const expected = createHmac("sha256", secret()).update(userId).digest();

  if (provided.length !== expected.length) return null;
  if (!timingSafeEqual(provided, expected)) return null;
  return userId;
}

/** The signed-in user, or null. Always re-read from the database. */
export async function getCurrentUser(): Promise<User | null> {
  const store = await cookies();
  const userId = verifySignedUserId(store.get(SESSION_COOKIE)?.value);
  if (!userId) return null;

  const [user] = await db.select().from(users).where(eq(users.id, userId));
  return user ?? null;
}
