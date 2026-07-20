package com.triclub.app;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothManager;
import android.bluetooth.le.AdvertiseCallback;
import android.bluetooth.le.AdvertiseData;
import android.bluetooth.le.AdvertiseSettings;
import android.bluetooth.le.BluetoothLeAdvertiser;
import android.content.Context;
import android.os.Build;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.PermissionState;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * SquadPeerBeacon — the <em>advertise</em> half of phone-to-phone BLE ranging for
 * live-ride pack positioning. Broadcasts the athlete's GUID as 16 raw bytes in BLE
 * manufacturer-specific data (company id 0xFFFF) so teammates' scanners
 * (@capacitor-community/bluetooth-le {@code requestLEScan}) can range this phone by RSSI.
 *
 * <p>The 16-byte payload uses <em>canonical</em> (big-endian / RFC-4122 textual) GUID
 * order — it MUST stay in lockstep with {@code bytesToGuid} in
 * {@code peerRangingSource.native.js}.
 *
 * <p>Android 12+ (API 31) gates BLE advertising behind the runtime
 * {@code BLUETOOTH_ADVERTISE} permission, requested lazily on the first advertise().
 */
@CapacitorPlugin(
    name = "SquadPeerBeacon",
    permissions = {
        @Permission(alias = "advertise", strings = { Manifest.permission.BLUETOOTH_ADVERTISE })
    }
)
public class SquadPeerBeaconPlugin extends Plugin {

    private BluetoothLeAdvertiser advertiser;
    private AdvertiseCallback callback;

    @PluginMethod
    public void advertise(PluginCall call) {
        // BLUETOOTH_ADVERTISE is a runtime permission only on Android 12+. Below that the
        // adapter advertises without a prompt, so skip the request path entirely.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
                && getPermissionState("advertise") != PermissionState.GRANTED) {
            requestPermissionForAlias("advertise", call, "advertisePermCallback");
            return;
        }
        startAdvertise(call);
    }

    @PermissionCallback
    private void advertisePermCallback(PluginCall call) {
        if (getPermissionState("advertise") == PermissionState.GRANTED) {
            startAdvertise(call);
        } else {
            call.reject("BLUETOOTH_ADVERTISE permission denied");
        }
    }

    private void startAdvertise(PluginCall call) {
        String athleteId = call.getString("athleteId");
        if (athleteId == null || athleteId.isEmpty()) {
            call.reject("athleteId is required");
            return;
        }
        int manufacturerId = call.getInt("manufacturerId", 0xFFFF);
        byte[] guidBytes;
        try {
            guidBytes = guidToBytes(athleteId);
        } catch (IllegalArgumentException e) {
            call.reject("athleteId is not a valid GUID");
            return;
        }

        BluetoothManager manager = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
        BluetoothAdapter adapter = manager != null ? manager.getAdapter() : null;
        if (adapter == null || !adapter.isEnabled()) {
            call.reject("Bluetooth is off");
            return;
        }
        if (!adapter.isMultipleAdvertisementSupported()) {
            call.reject("BLE advertising is not supported on this device");
            return;
        }
        BluetoothLeAdvertiser adv = adapter.getBluetoothLeAdvertiser();
        if (adv == null) {
            call.reject("BLE advertiser unavailable");
            return;
        }

        // Replace any advertisement already running (e.g. athlete id changed mid-ride).
        stopInternal();

        AdvertiseSettings settings = new AdvertiseSettings.Builder()
            .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
            .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_HIGH)
            .setConnectable(false)
            .build();

        // 2-byte company id + 16-byte GUID = 18 bytes of manufacturer data; with AD-structure
        // overhead this stays well under the 31-byte legacy advertisement budget. Drop the
        // device name so it always fits.
        AdvertiseData data = new AdvertiseData.Builder()
            .addManufacturerData(manufacturerId, guidBytes)
            .setIncludeDeviceName(false)
            .setIncludeTxPowerLevel(false)
            .build();

        final BluetoothLeAdvertiser startedAdvertiser = adv;
        callback = new AdvertiseCallback() {
            @Override
            public void onStartSuccess(AdvertiseSettings settingsInEffect) {
                advertiser = startedAdvertiser;
                call.resolve();
            }

            @Override
            public void onStartFailure(int errorCode) {
                callback = null;
                call.reject("Advertise failed (code " + errorCode + ")");
            }
        };

        try {
            adv.startAdvertising(settings, data, callback);
        } catch (SecurityException e) {
            callback = null;
            call.reject("Missing BLUETOOTH_ADVERTISE permission", e);
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        stopInternal();
        call.resolve();
    }

    private void stopInternal() {
        try {
            if (advertiser != null && callback != null) {
                advertiser.stopAdvertising(callback);
            }
        } catch (SecurityException ignored) {
            // Permission revoked mid-session — nothing left to stop.
        }
        advertiser = null;
        callback = null;
    }

    @Override
    protected void handleOnDestroy() {
        stopInternal();
        super.handleOnDestroy();
    }

    /**
     * "550e8400-e29b-41d4-a716-446655440000" → 16 bytes in canonical textual (big-endian)
     * order. Throws {@link IllegalArgumentException} for anything that isn't 32 hex nibbles
     * once dashes are stripped. Mirror of {@code guidToBytes} in peerRangingSource.native.js.
     */
    static byte[] guidToBytes(String guid) {
        String hex = guid.replace("-", "");
        if (hex.length() != 32) {
            throw new IllegalArgumentException("GUID must be 32 hex digits");
        }
        byte[] out = new byte[16];
        for (int i = 0; i < 16; i++) {
            int hi = Character.digit(hex.charAt(i * 2), 16);
            int lo = Character.digit(hex.charAt(i * 2 + 1), 16);
            if (hi < 0 || lo < 0) {
                throw new IllegalArgumentException("GUID contains a non-hex character");
            }
            out[i] = (byte) ((hi << 4) | lo);
        }
        return out;
    }
}
