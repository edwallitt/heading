# Feature ideas

Suggestions from a full codebase review (July 2026). Grouped into three buckets:
finish the half-built things, deepen the "dispatch" fantasy, and give the app
memory without a database.

**Top three picks:** home-base/journey mode (#8), wind-aware routing (#4), and
finishing the navaid waypoint path that's already ~80% built (#1).

---

## Finish what's already half-built (high payoff, low effort)

### 1. Named navaid routing ✅ *(shipped July 2026)*

~10,800 navaids load at boot and the `.pln` writer can resolve them by ident
(`export/waypoints.ts`) — but `validateWaypoints` in
`apps/server/src/ai/generateFlight.ts` only accepts raw `lat,lon` strings, so
the entire navaid path is dead weight. Feed each candidate chain's nearby
VOR/NDB idents into the prompt and accept them back. VFR briefs suddenly read
like real ones ("route via the WHISKEY VOR, then coast-crawl north") and the
`.pln` gets proper named waypoints instead of anonymous coordinates.

Bonus creative reuse: a navaid *on the field* is a decent
instrument-capability signal — better than the current `scheduled_service`
proxy for `ifr_capable`, which is flagged in-code as coarse.

### 2. Multi-leg scenic waypoints ✅ *(shipped July 2026)*

Waypoints are single-leg only; legs 2–3 always fly direct
(`generateFlight.ts`). Multi-leg tours are exactly the flights where scenic
routing matters most.

### 3. Server-side anti-repeat

`excludeRecent` is only a "please avoid" hint in the prompt. Demote (not
remove — keep the honest-relaxation philosophy) recently-seen airports in the
ranking in `lib/candidatePairs.ts`, so "Generate again" reliably feels fresh
instead of hoping Opus complies.

---

## Deepen existing features

### 4. Wind-aware everything

METARs are already fetched for the whole pool but used only for category
demotion. The wind fields are sitting right there:

- Adjust block time for head/tailwind component so the numbers are honest.
- Prefer chains flown *downwind* when the budget is tight.
- Surface it in the card ("18 kt on the tail — you'll beat the block time").

Going further: Open-Meteo serves keyless winds-aloft at pressure levels, which
fits the no-API-key rule and gives real cruise-level winds instead of surface
wind as a proxy.

### 5. TAFs for the golden-hour slot

The golden-hour strip proposes a departure hours from now, but the weather
chips show *current* METARs — the one time the weather is guaranteed stale is
the time the app tells the user to fly. AWC serves TAFs from the same keyless
API; decode the validity window covering the proposed departure and badge the
destination with the *forecast* category alongside the current one.

### 6. Fix the coastal vibe with real coastline data (+ restore Africa)

The ≤50 ft elevation proxy is the weakest vibe tag (inland river valleys
qualify; cliff-top coastal fields don't). Natural Earth's coastline geojson is
small and free — bake distance-to-coast at build time in
`scripts/build-airports.ts` and the tag becomes trustworthy.

While in there: **restore Africa**. It was dropped deliberately in Phase 1,
but Namibia, the Nile, and the Rift Valley are some of the best sim flying on
Earth, and the pipeline no longer has whatever constraint motivated dropping
it.

### 7. Golden hour is one mode — make it a dial

"Arrive at golden hour" is lovely, but the same sun math (`lib/sun.ts`) gives:

- **Dawn patrol** — lift off in civil twilight, land in morning light.
- **Night VFR** — the city-skyline vibe at night is a different product.
- **Sunset chaser** — westbound at jet speeds you outrun the terminator, so a
  regional-jet leg can stretch golden hour across the whole flight. A
  computable, physical, magical thing no other tool tells you.

---

## New features that fit the architecture

### 8. Home base + journey mode (top pick)

Simmers overwhelmingly fly from a home field, and the app currently teleports
you somewhere random every time. Two layers, both stateless:

1. Let the user pin an origin ICAO (localStorage, one text input; the pool
   seeds from it in `candidatePairs.ts`).
2. The killer feature on top — **"continue the journey"**: the next brief
   departs wherever the last one landed. The open-chain machinery already does
   exactly this shape of work.

Suddenly Heading isn't a random-flight generator, it's an ongoing world tour
with a persistent line crawling across the map — the emotional difference is
enormous, and it costs a localStorage key.

### 9. Closed loops

The chain builder only does open A→B→C. "There and back" (A→B→A) and
triangles that end at origin are *the* classic sim-session shapes — you want
to end parked at your home hangar. It's a small variant of `extendChain`: the
last leg targets the origin, band-checked like any other leg.

### 10. Challenge modifiers

An optional "spice" dial using data that's already there:

- **Short-field** — destination `longest_rwy_ft` near the aircraft minimum.
- **High & hot** — field elevation + temperature from the METAR.
- **Crosswind work** — needs runway headings baked from `runways.csv`
  (currently only lengths are kept), then compute the crosswind component from
  live wind.

The briefing prose gets to say "gusting 22 across runway 27 — earn it."

### 11. A curated bucket-list tag ✅ *(shipped July 2026)*

A hand-written list of famous airports (Innsbruck, Courchevel, St. Barth,
Paro, Madeira, Saba…) exposed as a `notable` vibe tag with a one-line hook
each. Tiny data, and it gives Opus real material — the briefings for these
write themselves. "Surprise me" occasionally hitting Lukla is worth more than
any algorithmic vibe.

Shipped as `data/notable.ts` (ICAO→hook map, tag applied at load — not baked
into the airport asset, since the list changes on a different cadence). 36
curated fields present in the dataset; the hook text is surfaced per-chain to
the prompt. Africa entries (Cape Town, Nairobi, Lagos, Casablanca) are staged
but dead until Africa is restored (#6).

### 12. Shareable dispatch card

The permalink reproduces the app, but sim communities share *images* on
Discord. Render the result card to a downloadable PNG (canvas, or an OG-image
endpoint on the Hono server so pasted links unfurl with the route map +
briefing). The magenta-on-dark glass-cockpit aesthetic would be instantly
recognizable in a feed — that's the growth loop.

### 13. Local logbook

No accounts, no DB — just a "Mark as flown" button writing to localStorage:
flights flown, NM covered, countries visited, airports lit up on a personal
map. Pairs perfectly with journey mode (#8) to make the whole thing feel like
a career instead of a slot machine.

---

## Small bug ✅ *(fixed July 2026)*

`regenerating`/`retrying` were hardcoded to `false` in `apps/web/src/App.tsx`,
so the "Generate again" spinner path in `ResultCard` could never trigger. Root
cause was deeper than the hardcoded flag: while `generate.isPending`, App
renders the full-screen `<Dispatching />` and unmounts `ResultCard` entirely,
so the inline spinner was structurally dead. Fixed by deleting the dead path —
`<Dispatching />` already gives regen feedback. (The `retrying` prop stays: the
options-error panel genuinely uses it; only the generate-error `false` was
inert, and it's honest as-is.)

## Suggested sequencing

- **"Your journey" release:** #8 + #9 + #13
- **"Real airmanship" release:** #1 + #4 + #5
- **Quiet data upgrades** that make everything else better: #6 + #11
