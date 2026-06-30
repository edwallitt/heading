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
