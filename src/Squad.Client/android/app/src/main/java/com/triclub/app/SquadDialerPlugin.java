package com.triclub.app;

import android.Manifest;
import android.content.Intent;
import android.net.Uri;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.PermissionState;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * SquadDialer — call the emergency contact from the live-ride fall-detection flow WITHOUT a user
 * gesture (a web {@code tel:} navigation is blocked unless it happens inside a tap, so a hands-free
 * countdown timeout can't dial from the web layer).
 *
 * <p>With the runtime {@code CALL_PHONE} permission this places the call outright ({@code
 * ACTION_CALL}) — true hands-free. Without it (denied, or before the rider grants it) it falls back
 * to opening the dialer with the number filled in ({@code ACTION_DIAL}), which needs no permission
 * and lets the rider (or a bystander) tap to call.
 */
@CapacitorPlugin(
    name = "SquadDialer",
    permissions = {
        @Permission(alias = "phone", strings = { Manifest.permission.CALL_PHONE })
    }
)
public class SquadDialerPlugin extends Plugin {

    @PluginMethod
    public void dial(PluginCall call) {
        String number = call.getString("number");
        if (number == null || number.trim().isEmpty()) {
            call.reject("A phone number is required.");
            return;
        }
        // Place the call directly when we're allowed to; otherwise ask once, then fall back to the
        // dialer if still denied.
        if (getPermissionState("phone") == PermissionState.GRANTED) {
            placeCall(call, number);
        } else {
            requestPermissionForAlias("phone", call, "phonePermCallback");
        }
    }

    @PermissionCallback
    private void phonePermCallback(PluginCall call) {
        String number = call.getString("number");
        if (getPermissionState("phone") == PermissionState.GRANTED) {
            placeCall(call, number);
        } else {
            openDialer(call, number);
        }
    }

    private void placeCall(PluginCall call, String number) {
        try {
            Intent intent = new Intent(Intent.ACTION_CALL, Uri.parse("tel:" + clean(number)));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            // SecurityException (permission revoked mid-flight) etc. — degrade to the dialer.
            openDialer(call, number);
        }
    }

    private void openDialer(PluginCall call, String number) {
        try {
            Intent intent = new Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + clean(number)));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not open the dialer.");
        }
    }

    private String clean(String number) {
        return number.replaceAll("[^0-9+]", "");
    }
}
