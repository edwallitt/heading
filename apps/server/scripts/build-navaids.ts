/**
 * Build-time preprocessing: OurAirports navaids.csv → a compact, committed
 * `navaids.generated.json`. Sibling of `build-airports.ts` — same layout,
 * summary style, and JSON-shape conventions.
 *
 * Run with: pnpm --filter server build-navaids
 *
 * Reads (and, if absent, downloads once) the raw CSV from apps/server/data/raw/
 * — that folder is gitignored, so only the generated JSON is committed.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Navaid } from "../src/types.js";
import { headerIndex, parseCsv } from "./lib/csv.js";

const RAW_DIR = fileURLToPath(new URL("../data/raw/", import.meta.url));
const NAVAIDS_CSV = RAW_DIR + "navaids.csv";
const OUT_PATH = fileURLToPath(
  new URL("../src/data/navaids.generated.json", import.meta.url),
);
const SOURCE_URL =
  "https://davidmegginson.github.io/ourairports-data/navaids.csv";

/**
 * Enroute navaids usable as named VFR scenic waypoints. Plain "DME" is dropped:
 * a standalone DME almost always duplicates a co-located VOR's ident, and we
 * prefer the VOR row. Keeping the filter simple (drop all plain DME) rather than
 * de-duping per-ident, per the task's documented fallback. ILS/localizers aren't
 * in this dataset, but anything outside this set is dropped regardless.
 */
const KEEP_TYPES = new Set([
  "VOR",
  "VOR-DME",
  "VORTAC",
  "NDB",
  "NDB-DME",
  "TACAN",
]);

function fail(message: string): never {
  console.error(`\n[build-navaids] ${message}\n`);
  process.exit(1);
}

/** Download the raw CSV once if it isn't already present. */
async function ensureInput(): Promise<void> {
  if (existsSync(NAVAIDS_CSV)) return;
  console.log(`[build-navaids] navaids.csv not found — downloading from`);
  console.log(`  ${SOURCE_URL}`);
  let res: Response;
  try {
    res = await fetch(SOURCE_URL);
  } catch (err) {
    fail(`Download failed: ${(err as Error).message}`);
  }
  if (!res.ok) fail(`Download failed: HTTP ${res.status} ${res.statusText}`);
  writeFileSync(NAVAIDS_CSV, await res.text(), "utf8");
  console.log(`[build-navaids] saved ${NAVAIDS_CSV}`);
}

async function main(): Promise<void> {
  await ensureInput();

  const rows = parseCsv(readFileSync(NAVAIDS_CSV, "utf8"));
  const header = rows.shift();
  if (!header) fail("navaids.csv is empty.");
  const col = headerIndex(header);
  const get = (row: string[], name: string): string =>
    row[col.get(name) ?? -1] ?? "";

  let totalIn = 0;
  const dropped = { type: 0, ident: 0, coords: 0 };
  const out: Navaid[] = [];

  for (const row of rows) {
    if (row.length <= 1) continue; // skip blank lines
    totalIn++;

    const type = get(row, "type").trim();
    if (!KEEP_TYPES.has(type)) {
      dropped.type++;
      continue;
    }
    const ident = get(row, "ident").trim();
    if (!ident) {
      dropped.ident++;
      continue;
    }
    const lat = Number(get(row, "latitude_deg"));
    const lon = Number(get(row, "longitude_deg"));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      dropped.coords++;
      continue;
    }

    out.push({
      ident,
      name: get(row, "name").trim(),
      type,
      lat,
      lon,
      country: get(row, "iso_country").trim().toUpperCase(),
    });
  }

  // Stable order: by ident, then country (idents are not globally unique).
  out.sort(
    (a, b) => a.ident.localeCompare(b.ident) || a.country.localeCompare(b.country),
  );
  writeFileSync(OUT_PATH, JSON.stringify(out), "utf8");

  // ---- Summary ----
  const byType = new Map<string, number>();
  const byCountry = new Map<string, number>();
  for (const n of out) {
    byType.set(n.type, (byType.get(n.type) ?? 0) + 1);
    byCountry.set(n.country, (byCountry.get(n.country) ?? 0) + 1);
  }

  console.log("\n[build-navaids] done.");
  console.log(`  input rows:       ${totalIn}`);
  console.log(`  emitted navaids:  ${out.length}`);
  console.log(`  dropped — type:   ${dropped.type}`);
  console.log(`  dropped — ident:  ${dropped.ident}`);
  console.log(`  dropped — coords: ${dropped.coords}`);
  console.log("  per type:");
  for (const [t, n] of [...byType].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${t.padEnd(10)} ${n}`);
  }
  // OurAirports has no continent column for navaids, so we bucket by country
  // (top 10) rather than reuse/duplicate the airports' continent→region map.
  console.log("  top 10 countries:");
  for (const [c, n] of [...byCountry].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    console.log(`    ${c.padEnd(10)} ${n}`);
  }
  console.log(`  written: ${OUT_PATH}\n`);
}

void main();
