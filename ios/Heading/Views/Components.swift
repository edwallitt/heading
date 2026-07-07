import SwiftUI

/// An instrument readout: an uppercase placard over a monospaced value.
struct Stat: View {
    let label: String
    let value: String
    var accent: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Placard(text: label)
            Text(value)
                .font(.system(.title3, design: .rounded).weight(.semibold))
                .foregroundStyle(accent ? Theme.accent : Theme.chalk)
                .monospacedDigit()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// The primary course button — a filled magenta capsule with a glow.
struct CourseButtonStyle: ButtonStyle {
    var prominent: Bool = true
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .foregroundStyle(prominent ? Color.black : Theme.chalk)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 15)
            .background {
                if prominent {
                    Capsule().fill(Theme.accent)
                        .shadow(color: Theme.accent.opacity(0.5), radius: 14, y: 4)
                } else {
                    Capsule().strokeBorder(Theme.panelStroke, lineWidth: 1)
                        .background(Capsule().fill(Theme.panelFill))
                }
            }
            .opacity(configuration.isPressed ? 0.75 : 1)
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .animation(.easeOut(duration: 0.15), value: configuration.isPressed)
    }
}

/// A flight-category badge (VFR / MVFR / IFR / LIFR).
struct CategoryBadge: View {
    let category: String
    var body: some View {
        Text(category)
            .font(.system(.caption2, design: .rounded).weight(.bold))
            .tracking(0.5)
            .foregroundStyle(Theme.category(category))
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(Theme.category(category).opacity(0.15), in: Capsule())
            .overlay(Capsule().strokeBorder(Theme.category(category).opacity(0.4), lineWidth: 1))
    }
}

/// An amber advisory callout (relaxed constraints, golden hour, footnotes).
struct Callout: View {
    let symbol: String
    let tint: Color
    let content: AnyView

    init(symbol: String, tint: Color = Color(hex: 0xE6B450), @ViewBuilder content: () -> some View) {
        self.symbol = symbol
        self.tint = tint
        self.content = AnyView(content())
    }

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: symbol)
                .foregroundStyle(tint)
                .font(.callout)
            content
                .font(.footnote)
                .foregroundStyle(Theme.chalk.opacity(0.9))
            Spacer(minLength: 0)
        }
        .padding(12)
        .background(tint.opacity(0.08), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .strokeBorder(tint.opacity(0.25), lineWidth: 1)
        )
    }
}
