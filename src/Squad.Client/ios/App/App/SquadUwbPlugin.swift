import Foundation
import Capacitor
import NearbyInteraction
import simd

/// SquadUwb — Ultra-Wideband precise ranging for the live ride, via Apple's NearbyInteraction.
/// Gives ~10 cm DISTANCE and a DIRECTION vector (front/back, left/right, up/down) between two
/// U1/U2-capable Apple devices (iPhone 11+, iPad Pro 2020+) — what BLE RSSI cannot do.
///
/// Protocol (per peer pair, driven from JS over the ride hub):
///   1. `startPeer({athleteId})`  → creates an NISession for that peer and returns THIS device's
///      base64 discovery token. JS ships that token to the peer over the ride hub.
///   2. `receivePeerToken({athleteId, token})` → runs the session against the peer's token.
///   Both devices do 1+2 with each other's tokens; then `nearby` events stream distance/direction.
///
/// One NISession per peer (a pre-iOS-16 session ranges a single peer, which keeps this simple and
/// group-safe). Distance is available whenever the peer is in range; `direction` is non-nil only
/// once the session converges and the devices are oriented so the U1 antenna can resolve angle.
///
/// NOTE: written but UNVERIFIED on hardware — needs the native iOS build + two UWB devices to test.
@objc(SquadUwbPlugin)
public class SquadUwbPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SquadUwbPlugin"
    public let jsName = "SquadUwb"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isSupported", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startPeer", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "receivePeerToken", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
    ]

    // athleteId -> its dedicated NISession. `delegates` retains a per-session delegate that maps
    // NearbyInteraction callbacks back to the right athleteId (and up to notifyListeners).
    private var sessions: [String: NISession] = [:]
    private var delegates: [String: NIDelegate] = [:]

    // NISession.isSupported was deprecated in iOS 16 and can report false on newer OS even on
    // UWB-capable hardware — iOS 16+ must use deviceCapabilities.supportsPreciseDistanceMeasurement.
    private static var uwbSupported: Bool {
        if #available(iOS 16.0, *) {
            return NISession.deviceCapabilities.supportsPreciseDistanceMeasurement
        } else if #available(iOS 14.0, *) {
            return NISession.isSupported
        }
        return false
    }

    @objc func isSupported(_ call: CAPPluginCall) {
        call.resolve(["supported": SquadUwbPlugin.uwbSupported])
    }

    @objc func startPeer(_ call: CAPPluginCall) {
        guard #available(iOS 14.0, *), SquadUwbPlugin.uwbSupported else { call.reject("UWB not supported on this device"); return }
        guard let athleteId = call.getString("athleteId"), !athleteId.isEmpty else { call.reject("athleteId is required"); return }
        DispatchQueue.main.async {
            self.sessions[athleteId]?.invalidate() // re-create if one already exists for this peer
            let session = NISession()
            let delegate = NIDelegate(athleteId: athleteId) { [weak self] event, data in
                self?.notifyListeners(event, data: data)
            }
            session.delegate = delegate
            self.sessions[athleteId] = session
            self.delegates[athleteId] = delegate

            guard let token = session.discoveryToken,
                  let data = try? NSKeyedArchiver.archivedData(withRootObject: token, requiringSecureCoding: true) else {
                call.reject("Couldn't create a discovery token")
                return
            }
            NSLog("[SquadUwb] startPeer(%@) — session created, token issued", athleteId)
            call.resolve(["athleteId": athleteId, "token": data.base64EncodedString()])
        }
    }

    @objc func receivePeerToken(_ call: CAPPluginCall) {
        guard #available(iOS 14.0, *) else { call.reject("UWB not supported on this device"); return }
        guard let athleteId = call.getString("athleteId"),
              let tokenB64 = call.getString("token"),
              let data = Data(base64Encoded: tokenB64) else { call.reject("athleteId + token are required"); return }
        DispatchQueue.main.async {
            guard let session = self.sessions[athleteId] else { call.reject("No session for peer — call startPeer first"); return }
            guard let token = try? NSKeyedUnarchiver.unarchivedObject(ofClass: NIDiscoveryToken.self, from: data) else {
                call.reject("Invalid peer discovery token")
                return
            }
            session.run(NINearbyPeerConfiguration(peerToken: token))
            NSLog("[SquadUwb] receivePeerToken(%@) — session running against peer token", athleteId)
            call.resolve()
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            for (_, s) in self.sessions { s.invalidate() }
            self.sessions.removeAll()
            self.delegates.removeAll()
            call.resolve()
        }
    }
}

/// Per-session NearbyInteraction delegate. Bridges NINearbyObject updates → the JS `nearby` event,
/// tagging each with its athleteId. Direction is a unit vector in the device frame: -z ≈ in front,
/// +x ≈ to the right, +y ≈ up. JS turns that into front/back + left/right.
@available(iOS 14.0, *)
final class NIDelegate: NSObject, NISessionDelegate {
    private let athleteId: String
    private let emit: (String, [String: Any]) -> Void

    init(athleteId: String, emit: @escaping (String, [String: Any]) -> Void) {
        self.athleteId = athleteId
        self.emit = emit
    }

    func session(_ session: NISession, didUpdate nearbyObjects: [NINearbyObject]) {
        for obj in nearbyObjects {
            var data: [String: Any] = ["athleteId": athleteId, "ts": Date().timeIntervalSince1970 * 1000]
            if let d = obj.distance { data["distanceM"] = Double(d) }
            if let dir = obj.direction {
                data["dirX"] = Double(dir.x)
                data["dirY"] = Double(dir.y)
                data["dirZ"] = Double(dir.z)
            }
            NSLog("[SquadUwb] nearby %@ dist=%@ dir=%@", athleteId,
                  obj.distance.map { String(format: "%.2fm", $0) } ?? "—",
                  obj.direction.map { String(format: "(%.2f,%.2f,%.2f)", $0.x, $0.y, $0.z) } ?? "nil")
            emit("nearby", data)
        }
    }

    // iOS 16+: tells us WHY there's no direction yet (needs sweeping/movement/etc.) so the UI can
    // coach the user. Only fires with camera assistance on some devices; harmless where it doesn't.
    @available(iOS 16.0, *)
    func session(_ session: NISession, didUpdateAlgorithmConvergence convergence: NIAlgorithmConvergence, for object: NINearbyObject?) {
        var reasons: [String] = []
        var converged = false
        switch convergence.status {
        case .converged:
            converged = true
        case .notConverged(let rs):
            for r in rs {
                switch r {
                case .insufficientHorizontalSweep: reasons.append("sweep-left-right")
                case .insufficientVerticalSweep: reasons.append("sweep-up-down")
                case .insufficientMovement: reasons.append("move-around")
                case .insufficientLighting: reasons.append("more-light")
                default: reasons.append("unknown")
                }
            }
        case .unknown:
            reasons.append("status-unknown")
        @unknown default:
            break
        }
        NSLog("[SquadUwb] convergence %@ converged=%@ reasons=%@", athleteId, converged ? "yes" : "no", reasons.joined(separator: ","))
        emit("convergence", ["athleteId": athleteId, "converged": converged, "reasons": reasons])
    }

    func session(_ session: NISession, didRemove nearbyObjects: [NINearbyObject], reason: NINearbyObject.RemovalReason) {
        NSLog("[SquadUwb] lost %@ (%@)", athleteId, "\(reason)")
        emit("lost", ["athleteId": athleteId, "reason": "\(reason)"])
    }

    func session(_ session: NISession, didInvalidateWith error: Error) {
        NSLog("[SquadUwb] invalidated %@: %@", athleteId, error.localizedDescription)
        emit("error", ["athleteId": athleteId, "message": error.localizedDescription])
    }

    func sessionWasSuspended(_ session: NISession) { emit("suspended", ["athleteId": athleteId]) }
    func sessionSuspensionEnded(_ session: NISession) { emit("resumed", ["athleteId": athleteId]) }
}
