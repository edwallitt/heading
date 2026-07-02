import { describe, expect, it } from "vitest";
import {
  createAwcWeatherProvider,
  describeWeather,
  flightCategory,
  parseAwcMetar,
} from "./metar.js";

describe("flightCategory", () => {
  it("classifies the standard boundaries", () => {
    expect(flightCategory(10, 5000)).toBe("VFR");
    expect(flightCategory(6, null)).toBe("VFR");
    expect(flightCategory(5, null)).toBe("MVFR"); // vis ≤ 5
    expect(flightCategory(null, 3000)).toBe("MVFR"); // ceiling ≤ 3000
    expect(flightCategory(2.5, null)).toBe("IFR"); // vis < 3
    expect(flightCategory(null, 900)).toBe("IFR"); // ceiling < 1000
    expect(flightCategory(0.5, null)).toBe("LIFR"); // vis < 1
    expect(flightCategory(null, 400)).toBe("LIFR"); // ceiling < 500
  });

  it("treats unknown values as unlimited (optimistic — never demotes on gaps)", () => {
    expect(flightCategory(null, null)).toBe("VFR");
  });

  it("takes the worse of visibility and ceiling", () => {
    expect(flightCategory(10, 400)).toBe("LIFR");
    expect(flightCategory(0.5, 5000)).toBe("LIFR");
  });
});

const AWC_ENTRY = {
  icaoId: "EGLL",
  rawOb: "EGLL 271520Z 25010G22KT 9999 FEW020 BKN045 18/12 Q1017",
  temp: 18,
  wdir: 250,
  wspd: 10,
  wgst: 22,
  visib: "6+",
  obsTime: 1782314400, // 2026-06-24T14:00:00Z
  clouds: [
    { cover: "FEW", base: 2000 },
    { cover: "BKN", base: 4500 },
  ],
};

describe("parseAwcMetar", () => {
  it("decodes a full entry (string visibility, ceiling from lowest BKN/OVC)", () => {
    const w = parseAwcMetar(AWC_ENTRY);
    expect(w).not.toBeNull();
    expect(w!.icao).toBe("EGLL");
    expect(w!.visibility_sm).toBe(6); // "6+" → 6
    expect(w!.ceiling_ft).toBe(4500); // FEW is not a ceiling
    expect(w!.category).toBe("VFR");
    expect(w!.wind_dir_deg).toBe(250);
    expect(w!.wind_kt).toBe(10);
    expect(w!.gust_kt).toBe(22);
    expect(w!.temp_c).toBe(18);
    expect(w!.observed_utc).toBe(new Date(1782314400 * 1000).toISOString());
  });

  it("maps a variable wind and missing groups to nulls", () => {
    const w = parseAwcMetar({
      icaoId: "lfmn",
      rawOb: "LFMN ...",
      wdir: "VRB",
      wspd: 3,
    });
    expect(w!.icao).toBe("LFMN"); // normalised
    expect(w!.wind_dir_deg).toBeNull();
    expect(w!.wind_kt).toBe(3);
    expect(w!.visibility_sm).toBeNull();
    expect(w!.ceiling_ft).toBeNull();
    expect(w!.temp_c).toBeNull();
    expect(w!.observed_utc).toBeNull();
    expect(w!.category).toBe("VFR"); // unknowns are optimistic
  });

  it("rejects entries without station or raw text", () => {
    expect(parseAwcMetar(null)).toBeNull();
    expect(parseAwcMetar({ rawOb: "…" })).toBeNull();
    expect(parseAwcMetar({ icaoId: "EGLL" })).toBeNull();
  });
});

describe("describeWeather", () => {
  it("summarises decoded fields and omits unknowns", () => {
    expect(describeWeather(parseAwcMetar(AWC_ENTRY)!)).toBe(
      "wind 250° 10 gusting 22 kt, vis 6 SM, ceiling 4500 ft, 18°C",
    );
    expect(
      describeWeather(
        parseAwcMetar({ icaoId: "XXXX", rawOb: "…", wspd: 0 })!,
      ),
    ).toBe("wind calm");
  });
});

describe("createAwcWeatherProvider", () => {
  const okFetch = (body: unknown): typeof fetch =>
    (async () =>
      new Response(JSON.stringify(body), { status: 200 })) as typeof fetch;

  it("returns a map keyed by station, keeping the first (newest) report", async () => {
    const provider = createAwcWeatherProvider(
      okFetch([AWC_ENTRY, { ...AWC_ENTRY, temp: -99 }]),
    );
    const map = await provider.metars(["EGLL", "egll", "ZZZZ"]);
    expect(map.size).toBe(1);
    expect(map.get("EGLL")!.temp_c).toBe(18); // first entry wins
  });

  it("degrades to an empty map on network failure, non-200, or bad shape", async () => {
    const failing = createAwcWeatherProvider((async () => {
      throw new Error("boom");
    }) as typeof fetch);
    expect((await failing.metars(["EGLL"])).size).toBe(0);

    const teapot = createAwcWeatherProvider(
      (async () => new Response("nope", { status: 418 })) as typeof fetch,
    );
    expect((await teapot.metars(["EGLL"])).size).toBe(0);

    const weird = createAwcWeatherProvider(okFetch({ not: "an array" }));
    expect((await weird.metars(["EGLL"])).size).toBe(0);
  });

  it("skips the request entirely for an empty station list", async () => {
    let called = 0;
    const provider = createAwcWeatherProvider((async () => {
      called++;
      return new Response("[]", { status: 200 });
    }) as typeof fetch);
    await provider.metars([]);
    expect(called).toBe(0);
  });
});
