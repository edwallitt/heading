import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createAnthropicClient } from "./ai/client.js";
import { generateFlight } from "./ai/generateFlight.js";
import { withExports } from "./export/index.js";
import { flightOptions } from "./options.js";
import { createRateLimiter } from "./rateLimit.js";
import { briefSchema } from "./schema.js";
import { protectedProcedure, publicProcedure, router } from "./trpc.js";
import { createAwcWeatherProvider } from "./weather/metar.js";

/**
 * Backstop against a runaway loop hammering the token-spending path. Process-
 * local and best-effort (see `rateLimit.ts`); the Anthropic console spend limit
 * is the real ceiling.
 */
const generateLimiter = createRateLimiter({ limit: 30, windowMs: 60 * 60 * 1000 });

/**
 * `flight.generate` input: the Brief plus an optional anti-repeat list of
 * recently shown airport idents (Phase 5). `excludeRecent` is a soft hint the
 * generator forwards to the model ("avoid these if possible"); it never gates
 * the candidate pool.
 */
const generateInput = briefSchema.extend({
  excludeRecent: z.array(z.string()).max(20).optional(),
});

/**
 * `system` router — health/diagnostic procedures.
 * `ping` proves the frontend↔backend tRPC pipe end-to-end.
 */
const systemRouter = router({
  ping: publicProcedure.query(() => ({
    message: "pong" as const,
    at: new Date().toISOString(),
  })),
});

/**
 * `flight` router — the AI dispatch surface (Phase 2).
 * `generate` resolves a Brief into a validated, flyable Flight (or a typed
 * no-flight result). It constructs the Anthropic client per call; the candidate
 * pool and enrichment come from our own libs, never the model.
 */
const flightRouter = router({
  // Brief-builder metadata: dial value lists + the time×aircraft viability
  // matrix that drives the client's progressive narrowing. Static and cheap.
  options: protectedProcedure.query(() => flightOptions()),
  generate: protectedProcedure.input(generateInput).mutation(async ({ input }) => {
    if (!generateLimiter(Date.now())) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "Rate limit reached — try again shortly.",
      });
    }
    const { excludeRecent, ...brief } = input;
    const result = await generateFlight(brief, {
      client: createAnthropicClient(),
      weather: createAwcWeatherProvider(),
      excludeRecent,
    });
    // Attach Phase 3 export artifacts (SimBrief URL + VFR .pln) to a successful
    // flight. generateFlight's selection/validation logic is left untouched.
    return result.status === "ok"
      ? { ...result, flight: withExports(result.flight) }
      : result;
  }),
});

/** The application's root tRPC router. */
export const appRouter = router({
  system: systemRouter,
  flight: flightRouter,
});

/** Type-only export; flows through `@heading/shared` to `apps/web`. */
export type AppRouter = typeof appRouter;
