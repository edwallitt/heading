import { describe, expect, it, vi } from "vitest";
import type { inferRouterInputs } from "@trpc/server";
import { briefSchema } from "./schema.js";
import type { AppRouter } from "./router.js";

// Mock only the two external seams the router constructs per call: the Anthropic
// client and the live-weather provider. Everything else — the candidate
// pipeline, generateFlight, and withExports — runs for real against the real
// airport data, so these tests exercise the actual request wiring end to end.

vi.mock("./ai/client.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./ai/client.js")>();
  return {
    ...actual,
    // A scripted client that always picks the first candidate. An out-of-range
    // or unparseable pick would just fall back to the algorithmic path, so this
    // stays valid regardless of how many candidates the real data yields.
    createAnthropicClient: () => ({
      async complete() {
        return JSON.stringify({
          choiceIndex: 0,
          overview: "A scenic test hop.",
          why_this: "Chosen by the integration test.",
        });
      },
    }),
  };
});

vi.mock("./weather/metar.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./weather/metar.js")>();
  return {
    ...actual,
    // No live weather in tests — an empty provider keeps dispatch deterministic
    // and offline (generateFlight treats missing weather as a non-event).
    createAwcWeatherProvider: () => ({
      async metars() {
        return new Map();
      },
    }),
  };
});

const { appRouter } = await import("./router.js");

type GenerateInput = inferRouterInputs<AppRouter>["flight"]["generate"];

/**
 * A viable single-hop brief; `anywhere`/`any` maximises the candidate pool.
 * `over` is intentionally loose so the schema-rejection tests can feed
 * out-of-range values; the cast keeps the happy-path call sites well-typed.
 */
function briefInput(over: Record<string, unknown> = {}): GenerateInput {
  return {
    timeBand: "1hr",
    region: "anywhere",
    rules: "VFR",
    vibe: "any",
    aircraft: "small_prop",
    legCount: 1,
    ...over,
  } as unknown as GenerateInput;
}

const caller = () => appRouter.createCaller({});

describe("briefSchema — the flight.generate input core", () => {
  it("defaults legCount to a single hop when omitted", () => {
    const { legCount: _omit, ...noLeg } = briefInput();
    const parsed = briefSchema.parse(noLeg);
    expect(parsed.legCount).toBe(1);
  });

  it("accepts leg counts 1–3", () => {
    for (const legCount of [1, 2, 3]) {
      expect(briefSchema.parse(briefInput({ legCount })).legCount).toBe(legCount);
    }
  });

  it("rejects an out-of-range leg count rather than coercing it", () => {
    // The .default(1)-not-.catch choice: bad input is refused, not silently widened.
    expect(() => briefSchema.parse(briefInput({ legCount: 4 }))).toThrow();
    expect(() => briefSchema.parse(briefInput({ legCount: 0 }))).toThrow();
  });

  it("rejects an unknown dial value", () => {
    expect(() => briefSchema.parse(briefInput({ timeBand: "5min" }))).toThrow();
  });
});

describe("flight.options", () => {
  it("returns the dial value lists straight off the schema", async () => {
    const opts = await caller().flight.options();
    expect(opts.dials.timeBand).toContain("1hr");
    expect(opts.dials.legCount).toEqual([1, 2, 3]);
  });

  it("marks impossible time×aircraft cells non-viable", async () => {
    const opts = await caller().flight.options();
    expect(opts.viability.airliner["20min"]).toBe(false);
    expect(opts.viability.small_prop["1hr"]).toBe(true);
    expect(opts.maxLegs.small_prop["1hr"]).toBeGreaterThanOrEqual(1);
  });
});

describe("flight.generate — router wiring", () => {
  it("attaches VFR export artifacts to a successful flight", async () => {
    const res = await caller().flight.generate(briefInput());
    expect(res.status).toBe("ok");
    if (res.status !== "ok") return;
    expect(res.flight.simbrief_url).toMatch(/^https?:\/\//);
    expect(res.flight.pln).toBeTruthy();
    expect(res.flight.pln_filename).toMatch(/\.pln$/);
  });

  it("omits the .pln for an IFR flight (SimBrief only)", async () => {
    const res = await caller().flight.generate(briefInput({ rules: "IFR" }));
    expect(res.status).toBe("ok");
    if (res.status !== "ok") return;
    expect(res.flight.rules).toBe("IFR");
    expect(res.flight.simbrief_url).toMatch(/^https?:\/\//);
    expect(res.flight.pln).toBeUndefined();
  });

  it("accepts excludeRecent and keeps it out of the returned brief", async () => {
    const res = await caller().flight.generate(
      briefInput({ excludeRecent: ["EGLL", "LFPG"] }),
    );
    expect(res.status).toBe("ok");
    if (res.status !== "ok") return;
    expect("excludeRecent" in res.flight.brief).toBe(false);
  });

  it("rejects an excludeRecent list over the cap", async () => {
    const tooMany = Array.from({ length: 21 }, (_, i) => `A${i}`);
    await expect(
      caller().flight.generate(briefInput({ excludeRecent: tooMany })),
    ).rejects.toThrow();
  });

  it("passes a typed no-flight result through without export artifacts", async () => {
    // Airliner in a 20-min budget can't reach any airport → no candidates.
    const res = await caller().flight.generate(
      briefInput({ aircraft: "airliner", timeBand: "20min" }),
    );
    expect(res.status).not.toBe("ok");
    expect(res).not.toHaveProperty("flight");
  });
});
