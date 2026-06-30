/**
 * Parse a "aircraft,time,region,vibe,rules" CLI string into a Brief.
 * Shared by the try-brief and generate harnesses.
 */
import type {
  AircraftCategory,
  Brief,
  Region,
  Rules,
  TimeBand,
  VibeTag,
} from "../../src/types.js";

const AIRCRAFT_ALIASES: Record<string, AircraftCategory> = {
  small_prop: "small_prop",
  smallprop: "small_prop",
  "small prop": "small_prop",
  prop: "small_prop",
  turboprop: "turboprop",
  turbo: "turboprop",
  regional_jet: "regional_jet",
  "regional jet": "regional_jet",
  regional: "regional_jet",
  rj: "regional_jet",
  airliner: "airliner",
  jet: "airliner",
};

const TIME_ALIASES: Record<string, TimeBand> = {
  "20min": "20min",
  "20": "20min",
  "45min": "45min",
  "45": "45min",
  "1hr": "1hr",
  "1h": "1hr",
  "60min": "1hr",
  "2hr": "2hr",
  "2h": "2hr",
  "120min": "2hr",
  "3-5hr": "3-5hr",
  "3-5h": "3-5hr",
  long_haul: "long_haul",
  longhaul: "long_haul",
  "long haul": "long_haul",
};

const REGION_ALIASES: Record<string, Region | "anywhere"> = {
  anywhere: "anywhere",
  any: "anywhere",
  north_america: "north_america",
  "north america": "north_america",
  na: "north_america",
  south_america: "south_america",
  "south america": "south_america",
  sa: "south_america",
  europe: "europe",
  eu: "europe",
  asia: "asia",
  oceania: "oceania",
  caribbean: "caribbean",
};

const VIBE_ALIASES: Record<string, VibeTag | "any"> = {
  any: "any",
  "surprise me": "any",
  surprise: "any",
  mountain: "mountain",
  mountains: "mountain",
  "scenic mountains": "mountain",
  coastal: "coastal",
  coast: "coastal",
  urban: "urban",
  city: "urban",
  "city skylines": "urban",
  skylines: "urban",
};

const RULES_ALIASES: Record<string, Rules | "any"> = {
  any: "any",
  vfr: "VFR",
  ifr: "IFR",
};

function lookup<T>(map: Record<string, T>, raw: string, kind: string): T {
  const value = map[raw.trim().toLowerCase()];
  if (value === undefined) {
    throw new Error(
      `Unrecognised ${kind}: "${raw}". Valid: ${Object.keys(map).join(", ")}`,
    );
  }
  return value;
}

/** Parse "aircraft,time,region,vibe,rules" into a Brief. Throws on bad input. */
export function parseBrief(input: string): Brief {
  const parts = input.split(",").map((p) => p.trim());
  if (parts.length !== 5) {
    throw new Error(
      `Expected 5 comma-separated fields (aircraft,time,region,vibe,rules), ` +
        `got ${parts.length}: "${input}"`,
    );
  }
  const [aircraft, time, region, vibe, rules] = parts as [
    string,
    string,
    string,
    string,
    string,
  ];
  return {
    aircraft: lookup(AIRCRAFT_ALIASES, aircraft, "aircraft"),
    timeBand: lookup(TIME_ALIASES, time, "time band"),
    region: lookup(REGION_ALIASES, region, "region"),
    vibe: lookup(VIBE_ALIASES, vibe, "vibe"),
    rules: lookup(RULES_ALIASES, rules, "rules"),
  };
}
