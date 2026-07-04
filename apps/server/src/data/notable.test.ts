import { describe, expect, it } from "vitest";
import type { Airport } from "../types.js";
import { NOTABLE_HOOKS, NOTABLE_ICAOS, applyNotableTags } from "./notable.js";

const apt = (ident: string, vibe_tags: Airport["vibe_tags"] = []): Airport => ({
  ident,
  name: ident,
  type: "medium_airport",
  iso_country: "XX",
  region: "europe",
  lat: 0,
  lon: 0,
  elev_ft: 0,
  longest_rwy_ft: 5000,
  longest_paved_rwy_ft: 5000,
  ifr_capable: true,
  vibe_tags,
});

describe("applyNotableTags", () => {
  it("tags a curated airport with the notable vibe", () => {
    const [out] = applyNotableTags([apt("LOWI")]);
    expect(out.vibe_tags).toContain("notable");
  });

  it("preserves existing tags alongside notable", () => {
    const [out] = applyNotableTags([apt("LOWI", ["mountain"])]);
    expect(out.vibe_tags).toEqual(["mountain", "notable"]);
  });

  it("leaves non-curated airports untouched and by reference", () => {
    const plain = apt("ZZZZ", ["coastal"]);
    const [out] = applyNotableTags([plain]);
    expect(out).toBe(plain); // no allocation for untouched airports
  });

  it("is idempotent — re-tagging an already-notable field is a no-op", () => {
    const once = applyNotableTags([apt("LOWI")]);
    const twice = applyNotableTags(once);
    expect(twice[0]!.vibe_tags).toEqual(["notable"]);
  });
});

describe("NOTABLE_ICAOS", () => {
  it("mirrors the hook map keys", () => {
    expect(NOTABLE_ICAOS.size).toBe(Object.keys(NOTABLE_HOOKS).length);
    expect(NOTABLE_ICAOS.has("LOWI")).toBe(true);
  });

  it("uses 4-letter ICAO idents", () => {
    for (const icao of NOTABLE_ICAOS) {
      expect(icao).toMatch(/^[A-Z]{4}$/);
    }
  });
});
