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

function nodeMarker(lit: boolean): HTMLElement {
  const el = document.createElement("div");
  el.style.cssText = `width:14px;height:14px;border-radius:9999px;box-sizing:border-box;${
    lit
      ? `background:${COURSE};box-shadow:0 0 0 4px rgba(236,95,164,0.25),0 0 10px 1px rgba(236,95,164,0.7);`
      : `background:#0E1419;border:2px solid #8696A3;`
  }`;
  return el;
}

function dartMarker(): HTMLElement {
  const el = document.createElement("div");
  el.innerHTML = `<svg width="26" height="26" viewBox="-13 -13 26 26" aria-hidden="true">
    <circle r="11" fill="#0E1419"/>
    <path d="M 0 -7 L 6 7 L 0 3 L -6 7 Z" fill="${COURSE}" stroke="#0E1419" stroke-width="1" stroke-linejoin="round"/>
  </svg>`;
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
    const leg = flight.legs[0];
    if (!container || !leg) return;

    const origin: LngLat = [leg.from_lon, leg.from_lat];
    const dest: LngLat = [leg.to_lon, leg.to_lat];
    const mids = leg.waypoints
      .map(parseWaypoint)
      .filter((c): c is LngLat => c !== null);
    const path: LngLat[] = [origin, ...mids, dest];

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

      new maplibregl.Marker({ element: nodeMarker(false) }).setLngLat(origin).addTo(map);
      new maplibregl.Marker({ element: nodeMarker(true) }).setLngLat(dest).addTo(map);
      new maplibregl.Marker({
        element: dartMarker(),
        rotation: bearing(origin, dest),
        rotationAlignment: "map",
      })
        .setLngLat(mids[Math.floor(mids.length / 2)] ?? midpoint(origin, dest))
        .addTo(map);

      const bounds = path.reduce(
        (b, c) => b.extend(c),
        new maplibregl.LngLatBounds(path[0], path[0]),
      );
      map.fitBounds(bounds, {
        padding: 56,
        maxZoom: 8,
        animate: !reducedMotion,
        duration: reducedMotion ? 0 : 700,
      });
    });

    return () => map.remove();
  }, [flight]);

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className="h-60 w-full overflow-hidden rounded-lg border border-line bg-ink"
        role="img"
        aria-label={`Route map from ${flight.legs[0]?.from_icao} to ${flight.legs[0]?.to_icao}`}
      />
      {flight.legs[0] ? (
        <span className="pointer-events-none absolute bottom-2.5 left-2.5 rounded border border-line bg-ink/85 px-2 py-0.5 font-instrument text-xs font-medium tabular-nums tracking-wide text-course backdrop-blur-sm">
          {flight.legs[0].dist_nm.toLocaleString()} NM
        </span>
      ) : null}
    </div>
  );
}

function midpoint([lon1, lat1]: LngLat, [lon2, lat2]: LngLat): LngLat {
  return [(lon1 + lon2) / 2, (lat1 + lat2) / 2];
}
