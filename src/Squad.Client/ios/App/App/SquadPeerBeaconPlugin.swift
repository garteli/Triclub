import Foundation
import Capacitor
import CoreBluetooth

/// SquadPeerBeacon — the *advertise* half of phone-to-phone BLE ranging for live-ride
/// pack positioning. Broadcasts the athlete's GUID as 16 raw bytes in BLE
/// manufacturer-specific data (company id 0xFFFF) so teammates' scanners
/// (@capacitor-community/bluetooth-le `requestLEScan`) can range this phone by RSSI.
///
/// The 16-byte payload uses *canonical* (big-endian / RFC-4122 textual) GUID order —
/// it MUST stay in lockstep with `bytesToGuid` in `peerRangingSource.native.js`.
///
/// iOS caveat: CoreBluetooth only reliably advertises manufacturer data while the app
/// is in the **foreground**. When backgrounded, iOS drops the manufacturer-data key
/// (and the advertisement is coalesced into the "overflow" area other iOS devices can
/// see but generic scanners can't). This is a documented Apple limitation, not a bug —
/// pack ranging degrades to GPS+heading server fusion when the app is backgrounded.
@objc(SquadPeerBeaconPlugin)
public class SquadPeerBeaconPlugin: CAPPlugin, CAPBridgedPlugin, CBPeripheralManagerDelegate {
    public let identifier = "SquadPeerBeaconPlugin"
    public let jsName = "SquadPeerBeacon"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "advertise", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
    ]

    private var peripheralManager: CBPeripheralManager?
    private var pendingData: Data?
    // The advertise() call is held open until CoreBluetooth confirms start (or the
    // manager reports it can't) — resolving early would lie about whether we're visible.
    private var startCall: CAPPluginCall?

    // MARK: - JS methods

    @objc func advertise(_ call: CAPPluginCall) {
        guard let athleteId = call.getString("athleteId"), !athleteId.isEmpty else {
            call.reject("athleteId is required")
            return
        }
        // Company identifier — the JS side passes 0xFFFF (the "not assigned" range used
        // for local experimentation). CoreBluetooth wants the 2-byte company id
        // little-endian at the front of the manufacturer-data blob (it does NOT prepend
        // it for us), followed by our 16-byte GUID payload.
        let manufacturerId = call.getInt("manufacturerId") ?? 0xFFFF
        guard let guidBytes = SquadPeerBeaconPlugin.guidToBytes(athleteId) else {
            call.reject("athleteId is not a valid GUID")
            return
        }

        var data = Data([UInt8(manufacturerId & 0xFF), UInt8((manufacturerId >> 8) & 0xFF)])
        data.append(contentsOf: guidBytes)

        DispatchQueue.main.async {
            // A prior call left un-resolved (manager still spinning up) never completes —
            // reject it so the JS promise settles before we take over.
            self.startCall?.reject("superseded by a newer advertise() call")
            self.pendingData = data
            self.startCall = call
            if self.peripheralManager == nil {
                // Advertising begins in peripheralManagerDidUpdateState once poweredOn.
                self.peripheralManager = CBPeripheralManager(delegate: self, queue: nil)
            } else {
                self.startAdvertisingIfReady()
            }
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.pendingData = nil
            self.startCall?.reject("advertising stopped")
            self.startCall = nil
            if let mgr = self.peripheralManager, mgr.isAdvertising {
                mgr.stopAdvertising()
            }
            call.resolve()
        }
    }

    // MARK: - CBPeripheralManagerDelegate

    private func startAdvertisingIfReady() {
        guard let mgr = peripheralManager, mgr.state == .poweredOn, let data = pendingData else { return }
        if mgr.isAdvertising { mgr.stopAdvertising() }
        mgr.startAdvertising([CBAdvertisementDataManufacturerDataKey: data])
        // Resolution happens in peripheralManagerDidStartAdvertising.
    }

    public func peripheralManagerDidUpdateState(_ peripheral: CBPeripheralManager) {
        switch peripheral.state {
        case .poweredOn:
            startAdvertisingIfReady()
        case .poweredOff:
            startCall?.reject("Bluetooth is powered off")
            startCall = nil
        case .unauthorized:
            startCall?.reject("Bluetooth permission denied")
            startCall = nil
        case .unsupported:
            startCall?.reject("BLE peripheral role is unsupported on this device")
            startCall = nil
        default:
            break // .resetting / .unknown — transient; wait for the next state callback.
        }
    }

    public func peripheralManagerDidStartAdvertising(_ peripheral: CBPeripheralManager, error: Error?) {
        if let error = error {
            startCall?.reject("Failed to start advertising: \(error.localizedDescription)")
        } else {
            startCall?.resolve()
        }
        startCall = nil
    }

    // MARK: - GUID → canonical bytes

    /// "550e8400-e29b-41d4-a716-446655440000" → [0x55,0x0e,0x84,0x00,0xe2,0x9b,...] in
    /// canonical textual (big-endian) order. Returns nil for anything that isn't 32 hex
    /// nibbles once dashes are stripped. Mirror of `guidToBytes` in peerRangingSource.native.js.
    static func guidToBytes(_ guid: String) -> [UInt8]? {
        let hex = guid.replacingOccurrences(of: "-", with: "")
        guard hex.count == 32 else { return nil }
        var bytes = [UInt8]()
        bytes.reserveCapacity(16)
        var idx = hex.startIndex
        for _ in 0..<16 {
            let next = hex.index(idx, offsetBy: 2)
            guard let b = UInt8(hex[idx..<next], radix: 16) else { return nil }
            bytes.append(b)
            idx = next
        }
        return bytes
    }
}
