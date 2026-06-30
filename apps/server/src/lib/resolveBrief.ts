import { getAircraft, type AircraftProfile } from "../data/aircraft.js";
import {
  TIME_BAND_MINUTES,
  type Brief,
  type DistanceBand,
  type Region,
  type Rules,
  type VibeTag,
} from "../types.js";
import { distanceBand } from "./blockTime.js";

/**
 * The brief's five dials resolved to numeric/typed constraints (§4). Hard
 * constraints (distance band, runway, ceiling, rules, region) must hold; the
 * vibe is soft and the only relaxable one. `distanceBand` is null for an empty
 * band (budget ≤ overhead), which yields no candidates.
 */
export interface ResolvedConstraints {
  aircraft: AircraftProfile;
  distanceBand: DistanceBand | null;
  minRunwayFt: number;
  ceilingFt: number;
  rules: Rules;
  region: Region | "anywhere";
  /** Requested vibe tags; empty means no vibe filter. */
  vibeTags: VibeTag[];
}

/** Resolve a brief into constraints. Pure — no data access. */
export function resolveBrief(brief: Brief): ResolvedConstraints {
  const aircraft = getAircraft(brief.aircraft);
  const minutes = TIME_BAND_MINUTES[brief.timeBand];

  return {
    aircraft,
    distanceBand: distanceBand(minutes, aircraft),
    minRunwayFt: aircraft.min_rwy_ft,
    ceilingFt: aircraft.ceiling_ft,
    // "any" defers to the category default; otherwise the explicit choice holds.
    rules: brief.rules === "any" ? aircraft.default_rules : brief.rules,
    region: brief.region,
    vibeTags: brief.vibe === "any" ? [] : [brief.vibe],
  };
}
