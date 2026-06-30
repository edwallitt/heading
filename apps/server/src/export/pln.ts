import type { Airport, Flight } from "../types.js";
import { findAirport } from "./airports.js";
import { resolveWaypoints, type ResolvedWaypoint } from "./waypoints.js";

/**
 * MSFS 2024 VFR flight-plan (.pln) writer — FSX-derived AceXML, loaded via
 * World Map → Load/Save. VFR only; returns null for IFR (IFR routes via SimBrief
 * by design, §2c). No airways, no procedures, no parking position. Idents are
 * kept to simple alphanumerics (special characters in IDENT fields break loading).
 *
 * COORDINATE / ALTITUDE FORMAT (MSFS WorldPosition / *LLA), verified against
 * FSX-derived .pln files MSFS loads:
 *
 *   "<lat>,<lon>,<alt>"  e.g.  N47° 10' 53.76",E7° 25' 1.88",+001411.00
 *
 *   lat  = {N|S}{deg}° {min}' {sec}"   deg/min plain integers, sec to 2 decimals
 *   lon  = {E|W}{deg}° {min}' {sec}"   (longitude deg 0–180)
 *   alt  = {+|-}{feet}.00              feet zero-padded to 6 integer digits
 *
 * Degrees/minutes are NOT zero-padded; seconds always carry exactly 2 decimals;
 * altitude is sign + 6-digit zero-padded integer feet + ".00". Airport waypoints
 * use the airport elevation as their altitude; en-route waypoints use the cruise
 * altitude (the aircraft's position there).
 */

const INDENT = "    "; // 4 spaces per level (FSX-style)
const APP_VERSION_MAJOR = 11; // conventional MSFS value; MSFS 2024 is lenient here
const APP_VERSION_BUILD = 282174;

/** Returns the .pln XML for a VFR flight, or null for IFR. */
export function buildVfrPln(flight: Flight): string | null {
  if (flight.rules !== "VFR") return null;

  const leg = flight.legs[0]!;
  const dep = requireAirport(leg.from_icao);
  const dest = requireAirport(leg.to_icao);
  const cruiseFt = Number(flight.cruise_level) || 0;

  const depLLA = worldPosition(dep.lat, dep.lon, dep.elev_ft);
  const destLLA = worldPosition(dest.lat, dest.lon, dest.elev_ft);
  const title = `${dep.ident} to ${dest.ident}`;

  const waypoints = resolveWaypoints(flight);

  const lines: string[] = [];
  lines.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  lines.push("");
  lines.push(`<SimBase.Document Type="AceXML" version="1,0">`);
  lines.push(`${i(1)}<Descr>AceXML Document</Descr>`);
  lines.push(`${i(1)}<FlightPlan.FlightPlan>`);
  lines.push(`${i(2)}<Title>${xml(title)}</Title>`);
  lines.push(`${i(2)}<FPType>VFR</FPType>`);
  lines.push(`${i(2)}<RouteType>Direct</RouteType>`); // no airways/procedures
  lines.push(`${i(2)}<CruisingAlt>${cruiseFt}</CruisingAlt>`);
  lines.push(`${i(2)}<DepartureID>${xml(dep.ident)}</DepartureID>`);
  lines.push(`${i(2)}<DepartureLLA>${depLLA}</DepartureLLA>`);
  lines.push(`${i(2)}<DestinationID>${xml(dest.ident)}</DestinationID>`);
  lines.push(`${i(2)}<DestinationLLA>${destLLA}</DestinationLLA>`);
  lines.push(`${i(2)}<Descr>${xml(title)}</Descr>`);
  lines.push(`${i(2)}<DepartureName>${xml(dep.name)}</DepartureName>`);
  lines.push(`${i(2)}<DestinationName>${xml(dest.name)}</DestinationName>`);
  lines.push(`${i(2)}<AppVersion>`);
  lines.push(`${i(3)}<AppVersionMajor>${APP_VERSION_MAJOR}</AppVersionMajor>`);
  lines.push(`${i(3)}<AppVersionBuild>${APP_VERSION_BUILD}</AppVersionBuild>`);
  lines.push(`${i(2)}</AppVersion>`);

  lines.push(...airportWaypoint(dep, depLLA));
  for (const wp of waypoints) lines.push(...enrouteWaypoint(wp, cruiseFt));
  lines.push(...airportWaypoint(dest, destLLA));

  lines.push(`${i(1)}</FlightPlan.FlightPlan>`);
  lines.push(`</SimBase.Document>`);
  return lines.join("\n") + "\n";
}

function requireAirport(ident: string): Airport {
  const a = findAirport(ident);
  if (!a) throw new Error(`Airport ${ident} not found in the index — cannot build .pln.`);
  return a;
}

/** <ATCWaypoint> for a departure/destination airport. */
function airportWaypoint(airport: Airport, lla: string): string[] {
  const id = ident(airport.ident);
  return [
    `${i(2)}<ATCWaypoint id="${id}">`,
    `${i(3)}<ATCWaypointType>Airport</ATCWaypointType>`,
    `${i(3)}<WorldPosition>${lla}</WorldPosition>`,
    `${i(3)}<ICAO>`,
    `${i(4)}<ICAOIdent>${id}</ICAOIdent>`,
    `${i(3)}</ICAO>`,
    `${i(2)}</ATCWaypoint>`,
  ];
}

/** <ATCWaypoint> for an en-route navaid or user waypoint, at cruise altitude. */
function enrouteWaypoint(wp: ResolvedWaypoint, cruiseFt: number): string[] {
  const id = ident(wp.ident);
  const lla = worldPosition(wp.lat, wp.lon, cruiseFt);

  if (wp.kind === "user") {
    return [
      `${i(2)}<ATCWaypoint id="${id}">`,
      `${i(3)}<ATCWaypointType>User</ATCWaypointType>`,
      `${i(3)}<WorldPosition>${lla}</WorldPosition>`,
      `${i(2)}</ATCWaypoint>`,
    ];
  }

  // navaid: VOR family (VOR/VOR-DME/VORTAC/TACAN) → "VOR", NDB family → "NDB".
  // ICAORegion is omitted (not in our dataset); MSFS resolves by ident +
  // WorldPosition, and the coordinates preserve the route geometry regardless.
  const atcType = NDB_FAMILY.has(wp.type) ? "NDB" : "VOR";
  return [
    `${i(2)}<ATCWaypoint id="${id}">`,
    `${i(3)}<ATCWaypointType>${atcType}</ATCWaypointType>`,
    `${i(3)}<WorldPosition>${lla}</WorldPosition>`,
    `${i(3)}<ICAO>`,
    `${i(4)}<ICAOIdent>${id}</ICAOIdent>`,
    `${i(3)}</ICAO>`,
    `${i(2)}</ATCWaypoint>`,
  ];
}

const NDB_FAMILY = new Set(["NDB", "NDB-DME"]);

const i = (level: number): string => INDENT.repeat(level);

/** XML-escape element text content. */
function xml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Keep idents to simple uppercase alphanumerics (special chars break loading). */
function ident(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Format "lat,lon,alt" in the MSFS WorldPosition format documented above. */
function worldPosition(lat: number, lon: number, altFt: number): string {
  return `${dms(lat, true)},${dms(lon, false)},${altitude(altFt)}`;
}

function dms(value: number, isLat: boolean): string {
  const hemi = isLat ? (value >= 0 ? "N" : "S") : (value >= 0 ? "E" : "W");
  const abs = Math.abs(value);
  let deg = Math.floor(abs);
  let min = Math.floor((abs - deg) * 60);
  let sec = Math.round(((abs - deg) * 60 - min) * 60 * 100) / 100;
  if (sec >= 60) {
    sec -= 60;
    min += 1;
  }
  if (min >= 60) {
    min -= 60;
    deg += 1;
  }
  return `${hemi}${deg}° ${min}' ${sec.toFixed(2)}"`;
}

function altitude(ft: number): string {
  const rounded = Math.round(ft);
  const sign = rounded < 0 ? "-" : "+";
  return `${sign}${String(Math.abs(rounded)).padStart(6, "0")}.00`;
}
