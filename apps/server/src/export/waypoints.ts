import { findNavaid } from "../data/navaids.js";
import type { Flight, FlightLeg, LatLon, Rules } from "../types.js";
import { findAirport } from "./airports.js";

/** A waypoint resolved for the .pln: a real navaid, or a user lat/lon point. */
export type ResolvedWaypoint =
  | { kind: "navaid"; ident: string; type: string; lat: number; lon: number }
  | { kind: "user"; ident: string; lat: number; lon: number };

/**
 * Resolve a VFR flight's scenic waypoint strings into typed .pln waypoints:
 *   - an ident that matches a navaid → a NAVAID waypoint (disambiguated by the
 *     departure airport's position when the ident is reused across regions);
 *   - a "lat,lon" string → a USER waypoint (ident WP1, WP2, …);
 *   - anything else → dropped (logged with the reason).
 * All dropped ⇒ empty list ⇒ the .pln is great-circle direct dep→dest.
 *
 * Non-VFR flights have no self-generated waypoints (IFR routes via SimBrief).
 */
export function resolveWaypoints(flight: Flight): ResolvedWaypoint[] {
  const leg = flight.legs[0];
  return leg ? resolveLegWaypoints(leg, flight.rules) : [];
}

/**
 * Resolve one leg's scenic waypoints. Multi-leg trips fly direct between stops,
 * so their legs carry no waypoints and this returns an empty list for them.
 */
export function resolveLegWaypoints(
  leg: FlightLeg,
  rules: Rules,
): ResolvedWaypoint[] {
  if (rules !== "VFR") return [];

  const dep = findAirport(leg.from_icao);
  const hint: LatLon | undefined = dep ? { lat: dep.lat, lon: dep.lon } : undefined;

  const resolved: ResolvedWaypoint[] = [];
  let userCount = 0;

  for (const raw of leg.waypoints) {
    const navaid = findNavaid(raw, hint);
    if (navaid) {
      resolved.push({
        kind: "navaid",
        ident: navaid.ident,
        type: navaid.type,
        lat: navaid.lat,
        lon: navaid.lon,
      });
      continue;
    }

    const ll = parseLatLon(raw);
    if (ll) {
      resolved.push({
        kind: "user",
        ident: `WP${++userCount}`,
        lat: ll.lat,
        lon: ll.lon,
      });
      continue;
    }

    console.warn(
      `[waypoints] dropped "${raw}" — not a known navaid ident and not a valid lat,lon.`,
    );
  }

  return resolved;
}

/** Parse "lat,lon" or "lat lon" decimals; null if not a valid coordinate pair. */
function parseLatLon(s: string): LatLon | null {
  const parts = s.trim().split(/[,\s]+/);
  if (parts.length !== 2) return null;
  const lat = Number(parts[0]);
  const lon = Number(parts[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat, lon };
}
