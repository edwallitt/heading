import Foundation

/// The dispatched flight and everything baked into it. Field names mirror the
/// server `types.ts`; the client is a pure renderer — it never recomputes any
/// number, distance or coordinate.

struct Waypoint: Codable, Hashable, Identifiable {
    let ident: String
    let kind: String // "navaid" | "user"
    let lat: Double
    let lon: Double
    let name: String?
    let type: String?

    var id: String { "\(ident)-\(lat)-\(lon)" }
    var isNavaid: Bool { kind == "navaid" }
}

struct FlightLeg: Codable, Hashable, Identifiable {
    let from_icao: String
    let to_icao: String
    let from_name: String
    let to_name: String
    let from_lat: Double
    let from_lon: Double
    let to_lat: Double
    let to_lon: Double
    let dist_nm: Double
    let cruise_level: String
    let waypoints: [Waypoint]

    var id: String { "\(from_icao)-\(to_icao)-\(dist_nm)" }

    /// Named scenic navaids on this leg, in order (raw/user bends excluded).
    var namedWaypoints: [Waypoint] { waypoints.filter { $0.isNavaid } }
}

struct AirportWeather: Codable, Hashable, Identifiable {
    let icao: String
    let raw: String
    let category: String // VFR | MVFR | IFR | LIFR
    let wind_dir_deg: Int?
    let wind_kt: Int?
    let gust_kt: Int?
    let visibility_sm: Double?
    let ceiling_ft: Int?
    let temp_c: Double?
    let observed_utc: String?

    var id: String { icao }
}

struct AirportFrequency: Codable, Hashable, Identifiable {
    let type: String // ATIS | CLD | GND | TWR | CTAF | UNICOM | AFIS
    let mhz: Double

    var id: String { type }

    /// "118.5", "121.975" — 3 dp only where the frequency needs it.
    var formatted: String {
        var s = String(format: "%.3f", mhz)
        while s.hasSuffix("0") { s.removeLast() }
        if s.hasSuffix(".") { s += "0" }
        return s
    }
}

/// Baked field data for one stop. Unlike `AirportWeather` this ships in the
/// airport asset rather than being fetched, so it is always complete.
struct AirportFacility: Codable, Hashable, Identifiable {
    let icao: String
    let longest_rwy_ft: Int
    let rwy_surface: String
    let rwy_lighted: Bool
    let freqs: [AirportFrequency]

    var id: String { icao }

    /// Surfaces worth naming; asphalt and concrete are the unremarkable default.
    private static let noteworthySurface: Set<String> = [
        "grass", "gravel", "dirt", "sand", "snow", "water",
    ]

    /// Runway line: length, plus surface only when it's interesting.
    ///
    /// Lighting appears only as a POSITIVE — OurAirports' `lighted` column is
    /// unreliable (every Honolulu runway reads unlit), so a missing flag means
    /// "unknown", not "unlit", and the card must never imply otherwise.
    var runwaySummary: String {
        var parts = ["\(longest_rwy_ft.formatted()) ft"]
        if Self.noteworthySurface.contains(rwy_surface) { parts.append(rwy_surface) }
        if rwy_lighted { parts.append("lit") }
        return parts.joined(separator: " · ")
    }
}

struct GoldenHour: Codable, Hashable {
    let dest_icao: String
    let depart_utc: String
    let arrive_utc: String
    let sunset_utc: String
}

struct Flight: Codable, Hashable, Identifiable {
    let brief: Brief
    let aircraft_type: String
    let cruise_level: String
    let est_block_min: Int
    let rules: String // narrowed: "VFR" | "IFR"
    let overview: String
    let why_this: String
    let legs: [FlightLeg]
    let relaxed: [String]
    let source: String // "llm" | "fallback"
    let weather: [AirportWeather]?
    let facilities: [AirportFacility]?
    let golden_hour: GoldenHour?
    let simbrief_url: String?
    var pln: String?
    var pln_filename: String?

    /// Stable identity for navigation — the route chain.
    var id: String {
        (legs.first.map { $0.from_icao } ?? "") + legs.map { "→\($0.to_icao)" }.joined()
    }

    /// Origin then each arrival, in order — the stops shown across the header.
    var stops: [(icao: String, name: String)] {
        guard let first = legs.first else { return [] }
        var out: [(String, String)] = [(first.from_icao, first.from_name)]
        for leg in legs { out.append((leg.to_icao, leg.to_name)) }
        return out
    }

    var isVFR: Bool { rules == "VFR" }
    var totalDistanceNM: Double { legs.reduce(0) { $0 + $1.dist_nm } }

    /// Airports visited (origin + arrivals) — feeds the anti-repeat list.
    var endpoints: [String] { stops.map { $0.icao } }
}
