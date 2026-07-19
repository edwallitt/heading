/**
 * Runway-surface classification for the airport bake.
 *
 * OurAirports' `surface` column is free text with no controlled vocabulary: it
 * mixes the X-Plane/OurAirports three-letter codes ("ASP", "GRS", "GRE"), plain
 * English ("Grass", "Concrete"), combinations ("ASP/GRVL", "GRASS / SOD") and
 * one-off prose ("Grassed brown clay"). Everything here is best-effort bucketing
 * of that mess; anything unrecognised becomes "unknown" rather than a guess.
 */
import type { RunwaySurface } from "../../src/types.js";

/**
 * Paved tokens. Anything else (grass, gravel, dirt, water, unknown) counts as
 * unpaved, so the paved length under-reports rather than over-reports.
 */
const PAVED_SURFACE_RE = /asp|bit|con|pem|tar|paved|brick|macadam/i;

export function isPavedSurface(surface: string): boolean {
  return PAVED_SURFACE_RE.test(surface.trim());
}

/**
 * Free text → bucket. Order matters: the first pattern to match wins, so a
 * combined surface resolves to the firmer half ("GRVL-DIRT" → gravel), which is
 * the half that decides whether you can actually operate off it.
 *
 * The subtle one is "GRE": in the OurAirports/X-Plane code set that is *graded
 * earth*, not grass and not gravel, so it belongs with dirt. It appears on
 * ~1,500 runways, so getting it wrong visibly mislabels the card.
 */
const SURFACE_PATTERNS: readonly (readonly [RegExp, RunwaySurface])[] = [
  [/asp|bit|tar|macadam|pem|paved/i, "asphalt"],
  [/con|cem|brick/i, "concrete"],
  [/gvl|grv|gravel|coral|\bcor\b|shell/i, "gravel"],
  [/grass|turf|grs|sod/i, "grass"],
  [/dirt|soil|earth|gre|clay|mud|silt|later|\blat\b/i, "dirt"],
  [/sand|\bsan\b/i, "sand"],
  [/snow|\bsno\b|ice|glacier/i, "snow"],
  [/water|\bwat\b/i, "water"],
];

export function normaliseSurface(surface: string): RunwaySurface {
  const s = surface.trim();
  if (s === "") return "unknown";
  for (const [re, kind] of SURFACE_PATTERNS) {
    if (re.test(s)) return kind;
  }
  return "unknown";
}
