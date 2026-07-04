import type { BBox, LatLon } from "../types.js";

/** Earth mean radius in nautical miles. */
const EARTH_RADIUS_NM = 3440.065;

const toRad = (deg: number): number => (deg * Math.PI) / 180;

/**
 * Great-circle distance between two points, in nautical miles (haversine).
 *
 * Sanity check: EGLL (51.4706, -0.461941) → LFPG (49.0097, 2.5479) ≈ 190 NM.
 */
export function greatCircleNm(a: LatLon, b: LatLon): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_NM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Shortest distance from point `p` to the great-circle-ish segment `a`–`b`, in
 * nautical miles. Planar approximation in a local nm frame centred on `p`
 * (longitude scaled by cos(lat), 60 NM per degree): exact enough (<0.1%) at the
 * ≤ tens-of-NM scale this is used for — nearest-coastline tagging — while
 * avoiding spherical cross-track trig and its `acos` domain traps. Longitude
 * deltas are wrapped to ±180° so a segment across the antimeridian stays near.
 */
export function segmentDistanceNm(p: LatLon, a: LatLon, b: LatLon): number {
  const cosLat = Math.cos(toRad(p.lat));
  const wrapLon = (d: number): number => (d > 180 ? d - 360 : d < -180 ? d + 360 : d);
  const ax = wrapLon(a.lon - p.lon) * cosLat * 60;
  const ay = (a.lat - p.lat) * 60;
  const bx = wrapLon(b.lon - p.lon) * cosLat * 60;
  const by = (b.lat - p.lat) * 60;

  // Closest point on segment ab to the origin (p), clamped to the endpoints.
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? -(ax * dx + ay * dy) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.sqrt(cx * cx + cy * cy);
}

/**
 * Bounding box covering everything within `radiusNm` of `center`.
 *
 * Used as a cheap prefilter before the exact great-circle test so the query
 * never scans the whole index. 1° latitude ≈ 60 NM; longitude degrees shrink
 * with latitude. Latitude is clamped to the poles; if the box would span a
 * longitude range ≥ 360° (very high latitude) longitude is left unconstrained.
 */
export function boundingBox(center: LatLon, radiusNm: number): BBox {
  const latDelta = radiusNm / 60;
  const minLat = Math.max(-90, center.lat - latDelta);
  const maxLat = Math.min(90, center.lat + latDelta);

  const cosLat = Math.cos(toRad(center.lat));
  // Near the poles cosLat → 0; guard against blow-up by unconstraining longitude.
  if (cosLat < 1e-6) {
    return { minLat, maxLat, minLon: -180, maxLon: 180, lonWraps: false };
  }
  const lonDelta = radiusNm / (60 * cosLat);
  if (lonDelta >= 180) {
    return { minLat, maxLat, minLon: -180, maxLon: 180, lonWraps: false };
  }

  let minLon = center.lon - lonDelta;
  let maxLon = center.lon + lonDelta;
  let lonWraps = false;
  if (minLon < -180) {
    minLon += 360;
    lonWraps = true;
  }
  if (maxLon > 180) {
    maxLon -= 360;
    lonWraps = true;
  }
  return { minLat, maxLat, minLon, maxLon, lonWraps };
}

/** Whether a point falls inside a bounding box (handles antimeridian wrap). */
export function inBoundingBox(p: LatLon, box: BBox): boolean {
  if (p.lat < box.minLat || p.lat > box.maxLat) return false;
  if (box.lonWraps) {
    // Box straddles ±180: point is inside if it's east of min OR west of max.
    return p.lon >= box.minLon || p.lon <= box.maxLon;
  }
  return p.lon >= box.minLon && p.lon <= box.maxLon;
}
