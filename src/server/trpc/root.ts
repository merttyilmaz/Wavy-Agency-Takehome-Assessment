import { createCallerFactory, createTRPCRouter } from "./init";
import { campaignRouter } from "./routers/campaign";
import { submissionRouter } from "./routers/submission";
import { userRouter } from "./routers/user";

export const appRouter = createTRPCRouter({
  user: userRouter,
  campaign: campaignRouter,
  submission: submissionRouter,
});

export type AppRouter = typeof appRouter;

export const createCaller = createCallerFactory(appRouter);
