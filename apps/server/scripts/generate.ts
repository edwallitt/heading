/**
 * CLI harness for the full AI dispatch pipeline (Phase 2, Part E).
 *
 *   pnpm --filter server generate "turboprop,45min,europe,mountains,VFR"
 *
 * Runs resolveBrief → candidatePairs → Opus selection → enrichment and
 * pretty-prints the resulting Flight. With no argument it runs a few examples.
 * Requires ANTHROPIC_API_KEY for real Opus prose; without it, the pipeline
 * still returns a complete Flight via the algorithmic fallback (marked clearly).
 */
import { createAnthropicClient } from "../src/ai/client.js";
import {
  generateFlight,
  type GenerateFlightResult,
} from "../src/ai/generateFlight.js";
import { parseBrief } from "./lib/parseBrief.js";

function printResult(input: string, result: GenerateFlightResult): void {
  console.log(`\n=== brief: ${input} ===`);
  if (result.status === "no_flight") {
    console.log(`  NO FLIGHT: ${result.reason}`);
    return;
  }

  const f = result.flight;
  const leg = f.legs[0]!;
  if (f.source === "fallback") {
    console.log("  ⚠️  ALGORITHMIC FALLBACK (model unavailable or invalid x2)");
  }
  console.log(
    `  ${leg.from_icao} → ${leg.to_icao}  ${leg.dist_nm} NM  ` +
      `~${f.est_block_min} min  ${f.rules} ${f.cruise_level}  ` +
      `[${f.aircraft_type}]`,
  );
  if (f.relaxed.length > 0) {
    console.log(`  relaxed: ${f.relaxed.join(" → ")}`);
  }
  if (leg.waypoints.length > 0) {
    console.log(`  waypoints: ${leg.waypoints.join("  ")}`);
  }
  console.log(`\n  overview: ${f.overview}`);
  console.log(`  why:      ${f.why_this}`);
}

const EXAMPLES = [
  "turboprop,45min,europe,mountains,VFR",
  "small_prop,45min,caribbean,mountains,VFR", // forces relaxation
  "airliner,3-5hr,asia,city,IFR",
];

async function main(): Promise<void> {
  const arg = process.argv[2];
  const briefs = arg ? [arg] : EXAMPLES;
  const client = createAnthropicClient();

  for (const input of briefs) {
    try {
      const brief = parseBrief(input);
      const result = await generateFlight(brief, { client });
      printResult(input, result);
    } catch (err) {
      console.error(`\n[generate] ${(err as Error).message}`);
      process.exitCode = 1;
    }
  }
}

void main();
