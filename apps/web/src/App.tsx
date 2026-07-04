import { Navigation } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { BriefBuilder, type Draft, type LegCount } from "./components/BriefBuilder.js";
import { Dispatching } from "./components/Dispatching.js";
import { ErrorPanel, NoFlightPanel } from "./components/Panels.js";
import { ResultCard } from "./components/ResultCard.js";
import { friendlyError } from "./errors.js";
import { clearPermalink, readPermalink } from "./permalink.js";
import type { Brief, Flight, FlightOptions } from "./trpc.js";
import { trpc } from "./trpc.js";

const INITIAL_DRAFT: Draft = {
  region: "anywhere",
  rules: "any",
  vibe: "any",
  legCount: 1,
};

const RECENT_CAP = 20; // recent airport idents to avoid repeating

const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)]!;

/** All airport idents a flight visits, in order (origin + each leg's arrival). */
function flightEndpoints(legs: Flight["legs"]): string[] {
  const first = legs[0];
  if (!first) return [];
  return [first.from_icao, ...legs.map((l) => l.to_icao)];
}

/** A random but viable brief — never an impossible time×aircraft×legs combo. */
function randomBrief({
  dials,
  viability,
  maxLegs,
}: FlightOptions): Brief & { legCount: LegCount } {
  const aircraft = pick(dials.aircraft);
  const timeBand = pick(dials.timeBand.filter((tb) => viability[aircraft][tb]));
  const cap = maxLegs[aircraft][timeBand] || 1;
  const legCount = pick(dials.legCount.filter((n) => n <= cap)) as LegCount;
  return {
    timeBand,
    aircraft,
    region: pick(dials.region),
    rules: pick(dials.rules),
    vibe: pick(dials.vibe),
    legCount,
  };
}

export function App() {
  const optionsQuery = trpc.flight.options.useQuery(undefined, { staleTime: Infinity });
  const generate = trpc.flight.generate.useMutation();

  const [draft, setDraft] = useState<Draft>(INITIAL_DRAFT);
  const [shared, setShared] = useState<Flight | null>(() => readPermalink());
  const submitted = useRef<Brief | null>(null);
  const recent = useRef<string[]>([]);

  // Seed anti-repeat + "generate again" from a pasted permalink, once.
  useEffect(() => {
    if (!shared) return;
    submitted.current = shared.brief;
    recent.current = flightEndpoints(shared.legs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canGenerate = Boolean(draft.timeBand && draft.aircraft);

  function runBrief(brief: Brief) {
    submitted.current = brief;
    setShared(null);
    clearPermalink();
    generate.mutate(
      { ...brief, excludeRecent: recent.current.slice(-RECENT_CAP) },
      {
        onSuccess: (res) => {
          if (res.status !== "ok") return;
          const ids = flightEndpoints(res.flight.legs);
          if (ids.length === 0) return;
          recent.current = [
            ...recent.current.filter((id) => !ids.includes(id)),
            ...ids,
          ].slice(-RECENT_CAP);
        },
      },
    );
  }

  function generateFromDraft() {
    if (!draft.timeBand || !draft.aircraft) return;
    runBrief({
      timeBand: draft.timeBand,
      aircraft: draft.aircraft,
      region: draft.region,
      rules: draft.rules,
      vibe: draft.vibe,
      legCount: draft.legCount,
    });
  }

  function again() {
    if (submitted.current) runBrief(submitted.current);
  }

  function surprise() {
    if (!optionsQuery.data) return;
    const brief = randomBrief(optionsQuery.data);
    setDraft(brief);
    runBrief(brief);
  }

  const live = generate.data;

  return (
    <main className="mx-auto flex min-h-screen max-w-deck flex-col gap-8 px-4 py-10 sm:py-16">
      <header>
        <div className="flex items-center gap-2.5">
          <Navigation size={22} className="text-course" fill="currentColor" strokeWidth={1} />
          <h1 className="font-instrument text-2xl font-bold tracking-[0.28em] text-chalk">HEADING</h1>
        </div>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-mute">
          Tell it what you've got — the time, the aircraft, the mood — and it dispatches a
          flight worth firing up the sim for.
        </p>
      </header>

      {optionsQuery.isPending ? (
        <div className="rounded-xl border border-line bg-panel/40 px-6 py-16 text-center">
          <span className="placard animate-pulse-soft">Warming up the panel…</span>
        </div>
      ) : optionsQuery.isError ? (
        <ErrorPanel
          message={`Couldn't load the brief builder. ${friendlyError(optionsQuery.error)}`}
          onRetry={() => void optionsQuery.refetch()}
          retrying={optionsQuery.isFetching}
        />
      ) : (
        <BriefBuilder
          options={optionsQuery.data}
          draft={draft}
          onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
          onGenerate={generateFromDraft}
          onSurprise={surprise}
          canGenerate={canGenerate}
          isPending={generate.isPending}
        />
      )}

      {generate.isPending ? (
        <Dispatching />
      ) : generate.isError ? (
        <ErrorPanel message={friendlyError(generate.error)} onRetry={again} retrying={false} />
      ) : live?.status === "no_flight" ? (
        <NoFlightPanel reason={live.reason} onSurprise={surprise} />
      ) : live?.status === "ok" ? (
        <ResultCard flight={live.flight} onAgain={again} isShared={false} />
      ) : shared ? (
        <ResultCard flight={shared} onAgain={again} isShared />
      ) : null}

      <footer className="mt-auto pt-4">
        <p className="text-center text-xs text-mute/60">
          Heading · a personal dispatcher for MSFS 2024
        </p>
      </footer>
    </main>
  );
}
