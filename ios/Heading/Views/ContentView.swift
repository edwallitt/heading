import SwiftUI

/// Root screen. Frames the brief builder over the dusk backdrop, drives the
/// dispatch overlay, and pushes the result card. Handles the connection states
/// (loading, needs-token, error) up front.
struct ContentView: View {
    @Environment(AppModel.self) private var model
    @State private var showSettings = false

    var body: some View {
        @Bindable var model = model
        NavigationStack {
            ZStack {
                DuskBackground()

                switch model.connection {
                case .loading:
                    connecting
                case .needsToken(let reason):
                    ConnectPrompt(reason: reason) { showSettings = true }
                case .error(let message):
                    ConnectionError(message: message) {
                        Task { await model.reconnect() }
                    }
                case .ready:
                    BriefBuilderView()
                }

                if model.isDispatching {
                    dispatchOverlay
                }

                switch model.phase {
                case .noFlight(let reason):
                    NoFlightPanel(reason: reason,
                                  onSurprise: { Task { await model.surprise() } },
                                  onDismiss: { model.clearResult() })
                case .error(let message):
                    ErrorPanel(message: message,
                               onRetry: { Task { await model.generateFromDraft() } },
                               onDismiss: { model.clearResult() })
                default:
                    EmptyView()
                }
            }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showSettings = true } label: {
                        Image(systemName: "gearshape")
                    }
                    .tint(Theme.muted)
                }
            }
            .toolbarBackground(.hidden, for: .navigationBar)
            .navigationDestination(item: $model.flight) { flight in
                ResultView(flight: flight)
                    .background(DuskBackground())
            }
            .sheet(isPresented: $showSettings) {
                SettingsView()
            }
        }
        .task {
            if model.options == nil { await model.loadOptions() }
        }
    }

    private var connecting: some View {
        VStack(spacing: 14) {
            ProgressView().tint(Theme.accent)
            Text("Warming up the panel…")
                .font(.callout)
                .foregroundStyle(Theme.muted)
        }
    }

    private var dispatchOverlay: some View {
        ZStack {
            Color.black.opacity(0.55).ignoresSafeArea()
            DispatchingView()
        }
        .transition(.opacity)
    }
}

// MARK: - Connection states

private struct ConnectPrompt: View {
    let reason: String?
    let onConnect: () -> Void

    var body: some View {
        ContentUnavailableView {
            Label("Connect to Heading", systemImage: "lock.rotation")
        } description: {
            Text(reason ?? "Enter the shared access token to start dispatching flights.")
        } actions: {
            Button("Enter token", action: onConnect)
                .buttonStyle(.borderedProminent)
                .tint(Theme.accent)
        }
    }
}

private struct ConnectionError: View {
    let message: String
    let onRetry: () -> Void

    var body: some View {
        ContentUnavailableView {
            Label("Can't reach the server", systemImage: "wifi.exclamationmark")
        } description: {
            Text(message)
        } actions: {
            Button("Try again", action: onRetry)
                .buttonStyle(.borderedProminent)
                .tint(Theme.accent)
        }
    }
}

// MARK: - Result-phase panels

private struct NoFlightPanel: View {
    let reason: String
    let onSurprise: () -> Void
    let onDismiss: () -> Void

    var body: some View {
        PhaseSheet(onDismiss: onDismiss) {
            VStack(spacing: 14) {
                Image(systemName: "airplane.circle")
                    .font(.largeTitle)
                    .foregroundStyle(Theme.muted)
                Text("No flight matched")
                    .font(.headline).foregroundStyle(Theme.chalk)
                Text(reason)
                    .font(.callout)
                    .foregroundStyle(Theme.muted)
                    .multilineTextAlignment(.center)
                Text("Try loosening a dial, or let the dispatcher pick.")
                    .font(.caption)
                    .foregroundStyle(Theme.faint)
                Button {
                    onSurprise()
                } label: {
                    Label("Surprise me", systemImage: "sparkles")
                }
                .buttonStyle(CourseButtonStyle(prominent: true))
            }
        }
    }
}

private struct ErrorPanel: View {
    let message: String
    let onRetry: () -> Void
    let onDismiss: () -> Void

    var body: some View {
        PhaseSheet(onDismiss: onDismiss) {
            VStack(spacing: 14) {
                Image(systemName: "exclamationmark.triangle")
                    .font(.largeTitle)
                    .foregroundStyle(Color(hex: 0xE6B450))
                Text("Dispatch failed")
                    .font(.headline).foregroundStyle(Theme.chalk)
                Text(message)
                    .font(.callout)
                    .foregroundStyle(Theme.muted)
                    .multilineTextAlignment(.center)
                Button("Try again", action: onRetry)
                    .buttonStyle(CourseButtonStyle(prominent: true))
            }
        }
    }
}

/// A dimmed modal container for the transient result-phase panels.
private struct PhaseSheet<Content: View>: View {
    let onDismiss: () -> Void
    @ViewBuilder var content: Content

    var body: some View {
        ZStack {
            Color.black.opacity(0.6).ignoresSafeArea()
                .onTapGesture(perform: onDismiss)
            Panel {
                content.padding(4)
            }
            .padding(28)
        }
        .transition(.opacity)
    }
}
