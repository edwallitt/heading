import { trpc } from "./trpc.js";

export function App() {
  const ping = trpc.system.ping.useQuery();

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-4 font-sans text-gray-900">
      <h1 className="text-2xl font-semibold">Heading</h1>
      <p className="text-gray-600">
        {ping.isPending && "contacting server…"}
        {ping.isError && `error: ${ping.error.message}`}
        {ping.data && `server says: ${ping.data.message} @ ${ping.data.at}`}
      </p>
    </main>
  );
}
