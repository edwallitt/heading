import { inBoundingBox } from "../lib/geo.js";
import type { Airport, BBox, Region } from "../types.js";

/**
 * Typed in-memory index over the baked airport set. Pure data structure: build
 * it from any `Airport[]` (the generated asset at boot, or fixtures in tests).
 *
 * A region map plus a bounding-box scan keep the candidate-pair query fast
 * without a database — queries never scan the whole set unless the region is
 * "anywhere".
 */
export class AirportIndex {
  readonly all: readonly Airport[];
  private readonly byRegionMap: Map<Region, Airport[]>;

  constructor(airports: readonly Airport[]) {
    // Sort once by ident so every downstream query is deterministic.
    this.all = [...airports].sort((a, b) => a.ident.localeCompare(b.ident));
    this.byRegionMap = new Map();
    for (const a of this.all) {
      let bucket = this.byRegionMap.get(a.region);
      if (!bucket) {
        bucket = [];
        this.byRegionMap.set(a.region, bucket);
      }
      bucket.push(a);
    }
  }

  /** Airports in a region, or the whole set when region is "anywhere". */
  inRegion(region: Region | "anywhere"): readonly Airport[] {
    if (region === "anywhere") return this.all;
    return this.byRegionMap.get(region) ?? [];
  }

  /**
   * Airports inside `box`, optionally restricted to a region. Scans the region
   * pool (or the whole set for "anywhere"), never more.
   */
  withinBox(box: BBox, region: Region | "anywhere" = "anywhere"): Airport[] {
    const pool = this.inRegion(region);
    return pool.filter((a) => inBoundingBox(a, box));
  }
}

/** Build an index from a plain airport array. */
export function buildAirportIndex(airports: readonly Airport[]): AirportIndex {
  return new AirportIndex(airports);
}
