import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import type { Flight } from "../trpc.js";

const STYLE = "https://tiles.openfreemap.org/styles/dark";
const COURSE = "#EC5FA4";

const reducedMotion =
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

type LngLat = [number, number];

/** Parse a VFR "lat,lon" waypoint into a [lng, lat] pair. */
function parseWaypoint(s: string): LngLat | null {
  const parts = s.split(/[,\s]+/).map(Number);
  if (parts.length !== 2 || parts.some((n) => !Number.isFinite(n))) return null;
  const [lat, lon] = parts;
  return [lon!, lat!];
}

/** Initial great-circle bearing (deg, clockwise from north) a → b. */
function bearing([lon1, lat1]: LngLat, [lon2, lat2]: LngLat): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
  return (Math.atan2(y, x) * 180) / Math.PI;
}

type NodeKind = "origin" | "mid" | "dest";

function nodeMarker(kind: NodeKind): HTMLElement {
  const el = document.createElement("div");
  const style: Record<NodeKind, string> = {
    // Destination: filled, glowing. Origin: hollow ring. Intermediate stop:
    // a smaller filled dot (a place you land, but not the finish line).
    dest: `width:14px;height:14px;background:${COURSE};box-shadow:0 0 0 4px rgba(236,95,164,0.25),0 0 10px 1px rgba(236,95,164,0.7);`,
    origin: `width:14px;height:14px;background:#0E1419;border:2px solid #8696A3;`,
    mid: `width:11px;height:11px;background:${COURSE};border:2px solid #0E1419;box-shadow:0 0 6px 1px rgba(236,95,164,0.5);`,
  };
  el.style.cssText = `border-radius:9999px;box-sizing:border-box;${style[kind]}`;
  return el;
}

function dartMarker(): HTMLElement {
  const el = document.createElement("div");
  el.innerHTML = `<svg width="30" height="30" viewBox="-15 -15 30 30" aria-hidden="true">
    <circle r="12" fill="#0E1419" stroke="${COURSE}" stroke-width="1.5" opacity="0.9"/>
    <path d="M 0 -8 L 6 7 L 0 3.5 L -6 7 Z" fill="${COURSE}" stroke="#0E1419" stroke-width="1" stroke-linejoin="round"/>
  </svg>`;
  return el;
}

/** A small instrument chip labelling a node (ICAO). Lit = destination. */
function labelMarker(text: string, lit: boolean): HTMLElement {
  const el = document.createElement("div");
  el.textContent = text;
  el.style.cssText = `font-family:"Chakra Petch",system-ui,sans-serif;font-size:11px;font-weight:600;letter-spacing:0.05em;line-height:1;white-space:nowrap;padding:3px 6px;border-radius:4px;color:${
    lit ? COURSE : "#EAEFF2"
  };background:rgba(14,20,25,0.85);border:1px solid #2A3742;box-shadow:0 1px 3px rgba(0,0,0,0.4);backdrop-filter:blur(2px);pointer-events:none;`;
  return el;
}

/**
 * The route on an OpenFreeMap dark base — origin/destination nodes, any VFR
 * waypoints, and the magenta course line with a heading dart at its midpoint.
 * The dark style + course overlay read as instrumentation; if tiles fail the
 * dark canvas and the client-drawn route still render.
 */
export function RouteMap({ flight }: { flight: Flight }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const legs = flight.legs;
    const first = legs[0];
    if (!container || !first) return;

    // Per-leg geometry: endpoints plus any VFR scenic waypoints on that leg.
    const legPaths = legs.map((leg) => ({
      from: [leg.from_lon, leg.from_lat] as LngLat,
      to: [leg.to_lon, leg.to_lat] as LngLat,
      mids: leg.waypoints
        .map(parseWaypoint)
        .filter((c): c is LngLat => c !== null),
    }));

    // One continuous course line: origin, then each leg's mids + arrival. A shared
    // airport (leg N arrival = leg N+1 departure) appears once.
    const path: LngLat[] = [legPaths[0]!.from];
    for (const lp of legPaths) path.push(...lp.mids, lp.to);

    // Airport nodes with labels: origin, each intermediate stop, destination.
    const stops: { coord: LngLat; icao: string; kind: NodeKind }[] = [
      { coord: legPaths[0]!.from, icao: first.from_icao, kind: "origin" },
      ...legs.map((leg, idx) => ({
        coord: [leg.to_lon, leg.to_lat] as LngLat,
        icao: leg.to_icao,
        kind: (idx === legs.length - 1 ? "dest" : "mid") as NodeKind,
      })),
    ];

    const map = new maplibregl.Map({
      container,
      style: STYLE,
      dragRotate: false,
      pitchWithRotate: false,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.scrollZoom.disable(); // keep the card scrollable on touch

    map.on("load", () => {
      map.addSource("route", {
        type: "geojson",
        data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: path } },
      });
      map.addLayer({
        id: "route-glow",
        type: "line",
        source: "route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": COURSE, "line-width": 6, "line-opacity": 0.18, "line-blur": 3 },
      });
      map.addLayer({
        id: "route-line",
        type: "line",
        source: "route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": COURSE, "line-width": 2, "line-dasharray": [1.5, 2] },
      });

      // Nodes + ICAO labels (chalk for origin, lit magenta for every stop after).
      for (const stop of stops) {
        new maplibregl.Marker({ element: nodeMarker(stop.kind) })
          .setLngLat(stop.coord)
          .addTo(map);
        new maplibregl.Marker({
          element: labelMarker(stop.icao, stop.kind !== "origin"),
          anchor: "bottom",
          offset: [0, -12],
        })
          .setLngLat(stop.coord)
          .addTo(map);
      }

      // A heading dart at the midpoint of each leg, pointing along that leg.
      for (const lp of legPaths) {
        new maplibregl.Marker({
          element: dartMarker(),
          rotation: bearing(lp.from, lp.to),
          rotationAlignment: "map",
        })
          .setLngLat(midpoint(lp.from, lp.to))
          .addTo(map);
      }

      const bounds = path.reduce(
        (b, c) => b.extend(c),
        new maplibregl.LngLatBounds(path[0], path[0]),
      );
      map.fitBounds(bounds, {
        padding: { top: 80, bottom: 56, left: 56, right: 56 },
        maxZoom: 8,
        animate: !reducedMotion,
        duration: reducedMotion ? 0 : 700,
      });
    });

    return () => map.remove();
  }, [flight]);

  const legs = flight.legs;
  const totalNm = legs.reduce((sum, l) => sum + l.dist_nm, 0);
  const routeLabel =
    legs.length > 0
      ? [legs[0]!.from_icao, ...legs.map((l) => l.to_icao)].join(" to ")
      : "";

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className="h-60 w-full overflow-hidden rounded-lg border border-line bg-ink"
        role="img"
        aria-label={`Route map: ${routeLabel}`}
      />
      {legs.length > 0 ? (
        <span className="pointer-events-none absolute bottom-2.5 left-2.5 rounded border border-line bg-ink/85 px-2 py-0.5 font-instrument text-xs font-medium tabular-nums tracking-wide text-course backdrop-blur-sm">
          {totalNm.toLocaleString()} NM
          {legs.length > 1 ? ` · ${legs.length} legs` : ""}
        </span>
      ) : null}
    </div>
  );
}

function midpoint([lon1, lat1]: LngLat, [lon2, lat2]: LngLat): LngLat {
  return [(lon1 + lon2) / 2, (lat1 + lat2) / 2];
}
