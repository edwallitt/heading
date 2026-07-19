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
import type {
  Airport,
  AirportFrequency,
  FrequencyType,
  Region,
  RunwaySurface,
  VibeTag,
} from "../src/types.js";
import { MAJOR_CITIES } from "./lib/cities.js";
import {
  type CoastlineIndex,
  buildCoastlineIndex,
  distanceToCoastNm,
} from "./lib/coastline.js";
import { headerIndex, parseCsv } from "./lib/csv.js";
import { isOceanic } from "./lib/oceanic.js";
import { resolveRegion } from "./lib/regions.js";
import { isPavedSurface, normaliseSurface } from "./lib/surface.js";

const RAW_DIR = fileURLToPath(new URL("../data/raw/", import.meta.url));
const OUT_PATH = fileURLToPath(
  new URL("../src/data/airports.generated.json", import.meta.url),
);

const AIRPORTS_CSV = RAW_DIR + "airports.csv";
const RUNWAYS_CSV = RAW_DIR + "runways.csv";
const FREQUENCIES_CSV = RAW_DIR + "airport-frequencies.csv";
const COASTLINE_GEOJSON = RAW_DIR + "ne_10m_coastline.geojson";

/** Frequencies are auto-downloaded when absent (same pattern as build-navaids). */
const FREQUENCIES_URL =
  "https://davidmegginson.github.io/ourairports-data/airport-frequencies.csv";

const ALLOWED_TYPES = new Set([
  "large_airport",
  "medium_airport",
  "small_airport",
]);
const ICAO_RE = /^[A-Z]{4}$/;

// Vibe heuristics (§4).
const MOUNTAIN_MIN_ELEV_FT = 3000;
// "coastal": within this many NM of an ocean coastline (Natural Earth 10m).
// Replaces the old elevation-≤50ft proxy (#6) — trustworthy for cliff-top
// coastal fields and no longer fooled by low inland river valleys. 15 NM keeps
// every inland reference (river valleys sit >30 NM out) comfortably clear while
// recovering large lagoon atolls whose strip sits across the lagoon from the
// nearest mapped shoreline (e.g. Rangiroa, Tikehau).
const COASTAL_MAX_DIST_NM = 15;
const URBAN_RADIUS_NM = 27; // ~50 km to a major city
// "hub": a big instrument field with scheduled service — the busy hub-to-hub
// operational vibe. Gated on runway length too, so a scheduled-service regional
// strip with a 4,000 ft runway doesn't read as a hub.
const HUB_MIN_RWY_FT = 7000;

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
  if (!existsSync(COASTLINE_GEOJSON)) {
    fail(
      `Missing coastline input in ${RAW_DIR}: ne_10m_coastline.geojson.\n` +
        "Download it from Natural Earth (nvkelso/natural-earth-vector, geojson/\n" +
        "ne_10m_coastline.geojson) and place it in apps/server/data/raw/.",
    );
  }
}

interface RunwayFacts {
  /** Longest open runway of any surface, ft. */
  longestFt: number;
  /** Longest open paved runway, ft; 0 if none. */
  longestPavedFt: number;
  /** True headings of every open runway end. */
  headings: Set<number>;
  /** Any open runway lighted. */
  lighted: boolean;
  /** Surface of the longest open runway (tracked alongside `longestFt`). */
  surface: RunwaySurface;
}

/** Runway facts per airport ident, from the non-closed runway rows. */
function loadRunwayFacts(): Map<string, RunwayFacts> {
  const rows = parseCsv(readFileSync(RUNWAYS_CSV, "utf8"));
  const header = rows.shift();
  if (!header) fail("runways.csv is empty.");
  const col = headerIndex(header);
  const identCol = col.get("airport_ident");
  const lenCol = col.get("length_ft");
  const surfaceCol = col.get("surface");
  const closedCol = col.get("closed");
  const lightedCol = col.get("lighted");
  const leHeadingCol = col.get("le_heading_degT");
  const heHeadingCol = col.get("he_heading_degT");
  if (identCol === undefined || lenCol === undefined) {
    fail("runways.csv missing expected columns (airport_ident, length_ft).");
  }

  const facts = new Map<string, RunwayFacts>();
  for (const row of rows) {
    if (closedCol !== undefined && row[closedCol] === "1") continue;
    const ident = row[identCol]?.trim();
    const len = Number(row[lenCol]);
    if (!ident || !Number.isFinite(len) || len <= 0) continue;
    const entry = facts.get(ident) ?? {
      longestFt: 0,
      longestPavedFt: 0,
      headings: new Set<number>(),
      lighted: false,
      surface: "unknown" as RunwaySurface,
    };
    const surface = surfaceCol !== undefined ? (row[surfaceCol] ?? "") : "";
    // Surface tracks the LONGEST runway, so it must update in the same step.
    if (len > entry.longestFt) {
      entry.longestFt = len;
      entry.surface = normaliseSurface(surface);
    }
    if (isPavedSurface(surface) && len > entry.longestPavedFt) {
      entry.longestPavedFt = len;
    }
    if (lightedCol !== undefined && row[lightedCol] === "1") entry.lighted = true;
    for (const hCol of [leHeadingCol, heHeadingCol]) {
      if (hCol === undefined) continue;
      const h = Number(row[hCol]);
      // OurAirports leaves headings blank on many strips; Number("") is 0, which
      // would fabricate a north-facing runway, so require a non-empty field.
      if ((row[hCol] ?? "").trim() === "" || !Number.isFinite(h)) continue;
      entry.headings.add(Math.round(((h % 360) + 360) % 360));
    }
    facts.set(ident, entry);
  }
  return facts;
}

/**
 * COM frequencies worth printing, at most one per type (the first published).
 * OurAirports' `type` column is free text, so it is normalised against a small
 * whitelist; everything else (centre, radar, weather stations, ops) is dropped.
 */
const FREQ_TYPE_ALIASES: ReadonlyMap<string, FrequencyType> = new Map([
  ["TWR", "TWR"],
  ["TOWER", "TWR"],
  ["ATIS", "ATIS"],
  ["GND", "GND"],
  ["GROUND", "GND"],
  ["CLD", "CLD"],
  ["DEL", "CLD"],
  ["CTAF", "CTAF"],
  ["UNIC", "UNICOM"],
  ["UNICOM", "UNICOM"],
  ["AFIS", "AFIS"],
]);

function loadFrequencies(): Map<string, AirportFrequency[]> {
  const rows = parseCsv(readFileSync(FREQUENCIES_CSV, "utf8"));
  const header = rows.shift();
  if (!header) fail("airport-frequencies.csv is empty.");
  const col = headerIndex(header);
  const identCol = col.get("airport_ident");
  const typeCol = col.get("type");
  const mhzCol = col.get("frequency_mhz");
  if (identCol === undefined || typeCol === undefined || mhzCol === undefined) {
    fail(
      "airport-frequencies.csv missing expected columns (airport_ident, type, frequency_mhz).",
    );
  }

  const out = new Map<string, AirportFrequency[]>();
  for (const row of rows) {
    const ident = row[identCol]?.trim();
    const type = FREQ_TYPE_ALIASES.get((row[typeCol] ?? "").trim().toUpperCase());
    const mhz = Number(row[mhzCol]);
    if (!ident || !type) continue;
    // VHF airband only — the CSV carries a few 0 and out-of-band rows.
    if (!Number.isFinite(mhz) || mhz < 108 || mhz > 137) continue;
    const list = out.get(ident) ?? [];
    if (list.some((f) => f.type === type)) continue; // keep the first per type
    list.push({ type, mhz: Math.round(mhz * 1000) / 1000 });
    out.set(ident, list);
  }
  // Stable, readable order on the card rather than CSV order.
  const ORDER: FrequencyType[] = [
    "ATIS",
    "CLD",
    "GND",
    "TWR",
    "CTAF",
    "UNICOM",
    "AFIS",
  ];
  for (const list of out.values()) {
    list.sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type));
  }
  return out;
}

/** Download the frequencies CSV once if it isn't already present. */
async function ensureFrequencies(): Promise<void> {
  if (existsSync(FREQUENCIES_CSV)) return;
  console.log("[build-airports] airport-frequencies.csv not found — downloading");
  console.log(`  ${FREQUENCIES_URL}`);
  let res: Response;
  try {
    res = await fetch(FREQUENCIES_URL);
  } catch (err) {
    fail(`Download failed: ${(err as Error).message}`);
  }
  if (!res.ok) fail(`Download failed: HTTP ${res.status} ${res.statusText}`);
  writeFileSync(FREQUENCIES_CSV, await res.text(), "utf8");
  console.log(`[build-airports] saved ${FREQUENCIES_CSV}`);
}

/** What the vibe heuristics need to classify one airport. */
interface VibeInput {
  lat: number;
  lon: number;
  elevFt: number;
  isoCountry: string;
  isoRegion: string;
  ifrCapable: boolean;
  longestRwyFt: number;
}

/**
 * Vibe tags: the scenery-led three (elevation, distance-to-coast, major-city
 * proximity) plus the two operational ones (§3's reserved slot) — "hub" for
 * busy instrument fields and "oceanic" for island operations.
 */
function vibeTags(a: VibeInput, coast: CoastlineIndex): VibeTag[] {
  const tags: VibeTag[] = [];
  if (a.elevFt > MOUNTAIN_MIN_ELEV_FT) tags.push("mountain");
  if (distanceToCoastNm(coast, a.lat, a.lon) <= COASTAL_MAX_DIST_NM) {
    tags.push("coastal");
  }
  for (const city of MAJOR_CITIES) {
    if (greatCircleNm(a, city) <= URBAN_RADIUS_NM) {
      tags.push("urban");
      break;
    }
  }
  if (a.ifrCapable && a.longestRwyFt >= HUB_MIN_RWY_FT) tags.push("hub");
  if (isOceanic(a.isoCountry, a.isoRegion)) tags.push("oceanic");
  return tags;
}

async function main(): Promise<void> {
  ensureInputs();
  await ensureFrequencies();

  const runwayFacts = loadRunwayFacts();
  const frequencies = loadFrequencies();
  const coastline = buildCoastlineIndex(readFileSync(COASTLINE_GEOJSON, "utf8"));

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
    const rwy = runwayFacts.get(ident);
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
      rwy_headings: [...rwy.headings].sort((a, b) => a - b),
      rwy_lighted: rwy.lighted,
      rwy_surface: rwy.surface,
      freqs: frequencies.get(ident) ?? [],
      vibe_tags: vibeTags(
        {
          lat,
          lon,
          elevFt,
          isoCountry: get(row, "iso_country"),
          isoRegion: get(row, "iso_region"),
          ifrCapable,
          longestRwyFt: rwy.longestFt,
        },
        coastline,
      ),
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
  const headingCount = out.filter((a) => a.rwy_headings.length > 0).length;
  const lightedCount = out.filter((a) => a.rwy_lighted).length;
  const freqCount = out.filter((a) => a.freqs.length > 0).length;
  const towerCount = out.filter((a) =>
    a.freqs.some((f) => f.type === "TWR"),
  ).length;
  // Vibe counts under the jet hard-filters (paved + instrument + 5,000 ft), so a
  // hollow operational vibe — one that would relax to "anywhere" on every jet
  // brief — shows up here rather than in production.
  const jetPool = out.filter(
    (a) => a.ifr_capable && a.longest_paved_rwy_ft >= 5000,
  );

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
  console.log(`  with rwy headings: ${headingCount}`);
  console.log(`  lighted runway:    ${lightedCount}`);
  console.log(`  with COM freqs:    ${freqCount} (tower: ${towerCount})`);
  console.log("  per vibe tag:");
  for (const [t, n] of [...byVibe].sort((a, b) => b[1] - a[1])) {
    const inJetPool = jetPool.filter((a) => a.vibe_tags.includes(t)).length;
    console.log(`    ${t.padEnd(15)} ${String(n).padEnd(7)} (jet-eligible: ${inJetPool})`);
  }
  console.log(`  jet-eligible pool: ${jetPool.length}`);
  console.log(`  written: ${OUT_PATH}\n`);
}

main();
