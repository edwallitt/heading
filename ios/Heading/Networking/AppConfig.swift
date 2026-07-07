import Foundation
import Observation

/// Connection settings: the tRPC base URL and the shared access token. The URL
/// defaults to the deployed Fly app; the token is held in the Keychain.
@MainActor
@Observable
final class AppConfig {
    /// The origin serving both the web app and tRPC (used for share links too).
    static let defaultOrigin = "https://heading-sim.fly.dev"

    private let originKey = "heading.origin"
    private let tokenAccount = "heading.accessToken"

    var origin: String {
        didSet { UserDefaults.standard.set(origin, forKey: originKey) }
    }

    var token: String? {
        didSet { Keychain.set(token, for: tokenAccount) }
    }

    init() {
        origin = UserDefaults.standard.string(forKey: originKey) ?? Self.defaultOrigin
        token = Keychain.get(tokenAccount)
    }

    /// Base URL for tRPC calls, e.g. https://heading-sim.fly.dev/trpc
    var trpcBase: URL? {
        URL(string: origin.trimmingCharacters(in: .whitespaces))?.appendingPathComponent("trpc")
    }

    var hasToken: Bool { !(token?.isEmpty ?? true) }

    func makeClient() -> HeadingClient? {
        guard let base = trpcBase else { return nil }
        return HeadingClient(base: base, token: token)
    }
}
