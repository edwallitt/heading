import { initTRPC } from "@trpc/server";

/**
 * Root tRPC builder shared across the workspace.
 *
 * Phase 0 has no context (v0 is stateless). Future phases will pass a typed
 * context object into `initTRPC.context<...>()`.
 */
const t = initTRPC.create();

export const router = t.router;
export const publicProcedure = t.procedure;
