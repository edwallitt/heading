import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { greatCircleNm } from "../lib/geo.js";
import type { LatLon, Navaid } from "../types.js";

export type { Navaid } from "../types.js";

/**
 * Boot-time load of the baked navaid set into an in-memory ident index,
 * mirroring the airport loader. Feeds scenic-waypoint generation: candidate
 * suggestion in the prompt and ident resolution in `lib/scenicWaypoints`.
 */
const generatedPath = fileURLToPath(
  new URL("./navaids.generated.json", import.meta.url),
);

function loadNavaids(): Navaid[] {
  let raw: string;
  try {
    raw = readFileSync(generatedPath, "utf8");
  } catch {
    throw new Error(
      `Baked navaid data not found at ${generatedPath}.\n` +
        "Run the preprocessing step first: pnpm --filter server build-navaids",
    );
  }
  return JSON.parse(raw) as Navaid[];
}

const all: Navaid[] = loadNavaids();

/** The full baked navaid set (read-only; injectable seam for tests). */
export const allNavaids: readonly Navaid[] = all;

const byIdent = new Map<string, Navaid[]>();
for (const n of all) {
  const key = n.ident.toUpperCase();
  const bucket = byIdent.get(key);
  if (bucket) bucket.push(n);
  else byIdent.set(key, [n]);
}

/** Total navaids loaded. */
export const navaidCount = all.length;

/**
 * Look up a navaid by exact ident (case-insensitive). Idents are NOT globally
 * unique — the same beacon ident is reused across regions — so:
 *   - with a `{ lat, lon }` hint, return the geographically nearest match;
 *   - without a hint, return the first (idents are sorted, so this is stable).
 * Returns `undefined` when no ident matches.
 */
export function findNavaid(ident: string, hint?: LatLon): Navaid | undefined {
  const matches = byIdent.get(ident.trim().toUpperCase());
  if (!matches || matches.length === 0) return undefined;
  if (matches.length === 1 || !hint) return matches[0];

  let best = matches[0]!;
  let bestDist = greatCircleNm(hint, best);
  for (const candidate of matches.slice(1)) {
    const dist = greatCircleNm(hint, candidate);
    if (dist < bestDist) {
      best = candidate;
      bestDist = dist;
    }
  }
  return best;
}
