import type { Flight } from "./trpc.js";

/**
 * Shareable-permalink codec. The full Flight (minus the recomputable `.pln`,
 * which the export pipeline rebuilds from the route) is JSON-encoded into the
 * URL hash — the app's only "save". No server, no storage; a pasted link
 * rehydrates the exact card without another Opus call.
 */

const VERSION = 1;
const PARAM = "f";

function toBase64Url(json: string): string {
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(encoded: string): string {
  const b64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Drop the heavy, recomputable export artifacts before sharing. */
function slim(flight: Flight): Flight {
  const copy: Flight = { ...flight };
  delete copy.pln;
  delete copy.pln_filename;
  return copy;
}

/** Build a shareable URL for a flight (current origin + encoded hash). */
export function buildPermalink(flight: Flight): string {
  const payload = JSON.stringify({ v: VERSION, f: slim(flight) });
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = `${PARAM}=${toBase64Url(payload)}`;
  return url.toString();
}

/** Read a flight from the current URL hash, or null if absent/invalid. */
export function readPermalink(): Flight | null {
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash.startsWith(`${PARAM}=`)) return null;
  try {
    const data: unknown = JSON.parse(fromBase64Url(hash.slice(PARAM.length + 1)));
    if (!data || typeof data !== "object") return null;
    const { v, f } = data as { v?: number; f?: unknown };
    if (v !== VERSION || !isFlightLike(f)) return null;
    return f;
  } catch {
    return null;
  }
}

/** Drop the hash without a reload or a new history entry. */
export function clearPermalink(): void {
  history.replaceState(null, "", window.location.pathname + window.location.search);
}

/** Defensive shape guard — the hash is untrusted input. */
function isFlightLike(v: unknown): v is Flight {
  if (!v || typeof v !== "object") return false;
  const f = v as Record<string, unknown>;
  if (!Array.isArray(f.legs) || f.legs.length === 0) return false;
  const leg = f.legs[0] as Record<string, unknown>;
  return (
    typeof f.overview === "string" &&
    typeof f.why_this === "string" &&
    typeof f.rules === "string" &&
    typeof leg.from_icao === "string" &&
    typeof leg.to_icao === "string" &&
    typeof leg.from_lat === "number" &&
    typeof leg.from_lon === "number" &&
    typeof leg.to_lat === "number" &&
    typeof leg.to_lon === "number"
  );
}
