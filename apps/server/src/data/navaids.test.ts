import { describe, expect, it } from "vitest";
import navaidData from "./navaids.generated.json";
import { findNavaid, navaidCount } from "./navaids.js";

/** Types the build script keeps; everything else is dropped. */
const KEEP_TYPES = new Set([
  "VOR",
  "VOR-DME",
  "VORTAC",
  "NDB",
  "NDB-DME",
  "TACAN",
]);

describe("navaid index", () => {
  it("loads the baked dataset", () => {
    expect(navaidCount).toBeGreaterThan(1000);
  });

  it("resolves a known European VOR (GVA → Geneva ~46.2,6.1)", () => {
    const gva = findNavaid("GVA");
    expect(gva).toBeDefined();
    expect(gva!.name).toMatch(/Geneva/i);
    expect(gva!.type).toBe("VOR-DME");
    expect(gva!.country).toBe("CH");
    expect(gva!.lat).toBeCloseTo(46.2, 0);
    expect(gva!.lon).toBeCloseTo(6.1, 0);
  });

  it("is case-insensitive on the ident", () => {
    expect(findNavaid("gva")?.country).toBe("CH");
  });

  it("uses the lat/lon hint to disambiguate a reused ident", () => {
    // "GVA" is also a US NDB near 37.8,-87.8 — the hint should select it.
    const us = findNavaid("GVA", { lat: 37.8, lon: -87.8 });
    expect(us).toBeDefined();
    expect(us!.country).toBe("US");
    expect(us!.lat).toBeCloseTo(37.8, 0);
  });

  it("returns undefined for a nonsense ident", () => {
    expect(findNavaid("ZZZZ9")).toBeUndefined();
  });
});

describe("navaid build filter", () => {
  it("keeps only enroute navaid types — no DME/ILS slipped through", () => {
    const types = new Set(navaidData.map((n) => n.type));
    for (const t of types) expect(KEEP_TYPES.has(t)).toBe(true);
    expect(navaidData.some((n) => n.type === "DME")).toBe(false);
    expect(navaidData.some((n) => n.type === "ILS")).toBe(false);
  });
});
