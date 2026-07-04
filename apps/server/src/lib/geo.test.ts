import { describe, expect, it } from "vitest";
import {
  boundingBox,
  greatCircleNm,
  inBoundingBox,
  segmentDistanceNm,
} from "./geo.js";

const EGLL = { lat: 51.4706, lon: -0.461941 };
const LFPG = { lat: 49.0097, lon: 2.5479 };
const JFK = { lat: 40.6413, lon: -73.7781 };
const LAX = { lat: 33.9416, lon: -118.4085 };

describe("greatCircleNm", () => {
  it("matches the known EGLL→LFPG distance (~190 NM)", () => {
    expect(greatCircleNm(EGLL, LFPG)).toBeCloseTo(190, -1); // within ~5 NM
  });

  it("matches the known JFK→LAX distance (~2144 NM)", () => {
    expect(greatCircleNm(JFK, LAX)).toBeGreaterThan(2120);
    expect(greatCircleNm(JFK, LAX)).toBeLessThan(2160);
  });

  it("is zero for identical points and symmetric", () => {
    expect(greatCircleNm(EGLL, EGLL)).toBe(0);
    expect(greatCircleNm(EGLL, LFPG)).toBeCloseTo(greatCircleNm(LFPG, EGLL), 6);
  });

  it("approximates 1° of latitude as ~60 NM", () => {
    expect(greatCircleNm({ lat: 50, lon: 0 }, { lat: 51, lon: 0 })).toBeCloseTo(
      60,
      0,
    );
  });
});

describe("segmentDistanceNm", () => {
  const O = { lat: 0, lon: 0 };

  it("returns the perpendicular distance when the foot is on the segment", () => {
    // Segment runs N–S through lon 0.1° at the equator; closest point is (0, 0.1).
    const d = segmentDistanceNm(O, { lat: -1, lon: 0.1 }, { lat: 1, lon: 0.1 });
    expect(d).toBeCloseTo(6, 1); // 0.1° × 60 NM
  });

  it("clamps to the nearer endpoint when the foot is past the segment", () => {
    // Segment lies to the east (lon 1°→2°) at the equator; closest is the lon-1 end.
    const d = segmentDistanceNm(O, { lat: 0, lon: 1 }, { lat: 0, lon: 2 });
    expect(d).toBeCloseTo(60, 0); // 1° × 60 NM
  });

  it("is zero when the point lies on the segment", () => {
    expect(segmentDistanceNm(O, { lat: -1, lon: 0 }, { lat: 1, lon: 0 })).toBeCloseTo(0, 5);
  });

  it("treats a degenerate (zero-length) segment as a point", () => {
    // a === b: falls back to the endpoint distance, no divide-by-zero.
    const d = segmentDistanceNm(O, { lat: 0, lon: 0.5 }, { lat: 0, lon: 0.5 });
    expect(d).toBeCloseTo(30, 0); // 0.5° × 60 NM
  });

  it("handles a segment spanning the antimeridian without blowing up", () => {
    // Point at lon 179.9; segment straddles ±180. Should read ~a few NM, not ~half the globe.
    const p = { lat: 0, lon: 179.9 };
    const d = segmentDistanceNm(p, { lat: -1, lon: 179.95 }, { lat: 1, lon: -179.95 });
    expect(d).toBeLessThan(10);
  });
});

describe("boundingBox / inBoundingBox", () => {
  it("contains the centre and a point inside the radius", () => {
    const box = boundingBox({ lat: 50, lon: 0 }, 120);
    expect(inBoundingBox({ lat: 50, lon: 0 }, box)).toBe(true);
    expect(inBoundingBox({ lat: 51, lon: 0 }, box)).toBe(true); // ~60 NM north
  });

  it("excludes a point well outside the radius", () => {
    const box = boundingBox({ lat: 50, lon: 0 }, 60);
    expect(inBoundingBox({ lat: 55, lon: 0 }, box)).toBe(false); // ~300 NM north
  });

  it("handles antimeridian wrap", () => {
    const box = boundingBox({ lat: 0, lon: 179 }, 180); // ~3° each side
    expect(box.lonWraps).toBe(true);
    expect(inBoundingBox({ lat: 0, lon: -179 }, box)).toBe(true);
    expect(inBoundingBox({ lat: 0, lon: 0 }, box)).toBe(false);
  });
});
