# Heading — iOS

A native SwiftUI companion to the [Heading](../README.md) web app: set the same
six dials, and it dispatches a real, flyable MSFS 2024 flight — briefing, route
map, live weather, golden-hour timing and one-tap SimBrief hand-off — as a
proper iPhone app.

It is a **pure client**: it talks to the existing Heading backend (the deployed
Fly app by default) over the same tRPC HTTP API the web uses. No airport data,
AI or geo maths lives here — every number and coordinate is computed server-side
and rendered natively. Built for the latest iOS/hardware; not intended for the
App Store.

## What it does

- **Six-dial brief builder** with live progressive narrowing — time and aircraft
  mutually grey each other out, and both gate the leg count, driven by the
  server's viability matrices (never hardcoded). Tap a greyed pill to see why.
- **Generate**, **Surprise me** (a random but always-viable brief), and
  **Generate again** with server-side anti-repeat (`excludeRecent`).
- **Result card** — route header, a **native MapKit** route map (dashed magenta
  course line, labelled stops, scenic navaid fixes), the Opus briefing and
  "why this one", instrument readouts (cruise, block time, rules, aircraft),
  a per-leg breakdown for multi-leg tours, and relaxed-constraint notes.
- **Live weather** per stop with VFR/MVFR/IFR/LIFR badges, and the
  **golden-hour** dispatch callout.
- **Open in SimBrief**, **Share link** (a permalink that reopens the exact card
  in the web app), and **Save .pln** (VFR — share the MSFS 2024 flight plan to
  Files/AirDrop).

## Requirements

- **Xcode 16 or later** (built and tested with Xcode 26.3). The project uses
  file-system-synchronized folders, so new Swift files under `Heading/` are
  picked up automatically — no `.pbxproj` edits.
- Deployment target **iOS 26.0**.

## Run it on your iPhone

1. `open ios/Heading.xcodeproj`
2. Select the **Heading** target → **Signing & Capabilities**:
   - Set **Team** to your Apple ID (Xcode → Settings → Accounts if you haven't
     added one — a free account is fine for on-device runs).
   - Change **Bundle Identifier** from `dev.heading.Heading` to something unique
     to you, e.g. `com.yourname.Heading` (a free Apple ID needs a unique ID).
3. Plug in your iPhone (or use it wirelessly), pick it as the run destination,
   and press **⌘R**. First run: on the phone, trust the developer profile under
   **Settings → General → VPN & Device Management**.
4. In the app, tap the **gear → Access token** and enter the shared
   `APP_ACCESS_TOKEN` (the same secret the web app prompts for — it's a Fly
   secret on `heading-sim`). The server origin defaults to
   `https://heading-sim.fly.dev`; leave it unless you run your own.

Without a token the app shows a "Connect to Heading" gate — every dispatch spends
an Anthropic token server-side, so the backend requires it.

### Pointing at a local backend

Running the server locally (`pnpm dev` in the repo root)? In **Settings** set the
origin to your machine's LAN address as a **numeric IP**, e.g.
`http://192.168.1.x:3001`. Note that local dev has no `APP_ACCESS_TOKEN` (the gate
is off, as long as there's no built `apps/web/dist`), so the token can be left
blank.

Use the numeric IP, not a hostname: App Transport Security exempts plain-HTTP to
**IP-address literals**, so `http://192.168.1.x:3001` connects with no changes. A
hostname such as `http://mymac.local:3001` would be *blocked* by ATS (that path
needs an `NSAllowsLocalNetworking` Info.plist entry, which this app doesn't set).
A public backend must be HTTPS.

## Layout

```
Heading/
  HeadingApp.swift          app entry + environment
  AppModel.swift            @Observable state: draft, connection, dispatch, anti-repeat
  Theme.swift               "glass cockpit at dusk" design tokens + backdrop
  Models/
    Dials.swift             the six dial enums (raw values = server wire contract)
    Flight.swift            Flight / FlightLeg / Waypoint / weather / golden hour
    FlightOptions.swift     dial metadata + viability/maxLegs narrowing helpers
  Networking/
    HeadingClient.swift     hand-rolled tRPC-v11 batch client over URLSession
    AppConfig.swift         origin + token (Keychain), builds the client
    Keychain.swift          token storage
    Permalink.swift         web-compatible share-link codec
  Views/
    ContentView.swift       root: connection states, dispatch overlay, navigation
    BriefBuilderView.swift  the six dials + generate / surprise
    SegmentedDial.swift     wrapping pill dial + FlowLayout
    DispatchingView.swift   animated compass loading state
    ResultView.swift        the flight card + exports
    FlightMapView.swift     native MapKit route map
    SettingsView.swift      server + token
    Components.swift        Stat / buttons / badges / callouts
```

## Notes

- The dial raw values (`"3-5hr"`, `"regional_jet"`, `"north_america"`, …) and the
  camelCase request body (`timeBand`, `legCount`, `excludeRecent`) are the exact
  wire contract from `apps/server/src/schema.ts`. Change them only in lockstep
  with the server.
- Auth is a single shared `Authorization: Bearer <token>`; the server rate-limits
  dispatch to 30/hour. On a 401 the app returns to the token gate, mirroring the
  web re-prompt.
