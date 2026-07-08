import Foundation

/// Builds a shareable link matching the web app's codec exactly, so a link
/// shared from the phone opens the same card on the web: the slimmed Flight
/// (minus the recomputable `.pln`) JSON-encoded as `{v:1,f:…}`, base64url'd into
/// the `#f=` hash on the site origin.
enum Permalink {
    private static let version = 1

    static func build(flight: Flight, origin: String) -> URL? {
        var slim = flight
        slim.pln = nil
        slim.pln_filename = nil

        let payload = Payload(v: version, f: slim)
        guard let json = try? JSONEncoder().encode(payload) else { return nil }
        let b64url = json.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")

        // Strip trailing slashes so we don't emit "…//#f=" for an origin like
        // "https://host/".
        let root = origin
            .trimmingCharacters(in: .whitespaces)
            .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        return URL(string: "\(root)/#f=\(b64url)")
    }

    private struct Payload: Encodable {
        let v: Int
        let f: Flight
    }
}
