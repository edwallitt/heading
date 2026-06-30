/**
 * CLI harness for the Phase 3 export layer.
 *
 *   pnpm --filter server export "turboprop,45min,europe,mountains,VFR"
 *
 * Runs the full generate pipeline, prints the SimBrief dispatch URL, and (for
 * VFR) writes the .pln to apps/server/.out/<orig>-<dest>.pln to load into MSFS.
 * Requires ANTHROPIC_API_KEY for real Opus prose/waypoints; without it the
 * pipeline still produces a complete Flight via the algorithmic fallback.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createAnthropicClient } from "../src/ai/client.js";
import { generateFlight } from "../src/ai/generateFlight.js";
import { withExports } from "../src/export/index.js";
import { parseBrief } from "./lib/parseBrief.js";

const OUT_DIR = fileURLToPath(new URL("../.out/", import.meta.url));

async function run(input: string): Promise<void> {
  const brief = parseBrief(input);
  const result = await generateFlight(brief, { client: createAnthropicClient() });

  console.log(`\n=== brief: ${input} ===`);
  if (result.status === "no_flight") {
    console.log(`  NO FLIGHT: ${result.reason}`);
    return;
  }

  const flight = withExports(result.flight);
  const leg = flight.legs[0]!;
  console.log(`  ${leg.from_icao} → ${leg.to_icao}  ${flight.rules}  ${flight.cruise_level}`);
  console.log(`  SimBrief: ${flight.simbrief_url}`);

  if (flight.pln && flight.pln_filename) {
    mkdirSync(OUT_DIR, { recursive: true });
    const path = OUT_DIR + flight.pln_filename;
    writeFileSync(path, flight.pln, "utf8");
    console.log(`  .pln written: ${path}`);
    const wpCount = leg.waypoints.length;
    console.log(`  waypoints in plan: ${wpCount}${wpCount ? ` (${leg.waypoints.join(", ")})` : ""}`);
  } else {
    console.log(`  .pln: none (IFR routes via SimBrief)`);
  }
}

async function main(): Promise<void> {
  const arg = process.argv[2];
  const briefs = arg
    ? [arg]
    : ["turboprop,45min,europe,mountains,VFR", "airliner,3-5hr,asia,city,IFR"];
  for (const b of briefs) {
    try {
      await run(b);
    } catch (err) {
      console.error(`\n[export] ${(err as Error).message}`);
      process.exitCode = 1;
    }
  }
}

void main();
