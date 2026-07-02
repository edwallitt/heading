import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, isTRPCClientError } from "@trpc/client";
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import "./index.css";
import { trpc, trpcUrl } from "./trpc.js";

/**
 * Access gate (client side). The server gates token-spending procedures behind
 * a shared secret; we send it as a bearer token and, when the server rejects a
 * request, prompt for it once and retry. The client stays agnostic to whether
 * the gate is even enabled: with no secret configured (local dev) nothing ever
 * returns UNAUTHORIZED, so we never prompt.
 */
const TOKEN_KEY = "heading.accessToken";
const getToken = () => localStorage.getItem(TOKEN_KEY) ?? "";

/**
 * On an UNAUTHORIZED response, clear the stale token, ask for a fresh one, and
 * reload so every in-flight query refetches with it. Any other error is left
 * for the app's own error UI to surface.
 */
function handleAuthError(error: unknown): void {
  if (!isTRPCClientError(error) || error.data?.code !== "UNAUTHORIZED") return;
  localStorage.removeItem(TOKEN_KEY);
  const entered = window.prompt("Access token required for Heading:");
  if (entered?.trim()) {
    localStorage.setItem(TOKEN_KEY, entered.trim());
    window.location.reload();
  }
}

function Root() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({ onError: handleAuthError }),
        mutationCache: new MutationCache({ onError: handleAuthError }),
      }),
  );
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: trpcUrl,
          headers: () => {
            const token = getToken();
            return token ? { Authorization: `Bearer ${token}` } : {};
          },
        }),
      ],
    }),
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </trpc.Provider>
  );
}

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element #root not found");

createRoot(rootEl).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
