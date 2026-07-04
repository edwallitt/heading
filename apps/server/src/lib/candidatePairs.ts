import type { AirportIndex } from "../data/airportIndex.js";
import type { Airport, Brief, CandidatePair } from "../types.js";
import { estBlockMin } from "./blockTime.js";
import { boundingBox, greatCircleNm } from "./geo.js";
import { resolveBrief, type ResolvedConstraints } from "./resolveBrief.js";

export interface CandidatePairOptions {
  /** Minimum acceptable pair count before relaxing (§11 default). */
  threshold: number;
  /** Maximum pairs returned. */
  limit: number;
  /** How many origins to sample from the hard-filtered pool. */
  originSample: number;
  /**
   * Recently-shown airport idents (feature #3, server-side anti-repeat). Chains
   * touching these are *demoted* in every ranking so "Generate again" reliably
   * surfaces something fresh — never filtered out, so the relaxation ladder and
   * the honest best-effort pool are unaffected. Empty = a byte-for-byte no-op.
   */
  excludeRecent: readonly string[];
}

const DEFAULTS: CandidatePairOptions = {
  threshold: 3,
  limit: 10,
  originSample: 60,
  excludeRecent: [],
};

/** Labels for the relaxation report, applied in fixed order (§3/§4). */
export type RelaxationStep = "dropped_vibe" | "widened_region";

export interface CandidatePairResult {
  pairs: CandidatePair[];
  /** What was relaxed to reach this result, in the order applied. */
  relaxed: RelaxationStep[];
}

/**
 * The §4 candidate-pair pipeline as pure functions.
 *
 * Hard-filters an origin pool (region + min runway — paved-only and
 * instrument-procedure-capable for jet categories; airports are pre-cleaned to
 * open, runway-bearing, ICAO-identified types at build time), samples origins,
 * finds destinations in the distance band (bounding-box prefilter THEN exact
 * great-circle), soft-ranks by vibe match, and — if too few pairs survive —
 * relaxes in fixed order (drop vibe → widen region), recording what it bent.
 *
 * Aircraft, time, and rules are never changed.
 */
export function candidatePairs(
  brief: Brief,
  index: AirportIndex,
  options: Partial<CandidatePairOptions> = {},
): CandidatePairResult {
  const opts = { ...DEFAULTS, ...options };
  const base = resolveBrief(brief);

  // Empty distance band (budget ≤ overhead): nothing is reachable and nothing
  // is relaxable — report no relaxation rather than a spurious "widened_region".
  if (!base.distanceBand) return { pairs: [], relaxed: [] };

  let lastPairs: CandidatePair[] = [];
  let lastRelaxed: RelaxationStep[] = [];
  for (const step of relaxationLadder(base)) {
    lastPairs = runPipeline(step.constraints, index, opts);
    lastRelaxed = step.relaxed;
    if (lastPairs.length >= opts.threshold) break;
  }

  return { pairs: lastPairs.slice(0, opts.limit), relaxed: lastRelaxed };
}

/**
 * Cumulative relaxation ladder: full → drop vibe → widen region. Aircraft, time,
 * rules, and leg count are never bent. Shared by the pair and chain pipelines.
 */
function relaxationLadder(
  base: ResolvedConstraints,
): { relaxed: RelaxationStep[]; constraints: ResolvedConstraints }[] {
  const ladder: { relaxed: RelaxationStep[]; constraints: ResolvedConstraints }[] =
    [{ relaxed: [], constraints: base }];
  const applied: RelaxationStep[] = [];
  let cur = base;
  if (base.vibeTags.length > 0) {
    applied.push("dropped_vibe");
    cur = { ...cur, vibeTags: [] };
    ladder.push({ relaxed: [...applied], constraints: cur });
  }
  if (base.region !== "anywhere") {
    applied.push("widened_region");
    cur = { ...cur, region: "anywhere" };
    ladder.push({ relaxed: [...applied], constraints: cur });
  }
  return ladder;
}

/** One hop of a chain, endpoints resolved to full airports for enrichment. */
export interface ChainLeg {
  origin: Airport;
  destination: Airport;
  distanceNm: number;
}

/** A scored open chain of `legCount + 1` airports (A→B→C…), no airport repeated. */
export interface CandidateChain {
  airports: Airport[];
  legs: ChainLeg[];
  totalDistanceNm: number;
  /** Summed vibe match across all legs (soft-rank key). */
  vibeScore: number;
}

export interface CandidateChainResult {
  chains: CandidateChain[];
  relaxed: RelaxationStep[];
}

/**
 * The multi-leg generalisation of {@link candidatePairs}: builds a pool of open
 * chains of `brief.legCount` legs (1 → identical to a single pair, wrapped as a
 * two-airport chain). Each leg is drawn from the SAME per-leg distance band, so
 * the whole chain fits the total time budget. Seeds come from the pair pipeline;
 * each seed is greedily extended from its current endpoint, never revisiting an
 * airport, and dead-end seeds (no legal next hop) are discarded. Relaxes vibe
 * then region, exactly like the pair pipeline, until enough chains survive.
 */
export function candidateChains(
  brief: Brief,
  index: AirportIndex,
  options: Partial<CandidatePairOptions> = {},
): CandidateChainResult {
  const opts = { ...DEFAULTS, ...options };
  const base = resolveBrief(brief);
  if (!base.distanceBand) return { chains: [], relaxed: [] };

  let lastChains: CandidateChain[] = [];
  let lastRelaxed: RelaxationStep[] = [];
  for (const step of relaxationLadder(base)) {
    lastChains = buildChains(step.constraints, index, opts, base.legCount);
    lastRelaxed = step.relaxed;
    if (lastChains.length >= opts.threshold) break;
  }

  return { chains: lastChains.slice(0, opts.limit), relaxed: lastRelaxed };
}

/** Extend each seed pair into a full chain, then soft-rank the chains. */
function buildChains(
  c: ResolvedConstraints,
  index: AirportIndex,
  opts: CandidatePairOptions,
  legCount: number,
): CandidateChain[] {
  const recent = new Set(opts.excludeRecent);
  const seeds = runPipeline(c, index, opts); // ranked, deduped leg-1 pairs
  const chains: CandidateChain[] = [];
  for (const seed of seeds) {
    const chain = extendChain(seed, c, index, legCount, recent);
    if (chain) chains.push(chain);
    if (chains.length >= opts.limit) break;
  }

  // Soft rank: fewer recently-shown airports first (anti-repeat, counted across
  // the whole chain — origins repeat hardest on single-leg regenerates), then
  // vibe match desc, shorter total first, then idents for determinism. Empty
  // recency list → every penalty 0 → identical order to before.
  const recencyPenalty = (chain: CandidateChain): number =>
    chain.airports.reduce((n, a) => n + (recent.has(a.ident) ? 1 : 0), 0);
  chains.sort(
    (a, b) =>
      recencyPenalty(a) - recencyPenalty(b) ||
      b.vibeScore - a.vibeScore ||
      a.totalDistanceNm - b.totalDistanceNm ||
      a.airports[0]!.ident.localeCompare(b.airports[0]!.ident) ||
      last(a.airports).ident.localeCompare(last(b.airports).ident),
  );
  return chains;
}

/**
 * Greedily grow a seed pair to `legCount + 1` airports. From each endpoint, take
 * the best-ranked reachable destination not already in the chain. Returns null
 * if a leg dead-ends before the target length (the caller tries the next seed).
 */
function extendChain(
  seed: CandidatePair,
  c: ResolvedConstraints,
  index: AirportIndex,
  legCount: number,
  recent: ReadonlySet<string>,
): CandidateChain | null {
  const airports: Airport[] = [seed.origin, seed.destination];
  const legs: ChainLeg[] = [
    { origin: seed.origin, destination: seed.destination, distanceNm: seed.distanceNm },
  ];
  const used = new Set<string>([seed.origin.ident, seed.destination.ident]);

  while (airports.length < legCount + 1) {
    const from = airports[airports.length - 1]!;
    const next = rankedDestinations(from, c, index, recent).find(
      (d) => !used.has(d.destination.ident),
    );
    if (!next) return null; // this seed can't reach the requested length
    used.add(next.destination.ident);
    airports.push(next.destination);
    legs.push({ origin: from, destination: next.destination, distanceNm: next.distanceNm });
  }

  return {
    airports,
    legs,
    totalDistanceNm: legs.reduce((sum, l) => sum + l.distanceNm, 0),
    vibeScore: legs.reduce(
      (sum, l) => sum + vibeScore(c.vibeTags, l.origin, l.destination),
      0,
    ),
  };
}

/** Reachable, constraint-passing destinations from a fixed origin, ranked. */
function rankedDestinations(
  origin: Airport,
  c: ResolvedConstraints,
  index: AirportIndex,
  recent: ReadonlySet<string> = new Set(),
): { destination: Airport; distanceNm: number; vibeScore: number }[] {
  const band = c.distanceBand;
  if (!band) return [];

  const box = boundingBox(origin, band.maxNm);
  const out: { destination: Airport; distanceNm: number; vibeScore: number }[] = [];
  for (const d of index.withinBox(box, c.region)) {
    if (d.ident === origin.ident) continue;
    if (!passesAirportFilter(d, c)) continue;
    if (
      c.vibeTags.length > 0 &&
      !c.vibeTags.some((t) => d.vibe_tags.includes(t))
    ) {
      continue;
    }
    const dist = greatCircleNm(origin, d);
    if (dist < band.minNm || dist > band.maxNm) continue;
    out.push({ destination: d, distanceNm: dist, vibeScore: vibeScore(c.vibeTags, origin, d) });
  }

  // Prefer fresh next hops (anti-repeat) before vibe/distance; empty set → no-op.
  out.sort(
    (a, b) =>
      Number(recent.has(a.destination.ident)) -
        Number(recent.has(b.destination.ident)) ||
      b.vibeScore - a.vibeScore ||
      a.distanceNm - b.distanceNm ||
      a.destination.ident.localeCompare(b.destination.ident),
  );
  return out;
}

const last = <T>(arr: T[]): T => arr[arr.length - 1]!;

/**
 * Airport-level hard filter: runway length (paved-only for jets) and, for jet
 * categories, the instrument-procedure requirement. Shared by the origin pool,
 * the pair destination loop, and chain extension so no path can bypass it.
 */
function passesAirportFilter(a: Airport, c: ResolvedConstraints): boolean {
  const rwyFt = c.pavedRwyOnly ? a.longest_paved_rwy_ft : a.longest_rwy_ft;
  if (rwyFt < c.minRunwayFt) return false;
  if (c.ifrCapableOnly && !a.ifr_capable) return false;
  return true;
}

/** One pass of the hard-filter + distance-band + soft-rank pipeline. */
function runPipeline(
  c: ResolvedConstraints,
  index: AirportIndex,
  opts: CandidatePairOptions,
): CandidatePair[] {
  const band = c.distanceBand;
  if (!band) return []; // empty band (budget ≤ overhead) → no candidates

  const originPool = index
    .inRegion(c.region)
    .filter((a) => passesAirportFilter(a, c));
  const origins = sample(originPool, opts.originSample);

  const recent = new Set(opts.excludeRecent);
  const pairs: CandidatePair[] = [];
  const seen = new Set<string>(); // collapse reciprocal/duplicate pairs

  for (const o of origins) {
    const box = boundingBox(o, band.maxNm);
    const dests = index.withinBox(box, c.region);
    for (const d of dests) {
      if (d.ident === o.ident) continue;
      if (!passesAirportFilter(d, c)) continue;
      // Vibe is a destination filter when requested (you fly *to* the character).
      if (
        c.vibeTags.length > 0 &&
        !c.vibeTags.some((t) => d.vibe_tags.includes(t))
      ) {
        continue;
      }
      const dist = greatCircleNm(o, d);
      if (dist < band.minNm || dist > band.maxNm) continue;

      const key =
        o.ident < d.ident ? `${o.ident}|${d.ident}` : `${d.ident}|${o.ident}`;
      if (seen.has(key)) continue;
      seen.add(key);

      pairs.push({
        origin: o,
        destination: d,
        distanceNm: dist,
        estBlockMin: estBlockMin(dist, c.aircraft),
        vibeScore: vibeScore(c.vibeTags, o, d),
      });
    }
  }

  // Soft rank: fewer recently-shown endpoints first (anti-repeat), then vibe
  // match desc, then nearer first, then ident for determinism. Recency leads so
  // fresh seeds get built into chains; with an empty list every penalty is 0 and
  // the vibe/distance keys decide exactly as before.
  const recencyPenalty = (p: CandidatePair): number =>
    (recent.has(p.origin.ident) ? 1 : 0) + (recent.has(p.destination.ident) ? 1 : 0);
  pairs.sort(
    (a, b) =>
      recencyPenalty(a) - recencyPenalty(b) ||
      b.vibeScore - a.vibeScore ||
      a.distanceNm - b.distanceNm ||
      a.origin.ident.localeCompare(b.origin.ident) ||
      a.destination.ident.localeCompare(b.destination.ident),
  );
  return pairs;
}

/** Count of requested vibe tags present across both endpoints. */
function vibeScore(tags: readonly string[], o: Airport, d: Airport): number {
  if (tags.length === 0) return 0;
  let n = 0;
  for (const t of tags) {
    if (o.vibe_tags.includes(t as Airport["vibe_tags"][number])) n++;
    if (d.vibe_tags.includes(t as Airport["vibe_tags"][number])) n++;
  }
  return n;
}

/** Deterministic even-stride sample so queries spread across the pool. */
function sample<T>(arr: readonly T[], n: number): T[] {
  if (arr.length <= n) return [...arr];
  const out: T[] = [];
  const stride = arr.length / n;
  for (let i = 0; i < n; i++) out.push(arr[Math.floor(i * stride)]!);
  return out;
}
