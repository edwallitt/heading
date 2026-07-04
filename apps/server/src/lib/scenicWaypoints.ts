import type { LatLon, Navaid, Waypoint } from "../types.js";
import type { CandidateChain, ChainLeg } from "./candidatePairs.js";
import { greatCircleNm } from "./geo.js";

/**
 * Scenic VFR waypoint geometry — the corridor test that keeps model-suggested
 * waypoints honest, applied on both sides of the LLM call:
 *
 *   - BEFORE: `suggestNavaids` finds real navaids near each candidate chain's
 *     route, so the prompt can offer pre-validated idents to pick from;
 *   - AFTER: `assignWaypoints` resolves the model's flat, fly-order waypoint
 *     list (navaid idents or "lat,lon" strings), assigns each to the leg it
 *     detours least from, and drops anything too far off any leg's course.
 *
 * The geometric assignment means the model never has to say which leg a
 * waypoint belongs to — nesting mistakes can't corrupt the route.
 */

/** Max scenic waypoints kept per leg; extras are dropped in arrival order. */
export const MAX_WAYPOINTS_PER_LEG = 4;

/** Max navaid suggestions offered per candidate chain in the prompt. */
const MAX_SUGGESTIONS_PER_CHAIN = 8;

/**
 * How far off the direct course a waypoint may sit, expressed as the extra
 * distance the detour origin → waypoint → destination adds over the leg:
 * 20% of the leg, floored at 15 NM so short hops can still reach a beacon.
 */
export function corridorNm(legDistNm: number): number {
  return Math.max(15, 0.2 * legDistNm);
}

/** Extra distance flying origin → p → destination adds over the direct leg. */
function detourNm(leg: ChainLeg, p: LatLon): number {
  return (
    greatCircleNm(leg.origin, p) +
    greatCircleNm(p, leg.destination) -
    leg.distanceNm
  );
}

/**
 * Real navaids near a chain's route, for the prompt's per-trip "navaids:"
 * list: within some leg's corridor, deduped by ident (keeping the closest),
 * sorted by how little they detour the course, capped.
 */
export function suggestNavaids(
  chain: CandidateChain,
  navaids: readonly Navaid[],
): Navaid[] {
  const best = new Map<string, { navaid: Navaid; detour: number }>();
  for (const leg of chain.legs) {
    const corridor = corridorNm(leg.distanceNm);
    const midLat = (leg.origin.lat + leg.destination.lat) / 2;
    // Anything on the corridor is within reach of the leg midpoint; a cheap
    // latitude-difference reject (1° ≈ 60 NM) skips most of the world.
    const reachNm = leg.distanceNm / 2 + corridor;
    for (const n of navaids) {
      if (Math.abs(n.lat - midLat) * 60 > reachNm) continue;
      const detour = detourNm(leg, n);
      if (detour > corridor) continue;
      const cur = best.get(n.ident);
      if (!cur || detour < cur.detour) best.set(n.ident, { navaid: n, detour });
    }
  }
  return [...best.values()]
    .sort((a, b) => a.detour - b.detour)
    .slice(0, MAX_SUGGESTIONS_PER_CHAIN)
    .map((e) => e.navaid);
}

/**
 * Resolve the model's flat waypoint list into per-leg scenic waypoints:
 *   - a navaid ident → the dataset entry (idents are reused worldwide, so
 *     every entry competes and the corridor picks the right one);
 *   - a "lat,lon" string → a user waypoint (ident WP1, WP2, … in accept order);
 *   - anything unresolvable or outside every leg's corridor → dropped.
 * Each accepted waypoint goes to the leg it detours least, capped per leg,
 * then sorted into fly order (distance from that leg's origin).
 */
export function assignWaypoints(
  raw: string[],
  legs: ChainLeg[],
  navaids: readonly Navaid[],
): Waypoint[][] {
  const buckets: Waypoint[][] = legs.map(() => []);
  let userCount = 0;

  for (const s of raw) {
    let best: { legIndex: number; waypoint: Waypoint; detour: number } | null =
      null;
    for (const candidate of candidateWaypoints(s, navaids)) {
      for (let i = 0; i < legs.length; i++) {
        const leg = legs[i]!;
        const detour = detourNm(leg, candidate);
        if (detour > corridorNm(leg.distanceNm)) continue;
        if (!best || detour < best.detour) {
          best = { legIndex: i, waypoint: candidate, detour };
        }
      }
    }
    if (!best) {
      console.warn(
        `[waypoints] dropped "${s}" — not a known navaid or "lat,lon", or off every leg's course.`,
      );
      continue;
    }
    const bucket = buckets[best.legIndex]!;
    if (bucket.length >= MAX_WAYPOINTS_PER_LEG) continue;
    const wp = best.waypoint;
    bucket.push(wp.kind === "user" ? { ...wp, ident: `WP${++userCount}` } : wp);
  }

  buckets.forEach((bucket, i) => {
    const origin = legs[i]!.origin;
    bucket.sort(
      (a, b) => greatCircleNm(origin, a) - greatCircleNm(origin, b),
    );
  });
  return buckets;
}

/**
 * All the points a waypoint string could mean: every navaid sharing the ident
 * (case-insensitive), or the parsed coordinate as a placeholder user waypoint
 * (numbered by the caller on acceptance). Empty when it's neither.
 */
function candidateWaypoints(s: string, navaids: readonly Navaid[]): Waypoint[] {
  const ident = s.trim().toUpperCase();
  const named = navaids
    .filter((n) => n.ident.toUpperCase() === ident)
    .map(
      (n): Waypoint => ({
        ident: n.ident,
        kind: "navaid",
        lat: n.lat,
        lon: n.lon,
        name: n.name,
        type: n.type,
      }),
    );
  if (named.length > 0) return named;

  const ll = parseLatLon(s);
  return ll ? [{ ident: "WP", kind: "user", lat: ll.lat, lon: ll.lon }] : [];
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
