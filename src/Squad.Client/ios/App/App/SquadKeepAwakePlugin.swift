import Foundation
import Capacitor
import UIKit

/// SquadKeepAwake — hold the screen on during a live ride.
///
/// The web Screen Wake Lock API (navigator.wakeLock) is unreliable inside WKWebView, so the
/// live-ride display can't depend on it. This plugin flips UIApplication.isIdleTimerDisabled,
/// the native, dependable way to stop iOS auto-locking the screen. JS calls enable() when a
/// ride goes active and disable() when it ends (see hooks/useWakeLock.js).
///
/// isIdleTimerDisabled must be touched on the main thread. It is app-global and does NOT persist
/// across launches, so leaving it enabled only keeps the screen awake while the app is foreground.
@objc(SquadKeepAwakePlugin)
public class SquadKeepAwakePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SquadKeepAwakePlugin"
    public let jsName = "SquadKeepAwake"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "enable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "disable", returnType: CAPPluginReturnPromise),
    ]

    @objc func enable(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            UIApplication.shared.isIdleTimerDisabled = true
            call.resolve()
        }
    }

    @objc func disable(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            UIApplication.shared.isIdleTimerDisabled = false
            call.resolve()
        }
    }
}
