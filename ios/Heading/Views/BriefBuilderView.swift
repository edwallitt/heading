import SwiftUI

/// The six-dial brief builder. Time and aircraft mutually constrain each other,
/// and both gate the leg count — all driven by the server's viability matrices,
/// never hardcoded here.
struct BriefBuilderView: View {
    @Environment(AppModel.self) private var model

    private var options: FlightOptions? { model.options }

    var body: some View {
        @Bindable var model = model
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                header

                if let options {
                    timeDial(options)
                    aircraftDial(options)
                    legsDial(options)

                    Divider().overlay(Theme.panelStroke)

                    regionDial(options)
                    rulesDial(options)
                    vibeDial(options)

                    actions
                } else {
                    ProgressView().tint(Theme.accent)
                        .frame(maxWidth: .infinity, minHeight: 200)
                }
            }
            .padding(20)
            .padding(.bottom, 30)
        }
        .scrollIndicators(.hidden)
    }

    // MARK: Header

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                Image(systemName: "location.north.fill")
                    .rotationEffect(.degrees(45))
                    .foregroundStyle(Theme.accent)
                    .font(.title2)
                Text("HEADING")
                    .font(.system(.largeTitle, design: .rounded).weight(.heavy))
                    .tracking(2)
                    .foregroundStyle(Theme.chalk)
            }
            Text("Tell it what you've got — the time, the aircraft, the mood — and it dispatches a flight worth firing up the sim for.")
                .font(.subheadline)
                .foregroundStyle(Theme.muted)
        }
        .padding(.bottom, 4)
    }

    // MARK: Dials

    private func timeDial(_ o: FlightOptions) -> some View {
        SegmentedDial(
            title: "Time available",
            options: o.timeBands.map { t in
                DialOption(
                    value: t,
                    label: t.label,
                    enabled: o.timeEnabled(t, aircraft: model.draft.aircraft),
                    disabledReason: model.draft.aircraft.map {
                        "\($0.label) can't fit a \(t.label) flight — taxi, climb and descent use the whole budget."
                    }
                )
            },
            selected: model.draft.timeBand,
            onSelect: { model.draft.timeBand = $0; clampLegs(o) }
        )
    }

    private func aircraftDial(_ o: FlightOptions) -> some View {
        SegmentedDial(
            title: "Aircraft",
            options: o.aircraftKinds.map { a in
                DialOption(
                    value: a,
                    label: a.label,
                    symbol: a.symbol,
                    enabled: o.aircraftEnabled(a, time: model.draft.timeBand),
                    disabledReason: model.draft.timeBand.map {
                        "A \($0.label) flight is too short for the \(a.label)."
                    }
                )
            },
            selected: model.draft.aircraft,
            onSelect: { model.draft.aircraft = $0; clampLegs(o) }
        )
    }

    private func legsDial(_ o: FlightOptions) -> some View {
        SegmentedDial(
            title: "Legs",
            options: o.legCounts.map { n in
                DialOption(
                    value: n,
                    label: legLabel(n),
                    enabled: o.legEnabled(n, aircraft: model.draft.aircraft, time: model.draft.timeBand),
                    disabledReason: legReason(n)
                )
            },
            selected: model.draft.legCount,
            onSelect: { model.draft.legCount = $0 }
        )
    }

    private func regionDial(_ o: FlightOptions) -> some View {
        SegmentedDial(
            title: "Region",
            options: o.regions.map { DialOption(value: $0, label: $0.label) },
            selected: model.draft.region,
            onSelect: { model.draft.region = $0 }
        )
    }

    private func rulesDial(_ o: FlightOptions) -> some View {
        SegmentedDial(
            title: "Flight rules",
            options: o.ruleKinds.map { DialOption(value: $0, label: $0.label) },
            selected: model.draft.rules,
            onSelect: { model.draft.rules = $0 }
        )
    }

    private func vibeDial(_ o: FlightOptions) -> some View {
        SegmentedDial(
            title: "Vibe",
            options: o.vibes.map { DialOption(value: $0, label: $0.label, symbol: $0.symbol) },
            selected: model.draft.vibe,
            onSelect: { model.draft.vibe = $0 }
        )
    }

    // MARK: Actions

    private var actions: some View {
        VStack(spacing: 12) {
            Button {
                Task { await model.generateFromDraft() }
            } label: {
                Text(model.draft.isComplete ? "Generate flight" : "Pick a time and aircraft")
            }
            .buttonStyle(CourseButtonStyle(prominent: true))
            .disabled(!model.draft.isComplete)
            .opacity(model.draft.isComplete ? 1 : 0.6)

            Button {
                Task { await model.surprise() }
            } label: {
                Label("Surprise me", systemImage: "sparkles")
            }
            .buttonStyle(CourseButtonStyle(prominent: false))

            Text(model.draft.isComplete
                 ? "Or let the dispatcher pick everything."
                 : "Pick a time and an aircraft — or let the dispatcher decide.")
                .font(.caption)
                .foregroundStyle(Theme.faint)
                .frame(maxWidth: .infinity)
        }
        .padding(.top, 6)
    }

    // MARK: Helpers

    private func legLabel(_ n: Int) -> String {
        switch n {
        case 1: return "Single hop"
        case 2: return "2 legs"
        default: return "\(n) legs"
        }
    }

    private func legReason(_ n: Int) -> String? {
        guard let a = model.draft.aircraft, let t = model.draft.timeBand else { return nil }
        return "\(n) legs won't fit a \(t.label) \(a.label) trip — each leg needs its own taxi, climb and descent, and they share the one budget."
    }

    /// If narrowing made the current leg count unviable, pull it back to the max.
    private func clampLegs(_ o: FlightOptions) {
        let cap = o.maxViableLegs(aircraft: model.draft.aircraft, time: model.draft.timeBand)
        if model.draft.legCount > cap { model.draft.legCount = max(1, cap) }
    }
}
