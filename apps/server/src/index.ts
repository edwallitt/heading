import "./load-env.js"; // must be first: populates process.env from .env
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { trpcServer } from "@hono/trpc-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { computeAuthorized } from "./auth.js";
import { appRouter } from "./router.js";

const app = new Hono();

// A real deployment serves the built web bundle from this same origin (see
// below). We use that as the "is this production?" signal for the access gate:
// when the bundle is present, protected procedures fail *closed* if the secret
// is missing, rather than serving strangers on our token. Resolved once here.
const webDist = fileURLToPath(new URL("../../web/dist", import.meta.url));
const isDeployment = existsSync(webDist);

// Allow the Vite dev server (and any local origin) to call tRPC during dev.
// `Authorization` must be allowed so the cross-origin dev client can send the
// access token on preflighted requests.
app.use(
  "/trpc/*",
  cors({
    origin: (origin) => origin ?? "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  }),
);

app.use(
  "/trpc/*",
  trpcServer({
    router: appRouter,
    endpoint: "/trpc",
    createContext: (_opts, c) => ({
      authorized: computeAuthorized(c.req.header("authorization"), { isDeployment }),
    }),
  }),
);

// Health check for the platform (Fly) — cheap, no data load. Deliberately
// unauthenticated: Fly's health checks send no credentials.
app.get("/health", (c) => c.json({ ok: true }));

// In production the web bundle is built into apps/web/dist and served from the
// same origin as tRPC (so the client uses a relative `/trpc` URL — no CORS).
// The path is resolved from this module, not the cwd, so it works whatever
// directory the process is launched from. When there's no build (local dev,
// where Vite serves the web app separately) these routes simply don't mount.
if (isDeployment) {
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
    isDeployment
      ? "Web bundle: serving apps/web/dist"
      : "Web bundle: not built — run the web dev server separately",
  );
  console.log(
    process.env.APP_ACCESS_TOKEN
      ? "Access gate: on (shared token required)"
      : isDeployment
        ? "Access gate: FAIL-CLOSED — APP_ACCESS_TOKEN unset; protected routes denied"
        : "Access gate: off (dev — no APP_ACCESS_TOKEN)",
  );
});
