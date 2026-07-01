import { describe, expect, it } from "vitest";
import { buildAirportIndex } from "../data/airportIndex.js";
import type { Airport, Brief, Region, VibeTag } from "../types.js";
import { candidateChains, candidatePairs } from "./candidatePairs.js";

/**
 * A line of airports along a meridian, each ~100 NM apart (1° lat ≈ 60 NM).
 * For turboprop @ 45 min the band is ~88–120 NM, so only *adjacent* airports
 * pair — a line of 4 yields exactly 3 pairs.
 */
function line(
  prefix: string,
  region: Region,
  count: number,
  vibe: VibeTag[] = [],
): Airport[] {
  const out: Airport[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      ident: `${prefix}${i}`,
      name: `${prefix} ${i}`,
      type: "medium_airport",
      iso_country: "XX",
      region,
      lat: 50 + i * (100 / 60),
      lon: 0,
      elev_ft: 0,
      longest_rwy_ft: 5000,
      vibe_tags: [...vibe],
    });
  }
  return out;
}

const brief = (over: Partial<Brief>): Brief => ({
  aircraft: "turboprop",
  timeBand: "45min",
  region: "europe",
  vibe: "any",
  rules: "VFR",
  legCount: 1,
  ...over,
});

describe("candidatePairs relaxation order", () => {
  it("returns pairs with no relaxation when the full brief is satisfiable", () => {
    const index = buildAirportIndex(line("EU", "europe", 4));
    const result = candidatePairs(brief({}), index);
    expect(result.relaxed).toEqual([]);
    expect(result.pairs.length).toBe(3);
  });

  it("drops vibe first when the vibe filter starves the pool", () => {
    // 4 European airports, none tagged → vibe=mountain yields 0 pairs.
    const index = buildAirportIndex(line("EU", "europe", 4));
    const result = candidatePairs(brief({ vibe: "mountain" }), index);
    expect(result.relaxed).toEqual(["dropped_vibe"]);
    expect(result.pairs.length).toBe(3);
  });

  it("widens region when the region is empty (no vibe to drop)", () => {
    // Nothing in Europe; the satisfiable line lives in Asia.
    const index = buildAirportIndex(line("AS", "asia", 4));
    const result = candidatePairs(brief({ region: "europe", vibe: "any" }), index);
    expect(result.relaxed).toEqual(["widened_region"]);
    expect(result.pairs.length).toBe(3);
  });

  it("applies drop-vibe THEN widen-region in order when both are needed", () => {
    const index = buildAirportIndex(line("AS", "asia", 4, ["mountain"]));
    const result = candidatePairs(
      brief({ region: "europe", vibe: "mountain" }),
      index,
    );
    expect(result.relaxed).toEqual(["dropped_vibe", "widened_region"]);
    expect(result.pairs.length).toBe(3);
  });

  it("returns no pairs (best-effort) for an empty distance band", () => {
    const index = buildAirportIndex(line("EU", "europe", 4));
    const result = candidatePairs(
      brief({ aircraft: "airliner", timeBand: "20min" }),
      index,
    );
    expect(result.pairs).toEqual([]);
    expect(result.relaxed).toEqual([]); // nothing reachable, nothing relaxed
  });
});

describe("candidatePairs soft ranking", () => {
  it("ranks pairs with more vibe matches first (no relaxation)", () => {
    // A line of 4, ~100 NM apart, with B,C,D... mixed tags. Vibe=mountain keeps
    // pairs whose destination is mountainous; vibeScore counts matches across
    // both endpoints, so an all-mountain pair (score 2) outranks a one-sided one.
    const mk = (ident: string, i: number, vibe: VibeTag[]): Airport => ({
      ident,
      name: ident,
      type: "medium_airport",
      iso_country: "XX",
      region: "europe",
      lat: 50 + i * (100 / 60),
      lon: 0,
      elev_ft: 0,
      longest_rwy_ft: 5000,
      vibe_tags: vibe,
    });
    const index = buildAirportIndex([
      mk("AAAA", 0, ["mountain"]),
      mk("BBBB", 1, ["mountain"]),
      mk("CCCC", 2, []),
      mk("DDDD", 3, ["mountain"]),
    ]);
    const result = candidatePairs(brief({ vibe: "mountain" }), index);
    expect(result.relaxed).toEqual([]); // 3 pairs qualify → no relaxation
    expect(result.pairs.length).toBe(3);
    expect(result.pairs[0]!.vibeScore).toBe(2); // AAAA↔BBBB, both mountain
    const top = [result.pairs[0]!.origin.ident, result.pairs[0]!.destination.ident];
    expect(top.sort()).toEqual(["AAAA", "BBBB"]);
  });
});

/**
 * A meridian line spaced `stepNm` apart. For turboprop @ 3–5 hr the per-leg band
 * is ~354–479 NM (legCount 2) / ~212–287 NM (legCount 3), so a ~416 NM step lets
 * adjacent airports chain two legs but not three (a 3rd hop would exceed range of
 * the shorter 3-leg band from these positions).
 */
function spacedLine(prefix: string, count: number, stepNm: number): Airport[] {
  const stepDeg = stepNm / 60;
  return Array.from({ length: count }, (_, i) => ({
    ident: `${prefix}${i}`,
    name: `${prefix} ${i}`,
    type: "medium_airport",
    iso_country: "XX",
    region: "europe" as Region,
    lat: 40 + i * stepDeg,
    lon: 0,
    elev_ft: 0,
    longest_rwy_ft: 5000,
    vibe_tags: [] as VibeTag[],
  }));
}

describe("candidateChains", () => {
  it("legCount=1 mirrors candidatePairs (each chain is one two-airport leg)", () => {
    const index = buildAirportIndex(line("EU", "europe", 4));
    const b = brief({ vibe: "any", legCount: 1 });
    const { chains } = candidateChains(b, index);
    const { pairs } = candidatePairs(b, index);

    expect(chains.length).toBe(pairs.length);
    for (const chain of chains) {
      expect(chain.airports.length).toBe(2);
      expect(chain.legs.length).toBe(1);
    }
  });

  it("legCount=2 builds open 3-airport chains with no airport repeated", () => {
    const index = buildAirportIndex(spacedLine("EU", 3, 416));
    const { chains } = candidateChains(
      brief({ timeBand: "3-5hr", vibe: "any", legCount: 2 }),
      index,
    );

    expect(chains.length).toBeGreaterThan(0);
    for (const chain of chains) {
      expect(chain.airports.length).toBe(3);
      expect(chain.legs.length).toBe(2);
      const idents = chain.airports.map((a) => a.ident);
      expect(new Set(idents).size).toBe(3); // no revisits
      // legs are contiguous: each leg starts where the previous ended
      expect(chain.legs[0]!.destination.ident).toBe(chain.legs[1]!.origin.ident);
      expect(chain.totalDistanceNm).toBeCloseTo(
        chain.legs[0]!.distanceNm + chain.legs[1]!.distanceNm,
        6,
      );
    }
  });

  it("returns no chains when the leg count can't be reached from the pool", () => {
    // Only two airports → a 3-leg chain (4 airports) is impossible.
    const index = buildAirportIndex(spacedLine("EU", 2, 416));
    const { chains } = candidateChains(
      brief({ timeBand: "3-5hr", vibe: "any", legCount: 3 }),
      index,
    );
    expect(chains.length).toBe(0);
  });
});
