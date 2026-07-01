import { Plane, Shuffle } from "lucide-react";
import {
  AIRCRAFT_OPTIONS,
  LEG_OPTIONS,
  REGION_OPTIONS,
  RULES_OPTIONS,
  TIME_OPTIONS,
  VIBE_OPTIONS,
  aircraftDisabledReason,
  legsDisabledReason,
  timeDisabledReason,
  type DialOption,
} from "../dials.js";
import type { Brief, FlightOptions } from "../trpc.js";
import { SegmentedDial, type DialItem } from "./SegmentedDial.js";
import { Button } from "./ui.js";

/** Leg count is always concrete in the draft (defaults to a single hop). */
export type LegCount = NonNullable<Brief["legCount"]>;

export interface Draft {
  timeBand?: Brief["timeBand"];
  aircraft?: Brief["aircraft"];
  region: Brief["region"];
  rules: Brief["rules"];
  vibe: Brief["vibe"];
  legCount: LegCount;
}

interface BriefBuilderProps {
  options: FlightOptions;
  draft: Draft;
  onChange: (patch: Partial<Draft>) => void;
  onGenerate: () => void;
  onSurprise: () => void;
  canGenerate: boolean;
  isPending: boolean;
}

/** Keep only the options the server actually accepts — labels are ours, the set isn't. */
function present<V extends string>(
  opts: DialOption<V>[],
  allowed: readonly string[],
): DialOption<V>[] {
  return opts.filter((o) => allowed.includes(o.value));
}

export function BriefBuilder({
  options,
  draft,
  onChange,
  onGenerate,
  onSurprise,
  canGenerate,
  isPending,
}: BriefBuilderProps) {
  const { dials, viability, maxLegs } = options;

  const timeItems: DialItem<Brief["timeBand"]>[] = present(
    TIME_OPTIONS,
    dials.timeBand,
  ).map((o) => {
    const disabled = draft.aircraft ? !viability[draft.aircraft][o.value] : false;
    return {
      ...o,
      disabled,
      reason: disabled && draft.aircraft
        ? timeDisabledReason(o.value, draft.aircraft)
        : undefined,
    };
  });

  const aircraftItems: DialItem<Brief["aircraft"]>[] = present(
    AIRCRAFT_OPTIONS,
    dials.aircraft,
  ).map((o) => {
    const disabled = draft.timeBand ? !viability[o.value][draft.timeBand] : false;
    return {
      ...o,
      disabled,
      reason: disabled && draft.timeBand
        ? aircraftDisabledReason(o.value, draft.timeBand)
        : undefined,
    };
  });

  // Legs greys out only once time AND aircraft are chosen (max legs depends on
  // both). Picking legs first leaves them all enabled; the server's no-flight
  // path catches any combination that still can't be filled.
  const legItems: DialItem<`${LegCount}`>[] = present(
    LEG_OPTIONS,
    dials.legCount.map(String),
  ).map((o) => {
    const n = Number(o.value);
    const capped =
      draft.timeBand && draft.aircraft
        ? maxLegs[draft.aircraft][draft.timeBand]
        : undefined;
    const disabled = capped !== undefined && n > capped;
    return {
      ...o,
      disabled,
      reason:
        disabled && draft.timeBand && draft.aircraft
          ? legsDisabledReason(n, draft.timeBand, draft.aircraft)
          : undefined,
    };
  });

  return (
    <section className="rounded-xl border border-line bg-panel/60 shadow-panel backdrop-blur-sm">
      <div className="flex flex-col gap-7 p-5 sm:p-7">
        <SegmentedDial
          placard="Time available"
          items={timeItems}
          value={draft.timeBand}
          onChange={(v) => onChange({ timeBand: v })}
        />
        <SegmentedDial
          placard="Aircraft"
          items={aircraftItems}
          value={draft.aircraft}
          onChange={(v) => onChange({ aircraft: v })}
        />
        <SegmentedDial
          placard="Legs"
          items={legItems}
          value={`${draft.legCount}` as `${LegCount}`}
          onChange={(v) => onChange({ legCount: Number(v) as LegCount })}
        />
        <div className="h-px bg-line" />
        <SegmentedDial
          placard="Region"
          items={present(REGION_OPTIONS, dials.region)}
          value={draft.region}
          onChange={(v) => onChange({ region: v })}
        />
        <SegmentedDial
          placard="Flight rules"
          items={present(RULES_OPTIONS, dials.rules)}
          value={draft.rules}
          onChange={(v) => onChange({ rules: v })}
        />
        <SegmentedDial
          placard="Vibe"
          items={present(VIBE_OPTIONS, dials.vibe)}
          value={draft.vibe}
          onChange={(v) => onChange({ vibe: v })}
        />
      </div>

      <div className="border-t border-line p-5 sm:p-7">
        <Button
          variant="primary"
          onClick={onGenerate}
          disabled={!canGenerate || isPending}
          icon={<Plane size={17} strokeWidth={2.2} />}
          className="w-full py-3 text-base"
        >
          {isPending ? "Dispatching…" : "Generate flight"}
        </Button>
        <div className="mt-3 flex items-center justify-between gap-3">
          <Button
            variant="ghost"
            onClick={onSurprise}
            disabled={isPending}
            icon={<Shuffle size={15} />}
          >
            Surprise me
          </Button>
          <p className="text-right text-xs text-mute">
            {canGenerate
              ? "Or let the dispatcher pick everything."
              : "Pick a time and an aircraft — or let the dispatcher decide."}
          </p>
        </div>
      </div>
    </section>
  );
}
