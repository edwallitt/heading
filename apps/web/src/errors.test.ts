import { describe, expect, it } from "vitest";
import type { AppRouter } from "@heading/shared";
import type { TRPCClientErrorLike } from "@trpc/client";
import { friendlyError } from "./errors.js";

type ClientError = TRPCClientErrorLike<AppRouter>;

/** Minimal ClientError stand-in — friendlyError only reads data.httpStatus and message. */
function err(httpStatus: number | undefined, message = "raw message"): ClientError {
  return { message, data: httpStatus === undefined ? {} : { httpStatus } } as ClientError;
}

describe("friendlyError", () => {
  it("treats a missing status as an unreachable server (fetch failed)", () => {
    expect(friendlyError(err(undefined))).toMatch(/Couldn't reach the dispatcher/);
  });

  it("maps 401 and 403 to an AI-key hint", () => {
    expect(friendlyError(err(401))).toMatch(/AI key/);
    expect(friendlyError(err(403))).toMatch(/AI key/);
  });

  it("maps 429 to a rate-limit message", () => {
    expect(friendlyError(err(429))).toMatch(/busy/);
  });

  it("maps any 5xx to a generic server-error message", () => {
    expect(friendlyError(err(500))).toMatch(/server error/);
    expect(friendlyError(err(503))).toMatch(/server error/);
  });

  it("falls through to the raw message for other statuses", () => {
    expect(friendlyError(err(400, "Bad brief"))).toBe("Bad brief");
  });
});
