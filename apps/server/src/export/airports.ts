import { airportIndex } from "../data/index.js";
import type { Airport } from "../types.js";

/**
 * ICAO → Airport lookup for the export layer. Built once from the existing
 * in-memory airport index (no change to the Phase 1 index). The `Flight` only
 * carries idents, so the .pln writer and waypoint resolver re-resolve airport
 * coordinates/names/elevation here.
 */
const byIdent = new Map<string, Airport>();
for (const a of airportIndex.all) byIdent.set(a.ident, a);

export function findAirport(ident: string): Airport | undefined {
  return byIdent.get(ident.trim().toUpperCase());
}
