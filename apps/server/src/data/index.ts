import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Airport } from "../types.js";
import { AirportIndex } from "./airportIndex.js";

/**
 * Boot-time load of the baked reference data into a typed in-memory index (§8).
 *
 * This module performs file IO at load, so it is imported only by runtime
 * entry points (the CLI harness now; the tRPC procedure in Phase 2). Unit tests
 * import the pure `airportIndex.ts` and build fixtures instead, so they never
 * depend on the generated asset.
 */
const generatedPath = fileURLToPath(
  new URL("./airports.generated.json", import.meta.url),
);

function loadAirports(): Airport[] {
  let raw: string;
  try {
    raw = readFileSync(generatedPath, "utf8");
  } catch {
    throw new Error(
      `Baked airport data not found at ${generatedPath}.\n` +
        "Run the preprocessing step first: pnpm --filter server build-airports",
    );
  }
  return JSON.parse(raw) as Airport[];
}

/** The in-memory airport index, loaded once at module load. */
export const airportIndex = new AirportIndex(loadAirports());

/** Re-export the curated aircraft profiles for runtime consumers. */
export { AIRCRAFT, getAircraft } from "./aircraft.js";
