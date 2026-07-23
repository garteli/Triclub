import Foundation
import Capacitor
import UIKit

/// SquadDialer — open the phone dialer to the emergency contact from the live-ride fall-detection
/// flow, crucially WITHOUT a user gesture (a web `tel:` navigation is blocked by iOS unless it
/// happens inside a tap, so a hands-free countdown timeout can't dial from the web layer).
///
/// iOS never lets an app place a call silently: `UIApplication.open(tel:)` opens the system
/// dialer with the number filled in and shows the OS "Call?" confirmation the user taps. That's
/// still better than nothing on a hands-free timeout — the prompt appears on its own. (Android's
/// plugin can place the call outright with CALL_PHONE.)
@objc(SquadDialerPlugin)
public class SquadDialerPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SquadDialerPlugin"
    public let jsName = "SquadDialer"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "dial", returnType: CAPPluginReturnPromise),
    ]

    @objc func dial(_ call: CAPPluginCall) {
        guard let raw = call.getString("number"), !raw.isEmpty else {
            call.reject("A phone number is required.")
            return
        }
        // Keep only a leading + and digits.
        let cleaned = raw.filter { $0.isNumber || $0 == "+" }
        guard !cleaned.isEmpty, let url = URL(string: "tel:\(cleaned)") else {
            call.reject("That doesn't look like a valid phone number.")
            return
        }
        DispatchQueue.main.async {
            guard UIApplication.shared.canOpenURL(url) else {
                call.reject("Calling isn't available on this device.")
                return
            }
            UIApplication.shared.open(url, options: [:]) { ok in
                if ok { call.resolve() } else { call.reject("Could not open the dialer.") }
            }
        }
    }
}
