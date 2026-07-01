import type { AppRouter } from "@heading/shared";
import type { TRPCClientErrorLike } from "@trpc/client";

type ClientError = TRPCClientErrorLike<AppRouter>;

/**
 * Turn a raw tRPC/client error into one line a simmer can act on.
 *
 * The HTTP status (when present) distinguishes the cases that otherwise all
 * render as the same opaque message: a busy dispatcher (429), a server-side
 * key/config problem (401/403), a crash (5xx), or — most common in local dev —
 * no reachable server at all (no status, i.e. the fetch itself failed).
 */
export function friendlyError(err: ClientError): string {
  const status = err.data?.httpStatus;

  if (status === undefined) {
    return "Couldn't reach the dispatcher. Check the server is running, then try again.";
  }
  if (status === 401 || status === 403) {
    return "The dispatcher's AI key looks missing or invalid — check ANTHROPIC_API_KEY on the server.";
  }
  if (status === 429) {
    return "The AI dispatcher is busy right now (rate limited). Give it a moment and try again.";
  }
  if (status >= 500) {
    return "The dispatcher hit a server error. Try again in a moment.";
  }
  return err.message;
}
