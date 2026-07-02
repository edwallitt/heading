/**
 * Evening sun events for the golden-hour dispatch suggestion — the standard
 * NOAA/Wikipedia "sunrise equation" approximation, accurate to a minute or two,
 * which is plenty for suggesting a sim departure time. Pure math, no API, no
 * dependency.
 */

const DEG = Math.PI / 180;
const J2000 = 2451545.0; // Julian date of 2000-01-01T12:00Z
const UNIX_EPOCH_JD = 2440587.5;
const OBLIQUITY = 23.4397 * DEG;

/** Sun-centre elevation at the visual horizon (refraction + solar radius). */
const SUNSET_ELEV_DEG = -0.833;
/** The photographer's golden hour begins as the sun drops through ~6°. */
const GOLDEN_START_ELEV_DEG = 6;

export interface EveningSun {
  /** UTC instant the golden hour begins (sun descending through 6°). */
  goldenStart: Date;
  /** UTC instant of sunset. */
  sunset: Date;
}

const toJulian = (d: Date): number => d.getTime() / 86_400_000 + UNIX_EPOCH_JD;
const fromJulian = (j: number): Date => new Date((j - UNIX_EPOCH_JD) * 86_400_000);

/**
 * Golden-hour start and sunset at a point, for the local solar day nearest
 * `date`. Returns null when the sun never descends through 6° that day (polar
 * summer/winter) — no golden hour worth planning around.
 */
export function eveningSun(lat: number, lon: number, date: Date): EveningSun | null {
  const goldenStart = descendingCrossing(lat, lon, date, GOLDEN_START_ELEV_DEG);
  const sunset = descendingCrossing(lat, lon, date, SUNSET_ELEV_DEG);
  if (!goldenStart || !sunset) return null;
  return { goldenStart, sunset };
}

/**
 * The UTC instant the sun's centre descends through `elevDeg`, on the local
 * solar day nearest `date`. Null when it never reaches that elevation.
 */
function descendingCrossing(
  lat: number,
  lon: number,
  date: Date,
  elevDeg: number,
): Date | null {
  // Solar day number at this longitude: transit ≈ J2000 + n − lon/360.
  const n = Math.round(toJulian(date) - J2000 + lon / 360);
  const meanSolarTime = n - lon / 360;

  const meanAnomaly = ((357.5291 + 0.98560028 * meanSolarTime) % 360) * DEG;
  const equationOfCentre =
    1.9148 * Math.sin(meanAnomaly) +
    0.02 * Math.sin(2 * meanAnomaly) +
    0.0003 * Math.sin(3 * meanAnomaly);
  const eclipticLon =
    ((meanAnomaly / DEG + equationOfCentre + 180 + 102.9372) % 360) * DEG;

  const transit =
    J2000 +
    meanSolarTime +
    0.0053 * Math.sin(meanAnomaly) -
    0.0069 * Math.sin(2 * eclipticLon);

  const sinDec = Math.sin(eclipticLon) * Math.sin(OBLIQUITY);
  const cosDec = Math.cos(Math.asin(sinDec));
  const cosHourAngle =
    (Math.sin(elevDeg * DEG) - Math.sin(lat * DEG) * sinDec) /
    (Math.cos(lat * DEG) * cosDec);
  if (cosHourAngle < -1 || cosHourAngle > 1) return null; // never crosses today

  const hourAngleDeg = Math.acos(cosHourAngle) / DEG;
  return fromJulian(transit + hourAngleDeg / 360);
}
