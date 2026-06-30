/**
 * Core domain types for Heading's data layer (Phase 1).
 *
 * These are server-side types. Per the project's router rule, only the
 * `AppRouter` type flows through `packages/shared`; domain logic and its types
 * live here in `apps/server`.
 */

/** Aircraft performance category — the filtering bucket (a specific plane is flavour). */
export type AircraftCategory =
  | "small_prop"
  | "turboprop"
  | "regional_jet"
  | "airliner";

/** Flight rules. `any` lets later phases infer from aircraft + distance. */
export type Rules = "VFR" | "IFR";

/** Coarse geographic region. "anywhere" is the *absence* of a filter, never stored. */
export type Region =
  | "north_america"
  | "south_america"
  | "europe"
  | "asia"
  | "oceania"
  | "caribbean";

/** Vibe tags computed at build time (cheap heuristics — §4). Additive per airport. */
export type VibeTag = "mountain" | "coastal" | "urban";

/**
 * Time-available dial (§3). Maps to a block-time budget in minutes.
 * "long_haul" is capped so the candidate query stays bounded (§3).
 */
export type TimeBand = "20min" | "45min" | "1hr" | "2hr" | "3-5hr" | "long_haul";

/** Budget in minutes for each time band (§3 dial values). */
export const TIME_BAND_MINUTES: Record<TimeBand, number> = {
  "20min": 20,
  "45min": 45,
  "1hr": 60,
  "2hr": 120,
  "3-5hr": 240,
  long_haul: 480,
};

/** A point on the globe. `Airport` is assignable to this. */
export interface LatLon {
  lat: number;
  lon: number;
}

/** Baked reference airport, loaded into memory at boot (§8). Read-only. */
export interface Airport {
  ident: string;
  name: string;
  type: string;
  iso_country: string;
  region: Region;
  lat: number;
  lon: number;
  elev_ft: number;
  longest_rwy_ft: number;
  vibe_tags: VibeTag[];
}

/**
 * The five dials (§3). `region: "anywhere"` and `vibe: "any"` mean no filter.
 */
export interface Brief {
  timeBand: TimeBand;
  region: Region | "anywhere";
  rules: Rules | "any";
  vibe: VibeTag | "any";
  aircraft: AircraftCategory;
}

/** A geographic bounding box (degrees). `lonWraps` flags antimeridian crossing. */
export interface BBox {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
  lonWraps: boolean;
}

/** Inclusive distance band in nautical miles. */
export interface DistanceBand {
  minNm: number;
  maxNm: number;
}

/** A scored origin→destination candidate. */
export interface CandidatePair {
  origin: Airport;
  destination: Airport;
  distanceNm: number;
  estBlockMin: number;
  /** Count of requested vibe tags present across both endpoints (soft-rank key). */
  vibeScore: number;
}
