import type { AircraftProfile } from "../data/aircraft.js";
import { NOTABLE_HOOKS } from "../data/notable.js";
import type { CandidateChain } from "../lib/candidatePairs.js";
import { describeWeather } from "../weather/metar.js";
import type { AirportWeather, Brief, Rules } from "../types.js";

export interface BuildPromptInput {
  brief: Brief;
  chains: CandidateChain[];
  relaxed: string[];
  aircraft: AircraftProfile;
  /** Resolved flight rules (drives whether VFR waypoints are invited). */
  rules: Rules;
  /** Idents to avoid if possible (anti-repeat; Phase 5 wires the source). */
  excludeRecent?: string[];
  /**
   * Per-chain scenic navaid suggestions, aligned with `chains` by index (VFR
   * briefs only). Each entry is prompt-ready, e.g. `"WIL (VOR-DME)"`.
   */
  navaidsByChain?: string[][];
  /** Latest METARs by ident, for the stations in the pool that reported. */
  weather?: Map<string, AirportWeather>;
  /** On a retry, the validation error from the previous attempt. */
  previousError?: string;
}

const SYSTEM = `You are a flight dispatcher for a Microsoft Flight Simulator pilot.

You are given a numbered list of REAL, pre-validated trips. Each trip is one or more legs; a multi-leg trip is an open chain (A→B→C) where you land at every stop. Your job:
1. Pick the ONE trip that best fits the brief, BY ITS INDEX. You must not invent airports — only choose from the list.
2. Write a short, evocative overview of the whole trip (80 words max). For a multi-leg trip, give a sense of the journey across its stops.
3. Write a one-line reason it fits the brief.
4. For a VFR trip you MAY suggest scenic waypoints — for any leg, including each leg of a multi-leg trip. Prefer navaid identifiers from the trip's "navaids:" list (each is pre-checked to sit near that trip's route); a decimal "lat,lon" string close to a leg's course also works. Give up to 4 per leg (12 total), as ONE flat list in fly order — each waypoint is matched to the leg it sits along automatically, and anything too far off course is dropped. Omit waypoints for IFR.
5. A trip may list "notable:" hooks — short facts about a famous or dramatic stop (its approach, setting, or claim to fame). When you pick such a trip, weave the hook naturally into the overview. Never invent these; use only what is listed.
6. Live METAR weather may be listed per trip and per airport. Factor it into your pick — for a VFR brief strongly prefer trips whose stops are VFR or MVFR — and you may weave the listed conditions (wind, visibility, ceiling) into the overview. Never invent weather that is not listed.
7. For an IFR jet brief, every stop is pre-screened for jet operations (paved runway at or above the aircraft minimum, and airline-service airports with published instrument procedures — ILS/RNAV approaches, SIDs and STARs). Among the candidates, prefer stops with longer runways and larger, better-equipped airports; the runway length listed per stop is its longest paved runway.

Return JSON ONLY — no prose, no markdown, no code fences — matching exactly:
{"choiceIndex": <number>, "overview": <string>, "why_this": <string>, "waypoints": <string[] | omitted>}

If a soft constraint was relaxed, word the overview honestly (e.g. note that the requested vibe could not be matched).`;

const labelFor: Record<string, string> = {
  dropped_vibe: "the vibe filter was dropped",
  widened_region: "the region was widened to anywhere",
};

/**
 * A short gloss per vibe, so the model writes to the *intent* rather than to a
 * bare tag name. The two operational vibes need this most: "hub" and "oceanic"
 * mean nothing on their own, and their briefs should read as airline dispatch
 * rather than as scenery notes.
 */
const VIBE_GLOSS: Record<string, string> = {
  mountain: "mountainous terrain and high scenery",
  coastal: "coastline, shore and island scenery",
  urban: "city skylines and built-up approaches",
  notable: "famous, dramatic or bucket-list airfields",
  hub: "busy hub-to-hub airline operations — big instrument fields, heavy traffic, real-world route pairs",
  oceanic:
    "long overwater sectors — island and archipelago operations where the route crosses open sea",
};

/** Build the system + user prompt for one generate attempt. */
export function buildPrompt(input: BuildPromptInput): {
  system: string;
  user: string;
} {
  const {
    brief,
    chains,
    relaxed,
    aircraft,
    rules,
    excludeRecent,
    navaidsByChain,
    weather,
    previousError,
  } = input;

  const chainLines = chains
    .map((chain, i) => {
      const route = chain.airports
        .map((a) => {
          // For jet categories quote the paved length (what the filter used);
          // otherwise the longest runway of any surface.
          const rwyFt = aircraft.paved_rwy_only
            ? a.longest_paved_rwy_ft
            : a.longest_rwy_ft;
          return `${a.ident} ${a.name} (${a.iso_country}, rwy ${rwyFt} ft)`;
        })
        .join(" → ");
      const perLeg = chain.legs.map((l) => `${Math.round(l.distanceNm)}`).join("+");
      const tags =
        [...new Set(chain.airports.flatMap((a) => a.vibe_tags))].join(",") || "—";
      // Curated hooks for any famous/dramatic stop on this chain — raw material
      // for the overview (buildPrompt never invents these; they come from the
      // hand-written notable list).
      const notable = chain.airports
        .map((a) => NOTABLE_HOOKS[a.ident])
        .filter(Boolean)
        .join("; ");
      const legWord = chain.legs.length === 1 ? "leg" : "legs";
      // Per-stop METAR categories, for the stations in this chain that reported.
      const wx = chain.airports
        .map((a) => {
          const w = weather?.get(a.ident);
          return w ? `${a.ident} ${w.category}` : null;
        })
        .filter(Boolean)
        .join(", ");
      const navs = navaidsByChain?.[i];
      return (
        `[${i}] ${route} · ${chain.legs.length} ${legWord} · ` +
        `${perLeg} NM (${Math.round(chain.totalDistanceNm)} total) · vibe: ${tags}` +
        (wx ? ` · wx: ${wx}` : "") +
        (navs && navs.length > 0 ? ` · navaids: ${navs.join(", ")}` : "") +
        (notable ? ` · notable: ${notable}` : "")
      );
    })
    .join("\n");

  // Decoded conditions per unique station, so the overview can cite real
  // weather (not just a category) without inventing anything.
  const weatherLines =
    weather && weather.size > 0
      ? [...new Set(chains.flatMap((c) => c.airports.map((a) => a.ident)))]
          .map((ident) => {
            const w = weather.get(ident);
            if (!w) return null;
            const detail = describeWeather(w);
            return `${ident}: ${w.category}${detail ? ` — ${detail}` : ""}`;
          })
          .filter(Boolean)
          .join("\n")
      : "";

  const relaxLine =
    relaxed.length > 0
      ? `Relaxation applied: ${relaxed
          .map((r) => labelFor[r] ?? r)
          .join("; ")}.`
      : "Relaxation applied: none.";

  const excludeLine =
    excludeRecent && excludeRecent.length > 0
      ? `Avoid these recently shown airports if possible: ${excludeRecent.join(", ")}.`
      : "";

  const retryLine = previousError
    ? `Your previous response was rejected: ${previousError}. Return valid JSON matching the schema, with pairIndex in range.`
    : "";

  const legPhrase =
    brief.legCount === 1 ? "single-leg" : `${brief.legCount}-leg`;

  const user = [
    `Brief: a ${legPhrase} ${brief.timeBand} ${brief.aircraft.replace("_", " ")} trip in ` +
      `${brief.region.replace("_", " ")}, ${rules} rules, vibe: ${brief.vibe}` +
      `${VIBE_GLOSS[brief.vibe] ? ` (${VIBE_GLOSS[brief.vibe]})` : ""}.`,
    `Aircraft profile: ${aircraft.simbrief_type}, cruise ${aircraft.cruise_tas} kt, ` +
      `ceiling ${aircraft.ceiling_ft} ft, min runway ${aircraft.min_rwy_ft} ft` +
      `${aircraft.paved_rwy_only ? " paved" : ""}.`,
    relaxLine,
    excludeLine,
    "",
    `Candidate trips (choose by index):`,
    chainLines,
    weatherLines ? `Live weather (latest METAR):\n${weatherLines}` : "",
    "",
    retryLine,
  ]
    .filter((line) => line !== "")
    .join("\n");

  return { system: SYSTEM, user };
}
