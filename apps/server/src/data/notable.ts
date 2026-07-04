import type { Airport } from "../types.js";

/**
 * Curated "notable" airports — famous, dramatic, or bucket-list fields whose
 * approaches write their own briefings. Keyed by ICAO ident; the value is a
 * one-line hook surfaced to the model in the prompt (buildPrompt) and used to
 * tag the airport with the "notable" vibe at load (data/index.ts).
 *
 * Sparse by nature: many briefs have no notable field in range, which the
 * honest-relaxation ladder handles by dropping the vibe like any other. Extend
 * freely — an ident absent from the baked dataset simply never matches, so a
 * dead entry is harmless (see the load-time filter in data/index.ts).
 */
export const NOTABLE_HOOKS: Record<string, string> = {
  LOWI: "Innsbruck — a hand-flown weave up the Inn valley, the Alps close on both wings",
  LFLJ: "Courchevel — an uphill altiport runway with a ski-jump gradient and no go-around",
  VQPR: "Paro — a Himalayan slalom between peaks that only a handful of pilots are certified to fly",
  VNLK: "Lukla (Tenzing–Hillary) — the Everest trekkers' strip, a sloped runway ending at a cliff",
  TNCM: "St Maarten (Princess Juliana) — airliners skim Maho Beach sunbathers on short final",
  TNCS: "Saba — the shortest commercial runway on Earth, sheer cliffs at both ends",
  TFFJ: "St Barthélemy — dive over the hilltop roundabout, then drop onto the beach threshold",
  MHTG: "Toncontín — bank hard into the Tegucigalpa bowl on short final",
  NZQN: "Queenstown — a terrain-hemmed arrival threading the Southern Alps",
  KASE: "Aspen — a high-altitude, one-way canyon approach into the Rockies",
  KTEX: "Telluride — the highest commercial airport in the US, a mesa-top runway with drop-offs",
  KEGE: "Eagle/Vail — a steep, terrain-driven approach into Colorado ski country",
  KJAC: "Jackson Hole — the only airport inside a US national park, under the Teton wall",
  LXGB: "Gibraltar — a runway that crosses a live public road beneath the Rock",
  LPMA: "Madeira — a runway on stilts over the Atlantic, infamous for its swirling crosswinds",
  EGPR: "Barra — the world's only scheduled beach runway, its timetable set by the tide",
  EGLC: "London City — a steep 5.5° approach threaded between the Docklands towers",
  LSGS: "Sion — an Alpine valley strip deep in the Rhône, ringed by peaks",
  LSZA: "Lugano — a steep approach over the lake into Italian-speaking Ticino",
  LIRN: "Naples — Vesuvius standing off the wingtip on the arrival",
  LGSK: "Skiathos — the Greek St Maarten, jet blast roaring over the coast road",
  LGMK: "Mykonos — a Cycladic island approach fighting the summer meltemi",
  LFMN: "Nice — an overwater arrival skimming the Côte d'Azur",
  LFKC: "Calvi — a coastal Corsican approach pinned between the sea and the mountains",
  PHOG: "Kahului, Maui — a trade-wind island approach under the West Maui peaks",
  PHNL: "Honolulu — the reef runway built out over the Pacific",
  KSNA: "John Wayne — the famously steep, throttled-back noise-abatement departure",
  SBRJ: "Rio (Santos Dumont) — a downtown runway on the bay beneath Sugarloaf",
  SPZO: "Cusco — a high-altitude gateway to Machu Picchu, hemmed by the Andes",
  SKBO: "Bogotá — one of the world's highest major hubs, an Andean plateau arrival",
  PANC: "Anchorage — floatplane capital of the world under the Chugach peaks",
  BGGH: "Nuuk — an approach over Greenland's ice-strewn fjords",
  ENSB: "Svalbard (Longyearbyen) — the northernmost scheduled airport on the planet, polar light",
  NTAA: "Papeete, Tahiti — a lagoon approach across French Polynesia",
  YSSY: "Sydney — the harbour arrival past the Opera House and the Bridge",
  YMHB: "Hobart — the gateway to Tasmania, arriving over the Derwent",
  // Africa + its islands (restored to the dataset July 2026).
  FACT: "Cape Town — the arrival under Table Mountain, the Cape of Good Hope beyond",
  HKJK: "Nairobi — the safari gateway on the edge of the Rift Valley and its national park",
  HTKJ: "Kilimanjaro — an approach across the savanna beneath Africa's highest peak",
  FVFA: "Victoria Falls — arrive beside the mile-wide curtain of the Zambezi",
  HAAB: "Addis Ababa — one of the world's highest major airports, high on the Ethiopian plateau",
  FYWB: "Walvis Bay — where the red dunes of the Namib run straight into the Atlantic",
  FMEE: "Réunion (Roland Garros) — a volcanic-island approach beneath the smoking Piton de la Fournaise",
  FMMI: "Antananarivo — the highland gateway to Madagascar's singular wilds",
  FIMP: "Mauritius — a lagoon-ringed Indian Ocean island approach",
  HTZA: "Zanzibar — a spice-island arrival off the Tanzanian coast",
  GVAC: "Sal, Cape Verde — a mid-Atlantic island, the old transatlantic staging post",
  GCLP: "Gran Canaria — a Canary Islands hub in the Atlantic off the Saharan coast",
  GMMN: "Casablanca — the Atlantic-coast gateway to Morocco",
  DNMM: "Lagos — West Africa's teeming megacity hub on the Gulf of Guinea",
};

/** Idents carrying the curated "notable" tag/hook. */
export const NOTABLE_ICAOS = new Set(Object.keys(NOTABLE_HOOKS));

/**
 * Return `airports` with the "notable" vibe tag added to any curated field.
 * Pure and non-mutating — untouched airports are returned by reference so only
 * the tagged handful allocate. Idempotent: re-tagging a notable airport is a
 * no-op, so it is safe to run over already-enriched data.
 */
export function applyNotableTags(airports: readonly Airport[]): Airport[] {
  return airports.map((a) =>
    NOTABLE_ICAOS.has(a.ident) && !a.vibe_tags.includes("notable")
      ? { ...a, vibe_tags: [...a.vibe_tags, "notable"] }
      : a,
  );
}
