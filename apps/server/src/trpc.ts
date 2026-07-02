import { initTRPC, TRPCError } from "@trpc/server";

/**
 * Request context. `authorized` is computed per request from the access token
 * (see `auth.ts`) by the HTTP adapter's `createContext`. Direct callers (tests)
 * pass it explicitly.
 */
export interface Context {
  authorized: boolean;
}

/**
 * Root tRPC builder. Procedure logic lives in `apps/server` (this package);
 * only the resulting `AppRouter` *type* is re-exported through
 * `packages/shared` for the web client to consume.
 */
const t = initTRPC.context<Context>().create();

export const router = t.router;

/** Open procedure — no gate. Used for the unauthenticated heartbeat (`ping`). */
export const publicProcedure = t.procedure;

/**
 * Gated procedure — the caller must carry a valid access token. Used for every
 * procedure that spends the personal Anthropic token or exposes the app UI, so
 * strangers can't drive our key.
 */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.authorized) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Missing or invalid access token.",
    });
  }
  return next();
});
