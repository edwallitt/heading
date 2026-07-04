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
  | "africa"
  | "asia"
  | "oceania"
  | "caribbean";

/**
 * Vibe tags. "mountain"/"coastal"/"urban" are computed at build time (cheap
 * heuristics — §4); "notable" is a curated tag applied at load from a hand-
 * written list (data/notable.ts). Additive per airport.
 */
export type VibeTag = "mountain" | "coastal" | "urban" | "notable";

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
  /** Longest open PAVED runway (ft); 0 if every runway is unpaved. */
  longest_paved_rwy_ft: number;
  /**
   * Proxy for published instrument procedures (ILS/RNAV, SIDs/STARs):
   * scheduled airline service or a large airport. OurAirports has no
   * procedure data, so this is coarse — it misses well-equipped GA fields
   * (e.g. KTEB) but never admits a procedure-less strip.
   */
  ifr_capable: boolean;
  vibe_tags: VibeTag[];
}

/**
 * Baked enroute navaid (radio beacon), loaded into memory at boot. A compact
 * row for VFR scenic-waypoint routing — frequency/DME/variation fields are
 * intentionally omitted (not needed to name a waypoint).
 */
export interface Navaid {
  ident: string;
  name: string;
  type: string;
  lat: number;
  lon: number;
  country: string;
}

/** Number of legs in a trip: 1 (a single hop) to 3 (an open chain A→B→C). */
export type LegCount = 1 | 2 | 3;

/**
 * The six dials (§3). `region: "anywhere"` and `vibe: "any"` mean no filter.
 * `legCount` &gt; 1 requests an open multi-stop chain; the time budget is spread
 * across all legs (each leg carries the aircraft's fixed overhead).
 */
export interface Brief {
  timeBand: TimeBand;
  region: Region | "anywhere";
  rules: Rules | "any";
  vibe: VibeTag | "any";
  aircraft: AircraftCategory;
  legCount: LegCount;
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

/** METAR-derived flight category (standard aviation colour coding). */
export type FlightCategory = "VFR" | "MVFR" | "IFR" | "LIFR";

/**
 * Live surface weather at one airport, decoded from its latest METAR. A
 * snapshot at dispatch time — permalinks carry it as-is (see `observed_utc`).
 * Any field the report omits is null; category treats unknowns as unlimited.
 */
export interface AirportWeather {
  icao: string;
  /** The raw METAR text, verbatim. */
  raw: string;
  category: FlightCategory;
  /** Wind direction (°true); null = variable or unreported. */
  wind_dir_deg: number | null;
  wind_kt: number | null;
  gust_kt: number | null;
  visibility_sm: number | null;
  /** Lowest broken/overcast/obscured layer (ft AGL); null = no ceiling. */
  ceiling_ft: number | null;
  temp_c: number | null;
  /** Observation time (ISO UTC); null if unreported. */
  observed_utc: string | null;
}

/**
 * Golden-hour dispatch suggestion: sim times (UTC ISO) such that departing at
 * `depart_utc` touches down at the destination just as the golden hour begins.
 * Computed from today's sun at the final stop; absent in polar day/night.
 */
export interface GoldenHour {
  dest_icao: string;
  depart_utc: string;
  arrive_utc: string;
  sunset_utc: string;
}

/**
 * A resolved VFR scenic waypoint on a leg: a named navaid (validated against
 * the baked dataset and the leg's corridor at generation time) or a raw
 * lat/lon point. Coordinates are always present, so the map and the .pln
 * writer never re-resolve idents.
 */
export interface Waypoint {
  /** Navaid ident (e.g. "WIL"), or "WP1", "WP2"… for raw lat/lon points. */
  ident: string;
  kind: "navaid" | "user";
  lat: number;
  lon: number;
  /** Navaid name (e.g. "Willisau") — navaid waypoints only. */
  name?: string;
  /** Navaid type (e.g. "VOR-DME", "NDB") — navaid waypoints only. */
  type?: string;
}

/** One leg of a flight (§8). A flight has one leg per hop (1–3). */
export interface FlightLeg {
  from_icao: string;
  to_icao: string;
  /** Human-readable airport names, for the dispatch card header. */
  from_name: string;
  to_name: string;
  /** Endpoint coordinates, for the route map and fit-bounds. */
  from_lat: number;
  from_lon: number;
  to_lat: number;
  to_lon: number;
  dist_nm: number;
  /**
   * Cruise altitude for THIS leg: feet (VFR, e.g. "7500") or "FLxxx" (IFR).
   * Per-leg because the VFR hemispheric rule is track-dependent — an eastbound
   * and a westbound leg of the same trip take different legal altitudes.
   */
  cruise_level: string;
  /** VFR scenic waypoints (resolved, on-corridor); empty = great-circle direct. */
  waypoints: Waypoint[];
}

/**
 * A generated, validated flight (§8). Transient — lives in the response, never
 * persisted. Distances, block time, and cruise level are computed by our libs,
 * never trusted from the model.
 */
export interface Flight {
  brief: Brief;
  /** ICAO type designator the LLM/template names (from the aircraft profile). */
  aircraft_type: string;
  /** Cruise altitude as a string: feet (VFR, e.g. "7500") or "FLxxx" (IFR). */
  cruise_level: string;
  est_block_min: number;
  rules: Rules;
  overview: string;
  why_this: string;
  legs: FlightLeg[];
  /** What (if anything) was relaxed, for the honest result-card note. */
  relaxed: string[];
  /** "llm" = Opus picked & wrote it; "fallback" = algorithmic pick + template. */
  source: "llm" | "fallback";
  /** Live METARs for the trip's stops, in stop order (stations that reported). */
  weather?: AirportWeather[];
  /** Golden-hour timing suggestion for the final stop (absent in polar day/night). */
  golden_hour?: GoldenHour;
  /** SimBrief dispatch URL (Phase 3) — present for every flight. */
  simbrief_url?: string;
  /** Self-generated MSFS 2024 VFR .pln XML (Phase 3) — VFR only; absent for IFR. */
  pln?: string;
  /** Suggested download filename for the .pln, e.g. "LSZG-LSZS.pln" (VFR only). */
  pln_filename?: string;
}
