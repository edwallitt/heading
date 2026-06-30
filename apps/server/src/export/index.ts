import type { Flight } from "../types.js";
import { buildVfrPln } from "./pln.js";
import { buildSimbriefUrl } from "./simbrief.js";

export { buildSimbriefUrl } from "./simbrief.js";
export { buildVfrPln } from "./pln.js";
export { resolveWaypoints, type ResolvedWaypoint } from "./waypoints.js";

/** Suggested .pln download filename, e.g. "LSZG-LSZS.pln". */
export function plnFilename(flight: Flight): string {
  const leg = flight.legs[0]!;
  return `${leg.from_icao}-${leg.to_icao}.pln`;
}

/**
 * Attach the Phase 3 export artifacts to a Flight: the SimBrief URL (always) and,
 * for VFR, the self-generated .pln plus a suggested filename. Pure and stateless —
 * the XML is returned inline (it's small); nothing is persisted.
 */
export function withExports(flight: Flight): Flight {
  const simbrief_url = buildSimbriefUrl(flight);
  if (flight.rules !== "VFR") {
    return { ...flight, simbrief_url };
  }
  const pln = buildVfrPln(flight) ?? undefined;
  return { ...flight, simbrief_url, pln, pln_filename: plnFilename(flight) };
}
