import { describe, expect, it } from "vitest";
import { getAircraft } from "../data/aircraft.js";
import { BAND_TOLERANCE, distanceBand, estBlockMin } from "./blockTime.js";

const turboprop = getAircraft("turboprop");
const airliner = getAircraft("airliner");
const smallProp = getAircraft("small_prop");

describe("distanceBand", () => {
  it("turboprop @ 45 min → ~104 NM centre with ±tolerance band", () => {
    const band = distanceBand(45, turboprop);
    expect(band).not.toBeNull();
    const center = ((45 - 20) / 60) * 250; // 104.17
    expect(band!.minNm).toBeCloseTo(center * (1 - BAND_TOLERANCE), 2);
    expect(band!.maxNm).toBeCloseTo(center * (1 + BAND_TOLERANCE), 2);
  });

  it("airliner @ 20 min → empty band (budget ≤ overhead)", () => {
    expect(distanceBand(20, airliner)).toBeNull();
  });

  it("floors the lower edge at the climb+descent distance", () => {
    // small_prop @ 20 min: centre = (8/60)*120 = 16 NM, ±15% → 13.6 NM,
    // floored to climb_descent_nm (15).
    const band = distanceBand(20, smallProp);
    expect(band!.minNm).toBe(smallProp.climb_descent_nm);
  });

  it("caps the upper edge at the aircraft range", () => {
    // 500 min: centre ≈ 3643 NM, +15% ≈ 4189 → capped to range (3500),
    // while the floored minimum (≈3096) stays below the cap.
    const band = distanceBand(500, airliner);
    expect(band!.maxNm).toBe(airliner.range_nm);
    expect(band!.minNm).toBeLessThan(airliner.range_nm);
  });

  it("divides the total budget across legs (shorter per-leg band for more legs)", () => {
    // Same total budget, more legs → each leg's centre shrinks: (240−N·20)/N.
    const one = distanceBand(240, turboprop, 1)!;
    const two = distanceBand(240, turboprop, 2)!;
    const three = distanceBand(240, turboprop, 3)!;
    const centre = (n: number) => ((240 - n * 20) / n / 60) * 250;
    expect(one.maxNm).toBeGreaterThan(two.maxNm);
    expect(two.maxNm).toBeGreaterThan(three.maxNm);
    expect(two.minNm).toBeCloseTo(centre(2) * (1 - BAND_TOLERANCE), 2);
  });

  it("returns null when the budget can't fit the requested legs", () => {
    // Airliner overhead alone eats a 45-min budget once split across 2 legs.
    expect(distanceBand(45, airliner, 2)).toBeNull();
    // And an inverted band (floor ≥ ceiling after dividing) is also null, not a
    // silently-empty band: turboprop @ 45 min over 3 legs.
    expect(distanceBand(45, turboprop, 3)).toBeNull();
  });
});

describe("estBlockMin", () => {
  it("is the inverse of the band centre (turboprop 45-min leg ≈ 45 min)", () => {
    const center = ((45 - 20) / 60) * 250;
    expect(estBlockMin(center, turboprop)).toBeCloseTo(45, 6);
  });

  it("equals the fixed overhead at zero distance", () => {
    expect(estBlockMin(0, turboprop)).toBe(turboprop.overhead_min);
  });
});
