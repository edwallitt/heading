import { timingSafeEqual } from "node:crypto";

/**
 * Access gate for the token-spending procedures.
 *
 * Every `flight.generate` call spends a personal Anthropic token, so the app is
 * gated by a single shared secret (`APP_ACCESS_TOKEN`), sent by the web client
 * as an `Authorization: Bearer …` header. This is deliberately not a user
 * system — it exists only to stop strangers/bots from triggering the spend.
 */

/**
 * Decide whether a request may call protected procedures.
 *
 * - Secret set → the header must carry it (constant-time compare).
 * - Secret unset **and this is a real deployment** (`isDeployment`) → deny.
 *   Failing *closed* matters: if the Fly secret is ever missing (forgotten,
 *   typo'd, cleared on rebuild) the app locks *us* out instead of silently
 *   serving strangers on our token. The client's re-prompt flow makes this
 *   self-correcting.
 * - Secret unset and not a deployment (local dev / CI) → allow, so day-to-day
 *   work and the test suite stay frictionless.
 */
export function computeAuthorized(
  authorization: string | undefined,
  opts: { isDeployment: boolean },
): boolean {
  const secret = process.env.APP_ACCESS_TOKEN;
  if (!secret) return !opts.isDeployment;
  if (!authorization) return false;
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  return safeEqual(token, secret);
}

/** Length-safe constant-time string comparison (no early-exit timing leak). */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
