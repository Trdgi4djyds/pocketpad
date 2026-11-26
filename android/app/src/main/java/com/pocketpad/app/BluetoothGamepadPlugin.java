package com.pocketpad.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONException;

/** Pont JavaScript ↔ manette Bluetooth HID. Voir src/lib/connection.ts. */
@CapacitorPlugin(
    name = "BluetoothGamepad",
    permissions = {
        @Permission(
            alias = "bluetooth",
            strings = {
                Manifest.permission.BLUETOOTH_CONNECT,
                Manifest.permission.BLUETOOTH_ADVERTISE,
                Manifest.permission.BLUETOOTH_SCAN
            }
        )
    }
)
@SuppressLint({ "MissingPermission", "NewApi" })
public class BluetoothGamepadPlugin extends Plugin {
    private HidGamepad hid;

    private BluetoothAdapter adapter() {
        BluetoothManager manager = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
        return manager != null ? manager.getAdapter() : null;
    }

    private String unsupportedReason() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return "Le mode Bluetooth nécessite Android 9 ou plus récent.";
        if (adapter() == null) return "Ce téléphone n'a pas de Bluetooth.";
        return null;
    }

    private boolean hasPermission() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.S || getPermissionState("bluetooth") == PermissionState.GRANTED;
    }

    @PluginMethod
    public void isSupported(PluginCall call) {
        String reason = unsupportedReason();
        JSObject result = new JSObject();
        result.put("supported", reason == null);
        if (reason != null) result.put("reason", reason);
        call.resolve(result);
    }

    @PluginMethod
    public void enable(PluginCall call) {
        String reason = unsupportedReason();
        if (reason != null) {
            call.reject(reason);
            return;
        }
        if (!hasPermission()) {
            requestPermissionForAlias("bluetooth", call, "onPermission");
            return;
        }
        doEnable(call);
    }

    @PermissionCallback
    private void onPermission(PluginCall call) {
        if (hasPermission()) doEnable(call);
        else call.reject("Autorisation « Appareils à proximité » refusée.");
    }

    private void doEnable(PluginCall call) {
        BluetoothAdapter a = adapter();
        if (!a.isEnabled()) {
            getActivity().startActivity(new Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE));
            call.reject("Activez le Bluetooth puis réessayez.");
            return;
        }
        if (hid == null) hid = new HidGamepad(getContext(), a, this::emitState);
        hid.register(new HidGamepad.Result() {
            @Override
            public void ok() {
                JSObject result = new JSObject();
                result.put("registered", true);
                call.resolve(result);
            }

            @Override
            public void fail(String message) {
                call.reject(message);
            }
        });
    }

    private void emitState(boolean registered, boolean connected, String name, String address) {
        JSObject s = new JSObject();
        s.put("registered", registered);
        s.put("connected", connected);
        if (name != null) s.put("name", name);
        if (address != null) s.put("address", address);
        notifyListeners("state", s);
    }

    @PluginMethod
    public void makeDiscoverable(PluginCall call) {
        if (!hasPermission()) {
            call.reject("Activez d'abord la manette Bluetooth.");
            return;
        }
        Intent intent = new Intent(BluetoothAdapter.ACTION_REQUEST_DISCOVERABLE);
        intent.putExtra(BluetoothAdapter.EXTRA_DISCOVERABLE_DURATION, 120);
        getActivity().startActivity(intent);
        call.resolve();
    }

    @PluginMethod
    public void getPairedDevices(PluginCall call) {
        JSArray list = new JSArray();
        BluetoothAdapter a = adapter();
        if (a != null && hasPermission()) {
            for (BluetoothDevice d : a.getBondedDevices()) {
                JSObject o = new JSObject();
                o.put("name", d.getName() != null ? d.getName() : "");
                o.put("address", d.getAddress());
                list.put(o);
            }
        }
        JSObject result = new JSObject();
        result.put("devices", list);
        call.resolve(result);
    }

    @PluginMethod
    public void connect(PluginCall call) {
        String address = call.getString("address");
        if (hid == null || address == null) {
            call.reject("Activez d'abord la manette Bluetooth.");
            return;
        }
        String error = hid.connect(address);
        if (error != null) call.reject(error);
        else call.resolve();
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        if (hid != null) hid.disconnect();
        call.resolve();
    }

    @PluginMethod
    public void disable(PluginCall call) {
        if (hid != null) hid.unregister();
        call.resolve();
    }

    @PluginMethod
    public void sendReport(PluginCall call) {
        JSArray data = call.getArray("data");
        if (hid == null || data == null) {
            call.resolve();
            return;
        }
        byte[] report = new byte[HidGamepad.REPORT_SIZE];
        try {
            for (int i = 0; i < report.length && i < data.length(); i++) report[i] = (byte) data.getInt(i);
        } catch (JSONException e) {
            call.reject("Rapport invalide");
            return;
        }
        hid.send(report);
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        if (hid != null) hid.unregister();
    }
}
