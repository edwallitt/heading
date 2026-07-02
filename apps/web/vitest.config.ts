import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Node by default (matches the server); the permalink codec opts into jsdom
    // per-file with an `@vitest-environment jsdom` docblock, since it's the only
    // suite that touches window/history.
    include: ["src/**/*.test.ts"],
  },
});
