import type { Region } from "../../src/types.js";

/**
 * Maps OurAirports continent codes + ISO country to one of the six Heading
 * regions (§3). Committed mapping — no external dataset.
 *
 * Notes / deliberate limitations:
 * - Africa (AF) and Antarctica (AN) have no Heading region and are dropped at
 *   build time (the brief offers no Africa/Antarctica filter).
 * - Caribbean is a sub-bucket of the NA continent, selected by ISO country so
 *   island-hopping is its own region (§3). Mainland Central-American countries
 *   (e.g. Belize) stay in north_america.
 */

/** OurAirports continent codes. */
type Continent = "NA" | "SA" | "EU" | "AS" | "OC" | "AF" | "AN";

const CONTINENT_REGION: Partial<Record<Continent, Region>> = {
  NA: "north_america",
  SA: "south_america",
  EU: "europe",
  AS: "asia",
  OC: "oceania",
  // AF / AN: intentionally absent → dropped.
};

/** ISO 3166-1 alpha-2 codes treated as Caribbean (island nations/territories). */
const CARIBBEAN_ISO = new Set<string>([
  "AG", "AI", "AW", "BB", "BL", "BQ", "BS", "CU", "CW", "DM", "DO", "GD",
  "GP", "HT", "JM", "KN", "KY", "LC", "MF", "MQ", "MS", "PR", "SX", "TC",
  "TT", "VC", "VG", "VI",
]);

/**
 * Resolve an airport's region, or null if it has none (Africa/Antarctica, or an
 * unrecognised/empty continent — counted and dropped by the caller).
 */
export function resolveRegion(
  continent: string,
  isoCountry: string,
): Region | null {
  const iso = isoCountry.trim().toUpperCase();
  if (CARIBBEAN_ISO.has(iso)) return "caribbean";
  const region = CONTINENT_REGION[continent.trim().toUpperCase() as Continent];
  return region ?? null;
}
