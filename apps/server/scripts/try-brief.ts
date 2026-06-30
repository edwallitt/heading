/**
 * CLI harness to sanity-check the constraint → candidate-pair pipeline before
 * any UI or AI (Part E).
 *
 *   pnpm --filter server try-brief "turboprop,45min,europe,mountains,VFR"
 *
 * With no argument it runs a few built-in example briefs. Prints resolved
 * constraints, the resulting pairs (idents, names, distance, est block time,
 * vibe tags) and any relaxation report.
 */
import { airportIndex } from "../src/data/index.js";
import { candidatePairs } from "../src/lib/candidatePairs.js";
import { resolveBrief } from "../src/lib/resolveBrief.js";
import type {
  AircraftCategory,
  Brief,
  Region,
  Rules,
  TimeBand,
  VibeTag,
} from "../src/types.js";

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
  const key = raw.trim().toLowerCase();
  const value = map[key];
  if (value === undefined) {
    throw new Error(
      `Unrecognised ${kind}: "${raw}". Valid: ${Object.keys(map).join(", ")}`,
    );
  }
  return value;
}

/** Parse "aircraft,time,region,vibe,rules" into a Brief. */
function parseBrief(input: string): Brief {
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

function runBrief(input: string): void {
  const brief = parseBrief(input);
  const constraints = resolveBrief(brief);
  const { pairs, relaxed } = candidatePairs(brief, airportIndex);

  console.log(`\n=== brief: ${input} ===`);
  console.log(
    `  aircraft=${brief.aircraft} (${constraints.aircraft.simbrief_type}), ` +
      `time=${brief.timeBand}, region=${brief.region}, ` +
      `vibe=${brief.vibe}, rules=${constraints.rules}`,
  );
  const band = constraints.distanceBand;
  console.log(
    band
      ? `  distance band: ${band.minNm.toFixed(0)}–${band.maxNm.toFixed(0)} NM, ` +
          `min runway ${constraints.minRunwayFt} ft`
      : "  distance band: EMPTY (budget ≤ overhead) — no pairs possible",
  );
  if (relaxed.length > 0) {
    console.log(`  RELAXED: ${relaxed.join(" → ")}`);
  } else {
    console.log("  relaxed: none");
  }

  if (pairs.length === 0) {
    console.log("  (no candidate pairs)");
    return;
  }
  console.log(`  ${pairs.length} pair(s):`);
  for (const p of pairs) {
    const tags = [...new Set([...p.origin.vibe_tags, ...p.destination.vibe_tags])];
    console.log(
      `    ${p.origin.ident} → ${p.destination.ident}  ` +
        `${p.distanceNm.toFixed(0).padStart(4)} NM  ` +
        `~${p.estBlockMin.toFixed(0).padStart(3)} min  ` +
        `[${tags.join(",") || "—"}]`,
    );
    console.log(`        ${p.origin.name}  →  ${p.destination.name}`);
  }
}

const EXAMPLES = [
  "turboprop,45min,europe,mountains,VFR",
  "small_prop,1hr,north_america,coastal,VFR",
  "airliner,3-5hr,asia,city,IFR",
  "airliner,20min,europe,any,IFR", // empty band demonstration
];

function main(): void {
  const arg = process.argv[2];
  const briefs = arg ? [arg] : EXAMPLES;
  for (const b of briefs) {
    try {
      runBrief(b);
    } catch (err) {
      console.error(`\n[try-brief] ${(err as Error).message}`);
      process.exitCode = 1;
    }
  }
}

main();
