import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "@/server/trpc/root";
import { createTRPCContext } from "@/server/trpc/init";

/**
 * The only route handler in the app, and it carries no app data of its own —
 * it is the tRPC transport. Everything between client and server goes through
 * the router.
 */
function handler(req: Request) {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: createTRPCContext,
    onError({ error, path }) {
      if (process.env.NODE_ENV !== "production") {
        console.error(`tRPC error on ${path ?? "<no-path>"}:`, error);
      }
    },
  });
}

export { handler as GET, handler as POST };
