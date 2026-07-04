import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Flight } from "../types.js";
import { buildVfrPln } from "./pln.js";

/**
 * Fixed, deterministic flight (no LLM call). Airport coordinates come from the
 * committed dataset; waypoints are pre-resolved (as generation now emits them),
 * with WIL matching the baked navaid — this golden test locks the exact MSFS
 * .pln format against silent regression.
 */
const GOLDEN_FLIGHT: Flight = {
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
  overview: "Golden fixture flight.",
  why_this: "Format lock.",
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
      waypoints: [
        {
          ident: "WIL",
          kind: "navaid",
          type: "VOR-DME",
          name: "Willisau",
          lat: 47.17829895019531,
          lon: 7.905920028686523,
        },
        { ident: "WP1", kind: "user", lat: 46.8, lon: 8.5 },
      ],
    },
  ],
  relaxed: [],
  source: "llm",
};

const golden = readFileSync(
  fileURLToPath(new URL("./fixtures/LSZG-LSZS.pln", import.meta.url)),
  "utf8",
);

describe("buildVfrPln", () => {
  it("matches the committed golden .pln exactly", () => {
    expect(buildVfrPln(GOLDEN_FLIGHT)).toBe(golden);
  });

  it("returns null for an IFR flight (no self-generated .pln)", () => {
    expect(buildVfrPln({ ...GOLDEN_FLIGHT, rules: "IFR" })).toBeNull();
  });
});
