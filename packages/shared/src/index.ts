// The tRPC router (and its procedures) live in `apps/server`; only the
// `AppRouter` *type* flows through this shared package, so `apps/web` can type
// its client without importing any server logic. This is a type-only re-export
// (erased at build time) — `@heading/server` is a dev-only, types-only dep.
export type { AppRouter } from "@heading/server";
export * from "./schemas.js";
