import "./load-env.js"; // must be first: populates process.env from .env
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { trpcServer } from "@hono/trpc-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { appRouter } from "./router.js";

const app = new Hono();

// Allow the Vite dev server (and any local origin) to call tRPC during dev.
app.use(
  "/trpc/*",
  cors({
    origin: (origin) => origin ?? "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type"],
  }),
);

app.use(
  "/trpc/*",
  trpcServer({
    router: appRouter,
    endpoint: "/trpc",
  }),
);

// Health check for the platform (Fly) — cheap, no data load.
app.get("/health", (c) => c.json({ ok: true }));

// In production the web bundle is built into apps/web/dist and served from the
// same origin as tRPC (so the client uses a relative `/trpc` URL — no CORS).
// The path is resolved from this module, not the cwd, so it works whatever
// directory the process is launched from. When there's no build (local dev,
// where Vite serves the web app separately) these routes simply don't mount.
const webDist = fileURLToPath(new URL("../../web/dist", import.meta.url));

if (existsSync(webDist)) {
  const indexHtml = readFileSync(new URL("index.html", `file://${webDist}/`));

  app.use("/*", serveStatic({ root: webDist }));

  // SPA fallback: any non-asset, non-/trpc GET returns index.html so client-side
  // routing / permalinks resolve.
  app.get("/*", (c) => c.html(indexHtml.toString()));
} else {
  app.get("/", (c) => c.text("Heading server — tRPC mounted at /trpc"));
}

const port = Number(process.env.PORT ?? 3001);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Heading server listening on http://localhost:${info.port}`);
  console.log(
    process.env.ANTHROPIC_API_KEY
      ? "AI dispatch: on (Claude Opus)"
      : "AI dispatch: off — using algorithmic fallback",
  );
  console.log(
    existsSync(webDist)
      ? "Web bundle: serving apps/web/dist"
      : "Web bundle: not built — run the web dev server separately",
  );
});
