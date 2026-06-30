import { describe, expect, it } from "vitest";
import { legalVfrAltitude } from "./vfrAltitude.js";

describe("legalVfrAltitude", () => {
  it("eastbound snaps to odd thousands + 500", () => {
    expect(legalVfrAltitude(90, 5400)).toBe(5500);
    expect(legalVfrAltitude(0, 7600)).toBe(7500);
    expect(legalVfrAltitude(179, 3400)).toBe(3500);
  });

  it("westbound snaps to even thousands + 500", () => {
    expect(legalVfrAltitude(270, 5400)).toBe(4500);
    expect(legalVfrAltitude(180, 8400)).toBe(8500);
    expect(legalVfrAltitude(225, 6400)).toBe(6500);
  });

  it("breaks exact ties by rounding up", () => {
    // eastbound: 6500 is equidistant from 5500 and 7500 → 7500.
    expect(legalVfrAltitude(90, 6500)).toBe(7500);
  });

  it("normalises track ≥ 360°", () => {
    expect(legalVfrAltitude(450, 5400)).toBe(5500); // 450 ≡ 90 (east)
    expect(legalVfrAltitude(-90, 5400)).toBe(4500); // -90 ≡ 270 (west)
  });
});
