# Heading

**An AI flight-picker for Microsoft Flight Simulator 2024.** Tell it what you've
got — the time, the aircraft, the mood — and it dispatches a real, flyable
flight worth firing up the sim for: a named origin and destination, an evocative
briefing, a styled route map, and one-tap handoff to SimBrief or a downloadable
`.pln`.

It exists to answer the simmer's recurring question — *"I've got 90 minutes and
a turboprop, where should I actually go?"* — without the paralysis of a blank map.

🔗 https://github.com/edwallitt/heading

---

## How it works

You set five dials. The backend turns them into hard constraints, builds a pool
of **real, pre-validated** airport pairs from baked OurAirports data, and asks
Claude **Opus** to pick the one that best fits and write the briefing. Every
number you see — distance, block time, cruise level — is computed by the app's
own libraries, never trusted from the model. The result is enriched with a
SimBrief dispatch URL and, for VFR, a self-generated MSFS 2024 flight plan.

```
five dials ─▶ constraints ─▶ candidate pool ─▶ Opus picks + writes ─▶ enrich ─▶ exports
              (distance,      (real airports,   (one call, one        (our math)  (SimBrief
               runway,         soft-ranked by    retry, then                       URL + VFR
               rules…)         vibe)             algorithmic fallback)             .pln)
```

### The five dials

| Dial | Options |
| --- | --- |
| **Time available** | 20 min · 45 min · 1 hr · 2 hr · 3–5 hr · long haul |
| **Aircraft** | small prop · turboprop · regional jet · airliner |
| **Region** | anywhere · N./S. America · Europe · Asia · Oceania · Caribbean |
| **Flight rules** | any · VFR · IFR |
| **Vibe** | mountains · coastal · city skylines · surprise me |

Incompatible combinations grey out live as you pick (an airliner can't fit a
20-minute flight) — the narrowing rules come from the server, never hardcoded in
the UI.

### Features

- **Brief builder** with live progressive narrowing and large, touch-friendly controls.
- **Hero result card** — origin → destination, the briefing prose, the one-line
  *why*, cruise level, block time, rules and aircraft as instrument readouts.
- **Route map** (MapLibre GL on OpenFreeMap's dark style) drawn as instrumentation:
  a magenta course line with a heading dart, fit to the route.
- **Open in SimBrief** and, for VFR, **Download `.pln`** (loads in MSFS 2024).
- **Shareable permalink** — the whole flight encoded into the URL. Paste a link
  and it reproduces the exact card, map and all, with no new AI call.
- **Surprise me** — a random but always-viable brief, dispatched in one tap.
- **Anti-repeat** — *Generate again* avoids recently shown airports.
- **Honest relaxation** — if the vibe or region had to be loosened to find a
  match, the card says so.

Stateless by design: **no database**. The only thing that persists is the
shareable link.

---

## Tech stack

- **Web** (`apps/web`) — React + Vite + TypeScript, TanStack Query, Tailwind v3,
  MapLibre GL JS. "Glass cockpit at dusk" design system (tokens in
  `tailwind.config.js`).
- **Server** (`apps/server`) — Hono + tRPC over HTTP at `/trpc`; Anthropic SDK
  (Claude Opus) for dispatch; pure libraries for geo, block-time, VFR altitude,
  SimBrief and `.pln` export.
- **Shared** (`packages/shared`) — the tRPC `AppRouter` *type*, so the web client
  is fully typed without importing server logic.
- Reference data is baked at build time from [OurAirports](https://ourairports.com/data/)
  into committed JSON; map tiles are from [OpenFreeMap](https://openfreemap.org)
  (no API key).

### Monorepo layout

```
apps/
  server/   tRPC API, AI dispatch, constraint engine, exports, baked data
  web/      Vite + React brief builder and result card
packages/
  shared/   AppRouter type re-export (web ← shared ← server)
```

---

## Local development

### Prerequisites

- Node `>=22` (an `.nvmrc` is provided — run `nvm use`)
- pnpm `9.x`

### Install

```bash
pnpm install
```

### Run (dev)

Starts the server and web app together:

```bash
pnpm dev
```

- Web: http://localhost:5173
- Server: http://localhost:3001 (tRPC at `/trpc`)

### AI key

The server reads `ANTHROPIC_API_KEY` from its environment for the Opus dispatch
call. Export it in your shell before `pnpm dev`:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
pnpm dev
```

Without a key, `flight.generate` still returns a complete flight via the
**algorithmic fallback** (top-ranked pair + a templated briefing) — handy for
working on the UI offline. `.env` is git-ignored; see `.env.example` for all
supported variables (`PORT`, `VITE_TRPC_URL`).

### Other commands

```bash
pnpm typecheck                      # strict type-check, every package
pnpm build                          # build shared → server → web
pnpm --filter @heading/server test  # server unit tests (vitest)
```

### CLI harnesses

Sanity-check the pipeline from the terminal (from `apps/server`):

```bash
pnpm --filter @heading/server try-brief "turboprop,45min,europe,mountains,VFR"  # constraints → candidate pairs
pnpm --filter @heading/server generate  "turboprop,45min,europe,mountains,VFR"  # full dispatch (needs the key for prose)
pnpm --filter @heading/server export    "turboprop,45min,europe,mountains,VFR"  # write a .pln locally
```

The baked airport/navaid datasets are regenerated with `build-airports` and
`build-navaids` (raw OurAirports CSVs are git-ignored; the generated JSON is
committed).

---

A personal project — built for one simmer's hangar, shared in case it's useful
to yours.
