# Heading — single-image deploy: Hono/tRPC server that also serves the built
# web bundle. The server runs via `tsx` (not compiled) on purpose: the airport/
# navaid data is loaded from `.generated.json` files that live alongside the
# TypeScript source, so running from source keeps them resolvable at runtime.
FROM node:22-slim

# pnpm via corepack (version pinned by the root package.json "packageManager").
RUN corepack enable
WORKDIR /app

# Install dependencies first for better layer caching. All workspaces share the
# root lockfile, so the manifests are what the install actually needs.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile

# Copy the rest of the source.
COPY . .

# Build the web bundle. VITE_TRPC_URL is baked at build time; a relative "/trpc"
# points the client at this same server, so there's no CORS and no hardcoded host.
ENV VITE_TRPC_URL=/trpc
RUN pnpm --filter @heading/shared build \
  && pnpm --filter @heading/web build

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

# tsx (a dev dependency) is kept in the image so the server can run from source.
CMD ["pnpm", "--filter", "@heading/server", "start"]
