import "server-only";
import { cache } from "react";
import { createCaller } from "@/server/trpc/root";
import { createTRPCContext } from "@/server/trpc/init";

/**
 * Direct, in-process caller for server components. No HTTP hop, same context
 * and therefore the same role and ownership checks.
 */
export const getServerCaller = cache(async () =>
  createCaller(await createTRPCContext()),
);
