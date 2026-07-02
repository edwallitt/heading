import { describe, expect, it } from "vitest";
import {
  AIRCRAFT_OPTIONS,
  LEG_OPTIONS,
  REGION_OPTIONS,
  RULES_OPTIONS,
  TIME_OPTIONS,
  VIBE_OPTIONS,
  aircraftDisabledReason,
  aircraftLabel,
  legsDisabledReason,
  timeDisabledReason,
} from "./dials.js";

const ALL_OPTIONS = {
  TIME_OPTIONS,
  REGION_OPTIONS,
  RULES_OPTIONS,
  VIBE_OPTIONS,
  AIRCRAFT_OPTIONS,
  LEG_OPTIONS,
};

describe("dial option lists", () => {
  it("give every option a unique value and a non-empty label", () => {
    for (const [name, options] of Object.entries(ALL_OPTIONS)) {
      const values = options.map((o) => o.value);
      expect(new Set(values).size, `${name} has duplicate values`).toBe(values.length);
      expect(options.every((o) => o.label.length > 0), `${name} has a blank label`).toBe(true);
    }
  });

  it("exposes the leg-count dial as the numeric strings 1–3", () => {
    expect(LEG_OPTIONS.map((o) => o.value)).toEqual(["1", "2", "3"]);
  });
});

describe("aircraftLabel", () => {
  it("returns the display label for each aircraft category", () => {
    expect(aircraftLabel("small_prop")).toBe("Small prop");
    expect(aircraftLabel("airliner")).toBe("Airliner");
  });
});

describe("disabled-reason helpers", () => {
  it("timeDisabledReason names the aircraft and the time band", () => {
    const reason = timeDisabledReason("20min", "airliner");
    expect(reason).toContain("Airliner");
    expect(reason).toContain("20 min");
  });

  it("aircraftDisabledReason names the time band and lowercases the aircraft", () => {
    const reason = aircraftDisabledReason("airliner", "20min");
    expect(reason).toContain("20 min");
    expect(reason).toContain("airliner");
  });

  it("legsDisabledReason names the leg count, time band and aircraft", () => {
    const reason = legsDisabledReason(3, "45min", "small_prop");
    expect(reason).toContain("3 legs");
    expect(reason).toContain("45 min");
    expect(reason).toContain("small prop");
  });
});
