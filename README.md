# Heading

An AI flight-picker for Microsoft Flight Simulator 2024.

> **Phase 0 — scaffold.** This is the bootable plumbing only: a typed
> frontend↔backend tRPC pipe. No database, AI, SimBrief, or UI features yet —
> those arrive in later phases. v0 is intentionally stateless.

## Stack

- **Frontend** (`apps/web`): React + Vite + TypeScript, TanStack Query, Tailwind (v3)
- **Backend** (`apps/server`): Hono + tRPC over HTTP at `/trpc`
- **Shared** (`packages/shared`): the tRPC `AppRouter` (and its type) plus a home
  for future Zod schemas — consumed by both apps via the pnpm workspace

## Prerequisites

- Node `>=22` (see `.nvmrc` — run `nvm use`)
- pnpm `9.x`

## Install

```bash
pnpm install
```

## Run (dev)

Starts the server and web app concurrently:

```bash
pnpm dev
```

- Web: http://localhost:5173
- Server: http://localhost:3001 (tRPC at http://localhost:3001/trpc)

The page calls the `system.ping` tRPC procedure and renders its live result,
e.g. `server says: pong @ 2026-06-30T12:00:00.000Z`.

## Other commands

```bash
pnpm typecheck   # type-check every package (strict)
pnpm build       # build shared, server, then web
```

## Environment

Copy `.env.example` to `.env` if you need to override defaults. Both variables
are optional in Phase 0:

- `PORT` — server port (default `3001`)
- `VITE_TRPC_URL` — tRPC URL the web app calls (default `http://localhost:3001/trpc`)
