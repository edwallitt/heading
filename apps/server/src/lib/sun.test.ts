import { describe, expect, it } from "vitest";
import { eveningSun } from "./sun.js";

/** |a − b| in minutes. */
const minutesApart = (a: Date, iso: string): number =>
  Math.abs(a.getTime() - new Date(iso).getTime()) / 60_000;

describe("eveningSun", () => {
  it("matches published sunset for London at the June solstice (±5 min)", () => {
    const sun = eveningSun(51.5074, -0.1278, new Date("2026-06-21T12:00:00Z"));
    expect(sun).not.toBeNull();
    // timeanddate.com: 21:21 BST = 20:21 UTC.
    expect(minutesApart(sun!.sunset, "2026-06-21T20:21:00Z")).toBeLessThan(5);
  });

  it("matches published sunset for London at the December solstice (±5 min)", () => {
    const sun = eveningSun(51.5074, -0.1278, new Date("2026-12-21T12:00:00Z"));
    expect(sun).not.toBeNull();
    // timeanddate.com: 15:53 GMT.
    expect(minutesApart(sun!.sunset, "2026-12-21T15:53:00Z")).toBeLessThan(5);
  });

  it("handles a far-east longitude (Sydney mid-winter, ±6 min)", () => {
    const sun = eveningSun(-33.8688, 151.2093, new Date("2026-06-21T12:00:00Z"));
    expect(sun).not.toBeNull();
    // timeanddate.com: 16:53 AEST = 06:53 UTC.
    expect(minutesApart(sun!.sunset, "2026-06-21T06:53:00Z")).toBeLessThan(6);
  });

  it("puts the golden-hour start a plausible margin before sunset", () => {
    const sun = eveningSun(51.5074, -0.1278, new Date("2026-06-21T12:00:00Z"))!;
    const gapMin = (sun.sunset.getTime() - sun.goldenStart.getTime()) / 60_000;
    expect(gapMin).toBeGreaterThan(25); // mid-latitudes: roughly 30–80 min
    expect(gapMin).toBeLessThan(90);
  });

  it("returns null in polar day (Longyearbyen, June)", () => {
    expect(
      eveningSun(78.2232, 15.6469, new Date("2026-06-21T12:00:00Z")),
    ).toBeNull();
  });

  it("returns null in polar night (Longyearbyen, December)", () => {
    expect(
      eveningSun(78.2232, 15.6469, new Date("2026-12-21T12:00:00Z")),
    ).toBeNull();
  });
});
