import { z } from "zod";

/**
 * Strict schema for the MODEL's JSON output (Part A). The model returns only
 * the slice it's responsible for — the *index* of the pair it picked (so it
 * cannot invent an airport), the prose, and optional VFR waypoints. It never
 * returns ICAO codes or distances; those are ours.
 *
 * `pairIndex` range is checked in code against the actual candidate count
 * (the schema can't know it).
 */
export const modelOutputSchema = z.object({
  pairIndex: z.number().int().nonnegative(),
  overview: z.string().min(1),
  why_this: z.string().min(1),
  waypoints: z.array(z.string().min(1)).max(5).optional(),
});

export type ModelOutput = z.infer<typeof modelOutputSchema>;
