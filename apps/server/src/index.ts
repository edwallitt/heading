import { serve } from "@hono/node-server";
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

app.get("/", (c) => c.text("Heading server — tRPC mounted at /trpc"));

const port = Number(process.env.PORT ?? 3001);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Heading server listening on http://localhost:${info.port}`);
});
