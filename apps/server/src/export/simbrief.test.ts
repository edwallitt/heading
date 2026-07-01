import { describe, expect, it } from "vitest";
import type { Flight } from "../types.js";
import { buildSimbriefUrl } from "./simbrief.js";

function flight(over: Partial<Flight> = {}): Flight {
  return {
    brief: {
      aircraft: "turboprop",
      timeBand: "45min",
      region: "europe",
      vibe: "mountain",
      rules: "VFR",
      legCount: 1,
    },
    aircraft_type: "TBM9",
    cruise_level: "5500",
    est_block_min: 46,
    rules: "VFR",
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
        cruise_level: "5500",
        waypoints: [],
      },
    ],
    relaxed: [],
    source: "llm",
    ...over,
  };
}

describe("buildSimbriefUrl", () => {
  it("builds the exact dispatch URL (orig, dest, type; no route)", () => {
    expect(buildSimbriefUrl(flight())).toBe(
      "https://www.simbrief.com/system/dispatch.php?orig=LSZG&dest=LSZS&type=TBM9",
    );
  });

  it("uses the same URL shape for IFR (SimBrief routes it)", () => {
    const ifr = flight({
      rules: "IFR",
      aircraft_type: "A320",
      legs: [
        {
          from_icao: "WIII",
          to_icao: "RPLL",
          from_name: "Soekarno-Hatta",
          to_name: "Ninoy Aquino",
          from_lat: -6.13,
          from_lon: 106.66,
          to_lat: 14.51,
          to_lon: 121.02,
          dist_nm: 1505,
          cruise_level: "FL300",
          waypoints: [],
        },
      ],
    });
    expect(buildSimbriefUrl(ifr)).toBe(
      "https://www.simbrief.com/system/dispatch.php?orig=WIII&dest=RPLL&type=A320",
    );
  });
});
