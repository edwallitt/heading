import Foundation
import Observation

/// The app's single source of truth: connection status, the working draft, the
/// anti-repeat history and the current dispatch. Mirrors the web `App.tsx`
/// orchestration (draft → generate → result, surprise, generate-again).
@MainActor
@Observable
final class AppModel {
    let config: AppConfig

    var options: FlightOptions?
    var draft = BriefDraft()

    /// Drives navigation to the result card.
    var flight: Flight?

    var connection: Connection = .loading
    var phase: Phase = .idle

    /// True when the dials are the cached copy and a fresh fetch couldn't reach
    /// the server — the builder still works, but the panel is showing stale data.
    var isOffline = false

    private var lastBrief: Brief?
    private var recent: [String] = [] // anti-repeat, most-recent last, cap 20
    private let recentCap = 20

    enum Connection: Equatable {
        case loading
        case ready
        case needsToken(String?) // optional reason to show
        case error(String)
    }

    enum Phase: Equatable {
        case idle
        case dispatching
        case noFlight(String)
        case error(String)
    }

    init(config: AppConfig) {
        self.config = config
        recent = LocalStore.loadRecent()
        options = LocalStore.loadOptions()
    }

    var isDispatching: Bool { phase == .dispatching }

    // MARK: Connection / options

    func loadOptions() async {
        guard let client = config.makeClient() else {
            // No token yet — but keep any cached dials so they're ready the moment
            // a token is entered.
            connection = .needsToken(nil)
            return
        }
        // Seed the builder from cache immediately (instant, offline-friendly);
        // only show the spinner if we have nothing to show.
        if options != nil {
            connection = .ready
        } else if let cached = LocalStore.loadOptions() {
            options = cached
            connection = .ready
        } else {
            connection = .loading
        }

        do {
            let fresh = try await client.fetchOptions()
            options = fresh
            LocalStore.saveOptions(fresh)
            isOffline = false
            connection = .ready
        } catch HeadingError.unauthorized {
            connection = .needsToken(config.hasToken ? "That token was rejected." : nil)
        } catch {
            // Network problem: if we already have (cached) dials, stay usable and
            // just flag it; otherwise surface the error.
            if options == nil {
                connection = .error(error.localizedDescription)
            } else {
                isOffline = true
                connection = .ready
            }
        }
    }

    /// Re-attempt the connection after the user edits settings.
    func reconnect() async {
        await loadOptions()
    }

    // MARK: Generation

    /// Generate from the current draft (both required dials must be set).
    func generateFromDraft() async {
        guard let brief = draft.brief(excludeRecent: recent) else { return }
        await run(brief)
    }

    /// Re-run the last brief with a refreshed anti-repeat list.
    func again() async {
        guard var brief = lastBrief else { return }
        brief.excludeRecent = recent.isEmpty ? nil : Array(recent.suffix(recentCap))
        await run(brief)
    }

    /// Build a viable random brief, reflect it into the draft, and dispatch.
    func surprise() async {
        guard let options else { return }
        guard let aircraft = options.aircraftKinds.randomElement() else { return }
        let viableTimes = options.timeBands.filter { options.timeEnabled($0, aircraft: aircraft) }
        guard let time = viableTimes.randomElement() else { return }
        let cap = max(1, options.maxViableLegs(aircraft: aircraft, time: time))
        let legChoices = options.legCounts.filter { $0 <= cap }
        let legCount = legChoices.randomElement() ?? 1
        let region = options.regions.randomElement() ?? .anywhere
        let rules = options.ruleKinds.randomElement() ?? .any
        let vibe = options.vibes.randomElement() ?? .any

        draft.aircraft = aircraft
        draft.timeBand = time
        draft.legCount = legCount
        draft.region = region
        draft.rules = rules
        draft.vibe = vibe

        var brief = Brief(
            timeBand: time, region: region, rules: rules,
            vibe: vibe, aircraft: aircraft, legCount: legCount, excludeRecent: nil
        )
        brief.excludeRecent = recent.isEmpty ? nil : Array(recent.suffix(recentCap))
        await run(brief)
    }

    private func run(_ brief: Brief) async {
        guard phase != .dispatching else { return } // no double-spend on fast taps
        guard let client = config.makeClient() else {
            connection = .needsToken(nil)
            return
        }
        lastBrief = brief
        phase = .dispatching
        do {
            switch try await client.generate(brief) {
            case .ok(let flight):
                remember(flight.endpoints)
                phase = .idle
                self.flight = flight
            case .noFlight(let reason):
                phase = .noFlight(reason)
            }
        } catch HeadingError.unauthorized {
            phase = .idle
            connection = .needsToken("That token was rejected.")
        } catch {
            phase = .error(error.localizedDescription)
        }
    }

    /// Append visited airports, moving any repeats to the end, capped at 20.
    private func remember(_ icaos: [String]) {
        for icao in icaos {
            recent.removeAll { $0 == icao }
            recent.append(icao)
        }
        if recent.count > recentCap {
            recent = Array(recent.suffix(recentCap))
        }
        LocalStore.saveRecent(recent)
    }

    func clearResult() {
        flight = nil
        if case .noFlight = phase { phase = .idle }
        if case .error = phase { phase = .idle }
    }
}
