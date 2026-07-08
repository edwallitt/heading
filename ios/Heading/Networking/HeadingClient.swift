import Foundation

/// Errors surfaced to the UI, mapped from tRPC/transport failures.
enum HeadingError: LocalizedError {
    case notConfigured
    case unauthorized
    case rateLimited
    case server(String)
    case transport(String)

    var errorDescription: String? {
        switch self {
        case .notConfigured: return "Set the server and access token in Settings."
        case .unauthorized: return "Missing or invalid access token."
        case .rateLimited: return "Rate limit reached — try again shortly."
        case .server(let m): return m
        case .transport(let m): return m
        }
    }
}

/// The result of `flight.generate` — a discriminated union on `status`.
enum GenerateResult {
    case ok(Flight)
    case noFlight(String)
}

/// A hand-rolled tRPC v11 client over `URLSession`. No transformer is configured
/// server-side, so payloads are plain JSON. Batching is used with a single item
/// at index "0"; the response is always a one-element array we unwrap.
struct HeadingClient {
    let base: URL // …/trpc
    let token: String?

    /// One shared session so requests pool connections and keep-alive — matters
    /// given the cold-start latency this app is built around. Configured once.
    private static let session: URLSession = {
        let config = URLSessionConfiguration.default
        // Fly cold-starts (min_machines_running = 0), so be patient on the first
        // request after the machine has stopped.
        config.timeoutIntervalForRequest = 45
        config.timeoutIntervalForResource = 90
        config.waitsForConnectivity = true
        return URLSession(configuration: config)
    }()

    // MARK: Public procedures

    /// `flight.options` — query, protected.
    func fetchOptions() async throws -> FlightOptions {
        var url = base.appendingPathComponent("flight.options")
        url.append(queryItems: [URLQueryItem(name: "batch", value: "1")])
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        applyAuth(&request)
        return try await run(request)
    }

    /// `flight.generate` — mutation, protected.
    func generate(_ brief: Brief) async throws -> GenerateResult {
        var url = base.appendingPathComponent("flight.generate")
        url.append(queryItems: [URLQueryItem(name: "batch", value: "1")])
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        applyAuth(&request)

        let encoder = JSONEncoder()
        // Batch body: { "0": <brief> } — camelCase keys, exactly as sent.
        request.httpBody = try encoder.encode(["0": brief])

        let result: GenerateEnvelope = try await run(request)
        switch result.status {
        case "ok":
            guard let flight = result.flight else {
                throw HeadingError.server("Malformed flight in response.")
            }
            return .ok(flight)
        default:
            return .noFlight(result.reason ?? "No flight matched those constraints.")
        }
    }

    // MARK: Wire plumbing

    private func applyAuth(_ request: inout URLRequest) {
        if let token, !token.isEmpty {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
    }

    /// Send a request, then map by HTTP status *and* the tRPC batch envelope.
    /// Checking the status guards against cold-start 5xx responses (often an HTML
    /// body, which used to surface to the user as raw markup) and against a bare
    /// `401` that isn't wrapped in the tRPC envelope — a real 401 must always
    /// route back to the token gate.
    private func run<T: Decodable>(_ request: URLRequest) async throws -> T {
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await Self.session.data(for: request)
        } catch {
            throw HeadingError.transport(error.localizedDescription)
        }
        let status = (response as? HTTPURLResponse)?.statusCode

        // Prefer the tRPC envelope when the body is the JSON we expect — its
        // error carries the authoritative httpStatus, and success rides here too.
        if let batch = try? JSONDecoder().decode([BatchItem<T>].self, from: data),
           let first = batch.first {
            if let err = first.error {
                throw mapError(status: err.data?.httpStatus ?? status, message: err.message)
            }
            if let payload = first.result?.data {
                return payload
            }
        }

        // Body wasn't a decodable envelope (HTML error page, empty, gateway error).
        // Fall back to the HTTP status so the UI shows something sensible.
        throw mapError(status: status, message: nil)
    }

    /// Map an HTTP/tRPC status to a user-facing error.
    private func mapError(status: Int?, message: String?) -> HeadingError {
        switch status {
        case 401: return .unauthorized
        case 429: return .rateLimited
        case .some(let code) where code >= 500:
            return .server("The server had a problem (\(code)). It may be waking up — try again in a moment.")
        default:
            return .server(message ?? "Unexpected response from the server.")
        }
    }
}

/// One element of a tRPC batch response: either `result.data` or an `error`.
private struct BatchItem<T: Decodable>: Decodable {
    struct ResultBox: Decodable { let data: T }
    struct ErrorBox: Decodable {
        struct Info: Decodable { let httpStatus: Int?; let code: String? }
        let message: String
        let data: Info?
    }
    let result: ResultBox?
    let error: ErrorBox?
}

/// `flight.generate` payload, decoded before dispatching on `status`.
private struct GenerateEnvelope: Decodable {
    let status: String
    let flight: Flight?
    let reason: String?
}
