import SwiftUI
import MapKit

/// The route drawn as instrumentation on a native map: a dashed magenta course
/// line through every leg, each stop labelled, scenic navaids marked as fixes.
/// All geometry is baked into the flight — nothing is re-resolved here.
///
/// Backed by `MKMapView` directly (not SwiftUI `Map`) so the map can be pinned
/// to dark regardless of the device appearance — the app is dark-only, and the
/// SwiftUI `Map` follows the system trait rather than an override.
struct FlightMapView: View {
    let flight: Flight

    var body: some View {
        RouteMap(flight: flight)
            .frame(height: 260)
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .strokeBorder(Theme.panelStroke, lineWidth: 1)
            )
            .overlay(alignment: .bottomLeading) {
                Text(distanceChip)
                    .font(.system(.caption2, design: .rounded).weight(.semibold))
                    .foregroundStyle(Theme.chalk)
                    .padding(.horizontal, 8).padding(.vertical, 4)
                    .background(.ultraThinMaterial, in: Capsule())
                    .padding(10)
            }
    }

    private var distanceChip: String {
        let nm = Int(flight.totalDistanceNM.rounded())
        return flight.legs.count > 1 ? "\(nm) NM · \(flight.legs.count) legs" : "\(nm) NM"
    }
}

// MARK: - MKMapView bridge

private struct RouteMap: UIViewRepresentable {
    let flight: Flight

    private static let accent = UIColor(red: 0.925, green: 0.373, blue: 0.643, alpha: 1)

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> MKMapView {
        let map = MKMapView()
        map.overrideUserInterfaceStyle = .dark
        let config = MKStandardMapConfiguration(elevationStyle: .flat, emphasisStyle: .muted)
        config.pointOfInterestFilter = .excludingAll
        map.preferredConfiguration = config
        map.isRotateEnabled = false
        map.isPitchEnabled = false
        map.showsCompass = false
        map.showsScale = false
        map.delegate = context.coordinator

        // Route line (origin → each leg's waypoints → arrival).
        let coords = routeCoordinates
        if coords.count >= 2 {
            map.addOverlay(MKPolyline(coordinates: coords, count: coords.count))
        }

        // Stops and scenic fixes.
        map.addAnnotations(stopAnnotations)
        map.addAnnotations(fixAnnotations)

        // Frame the whole route with a little breathing room.
        if let rect = boundingRect(of: coords) {
            map.setVisibleMapRect(
                rect,
                edgePadding: UIEdgeInsets(top: 44, left: 32, bottom: 44, right: 32),
                animated: false
            )
        }
        return map
    }

    func updateUIView(_ uiView: MKMapView, context: Context) {}

    // MARK: Geometry

    private var routeCoordinates: [CLLocationCoordinate2D] {
        guard let first = flight.legs.first else { return [] }
        var coords = [CLLocationCoordinate2D(latitude: first.from_lat, longitude: first.from_lon)]
        for leg in flight.legs {
            for wp in leg.waypoints {
                coords.append(CLLocationCoordinate2D(latitude: wp.lat, longitude: wp.lon))
            }
            coords.append(CLLocationCoordinate2D(latitude: leg.to_lat, longitude: leg.to_lon))
        }
        return coords
    }

    private var stopAnnotations: [StopAnnotation] {
        guard let first = flight.legs.first else { return [] }
        var out = [StopAnnotation(icao: first.from_icao, coordinate: .init(latitude: first.from_lat, longitude: first.from_lon), role: .origin)]
        for (i, leg) in flight.legs.enumerated() {
            let role: StopAnnotation.Role = (i == flight.legs.count - 1) ? .dest : .mid
            out.append(StopAnnotation(icao: leg.to_icao, coordinate: .init(latitude: leg.to_lat, longitude: leg.to_lon), role: role))
        }
        return out
    }

    private var fixAnnotations: [FixAnnotation] {
        flight.legs.flatMap { leg in
            leg.namedWaypoints.map {
                FixAnnotation(ident: $0.ident, coordinate: .init(latitude: $0.lat, longitude: $0.lon))
            }
        }
    }

    private func boundingRect(of coords: [CLLocationCoordinate2D]) -> MKMapRect? {
        guard !coords.isEmpty else { return nil }
        let rects = coords.map { c -> MKMapRect in
            let p = MKMapPoint(c)
            return MKMapRect(x: p.x, y: p.y, width: 0, height: 0)
        }
        return rects.reduce(MKMapRect.null) { $0.union($1) }
    }

    // MARK: Delegate

    final class Coordinator: NSObject, MKMapViewDelegate {
        func mapView(_ mapView: MKMapView, rendererFor overlay: MKOverlay) -> MKOverlayRenderer {
            guard let line = overlay as? MKPolyline else { return MKOverlayRenderer(overlay: overlay) }
            let renderer = MKPolylineRenderer(polyline: line)
            renderer.strokeColor = RouteMap.accent.withAlphaComponent(0.9)
            renderer.lineWidth = 2.5
            renderer.lineDashPattern = [3, 6]
            renderer.lineCap = .round
            return renderer
        }

        func mapView(_ mapView: MKMapView, viewFor annotation: MKAnnotation) -> MKAnnotationView? {
            if let stop = annotation as? StopAnnotation {
                let id = "stop"
                let view = (mapView.dequeueReusableAnnotationView(withIdentifier: id) as? StopAnnotationView)
                    ?? StopAnnotationView(annotation: stop, reuseIdentifier: id)
                view.annotation = stop
                view.configure(icao: stop.icao, role: stop.role)
                return view
            }
            if let fix = annotation as? FixAnnotation {
                let id = "fix"
                let view = (mapView.dequeueReusableAnnotationView(withIdentifier: id) as? FixAnnotationView)
                    ?? FixAnnotationView(annotation: fix, reuseIdentifier: id)
                view.annotation = fix
                view.configure(ident: fix.ident)
                return view
            }
            return nil
        }
    }
}

// MARK: - Annotations

private final class StopAnnotation: NSObject, MKAnnotation {
    enum Role { case origin, mid, dest }
    let icao: String
    let coordinate: CLLocationCoordinate2D
    let role: Role
    init(icao: String, coordinate: CLLocationCoordinate2D, role: Role) {
        self.icao = icao; self.coordinate = coordinate; self.role = role
    }
}

private final class FixAnnotation: NSObject, MKAnnotation {
    let ident: String
    let coordinate: CLLocationCoordinate2D
    init(ident: String, coordinate: CLLocationCoordinate2D) {
        self.ident = ident; self.coordinate = coordinate
    }
}

// MARK: - Annotation views

private let accentUI = UIColor(red: 0.925, green: 0.373, blue: 0.643, alpha: 1)
private let chalkUI = UIColor(red: 0.91, green: 0.925, blue: 0.957, alpha: 1)
private let mutedUI = UIColor(red: 0.541, green: 0.576, blue: 0.651, alpha: 1)
private let panelUI = UIColor(red: 0.02, green: 0.027, blue: 0.055, alpha: 0.85)

private final class StopAnnotationView: MKAnnotationView {
    private let dot = UIView()
    private let chip = PaddedLabel()
    private let stack = UIStackView()

    override init(annotation: MKAnnotation?, reuseIdentifier: String?) {
        super.init(annotation: annotation, reuseIdentifier: reuseIdentifier)
        canShowCallout = false
        stack.axis = .vertical
        stack.alignment = .center
        stack.spacing = 3
        stack.translatesAutoresizingMaskIntoConstraints = false
        dot.translatesAutoresizingMaskIntoConstraints = false
        chip.font = .systemFont(ofSize: 10, weight: .bold)
        chip.backgroundColor = panelUI
        chip.layer.cornerRadius = 4
        chip.layer.masksToBounds = true
        stack.addArrangedSubview(dot)
        stack.addArrangedSubview(chip)
        addSubview(stack)
        NSLayoutConstraint.activate([
            stack.centerXAnchor.constraint(equalTo: centerXAnchor),
            stack.topAnchor.constraint(equalTo: topAnchor),
        ])
    }

    required init?(coder: NSCoder) { fatalError() }

    func configure(icao: String, role: StopAnnotation.Role) {
        chip.text = icao
        let size: CGFloat
        switch role {
        case .origin:
            size = 12
            dot.backgroundColor = panelUI
            dot.layer.borderColor = mutedUI.cgColor
            dot.layer.borderWidth = 2
            chip.textColor = chalkUI
            layer.shadowOpacity = 0
        case .mid:
            size = 9
            dot.backgroundColor = accentUI
            dot.layer.borderWidth = 0
            chip.textColor = accentUI
            layer.shadowOpacity = 0
        case .dest:
            size = 13
            dot.backgroundColor = accentUI
            dot.layer.borderWidth = 0
            chip.textColor = accentUI
            dot.layer.shadowColor = accentUI.cgColor
            dot.layer.shadowRadius = 6
            dot.layer.shadowOpacity = 0.9
            dot.layer.shadowOffset = .zero
        }
        dot.layer.cornerRadius = size / 2
        for c in dot.constraints { dot.removeConstraint(c) }
        NSLayoutConstraint.activate([
            dot.widthAnchor.constraint(equalToConstant: size),
            dot.heightAnchor.constraint(equalToConstant: size),
        ])
        frame = CGRect(x: 0, y: 0, width: 60, height: 34)
        centerOffset = CGPoint(x: 0, y: -6)
        stack.frame = bounds
    }
}

private final class FixAnnotationView: MKAnnotationView {
    private let square = UIView()
    private let chip = PaddedLabel()
    private let stack = UIStackView()

    override init(annotation: MKAnnotation?, reuseIdentifier: String?) {
        super.init(annotation: annotation, reuseIdentifier: reuseIdentifier)
        canShowCallout = false
        stack.axis = .vertical
        stack.alignment = .center
        stack.spacing = 2
        stack.translatesAutoresizingMaskIntoConstraints = false
        square.translatesAutoresizingMaskIntoConstraints = false
        square.backgroundColor = mutedUI
        square.transform = CGAffineTransform(rotationAngle: .pi / 4)
        chip.font = .systemFont(ofSize: 9, weight: .medium)
        chip.textColor = mutedUI
        stack.addArrangedSubview(square)
        stack.addArrangedSubview(chip)
        addSubview(stack)
        NSLayoutConstraint.activate([
            square.widthAnchor.constraint(equalToConstant: 7),
            square.heightAnchor.constraint(equalToConstant: 7),
            stack.centerXAnchor.constraint(equalTo: centerXAnchor),
            stack.topAnchor.constraint(equalTo: topAnchor),
        ])
    }

    required init?(coder: NSCoder) { fatalError() }

    func configure(ident: String) {
        chip.text = ident
        frame = CGRect(x: 0, y: 0, width: 50, height: 26)
        stack.frame = bounds
    }
}

/// A label with a little horizontal padding for the ICAO/ident chips.
private final class PaddedLabel: UILabel {
    private let inset = UIEdgeInsets(top: 1, left: 5, bottom: 1, right: 5)
    override func drawText(in rect: CGRect) { super.drawText(in: rect.inset(by: inset)) }
    override var intrinsicContentSize: CGSize {
        let s = super.intrinsicContentSize
        return CGSize(width: s.width + inset.left + inset.right, height: s.height + inset.top + inset.bottom)
    }
}
