import SwiftUI

/// One selectable value within a dial.
struct DialOption<Value: Hashable>: Identifiable {
    let value: Value
    let label: String
    var symbol: String? = nil
    var enabled: Bool = true
    var disabledReason: String? = nil
    var id: Value { value }
}

/// A dial: a legend placard over a wrapping row of tappable pills. Selected pills
/// glow magenta; disabled pills stay tappable and reveal *why* they're greyed —
/// the narrowing feedback that makes the form feel smart, exactly as on the web.
struct SegmentedDial<Value: Hashable>: View {
    let title: String
    let options: [DialOption<Value>]
    let selected: Value?
    let onSelect: (Value) -> Void

    @State private var shownReason: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Placard(text: title)
            FlowLayout(spacing: 8) {
                ForEach(options) { option in
                    Pill(
                        label: option.label,
                        symbol: option.symbol,
                        state: option.value == selected ? .selected
                            : (option.enabled ? .normal : .disabled)
                    )
                    .onTapGesture {
                        if option.enabled {
                            shownReason = nil
                            onSelect(option.value)
                        } else {
                            shownReason = option.disabledReason
                        }
                    }
                }
            }
            if let shownReason {
                Text(shownReason)
                    .font(.caption)
                    .foregroundStyle(Theme.muted)
                    .transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: 0.2), value: shownReason)
        .sensoryFeedback(.selection, trigger: selected)
    }
}

private struct Pill: View {
    enum State { case normal, selected, disabled }
    let label: String
    var symbol: String?
    let state: State

    var body: some View {
        HStack(spacing: 6) {
            Circle()
                .fill(dotColor)
                .frame(width: 6, height: 6)
            if let symbol {
                Image(systemName: symbol).font(.caption2)
            }
            Text(label)
                .font(.subheadline.weight(.medium))
        }
        .foregroundStyle(textColor)
        .padding(.horizontal, 14)
        .frame(minHeight: 44)
        .background(fill, in: Capsule())
        .overlay(Capsule().strokeBorder(stroke, lineWidth: 1))
        .shadow(color: state == .selected ? Theme.accent.opacity(0.35) : .clear, radius: 8)
        .contentShape(Capsule())
        .opacity(state == .disabled ? 0.5 : 1)
        .animation(.easeOut(duration: 0.18), value: state)
    }

    private var textColor: Color {
        switch state {
        case .selected: return Theme.chalk
        case .normal: return Theme.chalk.opacity(0.85)
        case .disabled: return Theme.faint
        }
    }
    private var dotColor: Color {
        switch state {
        case .selected: return Theme.accent
        case .normal: return Theme.muted.opacity(0.6)
        case .disabled: return Theme.faint.opacity(0.5)
        }
    }
    private var fill: Color {
        state == .selected ? Theme.accent.opacity(0.16) : Theme.panelFill
    }
    private var stroke: Color {
        state == .selected ? Theme.accent : Theme.panelStroke
    }
}

/// A simple wrapping layout — lays children left to right, wrapping to new rows.
struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout Void) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        let rows = layout(subviews: subviews, maxWidth: maxWidth)
        guard !rows.isEmpty else { return .zero }
        let height = rows.map(\.height).reduce(0, +) + spacing * CGFloat(rows.count - 1)
        let width = rows.map(\.width).max() ?? 0
        return CGSize(width: min(width, maxWidth), height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout Void) {
        let rows = layout(subviews: subviews, maxWidth: bounds.width)
        var y = bounds.minY
        for row in rows {
            var x = bounds.minX
            for item in row.items {
                let size = subviews[item].sizeThatFits(.unspecified)
                subviews[item].place(at: CGPoint(x: x, y: y), anchor: .topLeading, proposal: ProposedViewSize(size))
                x += size.width + spacing
            }
            y += row.height + spacing
        }
    }

    private struct Row { var items: [Int] = []; var width: CGFloat = 0; var height: CGFloat = 0 }

    private func layout(subviews: Subviews, maxWidth: CGFloat) -> [Row] {
        var rows: [Row] = []
        var current = Row()
        var x: CGFloat = 0
        for index in subviews.indices {
            let size = subviews[index].sizeThatFits(.unspecified)
            if x + size.width > maxWidth, !current.items.isEmpty {
                rows.append(current)
                current = Row()
                x = 0
            }
            current.items.append(index)
            x += size.width + spacing
            current.width = max(current.width, x - spacing)
            current.height = max(current.height, size.height)
        }
        if !current.items.isEmpty { rows.append(current) }
        return rows
    }
}
