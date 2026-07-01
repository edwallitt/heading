import type { AircraftProfile } from "../data/aircraft.js";
import type { AirportIndex } from "../data/airportIndex.js";
import { candidateChains, type CandidateChain } from "../lib/candidatePairs.js";
import { estBlockMin } from "../lib/blockTime.js";
import { greatCircleNm } from "../lib/geo.js";
import { legalVfrAltitude } from "../lib/vfrAltitude.js";
import { resolveBrief } from "../lib/resolveBrief.js";
import type {
  Brief,
  Flight,
  FlightLeg,
  LatLon,
  Rules,
} from "../types.js";
import { buildPrompt } from "./buildPrompt.js";
import type { LlmClient } from "./client.js";
import { modelOutputSchema } from "./schema.js";

/** Number of model attempts before the algorithmic fallback fires. */
const MAX_LLM_ATTEMPTS = 2;

export type GenerateFlightResult =
  | { status: "ok"; flight: Flight }
  | { status: "no_flight"; reason: string };

export interface GenerateFlightDeps {
  /** Injected in tests/CLI; defaults to the boot-loaded global index. */
  index?: AirportIndex;
  /** The LLM seam; omit to force the algorithmic fallback. */
  client?: LlmClient;
  /** Anti-repeat exclusion list (Phase 5 wires the source). */
  excludeRecent?: string[];
}

interface Choice {
  chain: CandidateChain;
  overview: string;
  why_this: string;
  waypoints: string[];
  source: "llm" | "fallback";
}

/**
 * Resolve a Brief into a validated, flyable Flight (§4 + §6):
 * candidate pool → Opus selection (one retry) → algorithmic fallback on double
 * failure → enrichment with our own distance/block-time/altitude math.
 */
export async function generateFlight(
  brief: Brief,
  deps: GenerateFlightDeps = {},
): Promise<GenerateFlightResult> {
  const constraints = resolveBrief(brief);
  const index = deps.index ?? (await import("../data/index.js")).airportIndex;
  const { chains, relaxed } = candidateChains(brief, index);

  if (chains.length === 0) {
    // Should be rare (e.g. impossible budget, or a leg count too high to chain).
    // Never call the model.
    const reason =
      constraints.distanceBand === null
        ? `Time budget is too small for ${brief.legCount} ${brief.legCount === 1 ? "leg" : "legs"} — the aircraft's overhead consumes it.`
        : "No candidate trips matched the brief, even after relaxation.";
    return { status: "no_flight", reason };
  }

  const choice = deps.client
    ? await chooseWithLlm(
        brief,
        chains,
        relaxed,
        constraints.aircraft,
        constraints.rules,
        deps.client,
        deps.excludeRecent ?? [],
      )
    : fallbackChoice(chains);

  return {
    status: "ok",
    flight: enrich(brief, constraints.aircraft, constraints.rules, choice, relaxed),
  };
}

/** Up to two model attempts; the second is fed the first's validation error. */
async function chooseWithLlm(
  brief: Brief,
  chains: CandidateChain[],
  relaxed: string[],
  aircraft: AircraftProfile,
  rules: Rules,
  client: LlmClient,
  excludeRecent: string[],
): Promise<Choice> {
  let previousError: string | undefined;

  for (let attempt = 0; attempt < MAX_LLM_ATTEMPTS; attempt++) {
    try {
      const { system, user } = buildPrompt({
        brief,
        chains,
        relaxed,
        aircraft,
        rules,
        excludeRecent,
        previousError,
      });
      const raw = await client.complete({ system, user });
      const parsed = parseModelOutput(raw, chains.length);
      return {
        chain: chains[parsed.choiceIndex]!,
        overview: parsed.overview.trim(),
        why_this: parsed.why_this.trim(),
        waypoints: parsed.waypoints ?? [],
        source: "llm",
      };
    } catch (err) {
      previousError = (err as Error).message;
    }
  }

  // Both attempts failed → algorithmic fallback from the validated pool.
  return fallbackChoice(chains);
}

/** Parse + validate the model's JSON; throws on bad shape or out-of-range index. */
function parseModelOutput(raw: string, choiceCount: number) {
  const parsed = modelOutputSchema.parse(JSON.parse(extractJson(raw)));
  if (parsed.choiceIndex >= choiceCount) {
    throw new Error(
      `choiceIndex ${parsed.choiceIndex} is out of range (0..${choiceCount - 1}).`,
    );
  }
  return parsed;
}

/**
 * Extract the JSON object from the model's reply. The prompt demands JSON only,
 * but we defensively strip an accidental ```json fence and slice to the outer
 * braces so a stray leading sentence doesn't fail the parse. If no object is
 * present, return the text as-is and let `JSON.parse` throw (→ retry/fallback).
 */
function extractJson(raw: string): string {
  const stripped = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return stripped;
  return stripped.slice(start, end + 1);
}

/** Algorithmic pick: the top-ranked chain, prose templated in `enrich`. */
function fallbackChoice(chains: CandidateChain[]): Choice {
  return {
    chain: chains[0]!,
    overview: "",
    why_this: "",
    waypoints: [],
    source: "fallback",
  };
}

/**
 * Authoritative enrichment — all numbers come from our libs, not the model.
 * Builds one FlightLeg per hop in the chosen chain. Distance, block time, and
 * cruise level are computed per leg (VFR altitude is track-dependent); the
 * flight's `est_block_min` is the sum across legs (each carries the aircraft's
 * overhead), and the top-level `cruise_level` mirrors the first leg for the
 * single-line readout.
 */
function enrich(
  brief: Brief,
  aircraft: AircraftProfile,
  rules: Rules,
  choice: Choice,
  relaxed: string[],
): Flight {
  const chainLegs = choice.chain.legs;
  const singleLeg = chainLegs.length === 1;

  const legs: FlightLeg[] = chainLegs.map((leg) => {
    const o = leg.origin;
    const d = leg.destination;
    const distNm = Math.round(greatCircleNm(o, d));
    const track = initialBearingDeg(o, d);
    return {
      from_icao: o.ident,
      to_icao: d.ident,
      from_name: o.name,
      to_name: d.name,
      from_lat: o.lat,
      from_lon: o.lon,
      to_lat: d.lat,
      to_lon: d.lon,
      dist_nm: distNm,
      cruise_level: cruiseLevelFor(rules, aircraft, distNm, track),
      // Scenic waypoints are single-leg only; multi-leg hops fly direct.
      waypoints: singleLeg ? validateWaypoints(choice.waypoints, rules) : [],
    };
  });

  const blockMin = Math.round(
    legs.reduce((sum, leg) => sum + estBlockMin(leg.dist_nm, aircraft), 0),
  );
  const totalNm = legs.reduce((sum, leg) => sum + leg.dist_nm, 0);
  const route = choice.chain.airports.map((a) => a.ident).join(" → ");

  const overview =
    choice.source === "fallback"
      ? singleLeg
        ? `A ${totalNm} NM ${rules} hop from ${legs[0]!.from_name} (${legs[0]!.from_icao}) to ${legs[0]!.to_name} (${legs[0]!.to_icao}).`
        : `A ${legs.length}-leg ${rules} trip — ${route} — ${totalNm} NM in total.`
      : choice.overview;
  const why_this =
    choice.source === "fallback"
      ? `Best ranked match for a ${brief.timeBand} ${brief.aircraft.replace("_", " ")} brief in ${brief.region.replace("_", " ")}.`
      : choice.why_this;

  return {
    brief,
    aircraft_type: aircraft.simbrief_type,
    cruise_level: legs[0]!.cruise_level,
    est_block_min: blockMin,
    rules,
    overview,
    why_this,
    legs,
    relaxed,
    source: choice.source,
  };
}

/**
 * Validate model VFR waypoints. We have no navaid dataset, so we accept ONLY
 * clean decimal "lat,lon" strings (documented limitation — named navaids are
 * dropped); invalid ones are discarded. IFR routing is SimBrief's job (Phase 3),
 * so non-VFR carries no waypoints. All-dropped → empty = great-circle direct.
 */
function validateWaypoints(rawWaypoints: string[], rules: Rules): string[] {
  if (rules !== "VFR") return [];
  const out: string[] = [];
  for (const w of rawWaypoints) {
    const ll = parseLatLon(w);
    if (ll) out.push(`${ll.lat},${ll.lon}`);
  }
  return out;
}

/** Parse "lat,lon" or "lat lon" decimals; returns null if not a valid pair. */
function parseLatLon(s: string): LatLon | null {
  const parts = s.trim().split(/[,\s]+/);
  if (parts.length !== 2) return null;
  const lat = Number(parts[0]);
  const lon = Number(parts[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat, lon };
}

/** Default cruise level: hemispheric-legal VFR feet, or a plausible IFR FL. */
function cruiseLevelFor(
  rules: Rules,
  aircraft: AircraftProfile,
  distNm: number,
  trackDeg: number,
): string {
  if (rules === "VFR") {
    // Higher for longer legs, kept below the ceiling, then snapped to the rule.
    const base = Math.min(
      3000 + Math.min(distNm, 200) * 25,
      aircraft.ceiling_ft - 1000,
    );
    return String(legalVfrAltitude(trackDeg, base));
  }
  // IFR: climb toward the ceiling on longer legs; express as a flight level.
  const ft = Math.min(
    10000 + Math.min(distNm, 1000) * 25,
    aircraft.ceiling_ft,
  );
  const fl = Math.round(ft / 1000) * 10;
  return `FL${String(fl).padStart(3, "0")}`;
}

/** Initial great-circle track (degrees) from a to b. Phase-2 local geo helper. */
function initialBearingDeg(a: LatLon, b: LatLon): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const toDeg = (rad: number) => (rad * 180) / Math.PI;
  const phi1 = toRad(a.lat);
  const phi2 = toRad(b.lat);
  const dLon = toRad(b.lon - a.lon);
  const y = Math.sin(dLon) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}
