import type { AircraftCategory, Rules } from "../types.js";

/**
 * Per-category performance profile (§3). Drives the block-time distance band,
 * the runway filter, and the default flight rules. All values are tunable
 * constants — bias them toward your owned MSFS fleet so estimates stay
 * trustworthy.
 */
export interface AircraftProfile {
  category: AircraftCategory;
  /** Cruise true airspeed, knots. */
  cruise_tas: number;
  /** Service ceiling, feet. */
  ceiling_ft: number;
  /** Fixed block-time overhead (taxi + climb + descent), minutes. */
  overhead_min: number;
  /** Distance covered in climb + descent, NM — used as the band's lower floor. */
  climb_descent_nm: number;
  /** Minimum usable runway length, feet. */
  min_rwy_ft: number;
  /** Runway filter counts only paved runways (jets can't use grass/gravel). */
  paved_rwy_only: boolean;
  /**
   * Restrict to airports with (proxied) published instrument procedures —
   * ILS/RNAV approaches and SIDs/STARs. See Airport.ifr_capable.
   */
  ifr_capable_only: boolean;
  /** Default flight rules for the category. */
  default_rules: Rules;
  /** Sample SimBrief type designator (flavour / Phase 3). */
  simbrief_type: string;
  /** Practical range, NM — caps the upper end of the distance band. */
  range_nm: number;
}

/** Curated, committed aircraft category profiles (Part A). */
export const AIRCRAFT: readonly AircraftProfile[] = [
  {
    category: "small_prop",
    cruise_tas: 120,
    ceiling_ft: 10000,
    overhead_min: 12,
    climb_descent_nm: 15,
    min_rwy_ft: 1500,
    paved_rwy_only: false,
    ifr_capable_only: false,
    default_rules: "VFR",
    simbrief_type: "C172",
    range_nm: 600,
  },
  {
    category: "turboprop",
    cruise_tas: 250,
    ceiling_ft: 25000,
    overhead_min: 20,
    climb_descent_nm: 50,
    min_rwy_ft: 3000,
    paved_rwy_only: false,
    ifr_capable_only: false,
    default_rules: "VFR",
    simbrief_type: "TBM9",
    range_nm: 1500,
  },
  {
    category: "regional_jet",
    cruise_tas: 440,
    ceiling_ft: 41000,
    overhead_min: 30,
    climb_descent_nm: 120,
    // 6000 ft paved covers CRJ700/E190-class field lengths with margin.
    min_rwy_ft: 6000,
    paved_rwy_only: true,
    ifr_capable_only: true,
    default_rules: "IFR",
    simbrief_type: "E190",
    range_nm: 2000,
  },
  {
    category: "airliner",
    cruise_tas: 470,
    ceiling_ft: 41000,
    overhead_min: 35,
    climb_descent_nm: 150,
    min_rwy_ft: 7000,
    paved_rwy_only: true,
    ifr_capable_only: true,
    default_rules: "IFR",
    simbrief_type: "A320",
    range_nm: 3500,
  },
] as const;

const BY_CATEGORY = new Map<AircraftCategory, AircraftProfile>(
  AIRCRAFT.map((a) => [a.category, a]),
);

/** Look up a profile by category. Throws on an unknown category. */
export function getAircraft(category: AircraftCategory): AircraftProfile {
  const profile = BY_CATEGORY.get(category);
  if (!profile) throw new Error(`Unknown aircraft category: ${category}`);
  return profile;
}
