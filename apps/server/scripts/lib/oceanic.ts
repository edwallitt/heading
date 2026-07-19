/**
 * Build-time lookup for the "oceanic" vibe tag (the *long overwater* operational
 * vibe).
 *
 * A true overwater test is a property of the ROUTE, not the airport: you would
 * need land polygons and a per-leg water-crossing test. The candidate pipeline,
 * though, treats vibe as an airport-level tag (a destination filter plus a soft
 * score), so a leg predicate would change that abstraction at all three ranking
 * sites for one fuzzy signal.
 *
 * Instead this is a documented proxy in the same spirit as `ifr_capable`: an
 * airport counts as oceanic when it sits on an island or archipelago with no
 * land route out, so essentially every leg to or from it crosses open water.
 * Legs *between* two such fields (Caribbean and Pacific island-hopping) are the
 * strongest case; a mainland→island leg is the classic airline overwater sector.
 *
 * Two levels, because territory matters more than nationality — Madeira is
 * oceanic, Lisbon is not, and both are "PT":
 *
 * - `OCEANIC_COUNTRIES` — island nations where every field qualifies.
 * - `OCEANIC_REGIONS` — `iso_region` codes for island territories of otherwise
 *   mainland countries. `iso_region` is the right key here: `iso_country` lumps
 *   the Azores in with Iberia, and ICAO prefixes do the same.
 *
 * Deliberately excluded: large landmasses where flying is mostly overland even
 * though they are technically islands — Great Britain (GB-ENG/SCT/WLS),
 * Australia, Japan's Honshu, Java, Borneo, Madagascar, New Zealand's main
 * islands. Greenland and Iceland are likewise overland-dominated at GA range.
 */

/**
 * Island *nations* — every airport in these countries is oceanic. Small enough
 * that any departure is over water within minutes.
 */
export const OCEANIC_COUNTRIES: ReadonlySet<string> = new Set([
  // Caribbean
  "AG", "AI", "AW", "BB", "BL", "BM", "BQ", "BS", "CU", "CW", "DM", "DO", "GD",
  "GP", "HT", "JM", "KN", "KY", "LC", "MF", "MQ", "MS", "PR", "SX", "TC", "TT",
  "VC", "VG", "VI",
  // Atlantic / Indian Ocean
  "CV", "FK", "GS", "IO", "KM", "MU", "MV", "SC", "SH", "ST", "TF",
  // Pacific
  "AS", "CK", "FJ", "FM", "GU", "KI", "MH", "MP", "NC", "NF", "NR", "NU", "PF",
  "PW", "SB", "TK", "TO", "TV", "VU", "WF", "WS",
  // South-east Asian island states with no land route out
  "TL",
  // Mediterranean / other
  "CY", "MT",
]);

/**
 * Island *territories* of mainland countries, keyed by OurAirports `iso_region`.
 * Format is `<ISO country>-<subdivision>`.
 */
export const OCEANIC_REGIONS: ReadonlySet<string> = new Set([
  // Portugal — Azores, Madeira
  "PT-20", "PT-30",
  // Spain — Canaries, Balearics
  "ES-CN", "ES-PM",
  // United States — Hawaii
  "US-HI",
  // Ecuador — Galápagos
  "EC-W",
  // France — Corsica (2A/2B)
  "FR-2A", "FR-2B",
  // Italy — Sardinia, Sicily, Pantelleria sits in SIC
  "IT-88", "IT-82",
  // Greece — the Aegean and Ionian island peripheries
  "GR-K", "GR-L", "GR-F",
  // Norway — Svalbard, Jan Mayen
  "SJ-21", "SJ-22",
  // Denmark — Faroes
  "FO-U-A",
  // Chile — Easter Island / Juan Fernández (Valparaíso region)
  "CL-VS",
  // Yemen — Socotra
  "YE-SU",
  // Australia — external island territories (Christmas, Cocos, Norfolk, Lord Howe)
  "AU-CX", "AU-CC",
  // Colombia — San Andrés y Providencia
  "CO-SAP",
  // Honduras — Bay Islands
  "HN-IB",
  // Venezuela — Nueva Esparta (Margarita), Federal Dependencies
  "VE-O", "VE-W",
  // Malaysia — no; Indonesia handled by size. Maldives/Seychelles are countries.
]);

/** True if an airport's country or region makes it oceanic. */
export function isOceanic(isoCountry: string, isoRegion: string): boolean {
  return (
    OCEANIC_COUNTRIES.has(isoCountry.trim().toUpperCase()) ||
    OCEANIC_REGIONS.has(isoRegion.trim().toUpperCase())
  );
}
