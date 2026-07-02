import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Node by default (matches the server); the permalink codec opts into jsdom
    // per-file with an `@vitest-environment jsdom` docblock, since it's the only
    // suite that touches window/history.
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "html"],
      all: true,
      // Scope the gate to the pure-logic layer we test today. The .tsx component
      // surface is intentionally out of scope until component tests land (#4);
      // trpc.ts is type re-exports + client wiring with nothing to execute.
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/trpc.ts"],
      // Floor for the pure-logic layer; raise as component tests (#4) expand the
      // include set. Never lower to make a red build pass.
      thresholds: {
        statements: 95,
        branches: 90,
        functions: 95,
        lines: 95,
      },
    },
  },
});
