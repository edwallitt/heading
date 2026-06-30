/**
 * CLI harness to sanity-check the constraint → candidate-pair pipeline before
 * any UI or AI (Phase 1, Part E).
 *
 *   pnpm --filter server try-brief "turboprop,45min,europe,mountains,VFR"
 *
 * With no argument it runs a few built-in example briefs. Prints resolved
 * constraints, the resulting pairs (idents, names, distance, est block time,
 * vibe tags) and any relaxation report.
 */
import { airportIndex } from "../src/data/index.js";
import { candidatePairs } from "../src/lib/candidatePairs.js";
import { resolveBrief } from "../src/lib/resolveBrief.js";
import { parseBrief } from "./lib/parseBrief.js";

function runBrief(input: string): void {
  const brief = parseBrief(input);
  const constraints = resolveBrief(brief);
  const { pairs, relaxed } = candidatePairs(brief, airportIndex);

  console.log(`\n=== brief: ${input} ===`);
  console.log(
    `  aircraft=${brief.aircraft} (${constraints.aircraft.simbrief_type}), ` +
      `time=${brief.timeBand}, region=${brief.region}, ` +
      `vibe=${brief.vibe}, rules=${constraints.rules}`,
  );
  const band = constraints.distanceBand;
  console.log(
    band
      ? `  distance band: ${band.minNm.toFixed(0)}–${band.maxNm.toFixed(0)} NM, ` +
          `min runway ${constraints.minRunwayFt} ft`
      : "  distance band: EMPTY (budget ≤ overhead) — no pairs possible",
  );
  if (relaxed.length > 0) {
    console.log(`  RELAXED: ${relaxed.join(" → ")}`);
  } else {
    console.log("  relaxed: none");
  }

  if (pairs.length === 0) {
    console.log("  (no candidate pairs)");
    return;
  }
  console.log(`  ${pairs.length} pair(s):`);
  for (const p of pairs) {
    const tags = [...new Set([...p.origin.vibe_tags, ...p.destination.vibe_tags])];
    console.log(
      `    ${p.origin.ident} → ${p.destination.ident}  ` +
        `${p.distanceNm.toFixed(0).padStart(4)} NM  ` +
        `~${p.estBlockMin.toFixed(0).padStart(3)} min  ` +
        `[${tags.join(",") || "—"}]`,
    );
    console.log(`        ${p.origin.name}  →  ${p.destination.name}`);
  }
}

const EXAMPLES = [
  "turboprop,45min,europe,mountains,VFR",
  "small_prop,1hr,north_america,coastal,VFR",
  "airliner,3-5hr,asia,city,IFR",
  "airliner,20min,europe,any,IFR", // empty band demonstration
];

function main(): void {
  const arg = process.argv[2];
  const briefs = arg ? [arg] : EXAMPLES;
  for (const b of briefs) {
    try {
      runBrief(b);
    } catch (err) {
      console.error(`\n[try-brief] ${(err as Error).message}`);
      process.exitCode = 1;
    }
  }
}

main();
