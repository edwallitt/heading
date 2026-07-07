import Foundation

/// The dial metadata + viability matrices returned by `flight.options`. The
/// server owns the value sets and the greying-out rules; the client fetches them
/// and reproduces the same progressive-disable behaviour, so UI and engine can
/// never silently drift.
struct FlightOptions: Codable, Hashable {
    struct Dials: Codable, Hashable {
        let timeBand: [String]
        let region: [String]
        let rules: [String]
        let vibe: [String]
        let aircraft: [String]
        let legCount: [Int]
    }

    let dials: Dials
    /// aircraft rawValue → timeBand rawValue → reachable?
    let viability: [String: [String: Bool]]
    /// aircraft rawValue → timeBand rawValue → max legs that fit
    let maxLegs: [String: [String: Int]]

    // MARK: Narrowing helpers (mirror BriefBuilder.tsx)

    /// Is this time band reachable for the chosen aircraft? (Ungated until an
    /// aircraft is picked.)
    func timeEnabled(_ time: TimeBand, aircraft: Aircraft?) -> Bool {
        guard let aircraft else { return true }
        return viability[aircraft.rawValue]?[time.rawValue] ?? true
    }

    /// Is this aircraft usable for the chosen time band?
    func aircraftEnabled(_ aircraft: Aircraft, time: TimeBand?) -> Bool {
        guard let time else { return true }
        return viability[aircraft.rawValue]?[time.rawValue] ?? true
    }

    /// The most legs a given time×aircraft cell sustains (3 if unconstrained).
    func maxViableLegs(aircraft: Aircraft?, time: TimeBand?) -> Int {
        guard let aircraft, let time else { return 3 }
        return maxLegs[aircraft.rawValue]?[time.rawValue] ?? 3
    }

    /// Is this leg count viable? Only gated once both time and aircraft are set.
    func legEnabled(_ n: Int, aircraft: Aircraft?, time: TimeBand?) -> Bool {
        guard aircraft != nil, time != nil else { return true }
        return n <= maxViableLegs(aircraft: aircraft, time: time)
    }

    // MARK: Server-accepted value lists (filter labels to what's live)

    var timeBands: [TimeBand] { dials.timeBand.compactMap(TimeBand.init) }
    var aircraftKinds: [Aircraft] { dials.aircraft.compactMap(Aircraft.init) }
    var regions: [Region] { dials.region.compactMap(Region.init) }
    var ruleKinds: [Rules] { dials.rules.compactMap(Rules.init) }
    var vibes: [Vibe] {
        // Preserve the web display order, keeping only server-accepted values.
        let accepted = Set(dials.vibe)
        return Vibe.displayOrder.filter { accepted.contains($0.rawValue) }
    }
    var legCounts: [Int] { dials.legCount }
}
