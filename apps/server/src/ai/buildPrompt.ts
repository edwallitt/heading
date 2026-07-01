import type { AircraftProfile } from "../data/aircraft.js";
import type { CandidateChain } from "../lib/candidatePairs.js";
import type { Brief, Rules } from "../types.js";

export interface BuildPromptInput {
  brief: Brief;
  chains: CandidateChain[];
  relaxed: string[];
  aircraft: AircraftProfile;
  /** Resolved flight rules (drives whether VFR waypoints are invited). */
  rules: Rules;
  /** Idents to avoid if possible (anti-repeat; Phase 5 wires the source). */
  excludeRecent?: string[];
  /** On a retry, the validation error from the previous attempt. */
  previousError?: string;
}

const SYSTEM = `You are a flight dispatcher for a Microsoft Flight Simulator pilot.

You are given a numbered list of REAL, pre-validated trips. Each trip is one or more legs; a multi-leg trip is an open chain (A→B→C) where you land at every stop. Your job:
1. Pick the ONE trip that best fits the brief, BY ITS INDEX. You must not invent airports — only choose from the list.
2. Write a short, evocative overview of the whole trip (80 words max). For a multi-leg trip, give a sense of the journey across its stops.
3. Write a one-line reason it fits the brief.
4. For a single-leg VFR flight only, you MAY suggest 2–5 scenic waypoints, each a real navaid identifier or a decimal "lat,lon" string. Multi-leg trips fly direct between stops — omit waypoints.

Return JSON ONLY — no prose, no markdown, no code fences — matching exactly:
{"choiceIndex": <number>, "overview": <string>, "why_this": <string>, "waypoints": <string[] | omitted>}

If a soft constraint was relaxed, word the overview honestly (e.g. note that the requested vibe could not be matched).`;

const labelFor: Record<string, string> = {
  dropped_vibe: "the vibe filter was dropped",
  widened_region: "the region was widened to anywhere",
};

/** Build the system + user prompt for one generate attempt. */
export function buildPrompt(input: BuildPromptInput): {
  system: string;
  user: string;
} {
  const { brief, chains, relaxed, aircraft, rules, excludeRecent, previousError } =
    input;

  const chainLines = chains
    .map((chain, i) => {
      const route = chain.airports
        .map((a) => `${a.ident} ${a.name} (${a.iso_country})`)
        .join(" → ");
      const perLeg = chain.legs.map((l) => `${Math.round(l.distanceNm)}`).join("+");
      const tags =
        [...new Set(chain.airports.flatMap((a) => a.vibe_tags))].join(",") || "—";
      const legWord = chain.legs.length === 1 ? "leg" : "legs";
      return (
        `[${i}] ${route} · ${chain.legs.length} ${legWord} · ` +
        `${perLeg} NM (${Math.round(chain.totalDistanceNm)} total) · vibe: ${tags}`
      );
    })
    .join("\n");

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
      `${brief.region.replace("_", " ")}, ${rules} rules, vibe: ${brief.vibe}.`,
    `Aircraft profile: ${aircraft.simbrief_type}, cruise ${aircraft.cruise_tas} kt, ` +
      `ceiling ${aircraft.ceiling_ft} ft, min runway ${aircraft.min_rwy_ft} ft.`,
    relaxLine,
    excludeLine,
    "",
    `Candidate trips (choose by index):`,
    chainLines,
    "",
    retryLine,
  ]
    .filter((line) => line !== "")
    .join("\n");

  return { system: SYSTEM, user };
}
