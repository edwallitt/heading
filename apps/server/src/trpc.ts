import { initTRPC } from "@trpc/server";

/**
 * Root tRPC builder. Procedure logic lives in `apps/server` (this package);
 * only the resulting `AppRouter` *type* is re-exported through
 * `packages/shared` for the web client to consume.
 *
 * Phase 2 is still stateless — no context yet. A typed context object will be
 * threaded through `initTRPC.context<...>()` when one is needed.
 */
const t = initTRPC.create();

export const router = t.router;
export const publicProcedure = t.procedure;
