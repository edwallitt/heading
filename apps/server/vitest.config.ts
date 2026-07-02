import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "html"],
      // `all` counts untested source too, so coverage reflects the whole surface
      // — not just the files a test happens to import.
      all: true,
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/types.ts", // type-only declarations
        "src/index.ts", // Hono bootstrap (network entrypoint)
        "src/load-env.ts", // dotenv side-effects
        "src/ai/client.ts", // Anthropic SDK wrapper (network)
      ],
      // A floor set just below today's numbers: it fails CI on a regression
      // without demanding new tests chase the last few lines. Raise as coverage
      // climbs; never lower to make a red build pass.
      thresholds: {
        statements: 92,
        branches: 85,
        functions: 92,
        lines: 92,
      },
    },
  },
});
