import { getAircraft } from "./data/aircraft.js";
import { distanceBand } from "./lib/blockTime.js";
import { briefSchema } from "./schema.js";
import {
  TIME_BAND_MINUTES,
  type AircraftCategory,
  type TimeBand,
} from "./types.js";

/**
 * The five dials' canonical value lists, read straight off the `Brief` schema so
 * the client never re-declares them. Display labels/ordering are a UI concern;
 * the *set* of valid values is owned here.
 */
const dials = {
  timeBand: briefSchema.shape.timeBand.options,
  region: briefSchema.shape.region.options,
  rules: briefSchema.shape.rules.options,
  vibe: briefSchema.shape.vibe.options,
  aircraft: briefSchema.shape.aircraft.options,
  legCount: [1, 2, 3] as const,
} as const;

/** Every leg count the engine accepts (1–3). */
const LEG_COUNTS = dials.legCount;

/**
 * Precomputed time×aircraft viability for the brief builder's progressive
 * narrowing. `false` marks a cell the UI greys out: the aircraft's fixed
 * overhead consumes the whole time budget, so `distanceBand` returns null and no
 * leg is reachable (e.g. airliner in 20 min). Region, rules, and vibe are never
 * gated — they're soft constraints the candidate pipeline relaxes, never refuses,
 * so they're absent from this matrix by design.
 */
function buildViability(): Record<AircraftCategory, Record<TimeBand, boolean>> {
  const out = {} as Record<AircraftCategory, Record<TimeBand, boolean>>;
  for (const aircraft of dials.aircraft) {
    const row = {} as Record<TimeBand, boolean>;
    for (const timeBand of dials.timeBand) {
      row[timeBand] =
        distanceBand(TIME_BAND_MINUTES[timeBand], getAircraft(aircraft)) !== null;
    }
    out[aircraft] = row;
  }
  return out;
}

/**
 * The most legs each time×aircraft cell can sustain (0 if not even one leg fits).
 * Dividing the total budget across more legs shrinks each per-leg band until it
 * inverts, so viability is monotonic in leg count — the largest viable count is
 * the answer, and `distanceBand` already returns null on an inverted band. The UI
 * greys out any Legs option above this for the chosen time+aircraft.
 */
function buildMaxLegs(): Record<AircraftCategory, Record<TimeBand, number>> {
  const out = {} as Record<AircraftCategory, Record<TimeBand, number>>;
  for (const aircraft of dials.aircraft) {
    const row = {} as Record<TimeBand, number>;
    for (const timeBand of dials.timeBand) {
      let max = 0;
      for (const legCount of LEG_COUNTS) {
        if (
          distanceBand(TIME_BAND_MINUTES[timeBand], getAircraft(aircraft), legCount) !==
          null
        ) {
          max = legCount;
        }
      }
      row[timeBand] = max;
    }
    out[aircraft] = row;
  }
  return out;
}

/**
 * Static brief-builder metadata for the client: the dial value lists, the
 * time×aircraft viability matrix, and the max viable leg count per cell. Pure and
 * cheap — recomputed per call from the same constants the generator uses, so the
 * UI and the engine can't drift.
 */
export function flightOptions() {
  return { dials, viability: buildViability(), maxLegs: buildMaxLegs() };
}

export type FlightOptions = ReturnType<typeof flightOptions>;
