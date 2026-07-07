import SwiftUI

@main
struct HeadingApp: App {
    @State private var model = AppModel(config: AppConfig())

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(model)
                .tint(Theme.accent)
                .preferredColorScheme(.dark)
        }
    }
}
