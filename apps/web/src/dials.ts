import type { Brief } from "./trpc.js";

/**
 * Presentation metadata for the five dials. The *values* are owned by the server
 * (`flight.options`); here we only attach human labels and a display order. Each
 * dial declares its options in the order they should render — the builder shows
 * only those the server actually accepts, so the two can't silently drift.
 */

type TimeBand = Brief["timeBand"];
type Region = Brief["region"];
type Rules = Brief["rules"];
type Vibe = Brief["vibe"];
type Aircraft = Brief["aircraft"];
type LegCount = NonNullable<Brief["legCount"]>;

export interface DialOption<V extends string> {
  value: V;
  label: string;
  /** Optional one-line gloss for quieter dials. */
  hint?: string;
}

export const TIME_OPTIONS: DialOption<TimeBand>[] = [
  { value: "20min", label: "20 min" },
  { value: "45min", label: "45 min" },
  { value: "1hr", label: "1 hr" },
  { value: "2hr", label: "2 hr" },
  { value: "3-5hr", label: "3–5 hr" },
  { value: "long_haul", label: "Long haul" },
];

export const REGION_OPTIONS: DialOption<Region>[] = [
  { value: "anywhere", label: "Anywhere" },
  { value: "north_america", label: "N. America" },
  { value: "south_america", label: "S. America" },
  { value: "europe", label: "Europe" },
  { value: "asia", label: "Asia" },
  { value: "oceania", label: "Oceania" },
  { value: "caribbean", label: "Caribbean" },
];

export const RULES_OPTIONS: DialOption<Rules>[] = [
  { value: "any", label: "Any" },
  { value: "VFR", label: "VFR" },
  { value: "IFR", label: "IFR" },
];

export const VIBE_OPTIONS: DialOption<Vibe>[] = [
  { value: "mountain", label: "Mountains" },
  { value: "coastal", label: "Coastal" },
  { value: "urban", label: "City skylines" },
  { value: "notable", label: "Notable" },
  { value: "any", label: "Surprise me" },
];

export const AIRCRAFT_OPTIONS: DialOption<Aircraft>[] = [
  { value: "small_prop", label: "Small prop" },
  { value: "turboprop", label: "Turboprop" },
  { value: "regional_jet", label: "Regional jet" },
  { value: "airliner", label: "Airliner" },
];

/** Leg-count dial. Values are strings for the dial; the Draft stores the number. */
export const LEG_OPTIONS: DialOption<`${LegCount}`>[] = [
  { value: "1", label: "Single hop" },
  { value: "2", label: "2 legs" },
  { value: "3", label: "3 legs" },
];

const TIME_LABEL: Record<TimeBand, string> = Object.fromEntries(
  TIME_OPTIONS.map((o) => [o.value, o.label]),
) as Record<TimeBand, string>;

const AIRCRAFT_LABEL: Record<Aircraft, string> = Object.fromEntries(
  AIRCRAFT_OPTIONS.map((o) => [o.value, o.label]),
) as Record<Aircraft, string>;

/** Why a time band is greyed out, given the chosen aircraft. */
export function timeDisabledReason(time: TimeBand, aircraft: Aircraft): string {
  return `${AIRCRAFT_LABEL[aircraft]} can’t fit a ${TIME_LABEL[time]} flight — taxi, climb and descent use the whole budget.`;
}

/** Why an aircraft is greyed out, given the chosen time band. */
export function aircraftDisabledReason(aircraft: Aircraft, time: TimeBand): string {
  return `A ${TIME_LABEL[time]} flight is too short for the ${AIRCRAFT_LABEL[aircraft].toLowerCase()}.`;
}

/** Why a leg count is greyed out, given the chosen time band and aircraft. */
export function legsDisabledReason(
  legs: number,
  time: TimeBand,
  aircraft: Aircraft,
): string {
  return `${legs} legs won’t fit a ${TIME_LABEL[time]} ${AIRCRAFT_LABEL[aircraft].toLowerCase()} trip — each leg needs its own taxi, climb and descent, and they share the one time budget.`;
}

/** Friendly aircraft-category label for the result card. */
export function aircraftLabel(aircraft: Aircraft): string {
  return AIRCRAFT_LABEL[aircraft];
}
