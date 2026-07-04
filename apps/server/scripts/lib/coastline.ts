import { segmentDistanceNm } from "../../src/lib/geo.js";
import type { LatLon } from "../../src/types.js";

/**
 * Build-time nearest-coastline index over a Natural Earth `ne_10m_coastline`
 * GeoJSON. Coastline features are ocean shoreline LineStrings (lakeshores live
 * in a separate NE file, so lake-side fields are deliberately not "coastal").
 *
 * Segments are binned into a 1°×1° grid by their bounding box; a nearest-coast
 * query then scans only the airport's cell and its eight neighbours (~60 NM
 * reach), which comfortably covers any sane coastal threshold. Pure/in-memory —
 * used only by build-airports.ts, never at runtime.
 */

type Segment = readonly [LatLon, LatLon];

/** 1°×1° grid: "lat:lon" cell → segments whose bbox overlaps that cell. */
export type CoastlineIndex = Map<string, Segment[]>;

const cellKey = (lat: number, lon: number): string => `${lat}:${lon}`;

interface GeoJson {
  features: {
    geometry: {
      type: string;
      coordinates: number[][] | number[][][];
    };
  }[];
}

export function buildCoastlineIndex(geojsonText: string): CoastlineIndex {
  const fc = JSON.parse(geojsonText) as GeoJson;
  const grid: CoastlineIndex = new Map();

  const addSegment = (a: LatLon, b: LatLon): void => {
    const seg: Segment = [a, b];
    const latMin = Math.floor(Math.min(a.lat, b.lat));
    const latMax = Math.floor(Math.max(a.lat, b.lat));
    const lonMin = Math.floor(Math.min(a.lon, b.lon));
    const lonMax = Math.floor(Math.max(a.lon, b.lon));
    for (let la = latMin; la <= latMax; la++) {
      for (let lo = lonMin; lo <= lonMax; lo++) {
        const key = cellKey(la, lo);
        const bucket = grid.get(key);
        if (bucket) bucket.push(seg);
        else grid.set(key, [seg]);
      }
    }
  };

  // GeoJSON coordinates are [lon, lat] — the rest of the codebase is {lat, lon}.
  const addLine = (coords: number[][]): void => {
    for (let i = 1; i < coords.length; i++) {
      const p0 = coords[i - 1]!;
      const p1 = coords[i]!;
      addSegment({ lat: p0[1]!, lon: p0[0]! }, { lat: p1[1]!, lon: p1[0]! });
    }
  };

  for (const f of fc.features) {
    const g = f.geometry;
    if (g.type === "LineString") {
      addLine(g.coordinates as number[][]);
    } else if (g.type === "MultiLineString") {
      for (const line of g.coordinates as number[][][]) addLine(line);
    }
  }
  return grid;
}

/**
 * Shortest distance from (lat, lon) to any coastline segment, in NM. Scans the
 * airport's 1° cell and its eight neighbours only; returns Infinity if no
 * coastline is within that ~60 NM window (i.e. deep inland).
 */
export function distanceToCoastNm(
  index: CoastlineIndex,
  lat: number,
  lon: number,
): number {
  const p: LatLon = { lat, lon };
  const latC = Math.floor(lat);
  const lonC = Math.floor(lon);
  let best = Infinity;
  for (let dla = -1; dla <= 1; dla++) {
    for (let dlo = -1; dlo <= 1; dlo++) {
      let lo = lonC + dlo;
      if (lo < -180) lo += 360;
      else if (lo > 179) lo -= 360; // wrap longitude cells at the antimeridian
      const bucket = index.get(cellKey(latC + dla, lo));
      if (!bucket) continue;
      for (const [a, b] of bucket) {
        const d = segmentDistanceNm(p, a, b);
        if (d < best) best = d;
      }
    }
  }
  return best;
}
