import type { AppRouter } from "@heading/shared";
import { createTRPCReact } from "@trpc/react-query";

/** Typed tRPC React hooks, bound to the server's `AppRouter`. */
export const trpc = createTRPCReact<AppRouter>();

/** Base URL of the tRPC server; overridable via `VITE_TRPC_URL`. */
export const trpcUrl = import.meta.env.VITE_TRPC_URL ?? "http://localhost:3001/trpc";
