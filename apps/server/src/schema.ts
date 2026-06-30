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
    "asia",
    "oceania",
    "caribbean",
    "anywhere",
  ]),
  rules: z.enum(["VFR", "IFR", "any"]),
  vibe: z.enum(["mountain", "coastal", "urban", "any"]),
  aircraft: z.enum(["small_prop", "turboprop", "regional_jet", "airliner"]),
}) satisfies z.ZodType<Brief>;
