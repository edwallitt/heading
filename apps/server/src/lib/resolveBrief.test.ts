import { describe, expect, it } from "vitest";
import type { Brief } from "../types.js";
import { resolveBrief } from "./resolveBrief.js";

const base: Brief = {
  aircraft: "turboprop",
  timeBand: "45min",
  region: "europe",
  vibe: "any",
  rules: "any",
  legCount: 1,
};

describe("resolveBrief", () => {
  it("defers rules to the category default when rules are 'any'", () => {
    expect(resolveBrief(base).rules).toBe("VFR"); // turboprop default
    expect(resolveBrief({ ...base, aircraft: "airliner" }).rules).toBe("IFR");
  });

  it("keeps explicit rules over the default", () => {
    expect(resolveBrief({ ...base, rules: "IFR" }).rules).toBe("IFR");
  });

  it("maps vibe 'any' to no tags and a specific vibe to one tag", () => {
    expect(resolveBrief(base).vibeTags).toEqual([]);
    expect(resolveBrief({ ...base, vibe: "mountain" }).vibeTags).toEqual([
      "mountain",
    ]);
  });

  it("carries the aircraft runway/ceiling into the constraints", () => {
    const c = resolveBrief(base);
    expect(c.minRunwayFt).toBe(3000);
    expect(c.ceilingFt).toBe(25000);
    expect(c.distanceBand).not.toBeNull();
  });

  it("produces a null band for an impossible budget", () => {
    const c = resolveBrief({ ...base, aircraft: "airliner", timeBand: "20min" });
    expect(c.distanceBand).toBeNull();
  });
});
