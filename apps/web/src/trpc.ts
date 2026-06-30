import type { AppRouter } from "@heading/shared";
import { createTRPCReact } from "@trpc/react-query";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";

/** Typed tRPC React hooks, bound to the server's `AppRouter`. */
export const trpc = createTRPCReact<AppRouter>();

/** Base URL of the tRPC server; overridable via `VITE_TRPC_URL`. */
export const trpcUrl = import.meta.env.VITE_TRPC_URL ?? "http://localhost:3001/trpc";

type RouterInputs = inferRouterInputs<AppRouter>;
type RouterOutputs = inferRouterOutputs<AppRouter>;

/** The full `flight.generate` input: the brief plus the anti-repeat list. */
export type GenerateInput = RouterInputs["flight"]["generate"];
/** The brief the builder assembles — the five dials (no anti-repeat list). */
export type Brief = Omit<GenerateInput, "excludeRecent">;
/** The discriminated `flight.generate` result: a flight, or a typed no-flight. */
export type GenerateResult = RouterOutputs["flight"]["generate"];
/** A successfully dispatched flight (the `status: "ok"` branch). */
export type Flight = Extract<GenerateResult, { status: "ok" }>["flight"];
/** Brief-builder metadata: dial value lists + the viability matrix. */
export type FlightOptions = RouterOutputs["flight"]["options"];
