import { z } from "zod";
import type { Brief } from "./types.js";

/**
 * Zod schema for a Brief — the tRPC `flight.generate` input. Mirrors the `Brief`
 * type in `types.ts`; `satisfies` ties them together so the two can't drift.
 */
export const briefSchema = z.object({
  timeBand: z.enum(["20min", "45min", "1hr", "2hr", "3-5hr", "long_haul"]),
  region: z.enum([
    "north_america",
    "south_america",
    "europe",
    "africa",
    "asia",
    "oceania",
    "caribbean",
    "anywhere",
  ]),
  rules: z.enum(["VFR", "IFR", "any"]),
  vibe: z.enum(["mountain", "coastal", "urban", "notable", "any"]),
  aircraft: z.enum(["small_prop", "turboprop", "regional_jet", "airliner"]),
  // 1–3 legs. A numeric union (not an enum) so the value stays a number through
  // to the block-time math; `.default(1)` lets a client omit it (→ single hop)
  // without widening the client-facing input type to `unknown` (which `.catch`
  // would). Out-of-range values are rejected — our own client never sends them.
  legCount: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(1),
}) satisfies z.ZodType<Brief, z.ZodTypeDef, unknown>;
