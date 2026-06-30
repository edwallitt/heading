# Heading — Planning & Build Spec

*"What's my heading today?" — an AI-powered "where should I fly" companion for MSFS 2024.*

**Project:** Heading · **Repo/slug:** `heading-sim` · **Wordmark:** Heading · **Tagline:** *Your flight for today.*

---

## 1. Concept & mental model

You set five coarse dials (time, region, flight rules, vibe, aircraft — see §3). The app generates a concrete, flyable mission: origin, destination, a short evocative overview, a suggested cruise level, an estimated duration, and a route — then exports it to **SimBrief** (one click) and/or **MSFS 2024** (`.pln`).

**The matchmaker model — three roles, deliberately separated:**

| Role | Owner | Why |
|---|---|---|
| Creative dispatcher — *where / what / why / how high / how long* | LLM (Opus) | LLMs are excellent at scenario creativity, terrible at valid airways |
| Flight planner — *the real route, fuel, levels, valid `.pln`* | SimBrief | Purpose-built; we never reinvent it |
| Bridge — *UI, validation, hand-off* | The app | Glue + guardrails |

**Guardrail principle: LLM proposes, validator disposes.** Every airport ICAO and aircraft type code the LLM returns is checked against a real dataset before it's allowed downstream. The model literally cannot route you to a non-existent field.

---

## 2. The killer architectural decisions (settled from research)

### 2a. SimBrief export = a plain URL, no API key
```
https://www.simbrief.com/system/dispatch.php?type={ICAO}&orig={ICAO}&dest={ICAO}&route={optional}
```
- If `route` is **omitted**, SimBrief inserts its own recommended route from its database.
- Add `&altn=`, `&fltnum=`, etc. as desired.
- This is the **Dispatch Redirect** method — no key, no backend call. The app just builds the link and opens it.
- After SimBrief generates, the user downloads the MSFS `.pln` *from SimBrief* (valid, with airways).

### 2b. MSFS 2024 `.pln` = simple XML, but only generate it ourselves for VFR
- FSX-derived XML; loaded via **World Map → Load/Save**.
- **No parking position** in MSFS 2024 PLN — gate is always chosen in-sim. (Don't try to embed it.)
- VFR/scenic plans **must not** contain procedures/airways. So our self-generated `.pln` is point-to-point (great-circle, optional intermediate sightseeing waypoints from the LLM) — which is exactly right for bush/scenic.

### 2c. Flight rules decide who routes (the elegant branch)
```
VFR / scenic / bush  → app writes its own direct .pln  (LLM-friendly, zero airway risk)
IFR / airliner       → hand to SimBrief for real airway routing, grab SimBrief's .pln
```
This puts the hard routing where it belongs and keeps the LLM in its lane.

---

## 3. The brief — five dials as a constraint graph

The user sets five coarse dials. The key insight: **they are not independent menus — they form a constraint graph.** The design work is collision handling, not the option lists.

### The five dials (locked)

| # | Dial | Options |
|---|---|---|
| 1 | **Time available** | 20 min · 45 min · 1 hr · 2 hr · 3–5 hr · long haul |
| 2 | **Region** | Anywhere · North America · South America · Europe · Asia · Oceania · Caribbean |
| 3 | **Flight rules** | Any · VFR · IFR |
| 4 | **Vibe** | Scenic mountains · Coastal · City skylines · Bush/remote · Surprise me |
| 5 | **Aircraft type** | Small prop · Turboprop · Regional jet · Airliner |

*Season was considered and dropped: it can't be exported (MSFS sets weather/time-of-day at load), so it could only tint overview prose — not worth a dial plus hemisphere logic plus a relaxation branch. Time-of-day (golden hour / night) is the better future flavour lever if wanted: higher scenic impact, trivial to set in-sim.*

### Hard vs soft constraints

Some dials *must* hold or there's no flyable plan; others are flavour and can bend.

| Hard (a valid plan depends on it) | Soft (flavour — may relax) |
|---|---|
| Region, Aircraft, Time→distance, Flight rules | Vibe (the only one) |

**Relaxation order when a real brief returns too few airports:** drop Vibe → widen Region. **Never** silently change Aircraft, Time, or Rules. Always tell the user what was bent ("no remote strips matched there, so I ignored the vibe").

### Two mechanisms, used together

1. **Progressive narrowing (UI-level prevention).** Later picks prune earlier ones so an impossible brief can't be built. Pick *Airliner* → 20 min greys out, rules default to IFR, FL defaults high. Pick *Bush/remote* → airliner greys out.
2. **Graceful relaxation (server-level fallback).** If a still-legal combo yields too few real airports, loosen the softest constraint and surface the change. Fail soft, never error.

### Per-dial semantics

- **Time is *block* time, not cruise time** (see the block-time model below). A 45-min jet leg is mostly climb + descent, so multiplying the budget by cruise TAS badly overestimates reachable distance. Trip-average speed only approaches cruise on long legs — like a car's quarter-mile vs top speed.
- **Long haul** = 5 hr+ block, capped (~8–9 hr so the candidate query stays bounded), regional jet / airliner only. Carries an explicit "assumes sim time-acceleration" note — it's a dial that otherwise promises a flight no one sits through in real time.
- **Region:** continents are coarse; Vibe localises them (Europe + mountains → Alps/Norway, not the meseta). Caribbean is its own bucket on purpose (island-hopping).
- **Flight rules** is the load-bearing dial: it selects the routing path (§2c). *Any* → LLM infers from aircraft + distance.
- **Vibe** is the LLM's main creative lever. Currently scenery-led (GA-biased); leave a slot for operational vibes ("busy hub-to-hub", "long overwater") for airliners later.
- **Aircraft = category for filtering, specific plane for flavour.** Each category carries a performance profile (cruise TAS, ceiling, block-time overheads, range) used for the block-time distance band and runway filter; the LLM names a specific aircraft in its overview. Category also seeds default rules + FL.

### The block-time model (the distance math)

Reachable distance = the cruise *portion* of the budget × cruise TAS — not the whole budget. Each category carries fixed overheads:

```
block_time = taxi_out + climb_time + cruise_time + descent_time + taxi_in
cruise_distance_band = (time_budget − fixed_overheads) × cruise_TAS   (with a ± tolerance)
total_distance = climb_distance + cruise_distance + descent_distance
```

If `time_budget ≤ fixed_overheads` for a category (e.g. airliner in 20 min), the band is empty → that's *why* the cell greys out in the matrix, derived not hand-coded.

### Aircraft category profiles (drives the math + filters)

| Category | Cruise TAS | Ceiling | Fixed overhead (taxi+climb+descent) | Climb+descent dist | Min runway | Default rules |
|---|---|---|---|---|---|---|
| Small prop | ~120 kt | ≤10,000 ft | ~12 min | ~15 NM | short / grass OK | VFR |
| Turboprop | ~250 kt | ≤25,000 ft | ~20 min | ~50 NM | medium | VFR or IFR |
| Regional jet | ~440 kt | ≤41,000 ft | ~30 min | ~120 NM | medium–long | IFR |
| Airliner | ~470 kt | ≤41,000 ft | ~35 min | ~150 NM | long | IFR |

*(All values are tunable constants — bias toward your owned MSFS fleet so estimates stay trustworthy. SimBrief `type` samples: C172/C208, TBM9/PC12/DH8D, E190/CRJ9, A320/B738.)*

### Compatibility matrix (greys-out rules for progressive narrowing)

| | 20m | 45m | 1h | 2h | 3–5h | long haul |
|---|---|---|---|---|---|---|
| Small prop | ✓ | ✓ | ✓ | ✓ | ~ | ✗ |
| Turboprop | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| Regional jet | ~ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Airliner | ✗ | ~ | ✓ | ✓ | ✓ | ✓ |

`✓` allow · `~` allow but warn (tight) · `✗` grey out. The `✗` cells fall out of the block-time model (budget ≤ overhead), not a hand-maintained list. Vibe × Aircraft has one hard exclusion: **Bush/remote ✗ Airliner**.

---

## 4. The constraint → candidate-airport pipeline (spine of Phase 1/2)

This is what turns the five dials into a real, validated origin/destination pair. The LLM only ever *chooses from a pre-filtered real set* — it never free-recalls ICAOs.

```
brief (5 dials)
  │
  ├─ resolve dials → numeric constraints
  │     time − aircraft.overhead, × cruise_TAS → target distance band (min..max NM, block-time model)
  │     aircraft.category        → min runway length, ceiling, default rules
  │     region                   → bounding box(es) / country set
  │     vibe                     → terrain/scenery tags  (soft — the only relaxable one)
  │
  ├─ HARD filter on airports table (OurAirports)
  │     WHERE region_match
  │       AND longest_runway_ft >= category.min_runway
  │       AND airport_type IN (suitable set)
  │     → origin candidate pool
  │
  ├─ for each origin, find destinations within the distance band
  │     dest WHERE great_circle(origin,dest) BETWEEN min AND max
  │       AND same hard filters
  │     → (origin → dest) candidate pairs
  │
  ├─ SOFT rank by vibe (terrain/coastal/urban tags), sample N pairs
  │
  ├─ if pairs < threshold → RELAX softest constraint, retag, retry
  │     (drop vibe → widen region); record what was relaxed
  │
  └─ hand N candidate pairs + profiles to the LLM
        → LLM selects one, writes overview / why / (VFR waypoints)
        → validate against the same dataset → enrich → present
        → if LLM fails twice: pick algorithmically from the pool
          (best vibe-tag + distance fit) + templated overview — always returns a flyable plan
```

Because the candidate pool is already real and validated, the LLM is never a single point of failure: the app can always fall back to an algorithmic pick and still hand you a flyable mission.

Vibe tagging needs a terrain/scenery attribute per airport. Cheap v1: derive coarse tags from OurAirports + elevation + coastline proximity (e.g. `elev>3000ft`→mountain, `<5km to coastline`→coastal, near large city polygon→urban). Good enough to bias selection; the LLM does the rest.

---

## 5. Data the app needs (small, static, free)

| Dataset | Source | Use |
|---|---|---|
| Airports (`ident`, name, lat/lon, elev, type, country, region) | **OurAirports** `airports.csv` | Validate idents; filter by region/scenery; compute distances |
| Runways (length, surface) | **OurAirports** `runways.csv` | Join for the min-runway filter |
| Aircraft type designators (ICAO type, category, TAS, ceiling, overheads, range) | Curated JSON (your owned MSFS fleet) | Validate aircraft; block-time math; feed SimBrief `type` |
| Region polygons / bounding boxes | Hand-curated or Natural Earth | Map "Norway", "Alps", "PNG" → airport filter |

**OurAirports is messy — the Phase 1 ingest must clean it, or you'll suggest fields the sim can't load:**
- Runway lengths live in a **separate `runways.csv`** — join on airport ident; an airport with no runway row can't pass the length filter.
- Filter `type` to `large_airport` / `medium_airport` / `small_airport`; drop heliports, seaplane bases, balloonports, and anything `type = closed`.
- The `ident` column is mixed: true 4-letter **ICAO** where it exists, else local/GPS codes (`1G5`) MSFS often won't recognise. **Prefer 4-letter ICAO idents** for anything we suggest.
- Residual reality: OurAirports ≠ MSFS's airport set, so there's no guarantee every field exists in-sim. Treat "prefer larger / well-known airports" as a *quality lever* (a soft scoring weight), not just a realism nicety — it materially raises the hit rate of suggestions that actually load.

Bake these into the image as static assets, loaded into memory at boot. No database, no live API for the core loop.

---

## 6. The AI pipeline

```
user params
   → build prompt (inject candidate airport pool + aircraft profile)
   → LLM returns STRICT JSON
   → validate (ICAOs exist? aircraft real? distance vs duration plausible? FL legal for rules/aircraft?
              VFR waypoints each resolve to a real navaid or clean lat/lon?)
   → on fail: one auto-retry with the error fed back
   → enrich (compute GC distance, block-time ETE, normalise VFR altitude to hemispheric rule, build links/.pln)
   → present
```

**VFR altitude legality:** the LLM won't reliably apply VFR hemispheric rules (eastbound = odd thousands + 500, westbound = even + 500). Compute the initial track post-hoc and **snap the suggested cruise altitude to the legal value** — cheap realism polish you'd otherwise notice immediately.

**Anti-repeat:** keep a session-level "recently shown pairs" list (client-side, fits stateless) and pass it as an exclusion so **Regenerate** genuinely reshuffles instead of returning the same EGLL→LFPG. Small, but it's the difference between feeling alive and feeling canned.

**The candidate pool comes from §4** — the LLM never free-recalls ICAOs; it *chooses and justifies* from the pre-filtered, distance-banded real pairs the pipeline hands it. Recall problem → selection problem. The prompt also carries the *relaxation report* (if any), so the LLM can word the overview honestly when a soft constraint was bent.

**Structured output:** system prompt demands JSON only (no prose, no fences). Schema (validate with Zod):
```jsonc
{
  "origin": "ENBR",
  "destination": "ENAL",
  "aircraft_type": "C208",       // ICAO designator
  "cruise_level": "8500",        // ft or FLxxx
  "est_block_min": 52,           // block time (taxi+climb+cruise+descent+taxi), not cruise-only
  "rules": "VFR",
  "overview": "Short scene-setting paragraph...",
  "waypoints": ["...", "..."],   // VFR only: scenic routing, each must validate to a real navaid ident or lat/lon
  "why_this": "One line on why it fits the brief"
}
```

**Model:** one Opus call per generate (select pair + write overview + suggest scenic VFR waypoints). There's no extraction/triage step here, so no tiering — Opus's prose and geographic judgement are the whole point. Cost is one call per "generate"; cache nothing. **Opus is never a hard dependency:** on two failed/invalid responses, fall back to an algorithmic pick from the (already validated) candidate pool with a templated overview, so the app always returns a flyable flight.

---

## 7. Stack (your house stack — reused)

- **Frontend:** React + Vite + TypeScript, TanStack Query, Tailwind. A MapLibre GL map (OpenFreeMap tiles) to preview the picked route — you already use this in FlightCareer.
- **Backend:** Hono + tRPC.
- **Data store:** none. Reference data (airports, aircraft) is a **baked static asset loaded into memory** at boot — no database engine. Nothing is persisted.
- **AI:** Anthropic SDK server-side (key never in client).
- **Host:** Fly.io (London) or Vercel. Stateless, so either is trivial — no DB to provision.

*Note:* the app is fully stateless. The only "saved" state is whatever the user bookmarks via the shareable permalink (§9).

---

## 8. Data shapes (no persistence — in-memory + URL state)

Nothing is stored server-side. There are exactly two kinds of data:

**A. Baked reference data — loaded into memory at boot (read-only):**
```
Airport   { ident, name, lat, lon, elev_ft, type, country, region, longest_rwy_ft, vibe_tags[] }
Aircraft  { category, cruise_tas, ceiling_ft, overhead_min, climb_descent_nm, min_rwy_ft, default_rules, simbrief_type, range_nm }
```
Produced by a build-time preprocessing step from OurAirports + the curated aircraft JSON, committed as a compact asset (e.g. `airports.json`, `aircraft.json`). Held in a typed in-memory index; a region/bounding-box prefilter keeps the candidate-pair query fast without a DB.

**B. A generated flight — transient, lives in the response and (optionally) the URL:**
```
Flight {
  brief                  // the 5 dials
  aircraft_type
  cruise_level, est_block_min, rules
  overview, why_this
  legs[]                 // ordered [{ from_icao, to_icao, dist_nm, waypoints[] }] — length 1 in v1
  simbrief_url           // built from legs[0]
  pln                    // VFR self-generated plan (download), else absent
  relaxed                // what (if anything) was relaxed, for the honest result-card note
}
```
The whole `Flight` is reconstructible from a compact URL-encoded state, so a permalink *is* the save mechanism (§9). No history table, no favourites table, no logbook.

*Multi-leg note:* `legs[]` is an ordered list of one in v1 so Caribbean/bush/coastal multi-leg later is additive, not a refactor — and it costs nothing, since it's just a response shape, not a schema.

---

## 9. Screens

1. **Brief builder** — the five dials (§3) as fast tappable segmented controls: Time, Region, Flight rules, Vibe, Aircraft. Progressive narrowing live (incompatible options grey out per the §3 matrix as you pick). Tappable, fast — no free text.
2. **Result card** — origin → dest, map preview of the line/route, overview, FL, ETE, the *why*. If the vibe was relaxed (§3), show a small honest note ("ignored vibe — no remote strips matched there"). Buttons: **Open in SimBrief**, **Download .pln**, **Regenerate** (reshuffles via the anti-repeat exclusion list, §6), **Share/Copy link**.
3. **Shareable permalink (the only "save")** — encode brief + chosen flight into URL query params. Bookmark that gorgeous Norwegian fjord run, re-open it, or paste it to a FlyUK mate. With no persistence, this is how a flight is kept — and statelessness usually *costs* shareability, so this buys it back for free.

*(No History / Favourites / Logbook — those would require storage, which we've deliberately dropped.)*

---

## 10. Build phases → Claude Code prompt batches

Each phase is one self-contained prompt-master session.

**Phase 0 — Scaffold**
pnpm monorepo: Vite+React+TS front, Hono+tRPC back, shared types package, Tailwind, env wiring, health-check `ping`. **No database.** (Clone your MarketLens/FlightCareer skeleton, minus the DB layer.)

**Phase 1 — Data layer (build-time + in-memory)**
A **build-time preprocessing script** turns OurAirports `airports.csv` ⋈ `runways.csv` into a compact baked `airports.json` (filtered to real open airports, ICAO idents preferred, vibe tags precomputed — §5). Curated `aircraft.json` with block-time profiles (§3). A typed **in-memory index** loaded at boot with a region/bounding-box prefilter. **Block-time distance/ETE utils** and the VFR hemispheric-altitude helper. The **constraint resolver** (dials → numeric constraints) and the **candidate-pair query** (§4) with the soft-relaxation loop — all pure functions over the in-memory data. Unit tests on the validators, the block-time band, and the relaxation order.

**Phase 2 — AI dispatch (no UI)**
tRPC `generateFlight` procedure: brief schema → constraint resolver → candidate-pair builder (§4) → prompt (pairs + profiles + relaxation report + anti-repeat exclusions) → Anthropic Opus call → Zod-validated JSON → validation/retry → **algorithmic fallback on double failure** → enrich (incl. VFR altitude snap). CLI/test harness to hammer it across many briefs before any UI (mirrors your `mix briefings.generate` task pattern).

**Phase 3 — Export layer**
SimBrief dispatch-URL builder. VFR `.pln` writer (FSX XML, MSFS 2024 quirks handled) with LLM-suggested scenic waypoints — each validated to a real navaid/lat-lon, great-circle direct as fallback. IFR path = SimBrief hand-off only (no self-generated IFR `.pln`). Golden-file tests: generated `.pln` loads cleanly in MSFS.

**Phase 4 — UI**
Brief builder with live progressive narrowing (§3 matrix) → result card (incl. relaxation note, anti-repeat Regenerate, shareable permalink) → SimBrief / `.pln` / copy-link. MapLibre route preview.

**Phase 5 — Polish**
Loading/error states, "Surprise me" mode, anti-repeat exclusion list, permalink encode/decode. (No persistence work — there's nothing to persist.)

---

## 11. Decisions & remaining open items

### Decided
- **IFR `.pln`:** not generated by us. IFR → SimBrief hand-off; user downloads the `.pln` there. *(Optional far-later: pull SimBrief's `.pln` back via its keyed XML fetcher + userid for a direct download. Not v1.)*
- **State:** **no database, ever.** Fully stateless — reference data is baked and loaded in memory; the only "saved" state is the user's bookmarked permalink (§8/§9). No history, favourites, or logbook.
- **VFR waypoints:** LLM suggests scenic waypoints. Each must validate to a real navaid ident or clean lat/lon before entering the `.pln`; invalid ones are dropped or trigger one retry. (Great-circle direct remains the fallback if zero validate.)
- **Model:** Opus, single call per generate. No tiering, no toggle.
- **Season:** dropped (see §3).
- **Aircraft:** four categories + per-category performance profiles (incl. block-time overheads); LLM names a specific plane in the overview. Profiles biased toward your owned MSFS fleet.
- **Scope:** single-leg for v1, but the data model stores `legs[]` (length 1) so multi-leg is additive later (§8).
- **Robustness:** Opus is never a hard dependency — algorithmic fallback from the validated pool on double failure (§4/§6).

### Still open
1. **Relaxation threshold.** What counts as "too few" pairs before we drop Vibe / widen Region (e.g. <3 candidate pairs)? Start with a fixed minimum + the fixed order (drop Vibe → widen Region); tune from real use.
2. **Vibe tagging quality.** The cheap derive-from-elevation/coastline/city-polygon approach (§4) is good enough to *bias* selection, but worth a sanity pass on edge cases (high-altitude coastal airports reading as both). Decide later whether to hand-curate tags for a few marquee regions.

---

## 12. Smallest thing that proves it works (v0)

Form (duration + region + aircraft + VFR/IFR) → `generateFlight` → result card with **Open in SimBrief** button + a downloadable direct `.pln`. No DB, no map, no persistence — a permalink is the only way to keep a flight. If that loop feels good in the sim, everything else is decoration.
