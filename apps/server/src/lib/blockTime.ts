import type { AircraftProfile } from "../data/aircraft.js";
import type { DistanceBand } from "../types.js";

/**
 * ± tolerance applied to the block-time distance band. A brief targets a
 * distance *range*, not an exact value, so legs a bit shorter/longer than the
 * nominal still qualify.
 */
export const BAND_TOLERANCE = 0.15;

/**
 * Reachable distance band for a time budget under the block-time model (§3):
 *
 *   cruise_distance = (time_budget − fixed_overhead) × cruise_TAS
 *
 * Only the cruise *portion* of the budget counts — a short jet leg is mostly
 * climb and descent, so multiplying the whole budget by cruise TAS would badly
 * overestimate. Returns `null` when the budget is at or below the category's
 * fixed overhead (e.g. airliner in 20 min) — an empty band, which is *why* that
 * cell greys out in the matrix.
 *
 * The lower edge is floored at the climb+descent distance (you can't fly a leg
 * shorter than the profile needs) and the upper edge is capped at the aircraft's
 * range.
 */
export function distanceBand(
  timeBudgetMin: number,
  aircraft: AircraftProfile,
): DistanceBand | null {
  const cruiseMin = timeBudgetMin - aircraft.overhead_min;
  if (cruiseMin <= 0) return null;

  const center = (cruiseMin / 60) * aircraft.cruise_tas;
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
