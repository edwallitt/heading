import { Check, Download, ExternalLink, Info, Link2, RotateCw, Sunset } from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import { aircraftLabel } from "../dials.js";
import { buildPermalink } from "../permalink.js";
import type { Flight } from "../trpc.js";
import { RouteMap } from "./RouteMap.js";
import { Button, Stat } from "./ui.js";

const RELAXED_COPY: Record<string, string> = {
  dropped_vibe: "No airfields matched that vibe nearby — vibe relaxed.",
  widened_region: "Few matches in that region — search widened.",
};

function formatCruise(level: string): string {
  if (/^fl/i.test(level)) return level.toUpperCase();
  const n = Number(level);
  return Number.isFinite(n) ? `${n.toLocaleString()} ft` : level;
}

type StopWeather = NonNullable<Flight["weather"]>[number];

/**
 * Standard aviation flight-category colours (VFR green, MVFR blue, IFR red,
 * LIFR magenta), muted to sit inside the dusk palette.
 */
const CATEGORY_STYLE: Record<string, string> = {
  VFR: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
  MVFR: "border-sky-400/40 bg-sky-400/10 text-sky-300",
  IFR: "border-red-400/40 bg-red-400/10 text-red-300",
  LIFR: "border-fuchsia-400/40 bg-fuchsia-400/10 text-fuchsia-300",
};

/** Compact decoded METAR line: wind · visibility · ceiling · temperature. */
function weatherSummary(w: StopWeather): string {
  const parts: string[] = [];
  if (w.wind_kt !== null) {
    if (w.wind_kt === 0) {
      parts.push("calm");
    } else {
      const dir =
        w.wind_dir_deg !== null
          ? `${String(w.wind_dir_deg).padStart(3, "0")}°`
          : "VRB";
      parts.push(`${dir} ${w.wind_kt}${w.gust_kt ? `G${w.gust_kt}` : ""} kt`);
    }
  }
  if (w.visibility_sm !== null) parts.push(`${w.visibility_sm} SM`);
  if (w.ceiling_ft !== null) parts.push(`ceil ${w.ceiling_ft.toLocaleString()} ft`);
  if (w.temp_c !== null) parts.push(`${w.temp_c}°C`);
  return parts.join(" · ");
}

/** "2026-06-21T19:27:00.000Z" → "19:27Z" (ISO timestamps are always UTC here). */
const zulu = (iso: string) => `${iso.slice(11, 16)}Z`;

function formatBlock(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} hr` : `${h}h ${m}m`;
}

function downloadPln(flight: Flight) {
  if (!flight.pln || !flight.pln_filename) return;
  const blob = new Blob([flight.pln], { type: "application/xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = flight.pln_filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

interface ResultCardProps {
  flight: Flight;
  onAgain: () => void;
  regenerating: boolean;
  /** True when rendered from a pasted permalink (no live .pln present). */
  isShared: boolean;
}

export function ResultCard({ flight, onAgain, regenerating, isShared }: ResultCardProps) {
  const legs = flight.legs;
  const leg = legs[0];
  const singleLeg = legs.length === 1;
  // Origin, then each leg's arrival — the ordered stops of the trip.
  const stops = leg
    ? [
        { icao: leg.from_icao, name: leg.from_name },
        ...legs.map((l) => ({ icao: l.to_icao, name: l.to_name })),
      ]
    : [];
  const isVfr = flight.rules === "VFR";
  const canDownload = isVfr && Boolean(flight.pln && flight.pln_filename);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(id);
  }, [copied]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(buildPermalink(flight));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <article className="animate-rise-in overflow-hidden rounded-xl border border-course/25 bg-panel shadow-panel">
      <div className="flex items-center justify-between border-b border-line px-5 py-3 sm:px-7">
        <span className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-course shadow-[0_0_8px_1px_rgba(236,95,164,0.8)]" />
          <span className="placard text-course">{isShared ? "Saved flight" : "Dispatched"}</span>
        </span>
        <span className="font-instrument text-xs tracking-placard text-mute">{flight.rules}</span>
      </div>

      <div className="flex flex-col gap-6 p-5 sm:p-7">
        {leg ? (
          <header className="flex flex-col gap-5">
            {singleLeg ? (
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-instrument text-3xl font-semibold tracking-wide text-chalk sm:text-4xl">
                    {leg.from_icao}
                  </div>
                  <div className="mt-0.5 truncate text-sm text-mute">{leg.from_name}</div>
                </div>
                <div className="min-w-0 text-right">
                  <div className="font-instrument text-3xl font-semibold tracking-wide text-chalk sm:text-4xl">
                    {leg.to_icao}
                  </div>
                  <div className="mt-0.5 truncate text-sm text-mute">{leg.to_name}</div>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-start gap-x-2 gap-y-2">
                {stops.map((s, idx) => (
                  <Fragment key={`${s.icao}-${idx}`}>
                    <div className="min-w-0">
                      <div className="font-instrument text-2xl font-semibold tracking-wide text-chalk sm:text-3xl">
                        {s.icao}
                      </div>
                      <div className="mt-0.5 max-w-[7.5rem] truncate text-xs text-mute">{s.name}</div>
                    </div>
                    {idx < stops.length - 1 ? (
                      <span aria-hidden className="pt-1.5 text-xl text-course/70">→</span>
                    ) : null}
                  </Fragment>
                ))}
              </div>
            )}
            <RouteMap flight={flight} />
            {!singleLeg ? (
              <div className="divide-y divide-line overflow-hidden rounded-lg border border-line text-sm">
                {legs.map((l, idx) => (
                  <div
                    key={`${l.from_icao}-${l.to_icao}-${idx}`}
                    className="flex items-center justify-between gap-3 px-3.5 py-2"
                  >
                    <span className="font-instrument tracking-wide text-chalk">
                      <span className="text-mute">{idx + 1}.</span> {l.from_icao}{" "}
                      <span className="text-course/70">→</span> {l.to_icao}
                    </span>
                    <span className="tabular-nums text-mute">
                      {l.dist_nm.toLocaleString()} NM · {formatCruise(l.cruise_level)}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </header>
        ) : null}

        <p className="text-pretty text-[1.05rem] leading-relaxed text-chalk/90">{flight.overview}</p>

        <div className="border-l-2 border-course/60 pl-4">
          <div className="placard mb-1">Why this one</div>
          <p className="text-sm leading-relaxed text-mute">{flight.why_this}</p>
        </div>

        <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-line sm:grid-cols-4 [&>*]:border-line [&>*:nth-child(odd)]:border-r sm:[&>*]:border-r sm:[&>*:last-child]:border-r-0 [&>*:nth-child(n+3)]:border-t sm:[&>*:nth-child(n+3)]:border-t-0">
          <Stat label="Cruise">{formatCruise(flight.cruise_level)}</Stat>
          <Stat label="Block time">{formatBlock(flight.est_block_min)}</Stat>
          <Stat label="Rules">{flight.rules}</Stat>
          <Stat label="Aircraft">
            {aircraftLabel(flight.brief.aircraft)}
            <span className="ml-1.5 text-sm text-mute">{flight.aircraft_type}</span>
          </Stat>
        </div>

        {flight.weather?.length ? (
          <div>
            <div className="placard mb-2">Live weather</div>
            <div className="flex flex-wrap gap-2">
              {flight.weather.map((w) => {
                const summary = weatherSummary(w);
                return (
                  <div
                    key={w.icao}
                    title={w.raw}
                    className="flex items-center gap-2 rounded-md border border-line bg-panel-hi/40 px-3 py-2 text-xs"
                  >
                    <span className="font-instrument text-sm tracking-wide text-chalk">
                      {w.icao}
                    </span>
                    <span
                      className={`rounded border px-1.5 py-0.5 font-instrument text-[10px] font-semibold tracking-wider ${CATEGORY_STYLE[w.category] ?? "border-line text-mute"}`}
                    >
                      {w.category}
                    </span>
                    {summary ? <span className="tabular-nums text-mute">{summary}</span> : null}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {flight.golden_hour ? (
          <div className="flex items-start gap-2.5 rounded-lg border border-amber/25 bg-amber/[0.06] px-4 py-3">
            <Sunset size={16} className="mt-0.5 shrink-0 text-amber" />
            <p className="text-sm leading-relaxed text-amber">
              Golden hour: set the sim clock to lift off at{" "}
              <span className="font-instrument tabular-nums">{zulu(flight.golden_hour.depart_utc)}</span>{" "}
              and you'll touch down at {flight.golden_hour.dest_icao} as the light turns
              — arriving{" "}
              <span className="font-instrument tabular-nums">{zulu(flight.golden_hour.arrive_utc)}</span>,
              sunset{" "}
              <span className="font-instrument tabular-nums">{zulu(flight.golden_hour.sunset_utc)}</span>.
            </p>
          </div>
        ) : null}

        {flight.relaxed.length > 0 ? (
          <div className="flex items-start gap-2.5 rounded-lg border border-amber/25 bg-amber/[0.06] px-4 py-3">
            <Info size={16} className="mt-0.5 shrink-0 text-amber" />
            <div className="space-y-0.5 text-sm text-amber">
              {flight.relaxed.map((r) => (
                <p key={r}>{RELAXED_COPY[r] ?? r}</p>
              ))}
            </div>
          </div>
        ) : null}

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row">
            {flight.simbrief_url ? (
              <Button
                variant="primary"
                icon={<ExternalLink size={16} />}
                onClick={() => window.open(flight.simbrief_url, "_blank", "noopener")}
                className="flex-1"
              >
                Open in SimBrief
              </Button>
            ) : null}
            {canDownload ? (
              <Button
                variant="secondary"
                icon={<Download size={16} />}
                onClick={() => downloadPln(flight)}
                className="flex-1"
              >
                Download .pln
              </Button>
            ) : null}
            <Button
              variant="secondary"
              icon={copied ? <Check size={16} className="text-course" /> : <Link2 size={16} />}
              onClick={copyLink}
              className="flex-1"
            >
              {copied ? "Link copied" : "Copy link"}
            </Button>
          </div>

          {!isVfr ? (
            <p className="text-xs leading-relaxed text-mute">
              IFR routing is built by SimBrief — open the dispatch above to file and download the plan.
            </p>
          ) : isShared && !canDownload ? (
            <p className="text-xs leading-relaxed text-mute">
              The .pln isn't carried in shared links — open SimBrief, or regenerate to download it.
            </p>
          ) : !singleLeg && canDownload ? (
            <p className="text-xs leading-relaxed text-mute">
              The multi-leg .pln is one chained plan — intermediate airports load as
              route waypoints, so double-check it flies as separate stops in MSFS 2024.
            </p>
          ) : null}

          <Button
            variant="ghost"
            icon={<RotateCw size={15} className={regenerating ? "animate-sweep" : ""} />}
            onClick={onAgain}
            disabled={regenerating}
            className="self-start"
          >
            {regenerating ? "Dispatching…" : "Generate again"}
          </Button>
        </div>
      </div>
    </article>
  );
}
