import type { AircraftProfile } from "../data/aircraft.js";
import type { AirportIndex } from "../data/airportIndex.js";
import { candidatePairs } from "../lib/candidatePairs.js";
import { estBlockMin } from "../lib/blockTime.js";
import { greatCircleNm } from "../lib/geo.js";
import { legalVfrAltitude } from "../lib/vfrAltitude.js";
import { resolveBrief } from "../lib/resolveBrief.js";
import type {
  Brief,
  CandidatePair,
  Flight,
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
  pair: CandidatePair;
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
  const { pairs, relaxed } = candidatePairs(brief, index);

  if (pairs.length === 0) {
    // Should be rare (e.g. impossible budget). Never call the model.
    const reason =
      constraints.distanceBand === null
        ? "Time budget is at or below the aircraft's fixed overhead — no leg is reachable."
        : "No candidate airport pairs matched the brief, even after relaxation.";
    return { status: "no_flight", reason };
  }

  const choice = deps.client
    ? await chooseWithLlm(
        brief,
        pairs,
        relaxed,
        constraints.aircraft,
        constraints.rules,
        deps.client,
        deps.excludeRecent ?? [],
      )
    : fallbackChoice(pairs);

  return {
    status: "ok",
    flight: enrich(brief, constraints.aircraft, constraints.rules, choice, relaxed),
  };
}

/** Up to two model attempts; the second is fed the first's validation error. */
async function chooseWithLlm(
  brief: Brief,
  pairs: CandidatePair[],
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
        pairs,
        relaxed,
        aircraft,
        rules,
        excludeRecent,
        previousError,
      });
      const raw = await client.complete({ system, user });
      const parsed = parseModelOutput(raw, pairs.length);
      return {
        pair: pairs[parsed.pairIndex]!,
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
  return fallbackChoice(pairs);
}

/** Parse + validate the model's JSON; throws on bad shape or out-of-range index. */
function parseModelOutput(raw: string, pairCount: number) {
  const parsed = modelOutputSchema.parse(JSON.parse(extractJson(raw)));
  if (parsed.pairIndex >= pairCount) {
    throw new Error(
      `pairIndex ${parsed.pairIndex} is out of range (0..${pairCount - 1}).`,
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

/** Algorithmic pick: the top-ranked pair, prose templated in `enrich`. */
function fallbackChoice(pairs: CandidatePair[]): Choice {
  return {
    pair: pairs[0]!,
    overview: "",
    why_this: "",
    waypoints: [],
    source: "fallback",
  };
}

/** Authoritative enrichment — all numbers come from our libs, not the model. */
function enrich(
  brief: Brief,
  aircraft: AircraftProfile,
  rules: Rules,
  choice: Choice,
  relaxed: string[],
): Flight {
  const o = choice.pair.origin;
  const d = choice.pair.destination;
  const distNm = Math.round(greatCircleNm(o, d));
  const blockMin = Math.round(estBlockMin(distNm, aircraft));
  const track = initialBearingDeg(o, d);
  const cruiseLevel = cruiseLevelFor(rules, aircraft, distNm, track);
  const waypoints = validateWaypoints(choice.waypoints, rules);

  const overview =
    choice.source === "fallback"
      ? `A ${distNm} NM ${rules} hop from ${o.name} (${o.ident}) to ${d.name} (${d.ident}).`
      : choice.overview;
  const why_this =
    choice.source === "fallback"
      ? `Best ranked match for a ${brief.timeBand} ${brief.aircraft.replace("_", " ")} brief in ${brief.region.replace("_", " ")}.`
      : choice.why_this;

  return {
    brief,
    aircraft_type: aircraft.simbrief_type,
    cruise_level: cruiseLevel,
    est_block_min: blockMin,
    rules,
    overview,
    why_this,
    legs: [
      {
        from_icao: o.ident,
        to_icao: d.ident,
        from_name: o.name,
        to_name: d.name,
        from_lat: o.lat,
        from_lon: o.lon,
        to_lat: d.lat,
        to_lon: d.lon,
        dist_nm: distNm,
        waypoints,
      },
    ],
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
