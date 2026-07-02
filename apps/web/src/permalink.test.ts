// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import type { Flight } from "./trpc.js";
import { buildPermalink, clearPermalink, readPermalink } from "./permalink.js";

/** A round-trippable flight fixture — carries the fields the shape guard checks, plus pln to prove slimming. */
function makeFlight(overrides: Partial<Flight> = {}): Flight {
  return {
    overview: "A short scenic hop.",
    why_this: "Good weather, easy nav.",
    rules: "VFR",
    legs: [
      {
        from_icao: "LSZG",
        to_icao: "LSZS",
        from_name: "Grenchen",
        to_name: "Samedan",
        from_lat: 47.18,
        from_lon: 7.41,
        to_lat: 46.53,
        to_lon: 9.88,
        dist_nm: 92,
        cruise_level: "9500",
        waypoints: [],
      },
    ],
    pln: "<xml>heavy</xml>",
    pln_filename: "LSZG-LSZS.pln",
    ...overrides,
  } as unknown as Flight;
}

/** Encode a raw payload the way permalink.ts does, so negative cases can craft a hash directly. */
function encodeHash(payload: unknown): string {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `f=${b64}`;
}

/** Take the hash a permalink URL carries and make it the current location's hash. */
function applyPermalink(url: string): void {
  window.location.hash = new URL(url).hash;
}

beforeEach(() => {
  window.location.hash = "";
});

describe("permalink round trip", () => {
  it("rehydrates the exact flight from a built link", () => {
    const flight = makeFlight();
    applyPermalink(buildPermalink(flight));

    const decoded = readPermalink();
    expect(decoded).not.toBeNull();
    expect(decoded!.overview).toBe(flight.overview);
    expect(decoded!.legs[0]!.from_icao).toBe("LSZG");
    expect(decoded!.legs[0]!.to_lat).toBe(46.53);
  });

  it("drops the heavy, recomputable .pln artifacts before sharing", () => {
    applyPermalink(buildPermalink(makeFlight()));

    const decoded = readPermalink();
    expect(decoded!.pln).toBeUndefined();
    expect(decoded!.pln_filename).toBeUndefined();
  });
});

describe("readPermalink rejects bad input", () => {
  it("returns null when there is no hash", () => {
    expect(readPermalink()).toBeNull();
  });

  it("returns null for a hash that isn't our param", () => {
    window.location.hash = "other=123";
    expect(readPermalink()).toBeNull();
  });

  it("returns null for undecodable base64", () => {
    window.location.hash = "f=@@@not-base64@@@";
    expect(readPermalink()).toBeNull();
  });

  it("returns null on a version mismatch", () => {
    window.location.hash = encodeHash({ v: 999, f: makeFlight() });
    expect(readPermalink()).toBeNull();
  });

  it("returns null when a required text field is missing", () => {
    const { overview: _drop, ...rest } = makeFlight();
    window.location.hash = encodeHash({ v: 1, f: rest });
    expect(readPermalink()).toBeNull();
  });

  it("returns null when there are no legs", () => {
    window.location.hash = encodeHash({ v: 1, f: makeFlight({ legs: [] }) });
    expect(readPermalink()).toBeNull();
  });

  it("returns null when a leg is missing drawable endpoints", () => {
    const flight = makeFlight();
    const brokenLeg = { ...flight.legs[0]! } as Record<string, unknown>;
    delete brokenLeg.to_lat;
    window.location.hash = encodeHash({ v: 1, f: { ...flight, legs: [brokenLeg] } });
    expect(readPermalink()).toBeNull();
  });
});

describe("clearPermalink", () => {
  it("removes the hash without a reload", () => {
    applyPermalink(buildPermalink(makeFlight()));
    expect(window.location.hash).not.toBe("");

    clearPermalink();
    expect(window.location.hash).toBe("");
  });
});
