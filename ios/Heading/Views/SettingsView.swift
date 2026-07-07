import SwiftUI

/// Connection settings — the server origin and the shared access token. The
/// token gates every `flight.generate` spend, so it's required in production.
struct SettingsView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss

    @State private var origin = ""
    @State private var token = ""

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("https://heading-sim.fly.dev", text: $origin)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.URL)
                } header: {
                    Text("Server")
                } footer: {
                    Text("The origin serving the Heading backend. Leave as the default unless you're running your own.")
                }

                Section {
                    SecureField("Access token", text: $token)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                } header: {
                    Text("Access token")
                } footer: {
                    Text("The shared secret (APP_ACCESS_TOKEN) that authorises dispatch. Stored in the Keychain, sent as a Bearer token.")
                }

                Section {
                    Link(destination: URL(string: "https://github.com/edwallitt/heading")!) {
                        Label("About Heading", systemImage: "info.circle")
                    }
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { save() }
                        .fontWeight(.semibold)
                }
            }
        }
        .onAppear {
            origin = model.config.origin
            token = model.config.token ?? ""
        }
        .presentationDetents([.medium, .large])
    }

    private func save() {
        let trimmedOrigin = origin.trimmingCharacters(in: .whitespaces)
        model.config.origin = trimmedOrigin.isEmpty ? AppConfig.defaultOrigin : trimmedOrigin
        model.config.token = token.trimmingCharacters(in: .whitespaces)
        dismiss()
        Task { await model.reconnect() }
    }
}
