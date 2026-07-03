/**
 * Build-time preprocessing: OurAirports airports.csv ⋈ runways.csv → a compact,
 * committed `airports.generated.json` (§5).
 *
 * Run with: pnpm --filter server build-airports
 *
 * Reads the raw CSVs from apps/server/data/raw/ (you place them there — this
 * script never fetches over the network). Filters to real, open, ICAO-identified
 * airports with a usable runway, computes coarse vibe tags and a region, and
 * prints an in/out + per-region + per-vibe summary.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { greatCircleNm } from "../src/lib/geo.js";
import type { Airport, Region, VibeTag } from "../src/types.js";
import { MAJOR_CITIES } from "./lib/cities.js";
import { headerIndex, parseCsv } from "./lib/csv.js";
import { resolveRegion } from "./lib/regions.js";

const RAW_DIR = fileURLToPath(new URL("../data/raw/", import.meta.url));
const OUT_PATH = fileURLToPath(
  new URL("../src/data/airports.generated.json", import.meta.url),
);

const AIRPORTS_CSV = RAW_DIR + "airports.csv";
const RUNWAYS_CSV = RAW_DIR + "runways.csv";

const ALLOWED_TYPES = new Set([
  "large_airport",
  "medium_airport",
  "small_airport",
]);
const ICAO_RE = /^[A-Z]{4}$/;

// Vibe heuristics (§4 — cheap, coarse, documented).
const MOUNTAIN_MIN_ELEV_FT = 3000;
// "coastal" proxy: without a coastline dataset we use near-sea-level elevation.
// Limitation: over-includes low inland airports, under-includes elevated coastal
// ones. Good enough to *bias* selection (§11), refine later if needed.
const COASTAL_MAX_ELEV_FT = 50;
const URBAN_RADIUS_NM = 27; // ~50 km to a major city

function fail(message: string): never {
  console.error(`\n[build-airports] ${message}\n`);
  process.exit(1);
}

function ensureInputs(): void {
  const missing: string[] = [];
  if (!existsSync(AIRPORTS_CSV)) missing.push("airports.csv");
  if (!existsSync(RUNWAYS_CSV)) missing.push("runways.csv");
  if (missing.length > 0) {
    fail(
      `Missing raw input(s) in ${RAW_DIR}: ${missing.join(", ")}.\n` +
        "Download airports.csv and runways.csv from https://ourairports.com/data/\n" +
        "and place them in apps/server/data/raw/. (This script will not fetch them.)",
    );
  }
}

/**
 * OurAirports surface strings are free text ("ASP", "asphalt", "CON",
 * "Concrete", "PEM", "paved", "BIT", "TARMAC", …). Match the common paved
 * tokens; anything else (grass, gravel, dirt, water, unknown) counts as
 * unpaved, so the paved length under-reports rather than over-reports.
 */
const PAVED_SURFACE_RE = /asp|bit|con|pem|tar|paved|brick|macadam/i;

function isPavedSurface(surface: string): boolean {
  return PAVED_SURFACE_RE.test(surface.trim());
}

interface RunwayLengths {
  /** Longest open runway of any surface, ft. */
  longestFt: number;
  /** Longest open paved runway, ft; 0 if none. */
  longestPavedFt: number;
}

/** Longest non-closed runway lengths (any surface + paved) per airport ident. */
function loadLongestRunways(): Map<string, RunwayLengths> {
  const rows = parseCsv(readFileSync(RUNWAYS_CSV, "utf8"));
  const header = rows.shift();
  if (!header) fail("runways.csv is empty.");
  const col = headerIndex(header);
  const identCol = col.get("airport_ident");
  const lenCol = col.get("length_ft");
  const surfaceCol = col.get("surface");
  const closedCol = col.get("closed");
  if (identCol === undefined || lenCol === undefined) {
    fail("runways.csv missing expected columns (airport_ident, length_ft).");
  }

  const longest = new Map<string, RunwayLengths>();
  for (const row of rows) {
    if (closedCol !== undefined && row[closedCol] === "1") continue;
    const ident = row[identCol]?.trim();
    const len = Number(row[lenCol]);
    if (!ident || !Number.isFinite(len) || len <= 0) continue;
    const entry = longest.get(ident) ?? { longestFt: 0, longestPavedFt: 0 };
    if (len > entry.longestFt) entry.longestFt = len;
    const surface = surfaceCol !== undefined ? (row[surfaceCol] ?? "") : "";
    if (isPavedSurface(surface) && len > entry.longestPavedFt) {
      entry.longestPavedFt = len;
    }
    longest.set(ident, entry);
  }
  return longest;
}

/** Coarse vibe tags from elevation + coastline proxy + major-city proximity. */
function vibeTags(lat: number, lon: number, elevFt: number): VibeTag[] {
  const tags: VibeTag[] = [];
  if (elevFt > MOUNTAIN_MIN_ELEV_FT) tags.push("mountain");
  if (elevFt <= COASTAL_MAX_ELEV_FT) tags.push("coastal");
  for (const city of MAJOR_CITIES) {
    if (greatCircleNm({ lat, lon }, city) <= URBAN_RADIUS_NM) {
      tags.push("urban");
      break;
    }
  }
  return tags;
}

function main(): void {
  ensureInputs();

  const longestRwy = loadLongestRunways();

  const rows = parseCsv(readFileSync(AIRPORTS_CSV, "utf8"));
  const header = rows.shift();
  if (!header) fail("airports.csv is empty.");
  const col = headerIndex(header);
  const get = (row: string[], name: string): string =>
    row[col.get(name) ?? -1] ?? "";

  let totalIn = 0;
  const dropped = {
    type: 0,
    ident: 0,
    noRunway: 0,
    region: 0,
  };
  const out: Airport[] = [];

  for (const row of rows) {
    if (row.length <= 1) continue; // skip blank lines
    totalIn++;

    const type = get(row, "type");
    if (!ALLOWED_TYPES.has(type)) {
      dropped.type++;
      continue;
    }
    const ident = get(row, "ident").trim().toUpperCase();
    if (!ICAO_RE.test(ident)) {
      dropped.ident++;
      continue;
    }
    const rwy = longestRwy.get(ident);
    if (rwy === undefined) {
      dropped.noRunway++;
      continue;
    }
    // Instrument-procedure proxy (§4-style documented approximation): airports
    // with scheduled airline service — or large airports — reliably have
    // published approaches (ILS/RNAV) and SIDs/STARs.
    const ifrCapable =
      get(row, "scheduled_service").trim().toLowerCase() === "yes" ||
      type === "large_airport";
    const region = resolveRegion(get(row, "continent"), get(row, "iso_country"));
    if (!region) {
      dropped.region++;
      continue;
    }

    const lat = Number(get(row, "latitude_deg"));
    const lon = Number(get(row, "longitude_deg"));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      dropped.region++; // unusable coordinates — bucket with region drops
      continue;
    }
    const elevRaw = Number(get(row, "elevation_ft"));
    const elevFt = Number.isFinite(elevRaw) ? elevRaw : 0;

    out.push({
      ident,
      name: get(row, "name").trim(),
      type,
      iso_country: get(row, "iso_country").trim().toUpperCase(),
      region,
      lat,
      lon,
      elev_ft: elevFt,
      longest_rwy_ft: Math.round(rwy.longestFt),
      longest_paved_rwy_ft: Math.round(rwy.longestPavedFt),
      ifr_capable: ifrCapable,
      vibe_tags: vibeTags(lat, lon, elevFt),
    });
  }

  out.sort((a, b) => a.ident.localeCompare(b.ident));
  writeFileSync(OUT_PATH, JSON.stringify(out), "utf8");

  // ---- Summary ----
  const byRegion = new Map<Region, number>();
  const byVibe = new Map<VibeTag, number>();
  for (const a of out) {
    byRegion.set(a.region, (byRegion.get(a.region) ?? 0) + 1);
    for (const t of a.vibe_tags) byVibe.set(t, (byVibe.get(t) ?? 0) + 1);
  }

  const pavedCount = out.filter((a) => a.longest_paved_rwy_ft > 0).length;
  const ifrCount = out.filter((a) => a.ifr_capable).length;

  console.log("\n[build-airports] done.");
  console.log(`  input rows:        ${totalIn}`);
  console.log(`  emitted airports:  ${out.length}`);
  console.log(`  with paved runway: ${pavedCount}`);
  console.log(`  ifr_capable:       ${ifrCount}`);
  console.log(`  dropped — type:    ${dropped.type}`);
  console.log(`  dropped — ident:   ${dropped.ident}`);
  console.log(`  dropped — runway:  ${dropped.noRunway}`);
  console.log(`  dropped — region:  ${dropped.region}`);
  console.log("  per region:");
  for (const [r, n] of [...byRegion].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${r.padEnd(15)} ${n}`);
  }
  console.log("  per vibe tag:");
  for (const [t, n] of [...byVibe].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${t.padEnd(15)} ${n}`);
  }
  console.log(`  written: ${OUT_PATH}\n`);
}

main();
