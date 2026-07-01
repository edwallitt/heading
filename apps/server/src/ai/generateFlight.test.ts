import { describe, expect, it } from "vitest";
import { buildAirportIndex } from "../data/airportIndex.js";
import type { Airport, Brief, Region, VibeTag } from "../types.js";
import type { LlmClient } from "./client.js";
import { generateFlight } from "./generateFlight.js";

/** A line of airports ~100 NM apart (turboprop @ 45 min band ≈ 89–120 NM). */
function line(
  prefix: string,
  region: Region,
  count: number,
  vibe: VibeTag[] = [],
): Airport[] {
  const out: Airport[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      ident: `${prefix}${i}`,
      name: `${prefix} Field ${i}`,
      type: "medium_airport",
      iso_country: "XX",
      region,
      lat: 50 + i * (100 / 60),
      lon: 0,
      elev_ft: 0,
      longest_rwy_ft: 5000,
      vibe_tags: [...vibe],
    });
  }
  return out;
}

const index = buildAirportIndex(line("EU", "europe", 4, ["mountain"]));

const brief = (over: Partial<Brief> = {}): Brief => ({
  aircraft: "turboprop",
  timeBand: "45min",
  region: "europe",
  vibe: "mountain",
  rules: "VFR",
  legCount: 1,
  ...over,
});

/** Mock LLM client: returns scripted responses and records each call's input. */
function mockClient(responses: string[]): {
  client: LlmClient;
  inputs: { system: string; user: string }[];
  calls: () => number;
} {
  const inputs: { system: string; user: string }[] = [];
  return {
    client: {
      async complete(input) {
        const r = responses[Math.min(inputs.length, responses.length - 1)] ?? "";
        inputs.push(input);
        return r;
      },
    },
    inputs,
    calls: () => inputs.length,
  };
}

const ok = (choiceIndex: number, extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    choiceIndex,
    overview: "A scenic Alpine hop.",
    why_this: "Mountains both ends.",
    ...extra,
  });

describe("generateFlight — model output validation", () => {
  it("uses a valid model pick (single call, source=llm)", async () => {
    const m = mockClient([ok(0)]);
    const res = await generateFlight(brief(), { index, client: m.client });

    expect(res.status).toBe("ok");
    if (res.status !== "ok") return;
    expect(res.flight.source).toBe("llm");
    expect(res.flight.overview).toBe("A scenic Alpine hop.");
    expect(res.flight.legs[0]!.from_icao).toBe("EU0"); // top-ranked pair, index 0
    expect(m.calls()).toBe(1);
  });

  it("retries once when the index is out of range, then succeeds", async () => {
    const m = mockClient([ok(999), ok(0)]);
    const res = await generateFlight(brief(), { index, client: m.client });

    expect(res.status).toBe("ok");
    if (res.status !== "ok") return;
    expect(res.flight.source).toBe("llm");
    expect(m.calls()).toBe(2); // first rejected (out of range), second accepted
    // The retry must feed the validation error back into the prompt.
    expect(m.inputs[0]!.user).not.toMatch(/out of range/);
    expect(m.inputs[1]!.user).toMatch(/out of range/);
  });

  it("falls back algorithmically after two invalid responses", async () => {
    const m = mockClient(["not json at all", ok(999)]);
    const res = await generateFlight(brief(), { index, client: m.client });

    expect(res.status).toBe("ok");
    if (res.status !== "ok") return;
    expect(res.flight.source).toBe("fallback");
    expect(m.calls()).toBe(2);
    // Templated overview references the real distance + idents.
    expect(res.flight.overview).toMatch(/NM .*hop from/);
    expect(res.flight.legs[0]!.from_icao).toBe("EU0");
  });
});

describe("generateFlight — no-flight + enrichment", () => {
  it("returns a typed no-flight result for an impossible budget (no model call)", async () => {
    const m = mockClient([ok(0)]);
    const res = await generateFlight(
      brief({ aircraft: "airliner", timeBand: "20min" }),
      { index, client: m.client },
    );

    expect(res.status).toBe("no_flight");
    expect(m.calls()).toBe(0); // never call the model when nothing is reachable
  });

  it("snaps the VFR cruise altitude to a legal hemispheric level", async () => {
    const m = mockClient([ok(0)]);
    const res = await generateFlight(brief(), { index, client: m.client });

    expect(res.status).toBe("ok");
    if (res.status !== "ok") return;
    expect(res.flight.rules).toBe("VFR");
    // VFR hemispheric levels always end in 500.
    expect(Number(res.flight.cruise_level) % 1000).toBe(500);
  });

  it("keeps only valid lat/lon VFR waypoints and drops named navaids", async () => {
    const m = mockClient([
      ok(0, { waypoints: ["46.5,7.5", "DVOR", "999,999"] }),
    ]);
    const res = await generateFlight(brief(), { index, client: m.client });

    expect(res.status).toBe("ok");
    if (res.status !== "ok") return;
    expect(res.flight.legs[0]!.waypoints).toEqual(["46.5,7.5"]);
  });

  it("computes distance and block time from our libs, not the model", async () => {
    const m = mockClient([ok(0)]);
    const res = await generateFlight(brief(), { index, client: m.client });

    expect(res.status).toBe("ok");
    if (res.status !== "ok") return;
    const leg = res.flight.legs[0]!;
    expect(leg.dist_nm).toBeGreaterThanOrEqual(89);
    expect(leg.dist_nm).toBeLessThanOrEqual(120);
    expect(res.flight.est_block_min).toBeGreaterThan(20); // > turboprop overhead
  });
});

describe("generateFlight — multi-leg", () => {
  // ~416 NM spacing suits turboprop @ 3–5 hr / 2 legs (per-leg band ~354–479 NM).
  const chainIndex = buildAirportIndex(
    Array.from({ length: 3 }, (_, i) => ({
      ident: `US${i}`,
      name: `US Field ${i}`,
      type: "medium_airport" as const,
      iso_country: "XX",
      region: "europe" as Region,
      lat: 40 + i * (416 / 60),
      lon: 0,
      elev_ft: 0,
      longest_rwy_ft: 5000,
      vibe_tags: [] as VibeTag[],
    })),
  );

  it("builds a contiguous 2-leg flight; block time is the summed per-leg total", async () => {
    // No client → algorithmic fallback picks chains[0], exercising multi-leg enrich.
    const res = await generateFlight(
      brief({ timeBand: "3-5hr", vibe: "any", legCount: 2 }),
      { index: chainIndex },
    );

    expect(res.status).toBe("ok");
    if (res.status !== "ok") return;
    const legs = res.flight.legs;
    expect(legs.length).toBe(2);
    expect(legs[0]!.to_icao).toBe(legs[1]!.from_icao); // land, then continue
    const idents = [legs[0]!.from_icao, ...legs.map((l) => l.to_icao)];
    expect(new Set(idents).size).toBe(3); // no airport revisited
    expect(legs.every((l) => l.cruise_level.length > 0)).toBe(true); // per-leg cruise

    // Total block = sum of each leg's overhead + cruise (each leg carries overhead).
    const perLeg = legs.map((l) => 20 + (l.dist_nm / 250) * 60);
    expect(res.flight.est_block_min).toBe(
      Math.round(perLeg.reduce((a, b) => a + b, 0)),
    );
  });
});
