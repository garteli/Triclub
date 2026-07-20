package com.triclub.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Local (app-embedded) plugins must be registered before the bridge starts.
        registerPlugin(SquadPeerBeaconPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
