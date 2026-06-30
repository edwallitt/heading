import { publicProcedure, router } from "./trpc.js";

/**
 * `system` router — health/diagnostic procedures.
 *
 * `ping` proves the frontend↔backend tRPC pipe end-to-end.
 */
const systemRouter = router({
  ping: publicProcedure.query(() => ({
    message: "pong" as const,
    at: new Date().toISOString(),
  })),
});

/** The application's root tRPC router. */
export const appRouter = router({
  system: systemRouter,
});

/** Type-only export consumed by `apps/web` to type the tRPC client. */
export type AppRouter = typeof appRouter;
