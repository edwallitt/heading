import SwiftUI

/// The loading state: a sweeping compass with a rotating caption while Opus
/// picks the leg and writes the brief.
struct DispatchingView: View {
    @State private var sweep = false
    @State private var captionIndex = 0

    private let captions = ["Scanning airfields", "Plotting the leg", "Briefing the flight"]
    private let timer = Timer.publish(every: 1.6, on: .main, in: .common).autoconnect()

    var body: some View {
        VStack(spacing: 22) {
            ZStack {
                Circle()
                    .strokeBorder(Theme.panelStroke, lineWidth: 1)
                    .frame(width: 120, height: 120)
                // tick marks
                ForEach(0..<12) { i in
                    Capsule()
                        .fill(Theme.faint)
                        .frame(width: 2, height: i % 3 == 0 ? 10 : 5)
                        .offset(y: -55)
                        .rotationEffect(.degrees(Double(i) / 12 * 360))
                }
                // sweeping arm
                Rectangle()
                    .fill(
                        LinearGradient(colors: [Theme.accent, .clear],
                                       startPoint: .top, endPoint: .bottom)
                    )
                    .frame(width: 2.5, height: 52)
                    .offset(y: -26)
                    .rotationEffect(.degrees(sweep ? 360 : 0))
                    .animation(.linear(duration: 1.4).repeatForever(autoreverses: false), value: sweep)
                Image(systemName: "location.north.fill")
                    .foregroundStyle(Theme.accent)
                    .font(.title3)
            }

            VStack(spacing: 6) {
                Placard(text: "Dispatching")
                Text(captions[captionIndex])
                    .font(.headline)
                    .foregroundStyle(Theme.chalk)
                    .contentTransition(.opacity)
                    .id(captionIndex)
                Text("Opus is picking the leg and writing the brief.")
                    .font(.caption)
                    .foregroundStyle(Theme.muted)
            }
        }
        .padding(40)
        .onAppear { sweep = true }
        .onReceive(timer) { _ in
            withAnimation(.easeInOut(duration: 0.4)) {
                captionIndex = (captionIndex + 1) % captions.count
            }
        }
    }
}
