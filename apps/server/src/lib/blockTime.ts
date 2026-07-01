import type { AircraftProfile } from "../data/aircraft.js";
import type { DistanceBand } from "../types.js";

/**
 * ± tolerance applied to the block-time distance band. A brief targets a
 * distance *range*, not an exact value, so legs a bit shorter/longer than the
 * nominal still qualify.
 */
export const BAND_TOLERANCE = 0.15;

/**
 * Reachable PER-LEG distance band for a time budget under the block-time model
 * (§3), for a trip of `legCount` legs:
 *
 *   cruise_distance_per_leg = ((time_budget − legCount × overhead) / legCount) × cruise_TAS
 *
 * The time budget is the WHOLE trip. Every leg carries the aircraft's fixed
 * overhead (taxi + climb + descent), so an N-leg trip spends N × overhead before
 * any cruising, and the remaining cruise time is split evenly across the legs.
 * With `legCount = 1` this is exactly the single-hop formula.
 *
 * Only the cruise *portion* of the budget counts — a short jet leg is mostly
 * climb and descent, so multiplying the whole budget by cruise TAS would badly
 * overestimate. Returns `null` when the budget can't fit `legCount` legs (e.g.
 * airliner × 3 legs in 20 min): either the overhead alone exhausts the budget,
 * or dividing it shrinks the per-leg band until its floor (climb+descent
 * distance) meets its ceiling — an empty band, which is *why* that leg count
 * greys out in the matrix.
 *
 * The lower edge is floored at the climb+descent distance (you can't fly a leg
 * shorter than the profile needs) and the upper edge is capped at the aircraft's
 * range.
 */
export function distanceBand(
  timeBudgetMin: number,
  aircraft: AircraftProfile,
  legCount = 1,
): DistanceBand | null {
  const cruiseMin = timeBudgetMin - legCount * aircraft.overhead_min;
  if (cruiseMin <= 0) return null;

  const perLegCruiseMin = cruiseMin / legCount;
  const center = (perLegCruiseMin / 60) * aircraft.cruise_tas;
  const minNm = Math.max(center * (1 - BAND_TOLERANCE), aircraft.climb_descent_nm);
  const maxNm = Math.min(center * (1 + BAND_TOLERANCE), aircraft.range_nm);

  if (minNm >= maxNm) return null;
  return { minNm, maxNm };
}

/**
 * Estimated block time (minutes) to cover `distanceNm` — the inverse of the
 * band model: fixed overhead plus cruise time at TAS. This is block time
 * (taxi+climb+cruise+descent+taxi), not cruise-only.
 */
export function estBlockMin(
  distanceNm: number,
  aircraft: AircraftProfile,
): number {
  return aircraft.overhead_min + (distanceNm / aircraft.cruise_tas) * 60;
}
