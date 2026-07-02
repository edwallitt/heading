/**
 * Minimal in-memory fixed-window rate limiter.
 *
 * A backstop against an accidental tight loop within one machine's lifetime —
 * *not* the real spend ceiling. The Fly app cold-starts on demand
 * (`min_machines_running = 0`), so this process-local counter resets whenever
 * the machine wakes; the hard cap on spend is the Anthropic console's monthly
 * usage limit, which this cannot replace.
 */
export function createRateLimiter(opts: { limit: number; windowMs: number }) {
  let windowStart = 0;
  let count = 0;

  /** Record an attempt. Returns `true` if allowed, `false` if the window is full. */
  return function take(now: number): boolean {
    if (now - windowStart >= opts.windowMs) {
      windowStart = now;
      count = 0;
    }
    if (count >= opts.limit) return false;
    count += 1;
    return true;
  };
}
