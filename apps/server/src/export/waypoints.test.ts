import { describe, expect, it } from "vitest";
import type { Flight } from "../types.js";
import { resolveWaypoints } from "./waypoints.js";

function flight(waypoints: string[], rules: Flight["rules"] = "VFR"): Flight {
  return {
    brief: {
      aircraft: "turboprop",
      timeBand: "45min",
      region: "europe",
      vibe: "mountain",
      rules: "VFR",
    },
    aircraft_type: "TBM9",
    cruise_level: "5500",
    est_block_min: 46,
    rules,
    overview: "x",
    why_this: "y",
    legs: [
      {
        from_icao: "LSZG",
        to_icao: "LSZS",
        from_name: "Grenchen",
        to_name: "Samedan",
        from_lat: 47.18,
        from_lon: 7.42,
        to_lat: 46.53,
        to_lon: 9.88,
        dist_nm: 108,
        waypoints,
      },
    ],
    relaxed: [],
    source: "llm",
  };
}

describe("resolveWaypoints", () => {
  it("resolves a navaid ident, a lat/lon, and drops junk", () => {
    const wps = resolveWaypoints(flight(["GVA", "46.8,8.5", "NOT_A_WAYPOINT!"]));
    expect(wps).toHaveLength(2);

    const navaid = wps[0]!;
    expect(navaid.kind).toBe("navaid");
    if (navaid.kind !== "navaid") throw new Error("expected navaid");
    expect(navaid.ident).toBe("GVA");
    expect(navaid.type).toMatch(/VOR/);
    // GVA disambiguates to the Swiss VOR (departure hint is LSZG, in Switzerland).
    expect(navaid.lat).toBeCloseTo(46.25, 1);
    expect(navaid.lon).toBeCloseTo(6.13, 1);

    expect(wps[1]).toEqual({ kind: "user", ident: "WP1", lat: 46.8, lon: 8.5 });
  });

  it("returns no waypoints for an IFR flight", () => {
    expect(resolveWaypoints(flight(["GVA"], "IFR"))).toEqual([]);
  });
});
