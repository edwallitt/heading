import { describe, expect, it } from "vitest";
import { isOceanic } from "./oceanic.js";

describe("isOceanic", () => {
  it("tags island nations by country", () => {
    expect(isOceanic("MV", "MV-MLE")).toBe(true); // Maldives
    expect(isOceanic("FJ", "FJ-C")).toBe(true); // Fiji
    expect(isOceanic("MT", "MT-01")).toBe(true); // Malta
  });

  // The point of keying on iso_region: a mainland country's island territories
  // are oceanic while the mainland is not, and both share an iso_country.
  it("separates island territories from their mainland", () => {
    expect(isOceanic("PT", "PT-30")).toBe(true); // Madeira
    expect(isOceanic("PT", "PT-11")).toBe(false); // Lisbon
    expect(isOceanic("ES", "ES-CN")).toBe(true); // Canaries
    expect(isOceanic("ES", "ES-MD")).toBe(false); // Madrid
    expect(isOceanic("US", "US-HI")).toBe(true); // Hawaii
    expect(isOceanic("US", "US-CA")).toBe(false); // California
  });

  // Technically islands, but flying there is overland — tagging them would
  // make the vibe meaningless.
  it("excludes large landmasses", () => {
    expect(isOceanic("GB", "GB-ENG")).toBe(false);
    expect(isOceanic("AU", "AU-QLD")).toBe(false);
    expect(isOceanic("JP", "JP-13")).toBe(false);
    expect(isOceanic("NZ", "NZ-AUK")).toBe(false);
    expect(isOceanic("IS", "IS-1")).toBe(false);
  });

  it("is case- and whitespace-insensitive", () => {
    expect(isOceanic(" mv ", "")).toBe(true);
    expect(isOceanic("pt", " pt-30 ")).toBe(true);
  });
});
