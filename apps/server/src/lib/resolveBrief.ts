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
  /** Per-leg reachable distance band (the total budget divided across legs). */
  distanceBand: DistanceBand | null;
  /** How many legs the trip should have (1–3). */
  legCount: number;
  minRunwayFt: number;
  /** Count only paved runways toward the runway minimum. */
  pavedRwyOnly: boolean;
  /** Require airports with (proxied) instrument procedures. */
  ifrCapableOnly: boolean;
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
    // Per-leg band: the seed leg and every extension leg share the same band, so
    // a multi-leg chain fits the total budget instead of N full-budget legs.
    distanceBand: distanceBand(minutes, aircraft, brief.legCount),
    legCount: brief.legCount,
    minRunwayFt: aircraft.min_rwy_ft,
    pavedRwyOnly: aircraft.paved_rwy_only,
    ifrCapableOnly: aircraft.ifr_capable_only,
    ceilingFt: aircraft.ceiling_ft,
    // "any" defers to the category default; otherwise the explicit choice holds.
    rules: brief.rules === "any" ? aircraft.default_rules : brief.rules,
    region: brief.region,
    vibeTags: brief.vibe === "any" ? [] : [brief.vibe],
  };
}
