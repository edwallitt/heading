import SwiftUI

/// "Glass cockpit at dusk" — the shared visual language for the app, mirroring
/// the web design system (deep dusk backdrop, magenta course accent, chalk
/// instrument readouts).
enum Theme {
    // Course accent — the magenta used for the route line and live selections.
    static let accent = Color(hex: 0xEC5FA4)
    static let accentDim = Color(hex: 0xB84A82)

    // Backdrop — a dusk gradient behind everything.
    static let backdropTop = Color(hex: 0x0B1020)
    static let backdropBottom = Color(hex: 0x05070E)
    static let dusk = Color(hex: 0x1A1030) // faint warm glow at the horizon

    // Ink.
    static let chalk = Color(hex: 0xE8ECF4)
    static let muted = Color(hex: 0x8A93A6)
    static let faint = Color(hex: 0x565E70)

    // Surfaces.
    static let panelStroke = Color.white.opacity(0.08)
    static let panelFill = Color.white.opacity(0.03)

    // Flight-category badge colours (VFR / MVFR / IFR / LIFR).
    static func category(_ c: String) -> Color {
        switch c {
        case "VFR": return Color(hex: 0x54D08A)
        case "MVFR": return Color(hex: 0x4FA3F0)
        case "IFR": return Color(hex: 0xF05F5F)
        case "LIFR": return Color(hex: 0xEC5FA4)
        default: return muted
        }
    }
}

extension Color {
    init(hex: UInt32) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: 1
        )
    }
}

/// The dusk gradient used as the root background.
struct DuskBackground: View {
    var body: some View {
        LinearGradient(
            colors: [Theme.backdropTop, Theme.backdropBottom],
            startPoint: .top,
            endPoint: .bottom
        )
        .overlay(alignment: .bottom) {
            RadialGradient(
                colors: [Theme.dusk.opacity(0.7), .clear],
                center: .bottom,
                startRadius: 0,
                endRadius: 380
            )
        }
        .ignoresSafeArea()
    }
}

/// An uppercase legend placard — the label that sits above every instrument.
struct Placard: View {
    let text: String
    var body: some View {
        Text(text.uppercased())
            .font(.system(.caption2, design: .default).weight(.semibold))
            .tracking(1.6)
            .foregroundStyle(Theme.muted)
    }
}

/// A framed instrument panel — ultraThin material with a hairline stroke.
struct Panel<Content: View>: View {
    @ViewBuilder var content: Content
    var body: some View {
        content
            .padding(16)
            .background(Theme.panelFill, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .background(.ultraThinMaterial.opacity(0.4), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .strokeBorder(Theme.panelStroke, lineWidth: 1)
            )
    }
}
