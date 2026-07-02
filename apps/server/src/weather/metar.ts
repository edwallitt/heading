import type { AirportWeather, FlightCategory } from "../types.js";

/**
 * Live-weather seam. `generateFlight` depends on this interface, not on any
 * HTTP client, so tests inject a mock and never touch the network.
 *
 * Contract: never throws; stations with no current report are simply absent
 * from the map. Live weather is an enhancement — it must never block dispatch.
 */
export interface WeatherProvider {
  metars(icaos: string[]): Promise<Map<string, AirportWeather>>;
}

/**
 * NOAA Aviation Weather Center data API — free, keyless, JSON. One GET fetches
 * the latest METAR for many stations at once.
 */
const AWC_URL = "https://aviationweather.gov/api/data/metar";
/** Weather is a garnish on the dispatch — fail fast rather than stall the card. */
const REQUEST_TIMEOUT_MS = 5_000;
/** Sanity cap on one request's station list (the pool is ~10 chains × ≤4 stops). */
const MAX_STATIONS = 100;

/** Cloud covers that constitute a ceiling (broken, overcast, sky obscured). */
const CEILING_COVERS = new Set(["BKN", "OVC", "OVX"]);

/**
 * Standard METAR flight category from visibility + ceiling. Unknown values are
 * treated as unlimited: a missing group means "not the limiting factor", and an
 * optimistic default only ever *fails to demote* — it never blocks a flight.
 */
export function flightCategory(
  visibilitySm: number | null,
  ceilingFt: number | null,
): FlightCategory {
  const vis = visibilitySm ?? Infinity;
  const ceil = ceilingFt ?? Infinity;
  if (vis < 1 || ceil < 500) return "LIFR";
  if (vis < 3 || ceil < 1000) return "IFR";
  if (vis <= 5 || ceil <= 3000) return "MVFR";
  return "VFR";
}

/**
 * One-line human/model-readable summary of the decoded fields (no category —
 * callers place that themselves). Empty string when nothing was decoded.
 */
export function describeWeather(w: AirportWeather): string {
  const parts: string[] = [];
  if (w.wind_kt !== null) {
    if (w.wind_kt === 0) {
      parts.push("wind calm");
    } else {
      const dir = w.wind_dir_deg !== null ? `${w.wind_dir_deg}°` : "variable";
      const gust = w.gust_kt !== null ? ` gusting ${w.gust_kt}` : "";
      parts.push(`wind ${dir} ${w.wind_kt}${gust} kt`);
    }
  }
  if (w.visibility_sm !== null) parts.push(`vis ${w.visibility_sm} SM`);
  if (w.ceiling_ft !== null) parts.push(`ceiling ${w.ceiling_ft} ft`);
  if (w.temp_c !== null) parts.push(`${w.temp_c}°C`);
  return parts.join(", ");
}

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/**
 * Decode one entry of the AWC JSON response into an AirportWeather, or null if
 * it lacks the essentials (station + raw text). Everything else is optional and
 * defensively parsed: `visib` may be a number or a string like "10+", `wdir`
 * may be "VRB", `clouds[].base` may be null.
 */
export function parseAwcMetar(entry: unknown): AirportWeather | null {
  if (!entry || typeof entry !== "object") return null;
  const e = entry as Record<string, unknown>;
  if (typeof e.icaoId !== "string" || typeof e.rawOb !== "string") return null;

  let visibility: number | null = num(e.visib);
  if (visibility === null && typeof e.visib === "string") {
    const parsed = Number.parseFloat(e.visib); // "10+" → 10
    visibility = Number.isFinite(parsed) ? parsed : null;
  }

  let ceiling: number | null = null;
  if (Array.isArray(e.clouds)) {
    for (const layer of e.clouds) {
      if (!layer || typeof layer !== "object") continue;
      const l = layer as Record<string, unknown>;
      const base = num(l.base);
      if (typeof l.cover !== "string" || !CEILING_COVERS.has(l.cover)) continue;
      if (base !== null && (ceiling === null || base < ceiling)) ceiling = base;
    }
  }

  const obsTime = num(e.obsTime); // unix seconds

  return {
    icao: e.icaoId.trim().toUpperCase(),
    raw: e.rawOb,
    category: flightCategory(visibility, ceiling),
    wind_dir_deg: num(e.wdir), // "VRB" → null
    wind_kt: num(e.wspd),
    gust_kt: num(e.wgst),
    visibility_sm: visibility,
    ceiling_ft: ceiling,
    temp_c: num(e.temp),
    observed_utc: obsTime !== null ? new Date(obsTime * 1000).toISOString() : null,
  };
}

/**
 * Real provider backed by aviationweather.gov. Any failure — network, timeout,
 * non-200, unexpected shape — degrades to an empty map, honouring the
 * WeatherProvider contract. `fetchImpl` is injectable for tests.
 */
export function createAwcWeatherProvider(
  fetchImpl: typeof fetch = fetch,
): WeatherProvider {
  return {
    async metars(icaos) {
      const out = new Map<string, AirportWeather>();
      const ids = [
        ...new Set(icaos.map((i) => i.trim().toUpperCase()).filter(Boolean)),
      ].slice(0, MAX_STATIONS);
      if (ids.length === 0) return out;

      try {
        const url = `${AWC_URL}?ids=${ids.join(",")}&format=json`;
        const res = await fetchImpl(url, {
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (!res.ok) return out;
        const data: unknown = await res.json();
        if (!Array.isArray(data)) return out;
        for (const entry of data) {
          const w = parseAwcMetar(entry);
          // AWC returns newest first; keep the first report per station.
          if (w && !out.has(w.icao)) out.set(w.icao, w);
        }
      } catch {
        // Weather never blocks dispatch — the card simply omits the strip.
      }
      return out;
    },
  };
}
