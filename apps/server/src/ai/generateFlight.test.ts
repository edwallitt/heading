import { describe, expect, it } from "vitest";
import { buildAirportIndex } from "../data/airportIndex.js";
import type { CandidateChain } from "../lib/candidatePairs.js";
import type {
  Airport,
  AirportWeather,
  Brief,
  Navaid,
  Region,
  VibeTag,
} from "../types.js";
import type { WeatherProvider } from "../weather/metar.js";
import type { LlmClient } from "./client.js";
import { demoteBelowMinima, generateFlight } from "./generateFlight.js";

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
      longest_paved_rwy_ft: 5000,
      ifr_capable: true,
      rwy_headings: [90, 270],
      rwy_lighted: true,
      rwy_surface: "asphalt",
      freqs: [{ type: "TWR", mhz: 118.5 }],
      vibe_tags: [...vibe],
    });
  }
  return out;
}

const index = buildAirportIndex(line("EU", "europe", 4, ["mountain"]));

/** Minimal synthetic navaid for the injectable scenic-waypoint seam. */
const navaid = (ident: string, lat: number, lon: number): Navaid => ({
  ident,
  name: `${ident} Beacon`,
  type: "VOR",
  lat,
  lon,
  country: "XX",
});

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

  it("resolves navaid idents + lat/lon waypoints on the corridor, drops off-route ones", async () => {
    // Chain 0 is EU0 (50°N) → EU1 (51.67°N) along lon 0. MID sits on that
    // course; "10,10" parses but is a continent away; "junk!" parses as nothing.
    const m = mockClient([
      ok(0, { waypoints: ["MID", "50.5,0.05", "10,10", "junk!"] }),
    ]);
    const res = await generateFlight(brief(), {
      index,
      client: m.client,
      navaids: [navaid("MID", 50.8, 0.1), navaid("FAR", 10.1, 10.1)],
    });

    expect(res.status).toBe("ok");
    if (res.status !== "ok") return;
    const wps = res.flight.legs[0]!.waypoints;
    // Fly order (distance from the leg origin): the 50.5°N point, then MID.
    expect(wps.map((w) => w.ident)).toEqual(["WP1", "MID"]);
    expect(wps[0]).toMatchObject({ kind: "user", lat: 50.5, lon: 0.05 });
    expect(wps[1]).toMatchObject({
      kind: "navaid",
      name: "MID Beacon",
      type: "VOR",
      lat: 50.8,
    });
    // The prompt offered the on-corridor navaid for the model to pick from.
    expect(m.inputs[0]!.user).toContain("navaids: MID (VOR)");
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

/** Minimal AirportWeather with the given category; details are nulls. */
function wx(icao: string, category: AirportWeather["category"]): AirportWeather {
  return {
    icao,
    raw: `${icao} 211200Z ...`,
    category,
    wind_dir_deg: 250,
    wind_kt: 10,
    gust_kt: null,
    visibility_sm: 6,
    ceiling_ft: null,
    temp_c: 18,
    observed_utc: "2026-06-21T12:00:00Z",
  };
}

const stubProvider = (reports: AirportWeather[]): WeatherProvider => ({
  async metars() {
    return new Map(reports.map((r) => [r.icao, r]));
  },
});

// Mid-latitude fixtures + a June date → the evening sun always exists.
const JUNE_NOON = new Date("2026-06-21T12:00:00Z");

describe("generateFlight — live weather + golden hour", () => {
  it("attaches per-stop weather in stop order and a golden-hour suggestion", async () => {
    const m = mockClient([ok(0)]);
    const res = await generateFlight(brief(), {
      index,
      client: m.client,
      weather: stubProvider([wx("EU1", "MVFR"), wx("EU0", "VFR")]),
      now: JUNE_NOON,
    });

    expect(res.status).toBe("ok");
    if (res.status !== "ok") return;

    const stops = [
      res.flight.legs[0]!.from_icao,
      ...res.flight.legs.map((l) => l.to_icao),
    ];
    expect(res.flight.weather?.map((w) => w.icao)).toEqual(stops);

    const golden = res.flight.golden_hour;
    expect(golden).toBeDefined();
    expect(golden!.dest_icao).toBe(stops[stops.length - 1]);
    // Depart backs the block time off the golden-hour arrival; sunset is later.
    const depart = new Date(golden!.depart_utc).getTime();
    const arrive = new Date(golden!.arrive_utc).getTime();
    expect(arrive - depart).toBe(res.flight.est_block_min * 60_000);
    expect(new Date(golden!.sunset_utc).getTime()).toBeGreaterThan(arrive);
  });

  it("attaches baked field data for every stop, in stop order", async () => {
    const m = mockClient([ok(0)]);
    // No weather provider: facilities are baked reference data, so unlike
    // `weather` they must be present even when every live lookup is absent.
    const res = await generateFlight(brief(), { index, client: m.client });

    expect(res.status).toBe("ok");
    if (res.status !== "ok") return;

    const stops = [
      res.flight.legs[0]!.from_icao,
      ...res.flight.legs.map((l) => l.to_icao),
    ];
    expect(res.flight.weather).toBeUndefined();
    expect(res.flight.facilities?.map((f) => f.icao)).toEqual(stops);
    for (const f of res.flight.facilities ?? []) {
      expect(f.longest_rwy_ft).toBe(5000);
      expect(f.rwy_surface).toBe("asphalt");
      expect(f.freqs).toEqual([{ type: "TWR", mhz: 118.5 }]);
    }
  });

  it("feeds METAR categories and decoded conditions to the model", async () => {
    const m = mockClient([ok(0)]);
    await generateFlight(brief(), {
      index,
      client: m.client,
      weather: stubProvider([wx("EU0", "VFR")]),
      now: JUNE_NOON,
    });

    expect(m.inputs[0]!.user).toContain("wx: EU0 VFR");
    expect(m.inputs[0]!.user).toContain("Live weather (latest METAR):");
    expect(m.inputs[0]!.user).toContain("EU0: VFR — wind 250° 10 kt");
    expect(m.inputs[0]!.system).toContain("Never invent weather");
  });

  it("survives a throwing weather provider (weather omitted, flight intact)", async () => {
    const m = mockClient([ok(0)]);
    const res = await generateFlight(brief(), {
      index,
      client: m.client,
      weather: {
        async metars() {
          throw new Error("AWC is down");
        },
      },
    });

    expect(res.status).toBe("ok");
    if (res.status !== "ok") return;
    expect(res.flight.weather).toBeUndefined();
    expect(res.flight.overview).toBe("A scenic Alpine hop.");
  });

  it("omits the golden hour in polar day (no evening sun to aim for)", async () => {
    // ~79°N in June: the sun never descends through 6°.
    const polar = buildAirportIndex(
      Array.from({ length: 3 }, (_, i) => ({
        ident: `SV${i}`,
        name: `Svalbard Field ${i}`,
        type: "medium_airport" as const,
        iso_country: "SJ",
        region: "europe" as Region,
        lat: 79,
        lon: 12 + i * (100 / 60 / Math.cos((79 * Math.PI) / 180)),
        elev_ft: 0,
        longest_rwy_ft: 5000,
      longest_paved_rwy_ft: 5000,
      ifr_capable: true,
      rwy_headings: [],
      rwy_lighted: false,
      rwy_surface: "asphalt",
      freqs: [],
        vibe_tags: [] as VibeTag[],
      })),
    );
    const res = await generateFlight(brief({ vibe: "any" }), {
      index: polar,
      now: JUNE_NOON,
    });

    expect(res.status).toBe("ok");
    if (res.status !== "ok") return;
    expect(res.flight.golden_hour).toBeUndefined();
  });
});

describe("demoteBelowMinima", () => {
  const chainOf = (...idents: string[]): CandidateChain => {
    const airports = idents.map((ident) => ({
      ident,
      name: ident,
      type: "medium_airport",
      iso_country: "XX",
      region: "europe" as Region,
      lat: 50,
      lon: 0,
      elev_ft: 0,
      longest_rwy_ft: 5000,
      longest_paved_rwy_ft: 5000,
      ifr_capable: true,
      rwy_headings: [],
      rwy_lighted: false,
      rwy_surface: "asphalt" as const,
      freqs: [],
      vibe_tags: [] as VibeTag[],
    }));
    return { airports, legs: [], totalDistanceNm: 0, vibeScore: 0 };
  };

  it("stable-moves chains with an IFR/LIFR stop behind the flyable ones", () => {
    const chains = [chainOf("A", "B"), chainOf("C", "D"), chainOf("E", "F")];
    const weather = new Map([
      ["B", wx("B", "LIFR")],
      ["C", wx("C", "VFR")],
    ]);
    expect(
      demoteBelowMinima(chains, weather).map((c) => c.airports[0]!.ident),
    ).toEqual(["C", "E", "A"]);
  });

  it("is a no-op without weather, and never drops a chain", () => {
    const chains = [chainOf("A", "B"), chainOf("C", "D")];
    expect(demoteBelowMinima(chains, new Map())).toEqual(chains);
    const allBad = new Map([
      ["A", wx("A", "IFR")],
      ["C", wx("C", "LIFR")],
    ]);
    expect(demoteBelowMinima(chains, allBad)).toHaveLength(2);
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
      longest_paved_rwy_ft: 5000,
      ifr_capable: true,
      rwy_headings: [],
      rwy_lighted: false,
      rwy_surface: "asphalt",
      freqs: [],
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

  it("assigns scenic waypoints to the leg they sit along on a multi-leg trip", async () => {
    // Airports at 40°N / 46.93°N / 53.87°N along lon 0. AAA and 50.4°N belong
    // to whichever leg spans ~50°N; 43.5°N belongs to the other.
    const m = mockClient([
      ok(0, { waypoints: ["43.5,0.2", "AAA", "50.4,-0.2"] }),
    ]);
    const res = await generateFlight(
      brief({ timeBand: "3-5hr", vibe: "any", legCount: 2 }),
      { index: chainIndex, client: m.client, navaids: [navaid("AAA", 50.2, 0.15)] },
    );

    expect(res.status).toBe("ok");
    if (res.status !== "ok") return;
    const legs = res.flight.legs;
    expect(legs).toHaveLength(2);

    const spans = (l: (typeof legs)[number], lat: number) =>
      Math.min(l.from_lat, l.to_lat) < lat && lat < Math.max(l.from_lat, l.to_lat);
    const north = legs.find((l) => spans(l, 50.2))!;
    const south = legs.find((l) => spans(l, 43.5))!;
    expect(north.waypoints.map((w) => w.ident)).toContain("AAA");
    expect(north.waypoints).toHaveLength(2); // AAA + the 50.4°N user point
    expect(south.waypoints).toHaveLength(1);
    expect(south.waypoints[0]!.kind).toBe("user");
  });
});
