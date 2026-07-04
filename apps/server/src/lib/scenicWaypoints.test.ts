import { describe, expect, it } from "vitest";
import type { Airport, Navaid } from "../types.js";
import type { CandidateChain, ChainLeg } from "./candidatePairs.js";
import { greatCircleNm } from "./geo.js";
import {
  MAX_WAYPOINTS_PER_LEG,
  assignWaypoints,
  corridorNm,
  suggestNavaids,
} from "./scenicWaypoints.js";

const apt = (ident: string, lat: number, lon: number): Airport => ({
  ident,
  name: ident,
  type: "medium_airport",
  iso_country: "XX",
  region: "europe",
  lat,
  lon,
  elev_ft: 0,
  longest_rwy_ft: 5000,
  longest_paved_rwy_ft: 5000,
  ifr_capable: true,
  vibe_tags: [],
});

const legOf = (o: Airport, d: Airport): ChainLeg => ({
  origin: o,
  destination: d,
  distanceNm: greatCircleNm(o, d),
});

const navaid = (
  ident: string,
  lat: number,
  lon: number,
  type = "VOR",
): Navaid => ({ ident, name: `${ident} Beacon`, type, lat, lon, country: "XX" });

// A ~100 NM leg due north along the prime meridian; corridor = 20 NM detour.
const A = apt("AAAA", 50, 0);
const B = apt("BBBB", 51.6667, 0);
const LEG = legOf(A, B);

describe("corridorNm", () => {
  it("is 20% of the leg, floored at 15 NM for short hops", () => {
    expect(corridorNm(100)).toBeCloseTo(20);
    expect(corridorNm(30)).toBe(15);
  });
});

describe("assignWaypoints", () => {
  it("resolves an on-corridor navaid ident with its metadata", () => {
    const [wps] = assignWaypoints(["mid"], [LEG], [navaid("MID", 50.8, 0.1)]);
    expect(wps).toEqual([
      {
        ident: "MID",
        kind: "navaid",
        name: "MID Beacon",
        type: "VOR",
        lat: 50.8,
        lon: 0.1,
      },
    ]);
  });

  it("disambiguates a reused ident by the corridor, not by lookup order", () => {
    const far = navaid("DUP", 10, 10);
    const near = navaid("DUP", 50.9, -0.1);
    const [wps] = assignWaypoints(["DUP"], [LEG], [far, near]);
    expect(wps).toHaveLength(1);
    expect(wps![0]!.lat).toBe(50.9);
  });

  it("numbers lat/lon user waypoints in accept order, then sorts into fly order", () => {
    // Given out of order: WP1 = 51.2°N, WP2 = 50.4°N → fly order is WP2 first.
    const [wps] = assignWaypoints(["51.2,0.05", "50.4,-0.05"], [LEG], []);
    expect(wps!.map((w) => w.ident)).toEqual(["WP2", "WP1"]);
    expect(wps!.every((w) => w.kind === "user")).toBe(true);
  });

  it("drops off-corridor points, unknown idents, and unparseable strings", () => {
    const [wps] = assignWaypoints(
      ["10,10", "NOPE", "junk junk junk", "999,999"],
      [LEG],
      [navaid("ELSEWHERE", 10, 10)],
    );
    expect(wps).toEqual([]);
  });

  it("assigns each waypoint to the leg it detours least", () => {
    const C = apt("CCCC", 53.3333, 0);
    const legs = [legOf(A, B), legOf(B, C)];
    const buckets = assignWaypoints(
      ["52.5,0.1", "50.5,0"],
      legs,
      [],
    );
    expect(buckets[0]!.map((w) => w.lat)).toEqual([50.5]);
    expect(buckets[1]!.map((w) => w.lat)).toEqual([52.5]);
  });

  it("caps waypoints per leg", () => {
    const raw = ["50.2,0", "50.5,0", "50.8,0", "51.1,0", "51.4,0"];
    const [wps] = assignWaypoints(raw, [LEG], []);
    expect(wps).toHaveLength(MAX_WAYPOINTS_PER_LEG);
  });
});

describe("suggestNavaids", () => {
  const chainOf = (...legs: ChainLeg[]): CandidateChain => ({
    airports: [legs[0]!.origin, ...legs.map((l) => l.destination)],
    legs,
    totalDistanceNm: legs.reduce((s, l) => s + l.distanceNm, 0),
    vibeScore: 0,
  });

  it("returns only on-corridor navaids, closest detour first", () => {
    const onAxis = navaid("AXS", 50.83, 0);
    const offAxis = navaid("OFF", 50.8, 0.5); // ~19 NM abeam → small detour
    const wayOff = navaid("WAY", 50.8, 2); // ~76 NM abeam → rejected
    const got = suggestNavaids(chainOf(LEG), [wayOff, offAxis, onAxis]);
    expect(got.map((n) => n.ident)).toEqual(["AXS", "OFF"]);
  });

  it("dedupes reused idents and caps the list", () => {
    const dups = [navaid("DUP", 50.5, 0), navaid("DUP", 51.0, 0)];
    expect(suggestNavaids(chainOf(LEG), dups)).toHaveLength(1);

    const many = Array.from({ length: 12 }, (_, i) =>
      navaid(`N${i}`, 50.2 + i * 0.1, 0),
    );
    expect(suggestNavaids(chainOf(LEG), many)).toHaveLength(8);
  });

  it("covers every leg of a multi-leg chain", () => {
    const C = apt("CCCC", 53.3333, 0);
    const chain = chainOf(legOf(A, B), legOf(B, C));
    const got = suggestNavaids(chain, [
      navaid("ONE", 50.8, 0),
      navaid("TWO", 52.5, 0),
    ]);
    expect(got.map((n) => n.ident).sort()).toEqual(["ONE", "TWO"]);
  });
});
