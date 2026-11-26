package com.pocketpad.app;

import android.annotation.SuppressLint;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothHidDevice;
import android.bluetooth.BluetoothHidDeviceAppSdpSettings;
import android.bluetooth.BluetoothProfile;
import android.content.Context;
import android.os.Build;

import androidx.annotation.RequiresApi;

import java.util.concurrent.Executor;
import java.util.concurrent.Executors;

/**
 * Fait du téléphone une manette de jeu Bluetooth HID standard (Android 9+).
 * Le PC la voit comme une manette générique, sans logiciel à installer.
 */
@RequiresApi(api = Build.VERSION_CODES.P)
@SuppressLint("MissingPermission")
public class HidGamepad {
    public static final int REPORT_ID = 1;
    public static final int REPORT_SIZE = 9;

    public interface Listener {
        void onState(boolean registered, boolean connected, String name, String address);
    }

    public interface Result {
        void ok();

        void fail(String message);
    }

    private static byte[] bytes(int... values) {
        byte[] out = new byte[values.length];
        for (int i = 0; i < values.length; i++) out[i] = (byte) values[i];
        return out;
    }

    // Descripteur HID : 16 boutons, hat switch (croix), 4 axes (sticks) et 2 axes (gâchettes).
    // Doit correspondre à hidReport() dans src/lib/protocol.ts.
    private static final byte[] DESCRIPTOR = bytes(
        0x05, 0x01,       // Usage Page (Generic Desktop)
        0x09, 0x05,       // Usage (Game Pad)
        0xA1, 0x01,       // Collection (Application)
        0x85, REPORT_ID,  //   Report ID
        0x05, 0x09,       //   Usage Page (Button)
        0x19, 0x01,       //   Usage Minimum (1)
        0x29, 0x10,       //   Usage Maximum (16)
        0x15, 0x00,       //   Logical Minimum (0)
        0x25, 0x01,       //   Logical Maximum (1)
        0x75, 0x01,       //   Report Size (1)
        0x95, 0x10,       //   Report Count (16)
        0x81, 0x02,       //   Input (Data, Var, Abs)
        0x05, 0x01,       //   Usage Page (Generic Desktop)
        0x09, 0x39,       //   Usage (Hat switch)
        0x15, 0x00,       //   Logical Minimum (0)
        0x25, 0x07,       //   Logical Maximum (7)
        0x35, 0x00,       //   Physical Minimum (0)
        0x46, 0x3B, 0x01, //   Physical Maximum (315)
        0x65, 0x14,       //   Unit (Degrees)
        0x75, 0x04,       //   Report Size (4)
        0x95, 0x01,       //   Report Count (1)
        0x81, 0x42,       //   Input (Data, Var, Abs, Null)
        0x65, 0x00,       //   Unit (None)
        0x45, 0x00,       //   Physical Maximum (0)
        0x75, 0x04,       //   Report Size (4)
        0x95, 0x01,       //   Report Count (1)
        0x81, 0x03,       //   Input (Const) — bourrage
        0x09, 0x30,       //   Usage (X)
        0x09, 0x31,       //   Usage (Y)
        0x09, 0x32,       //   Usage (Z)
        0x09, 0x35,       //   Usage (Rz)
        0x15, 0x00,       //   Logical Minimum (0)
        0x26, 0xFF, 0x00, //   Logical Maximum (255)
        0x75, 0x08,       //   Report Size (8)
        0x95, 0x04,       //   Report Count (4)
        0x81, 0x02,       //   Input (Data, Var, Abs)
        0x09, 0x33,       //   Usage (Rx)
        0x09, 0x34,       //   Usage (Ry)
        0x15, 0x00,       //   Logical Minimum (0)
        0x26, 0xFF, 0x00, //   Logical Maximum (255)
        0x75, 0x08,       //   Report Size (8)
        0x95, 0x02,       //   Report Count (2)
        0x81, 0x02,       //   Input (Data, Var, Abs)
        0xC0              // End Collection
    );

    private final Context context;
    private final BluetoothAdapter adapter;
    private final Listener listener;
    private final Executor executor = Executors.newSingleThreadExecutor();

    private BluetoothHidDevice proxy;
    private BluetoothDevice host;
    private boolean registered;
    private Result pending;
    private byte[] last = new byte[REPORT_SIZE];

    public HidGamepad(Context context, BluetoothAdapter adapter, Listener listener) {
        this.context = context.getApplicationContext();
        this.adapter = adapter;
        this.listener = listener;
        last[2] = 8; // croix au neutre
        last[3] = last[4] = last[5] = last[6] = (byte) 128; // sticks centrés
    }

    private final BluetoothHidDevice.Callback callback = new BluetoothHidDevice.Callback() {
        @Override
        public void onAppStatusChanged(BluetoothDevice pluggedDevice, boolean isRegistered) {
            registered = isRegistered;
            Result p = pending;
            pending = null;
            if (p != null) {
                if (isRegistered) p.ok();
                else p.fail("Le système a refusé le mode manette Bluetooth.");
            }
            // Reconnexion automatique au dernier PC
            if (isRegistered && pluggedDevice != null && host == null && proxy != null) proxy.connect(pluggedDevice);
            emit();
        }

        @Override
        public void onConnectionStateChanged(BluetoothDevice device, int state) {
            if (state == BluetoothProfile.STATE_CONNECTED) host = device;
            else if (state == BluetoothProfile.STATE_DISCONNECTED && device != null && device.equals(host)) host = null;
            emit();
        }

        @Override
        public void onGetReport(BluetoothDevice device, byte type, byte id, int bufferSize) {
            if (proxy != null) proxy.replyReport(device, type, (byte) REPORT_ID, last);
        }

        @Override
        public void onSetReport(BluetoothDevice device, byte type, byte id, byte[] data) {
            if (proxy != null) proxy.reportError(device, BluetoothHidDevice.ERROR_RSP_SUCCESS);
        }
    };

    public void register(Result result) {
        if (registered && proxy != null) {
            result.ok();
            emit();
            return;
        }
        pending = result;
        if (proxy != null) {
            doRegister();
            return;
        }
        boolean ok = adapter.getProfileProxy(context, new BluetoothProfile.ServiceListener() {
            @Override
            public void onServiceConnected(int profile, BluetoothProfile p) {
                if (profile != BluetoothProfile.HID_DEVICE) return;
                proxy = (BluetoothHidDevice) p;
                doRegister();
            }

            @Override
            public void onServiceDisconnected(int profile) {
                proxy = null;
                registered = false;
                host = null;
                emit();
            }
        }, BluetoothProfile.HID_DEVICE);
        if (!ok) fail("Le profil Bluetooth HID n'est pas disponible sur ce téléphone.");
    }

    private void doRegister() {
        BluetoothHidDeviceAppSdpSettings sdp = new BluetoothHidDeviceAppSdpSettings(
            "PocketPad", "PocketPad Gamepad", "PocketPad", BluetoothHidDevice.SUBCLASS2_GAMEPAD, DESCRIPTOR);
        if (!proxy.registerApp(sdp, null, null, executor, callback)) {
            fail("Impossible d'activer le mode manette (une autre application l'utilise peut-être).");
        }
    }

    private void fail(String message) {
        Result p = pending;
        pending = null;
        if (p != null) p.fail(message);
    }

    /** @return un message d'erreur, ou null si la demande de connexion est partie. */
    public String connect(String address) {
        if (proxy == null || !registered) return "Activez d'abord la manette Bluetooth.";
        try {
            BluetoothDevice device = adapter.getRemoteDevice(address);
            if (!proxy.connect(device)) return "Connexion refusée. Associez d'abord le téléphone depuis le PC.";
            return null;
        } catch (IllegalArgumentException e) {
            return "Adresse Bluetooth invalide.";
        }
    }

    public void disconnect() {
        if (proxy != null && host != null) proxy.disconnect(host);
    }

    public void send(byte[] report) {
        last = report;
        if (proxy != null && host != null) proxy.sendReport(host, REPORT_ID, report);
    }

    public void unregister() {
        try {
            if (proxy != null) {
                if (host != null) proxy.disconnect(host);
                proxy.unregisterApp();
                adapter.closeProfileProxy(BluetoothProfile.HID_DEVICE, proxy);
            }
        } catch (Exception ignored) {
            // Bluetooth déjà coupé
        }
        proxy = null;
        registered = false;
        host = null;
        emit();
    }

    private void emit() {
        BluetoothDevice h = host;
        listener.onState(registered, h != null, h != null ? h.getName() : null, h != null ? h.getAddress() : null);
    }
}
