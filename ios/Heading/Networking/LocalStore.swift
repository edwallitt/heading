import Foundation

/// Tiny on-disk cache (UserDefaults-backed) so the app survives a cold or flaky
/// network: the last `flight.options` seeds the builder instantly and keeps it
/// usable offline, and the anti-repeat history persists across launches.
enum LocalStore {
    private static let defaults = UserDefaults.standard
    private static let optionsKey = "heading.cache.options.v1"
    private static let recentKey = "heading.cache.recent.v1"

    static func saveOptions(_ options: FlightOptions) {
        guard let data = try? JSONEncoder().encode(options) else { return }
        defaults.set(data, forKey: optionsKey)
    }

    static func loadOptions() -> FlightOptions? {
        guard let data = defaults.data(forKey: optionsKey) else { return nil }
        return try? JSONDecoder().decode(FlightOptions.self, from: data)
    }

    static func saveRecent(_ recent: [String]) {
        defaults.set(recent, forKey: recentKey)
    }

    static func loadRecent() -> [String] {
        defaults.stringArray(forKey: recentKey) ?? []
    }
}
