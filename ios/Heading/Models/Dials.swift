import Foundation

/// The six dials that describe a brief. Raw values match the server's Zod
/// `briefSchema` exactly — they are the wire contract, so do not change them
/// without changing the server.

enum TimeBand: String, CaseIterable, Codable, Identifiable, Hashable {
    case min20 = "20min"
    case min45 = "45min"
    case hr1 = "1hr"
    case hr2 = "2hr"
    case hr35 = "3-5hr"
    case longHaul = "long_haul"

    var id: String { rawValue }
    var label: String {
        switch self {
        case .min20: return "20 min"
        case .min45: return "45 min"
        case .hr1: return "1 hr"
        case .hr2: return "2 hr"
        case .hr35: return "3–5 hr"
        case .longHaul: return "Long haul"
        }
    }
}

enum Aircraft: String, CaseIterable, Codable, Identifiable, Hashable {
    case smallProp = "small_prop"
    case turboprop = "turboprop"
    case regionalJet = "regional_jet"
    case airliner = "airliner"

    var id: String { rawValue }
    var label: String {
        switch self {
        case .smallProp: return "Small prop"
        case .turboprop: return "Turboprop"
        case .regionalJet: return "Regional jet"
        case .airliner: return "Airliner"
        }
    }
    var symbol: String {
        switch self {
        case .smallProp: return "airplane"
        case .turboprop: return "airplane"
        case .regionalJet: return "airplane.departure"
        case .airliner: return "airplane.departure"
        }
    }
}

enum Region: String, CaseIterable, Codable, Identifiable, Hashable {
    case anywhere
    case northAmerica = "north_america"
    case southAmerica = "south_america"
    case europe
    case africa
    case asia
    case oceania
    case caribbean

    var id: String { rawValue }
    var label: String {
        switch self {
        case .anywhere: return "Anywhere"
        case .northAmerica: return "N. America"
        case .southAmerica: return "S. America"
        case .europe: return "Europe"
        case .africa: return "Africa"
        case .asia: return "Asia"
        case .oceania: return "Oceania"
        case .caribbean: return "Caribbean"
        }
    }
}

enum Rules: String, CaseIterable, Codable, Identifiable, Hashable {
    case any
    case vfr = "VFR"
    case ifr = "IFR"

    var id: String { rawValue }
    var label: String {
        switch self {
        case .any: return "Any"
        case .vfr: return "VFR"
        case .ifr: return "IFR"
        }
    }
}

enum Vibe: String, CaseIterable, Codable, Identifiable, Hashable {
    case mountain
    case coastal
    case urban
    case notable
    case any

    var id: String { rawValue }

    /// Display order differs from raw declaration order to match the web dial.
    static let displayOrder: [Vibe] = [.mountain, .coastal, .urban, .notable, .any]

    var label: String {
        switch self {
        case .mountain: return "Mountains"
        case .coastal: return "Coastal"
        case .urban: return "City skylines"
        case .notable: return "Notable"
        case .any: return "Surprise me"
        }
    }
    var symbol: String {
        switch self {
        case .mountain: return "mountain.2.fill"
        case .coastal: return "water.waves"
        case .urban: return "building.2.fill"
        case .notable: return "star.fill"
        case .any: return "sparkles"
        }
    }
}

/// The brief posted to `flight.generate`. Encoded with camelCase keys exactly
/// as the server expects — never snake_case.
struct Brief: Codable, Hashable {
    var timeBand: TimeBand
    var region: Region
    var rules: Rules
    var vibe: Vibe
    var aircraft: Aircraft
    var legCount: Int // 1, 2, or 3
    var excludeRecent: [String]?
}

/// The draft the builder mutates — time and aircraft start unset (nil) until the
/// user picks them, mirroring the web `INITIAL_DRAFT`.
struct BriefDraft: Hashable {
    var timeBand: TimeBand?
    var aircraft: Aircraft?
    var legCount: Int = 1
    var region: Region = .anywhere
    var rules: Rules = .any
    var vibe: Vibe = .any

    var isComplete: Bool { timeBand != nil && aircraft != nil }

    /// Build the wire brief once both required dials are set.
    func brief(excludeRecent: [String]) -> Brief? {
        guard let timeBand, let aircraft else { return nil }
        return Brief(
            timeBand: timeBand,
            region: region,
            rules: rules,
            vibe: vibe,
            aircraft: aircraft,
            legCount: legCount,
            excludeRecent: excludeRecent.isEmpty ? nil : Array(excludeRecent.suffix(20))
        )
    }
}
