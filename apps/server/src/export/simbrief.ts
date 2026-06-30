import type { Flight } from "../types.js";

/**
 * Build the SimBrief Dispatch Redirect URL (§2a) — a plain GET link, no API key,
 * no server-side call. SimBrief computes the real route when the user opens it.
 *
 *   https://www.simbrief.com/system/dispatch.php?orig={ICAO}&dest={ICAO}&type={type}
 *
 * `route` is intentionally omitted (VFR and IFR) so SimBrief inserts its own
 * recommended route. No cruise-altitude param is sent: the dispatch redirect has
 * no reliably-documented altitude field, and SimBrief picks an optimal level
 * itself — so we omit rather than guess (per the task).
 */
const DISPATCH_URL = "https://www.simbrief.com/system/dispatch.php";

export function buildSimbriefUrl(flight: Flight): string {
  const orig = flight.legs[0]!.from_icao;
  const dest = flight.legs[flight.legs.length - 1]!.to_icao;
  const type = flight.aircraft_type; // the aircraft profile's simbrief_type

  const params = new URLSearchParams({ orig, dest, type });
  return `${DISPATCH_URL}?${params.toString()}`;
}
