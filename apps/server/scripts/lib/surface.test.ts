import { describe, expect, it } from "vitest";
import { isPavedSurface, normaliseSurface } from "./surface.js";

describe("normaliseSurface", () => {
  it("maps the OurAirports/X-Plane three-letter codes", () => {
    expect(normaliseSurface("ASP")).toBe("asphalt");
    expect(normaliseSurface("CON")).toBe("concrete");
    expect(normaliseSurface("GVL")).toBe("gravel");
    expect(normaliseSurface("GRS")).toBe("grass");
    expect(normaliseSurface("SAN")).toBe("sand");
    expect(normaliseSurface("WATER")).toBe("water");
  });

  // The bare three-letter codes are rare (a few dozen runways each) but real,
  // and a substring rule alone misses them — hence the word-boundary branches.
  it("maps the rare bare codes that a substring rule would miss", () => {
    expect(normaliseSurface("WAT")).toBe("water");
    expect(normaliseSurface("SNO")).toBe("snow");
    expect(normaliseSurface("COR")).toBe("gravel"); // coral
    expect(normaliseSurface("LAT")).toBe("dirt"); // laterite
    // Word boundaries mean they still resolve inside a combined surface.
    expect(normaliseSurface("GRS/SAN")).toBe("grass");
  });

  // Regression: "GRE" is *graded earth*, not grass and not gravel. It appears on
  // ~1,500 runways, so misfiling it visibly mislabels the dispatch card.
  it("treats GRE as graded earth (dirt), not grass", () => {
    expect(normaliseSurface("GRE")).toBe("dirt");
    expect(normaliseSurface("gre")).toBe("dirt");
    // ...while the visually similar GRS stays grass.
    expect(normaliseSurface("GRS")).toBe("grass");
  });

  it("resolves a combined surface to the firmer half", () => {
    expect(normaliseSurface("GRVL-DIRT")).toBe("gravel");
    expect(normaliseSurface("ASP/GRVL")).toBe("asphalt");
    expect(normaliseSurface("GRASS / SOD")).toBe("grass");
  });

  it("handles free prose and casing", () => {
    expect(normaliseSurface("Grass")).toBe("grass");
    expect(normaliseSurface("grass")).toBe("grass");
    expect(normaliseSurface("Grassed brown clay")).toBe("grass");
    expect(normaliseSurface("Concrete")).toBe("concrete");
  });

  it("returns unknown for blank or unrecognised text rather than guessing", () => {
    expect(normaliseSurface("")).toBe("unknown");
    expect(normaliseSurface("   ")).toBe("unknown");
    expect(normaliseSurface("PSP")).toBe("unknown");
  });
});

describe("isPavedSurface", () => {
  it("accepts the paved tokens", () => {
    for (const s of ["ASP", "asphalt", "CON", "Concrete", "BIT", "PEM", "TARMAC"]) {
      expect(isPavedSurface(s)).toBe(true);
    }
  });

  it("rejects natural surfaces, so paved length under-reports", () => {
    for (const s of ["GRS", "Grass", "GVL", "GRE", "WATER", "SNOW", ""]) {
      expect(isPavedSurface(s)).toBe(false);
    }
  });
});
