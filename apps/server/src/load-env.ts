import process from "node:process";

/**
 * Load the repo-root `.env` into `process.env` before anything reads it.
 *
 * Node >=22 (required by this repo) ships `process.loadEnvFile`, so no `dotenv`
 * dependency is needed. This module is imported first in `index.ts`, which — by
 * ES module evaluation order — guarantees the values are present before the
 * router or the Anthropic client are constructed.
 *
 * A missing `.env` is not an error: shell-exported variables still take effect.
 */
try {
  process.loadEnvFile(new URL("../../../.env", import.meta.url));
} catch {
  // No .env file present — rely on the ambient environment instead.
}
