/**
 * Snap a requested altitude to the nearest legal VFR cruising altitude under
 * the hemispheric rule (§6):
 *
 *   eastbound (track 0–179°)   → odd thousands + 500   (3500, 5500, 7500, …)
 *   westbound (track 180–359°) → even thousands + 500  (4500, 6500, 8500, …)
 *
 * The LLM won't reliably apply this, so we compute the initial track and snap
 * post-hoc. Ties (a request exactly between two legal levels) round up.
 */
export function legalVfrAltitude(
  trackDegrees: number,
  requestedFt: number,
): number {
  const track = ((trackDegrees % 360) + 360) % 360;
  const eastbound = track < 180;
  // East wants odd thousands, West wants even thousands; both + 500.
  const wantOddThousand = eastbound;

  // Candidate levels have the form k*1000 + 500. Find the k nearest to the
  // request with the required parity.
  const kReal = (requestedFt - 500) / 1000;
  const lower = Math.floor(kReal);
  const upper = lower + 1;

  const candidates: number[] = [];
  for (const k of [lower - 1, lower, upper, upper + 1]) {
    if ((k % 2 !== 0) === wantOddThousand) candidates.push(k * 1000 + 500);
  }

  let best = candidates[0]!;
  let bestDist = Math.abs(requestedFt - best);
  for (const c of candidates.slice(1)) {
    const d = Math.abs(requestedFt - c);
    // `<=` makes ties round up (later candidates are higher).
    if (d <= bestDist) {
      best = c;
      bestDist = d;
    }
  }
  return best;
}
