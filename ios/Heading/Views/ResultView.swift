import SwiftUI
import UIKit

/// The dispatched-flight card: route header, map, briefing prose, instrument
/// readouts, per-leg breakdown, live weather, golden hour and exports.
struct ResultView: View {
    @Environment(AppModel.self) private var model
    let flight: Flight
    var isShared: Bool = false

    /// The .pln written to a temp file once (for VFR), so it isn't rewritten on
    /// every render.
    @State private var plnFileURL: URL?
    /// Flips true on appear to fire a one-shot success haptic as the flight lands.
    @State private var landed = false

    private var routeString: String {
        flight.stops.map(\.icao).joined(separator: " → ")
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                statusStrip
                RouteHeader(flight: flight)
                    .contextMenu { copyButton("Copy route", routeString) }
                FlightMapView(flight: flight)

                prose
                    .contextMenu { copyButton("Copy briefing", flight.overview) }
                statsGrid

                if flight.legs.count > 1 { legBreakdown }
                if !sceneryLine.isEmpty { viaLine }

                if let weather = flight.weather, !weather.isEmpty { weatherSection(weather) }
                if let golden = flight.golden_hour { goldenHour(golden) }
                if !flight.relaxed.isEmpty { relaxedNotes }

                actions
                footnotes
            }
            .padding(20)
            .padding(.bottom, 40)
        }
        .scrollIndicators(.hidden)
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .task { if plnFileURL == nil { plnFileURL = makePlnFile() } }
        .onAppear { landed = true }
        .sensoryFeedback(.success, trigger: landed)
    }

    /// A pasteboard copy action for a context menu.
    private func copyButton(_ title: String, _ text: String) -> some View {
        Button {
            UIPasteboard.general.string = text
        } label: {
            Label(title, systemImage: "doc.on.doc")
        }
    }

    // MARK: Status strip

    private var statusStrip: some View {
        HStack {
            Placard(text: isShared ? "Saved flight" : "Dispatched")
            Spacer()
            Text(flight.rules)
                .font(.system(.caption, design: .rounded).weight(.bold))
                .foregroundStyle(Theme.accent)
                .tracking(1)
        }
    }

    // MARK: Prose

    private var prose: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(flight.overview)
                .font(.body)
                .foregroundStyle(Theme.chalk.opacity(0.92))
                .fixedSize(horizontal: false, vertical: true)

            HStack(alignment: .top, spacing: 10) {
                Rectangle().fill(Theme.accent).frame(width: 3)
                VStack(alignment: .leading, spacing: 3) {
                    Placard(text: "Why this one")
                    Text(flight.why_this)
                        .font(.callout)
                        .italic()
                        .foregroundStyle(Theme.chalk.opacity(0.85))
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }

    // MARK: Stats

    private var statsGrid: some View {
        Panel {
            let cols = [GridItem(.flexible()), GridItem(.flexible())]
            LazyVGrid(columns: cols, alignment: .leading, spacing: 18) {
                Stat(label: "Cruise", value: Format.cruise(flight.cruise_level), accent: true)
                Stat(label: "Block time", value: Format.blockTime(flight.est_block_min))
                Stat(label: "Rules", value: flight.rules)
                Stat(label: "Aircraft", value: aircraftLabel)
            }
        }
    }

    private var aircraftLabel: String {
        let kind = flight.brief.aircraft.label
        return "\(kind) · \(flight.aircraft_type)"
    }

    // MARK: Leg breakdown

    private var legBreakdown: some View {
        Panel {
            VStack(alignment: .leading, spacing: 12) {
                Placard(text: "Legs")
                ForEach(Array(flight.legs.enumerated()), id: \.offset) { i, leg in
                    HStack(alignment: .firstTextBaseline) {
                        Text("\(i + 1).")
                            .font(.subheadline.weight(.bold))
                            .foregroundStyle(Theme.faint)
                        VStack(alignment: .leading, spacing: 2) {
                            Text("\(leg.from_icao) → \(leg.to_icao)")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(Theme.chalk)
                            if !leg.namedWaypoints.isEmpty {
                                Text("via " + leg.namedWaypoints.map(\.ident).joined(separator: ", "))
                                    .font(.caption)
                                    .foregroundStyle(Theme.muted)
                            }
                        }
                        Spacer()
                        VStack(alignment: .trailing, spacing: 2) {
                            Text("\(Int(leg.dist_nm.rounded())) NM")
                                .font(.subheadline).monospacedDigit()
                                .foregroundStyle(Theme.chalk)
                            Text(Format.cruise(leg.cruise_level))
                                .font(.caption).monospacedDigit()
                                .foregroundStyle(Theme.muted)
                        }
                    }
                    if i < flight.legs.count - 1 { Divider().overlay(Theme.panelStroke) }
                }
            }
        }
    }

    // MARK: Scenic waypoints (single-leg "Via" line)

    private var sceneryLine: String {
        guard flight.legs.count == 1, let leg = flight.legs.first else { return "" }
        let named = leg.namedWaypoints
        guard !named.isEmpty else { return "" }
        return named.map { wp in wp.name.map { "\(wp.ident) (\($0))" } ?? wp.ident }
            .joined(separator: " · ")
    }

    private var viaLine: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Image(systemName: "point.topleft.down.to.point.bottomright.curvepath")
                .foregroundStyle(Theme.accent)
                .font(.caption)
            Text("Via").foregroundStyle(Theme.muted)
            Text(sceneryLine).foregroundStyle(Theme.chalk)
            Spacer(minLength: 0)
        }
        .font(.footnote)
    }

    // MARK: Weather

    private func weatherSection(_ weather: [AirportWeather]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Placard(text: "Live weather")
            ForEach(weather) { WeatherChip(weather: $0) }
        }
    }

    // MARK: Golden hour

    private func goldenHour(_ g: GoldenHour) -> some View {
        Callout(symbol: "sunset.fill") {
            VStack(alignment: .leading, spacing: 2) {
                Text("Golden-hour dispatch").font(.footnote.weight(.semibold))
                Text("Lift off \(Format.zulu(g.depart_utc)) to touch down at \(g.dest_icao) \(Format.zulu(g.arrive_utc)), just as the light turns. Sunset \(Format.zulu(g.sunset_utc)).")
                    .foregroundStyle(Theme.muted)
            }
        }
    }

    // MARK: Relaxed notes

    private var relaxedNotes: some View {
        Callout(symbol: "info.circle.fill") {
            VStack(alignment: .leading, spacing: 4) {
                ForEach(flight.relaxed, id: \.self) { code in
                    Text(Format.relaxed(code))
                }
            }
        }
    }

    // MARK: Actions

    private var actions: some View {
        VStack(spacing: 12) {
            if let urlString = flight.simbrief_url, let url = URL(string: urlString) {
                Link(destination: url) {
                    Label("Open in SimBrief", systemImage: "arrow.up.forward.app")
                }
                .buttonStyle(CourseButtonStyle(prominent: true))
            }

            if let permalink = Permalink.build(flight: flight, origin: model.config.origin) {
                ShareLink(item: permalink) {
                    Label("Share link", systemImage: "square.and.arrow.up")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(CourseButtonStyle(prominent: false))
            }

            if flight.isVFR, let plnFileURL {
                ShareLink(item: plnFileURL) {
                    Label("Save .pln", systemImage: "doc.badge.arrow.up")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(CourseButtonStyle(prominent: false))
            }

            if !isShared {
                Button {
                    model.clearResult()
                    Task { await model.again() }
                } label: {
                    Label("Generate again", systemImage: "arrow.triangle.2.circlepath")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.plain)
                .foregroundStyle(Theme.muted)
                .padding(.top, 2)
            }
        }
        .padding(.top, 6)
    }

    /// Write the .pln to a temp file so it can be shared to Files/AirDrop. Called
    /// once from `.task`, not on every render.
    private func makePlnFile() -> URL? {
        guard let pln = flight.pln, let name = flight.pln_filename else { return nil }
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(name)
        do {
            try pln.data(using: .utf8)?.write(to: url)
            return url
        } catch {
            return nil
        }
    }

    // MARK: Footnotes

    @ViewBuilder private var footnotes: some View {
        VStack(alignment: .leading, spacing: 6) {
            if !flight.isVFR {
                footnote("IFR routing is built by SimBrief — no .pln is generated.")
            }
            if flight.legs.count > 1, flight.isVFR {
                footnote("The .pln loads intermediate stops as route waypoints — verify it flies as separate legs in MSFS 2024.")
            }
        }
        .padding(.top, 4)
    }

    private func footnote(_ text: String) -> some View {
        Text(text)
            .font(.caption2)
            .foregroundStyle(Theme.faint)
    }
}

// MARK: - Route header

private struct RouteHeader: View {
    let flight: Flight

    var body: some View {
        if flight.legs.count == 1, let leg = flight.legs.first {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 12) {
                    Text(leg.from_icao)
                    Image(systemName: "arrow.right").font(.title3).foregroundStyle(Theme.accent)
                    Text(leg.to_icao)
                }
                .font(.system(.largeTitle, design: .rounded).weight(.heavy))
                .foregroundStyle(Theme.chalk)

                Text("\(leg.from_name)  →  \(leg.to_name)")
                    .font(.subheadline)
                    .foregroundStyle(Theme.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        } else {
            VStack(alignment: .leading, spacing: 8) {
                FlowLayout(spacing: 6) {
                    ForEach(Array(flight.stops.enumerated()), id: \.offset) { i, stop in
                        HStack(spacing: 6) {
                            Text(stop.icao)
                                .font(.system(.title2, design: .rounded).weight(.heavy))
                                .foregroundStyle(Theme.chalk)
                            if i < flight.stops.count - 1 {
                                Image(systemName: "arrow.right")
                                    .font(.caption)
                                    .foregroundStyle(Theme.accent)
                            }
                        }
                    }
                }
                Text(flight.stops.map(\.name).joined(separator: " · "))
                    .font(.caption)
                    .foregroundStyle(Theme.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

// MARK: - Weather chip

private struct WeatherChip: View {
    let weather: AirportWeather

    var body: some View {
        Panel {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(weather.icao)
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(Theme.chalk)
                    CategoryBadge(category: weather.category)
                }
                Spacer()
                Text(summary)
                    .font(.caption)
                    .foregroundStyle(Theme.muted)
                    .multilineTextAlignment(.trailing)
            }
        }
    }

    private var summary: String {
        var parts: [String] = []
        parts.append(windText)
        if let vis = weather.visibility_sm {
            parts.append("\(Format.trim(vis)) SM")
        }
        if let ceil = weather.ceiling_ft {
            parts.append("ceil \(ceil) ft")
        }
        if let t = weather.temp_c {
            parts.append("\(Int(t.rounded()))°C")
        }
        return parts.joined(separator: " · ")
    }

    private var windText: String {
        guard let kt = weather.wind_kt, kt > 0 else { return "calm" }
        let dir = weather.wind_dir_deg.map { "\($0)°" } ?? "VRB"
        let gust = weather.gust_kt.map { "G\($0)" } ?? ""
        return "\(dir) \(kt)\(gust) kt"
    }
}

// MARK: - Formatting

enum Format {
    /// Feet with thousands separators, or an uppercased flight level.
    static func cruise(_ level: String) -> String {
        if level.allSatisfy(\.isNumber), let n = Int(level) {
            let f = NumberFormatter()
            f.numberStyle = .decimal
            return (f.string(from: NSNumber(value: n)) ?? level) + " ft"
        }
        return level.uppercased()
    }

    static func blockTime(_ minutes: Int) -> String {
        let h = minutes / 60, m = minutes % 60
        if h == 0 { return "\(m) min" }
        if m == 0 { return "\(h) hr" }
        return "\(h)h \(m)m"
    }

    /// ISO-8601 UTC → "HH:MMZ".
    static func zulu(_ iso: String) -> String {
        let parser = ISO8601DateFormatter()
        parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let date = parser.date(from: iso) ?? ISO8601DateFormatter().date(from: iso)
        guard let date else { return iso }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "UTC")!
        let c = cal.dateComponents([.hour, .minute], from: date)
        return String(format: "%02d:%02dZ", c.hour ?? 0, c.minute ?? 0)
    }

    static func relaxed(_ code: String) -> String {
        switch code {
        case "dropped_vibe": return "No airfields matched that vibe nearby — vibe relaxed."
        case "widened_region": return "Few matches in that region — search widened."
        default: return code
        }
    }

    static func trim(_ value: Double) -> String {
        value == value.rounded() ? String(Int(value)) : String(format: "%.1f", value)
    }
}
