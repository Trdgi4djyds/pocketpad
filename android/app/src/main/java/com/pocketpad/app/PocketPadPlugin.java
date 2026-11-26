package com.pocketpad.app;

import android.app.UiModeManager;
import android.content.Context;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.hardware.input.InputManager;
import android.net.ConnectivityManager;
import android.net.LinkAddress;
import android.net.LinkProperties;
import android.net.Network;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.MotionEvent;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.net.Inet4Address;
import java.util.HashMap;
import java.util.Map;

/**
 * Pont natif de PocketPad (voir src/shared/native.ts) :
 * vibrations à amplitude réelle, manettes physiques branchées sur la TV, adresse IP locale et bouton Retour.
 */
@CapacitorPlugin(name = "PocketPad")
public class PocketPadPlugin extends Plugin implements InputManager.InputDeviceListener {
    static PocketPadPlugin instance;

    // Masques de boutons : identiques à BTN dans src/shared/protocol.ts (XInput)
    static final int DPAD_UP = 0x0001, DPAD_DOWN = 0x0002, DPAD_LEFT = 0x0004, DPAD_RIGHT = 0x0008;
    static final int START = 0x0010, BACK = 0x0020, LS = 0x0040, RS = 0x0080, LB = 0x0100, RB = 0x0200, GUIDE = 0x0400;
    static final int A = 0x1000, B = 0x2000, X = 0x4000, Y = 0x8000;

    static class Pad {
        String name;
        int b;
        float lx, ly, rx, ry, lt, rt;
        boolean digitalLt, digitalRt;
        String last = "";
    }

    private final Map<Integer, Pad> pads = new HashMap<>();
    private boolean capture = false;
    private OnBackPressedCallback backCallback;
    private int rumbleAmp = 0;

    @Override
    public void load() {
        instance = this;
        backCallback = new OnBackPressedCallback(false) {
            @Override
            public void handleOnBackPressed() {
                notifyListeners("back", new JSObject());
            }
        };
        getActivity().runOnUiThread(() -> getActivity().getOnBackPressedDispatcher().addCallback(getActivity(), backCallback));
        InputManager im = (InputManager) getContext().getSystemService(Context.INPUT_SERVICE);
        if (im != null) im.registerInputDeviceListener(this, new Handler(Looper.getMainLooper()));
    }

    // ----- Informations ------------------------------------------------------------

    private boolean isTelevision() {
        UiModeManager ui = (UiModeManager) getContext().getSystemService(Context.UI_MODE_SERVICE);
        if (ui != null && ui.getCurrentModeType() == Configuration.UI_MODE_TYPE_TELEVISION) return true;
        return getContext().getPackageManager().hasSystemFeature(PackageManager.FEATURE_LEANBACK);
    }

    @PluginMethod
    public void getInfo(PluginCall call) {
        JSObject r = new JSObject();
        boolean tvFlavor = getContext().getPackageName().endsWith(".tv");
        r.put("tv", tvFlavor || isTelevision());
        r.put("flavor", tvFlavor ? "tv" : "phone");
        r.put("model", Build.MODEL);
        Vibrator v = vibrator();
        r.put("amplitude", v != null && Build.VERSION.SDK_INT >= 26 && v.hasAmplitudeControl());
        try {
            ConnectivityManager cm = (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
            Network n = cm != null ? cm.getActiveNetwork() : null;
            LinkProperties lp = n != null ? cm.getLinkProperties(n) : null;
            if (lp != null) {
                for (LinkAddress la : lp.getLinkAddresses()) {
                    if (la.getAddress() instanceof Inet4Address && !la.getAddress().isLoopbackAddress()) {
                        r.put("ip", la.getAddress().getHostAddress());
                        r.put("prefix", la.getPrefixLength());
                        break;
                    }
                }
            }
        } catch (Exception ignored) {
            // réseau indisponible : la recherche des PC se fera par adresse
        }
        call.resolve(r);
    }

    // ----- Vibrations du téléphone -------------------------------------------------------

    private Vibrator vibrator() {
        if (Build.VERSION.SDK_INT >= 31) {
            VibratorManager vm = (VibratorManager) getContext().getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
            return vm != null ? vm.getDefaultVibrator() : null;
        }
        return (Vibrator) getContext().getSystemService(Context.VIBRATOR_SERVICE);
    }

    @PluginMethod
    public void vibrate(PluginCall call) {
        int ms = clamp(call.getInt("ms", 15), 1, 1000);
        int amp = clamp(call.getInt("amp", 128), 1, 255);
        Vibrator v = vibrator();
        if (v != null && v.hasVibrator()) {
            if (Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createOneShot(ms, v.hasAmplitudeControl() ? amp : VibrationEffect.DEFAULT_AMPLITUDE));
            else v.vibrate(ms);
        }
        call.resolve();
    }

    /** Vibration continue dosée (moteurs du jeu) ; amp = 0 l'arrête. */
    @PluginMethod
    public void rumble(PluginCall call) {
        int amp = clamp(call.getInt("amp", 0), 0, 255);
        startRumble(vibrator(), amp);
        rumbleAmp = amp;
        call.resolve();
    }

    private static void startRumble(Vibrator v, int amp) {
        if (v == null || !v.hasVibrator()) return;
        if (amp == 0) {
            v.cancel();
            return;
        }
        if (Build.VERSION.SDK_INT >= 26) {
            if (v.hasAmplitudeControl()) v.vibrate(VibrationEffect.createWaveform(new long[] { 0, 1000 }, new int[] { 0, amp }, 0));
            else {
                // Sans réglage d'amplitude : intensité rendue par un motif marche / arrêt
                long on = 20 + amp / 4;
                long off = Math.max(0, 80 - amp / 4);
                v.vibrate(VibrationEffect.createWaveform(off > 0 ? new long[] { 0, on, off } : new long[] { 0, 1000 }, 1));
            }
        } else v.vibrate(new long[] { 0, 1000 }, 0);
    }

    @Override
    protected void handleOnPause() {
        super.handleOnPause();
        if (rumbleAmp > 0) startRumble(vibrator(), 0);
        rumbleAmp = 0;
    }

    // ----- Manettes physiques (application TV) ----------------------------------------------

    @PluginMethod
    public void setPadCapture(PluginCall call) {
        capture = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        if (capture) emitPadList();
        call.resolve();
    }

    @PluginMethod
    public void padRumble(PluginCall call) {
        InputDevice d = InputDevice.getDevice(call.getInt("id", -1));
        int amp = clamp(call.getInt("amp", 0), 0, 255);
        if (d != null) {
            Vibrator v = Build.VERSION.SDK_INT >= 31 ? d.getVibratorManager().getDefaultVibrator() : d.getVibrator();
            startRumble(v, amp);
        }
        call.resolve();
    }

    static boolean isGamepad(InputDevice d) {
        if (d == null || d.isVirtual()) return false;
        int s = d.getSources();
        return (s & InputDevice.SOURCE_GAMEPAD) == InputDevice.SOURCE_GAMEPAD || (s & InputDevice.SOURCE_JOYSTICK) == InputDevice.SOURCE_JOYSTICK;
    }

    private Pad pad(InputDevice d) {
        Pad p = pads.get(d.getId());
        if (p == null) {
            p = new Pad();
            p.name = d.getName();
            pads.put(d.getId(), p);
        }
        return p;
    }

    private static int mapKey(int code) {
        switch (code) {
            case KeyEvent.KEYCODE_BUTTON_A: return A;
            case KeyEvent.KEYCODE_BUTTON_B: return B;
            case KeyEvent.KEYCODE_BUTTON_X: return X;
            case KeyEvent.KEYCODE_BUTTON_Y: return Y;
            case KeyEvent.KEYCODE_BUTTON_L1: return LB;
            case KeyEvent.KEYCODE_BUTTON_R1: return RB;
            case KeyEvent.KEYCODE_BUTTON_THUMBL: return LS;
            case KeyEvent.KEYCODE_BUTTON_THUMBR: return RS;
            case KeyEvent.KEYCODE_BUTTON_START: return START;
            case KeyEvent.KEYCODE_BUTTON_SELECT: return BACK;
            case KeyEvent.KEYCODE_BUTTON_MODE: return GUIDE;
            case KeyEvent.KEYCODE_DPAD_UP: return DPAD_UP;
            case KeyEvent.KEYCODE_DPAD_DOWN: return DPAD_DOWN;
            case KeyEvent.KEYCODE_DPAD_LEFT: return DPAD_LEFT;
            case KeyEvent.KEYCODE_DPAD_RIGHT: return DPAD_RIGHT;
            default: return 0;
        }
    }

    /** Appelé par MainActivity pour chaque touche ; renvoie true si l'événement vient d'une manette capturée. */
    boolean handleKey(KeyEvent e) {
        if (!capture || !isGamepad(e.getDevice())) return false;
        int code = e.getKeyCode();
        boolean down = e.getAction() == KeyEvent.ACTION_DOWN;
        Pad p = pad(e.getDevice());
        if (code == KeyEvent.KEYCODE_BUTTON_L2) {
            p.digitalLt = down;
            p.lt = down ? 1 : 0;
        } else if (code == KeyEvent.KEYCODE_BUTTON_R2) {
            p.digitalRt = down;
            p.rt = down ? 1 : 0;
        } else {
            int mask = mapKey(code);
            if (mask == 0) return false;
            if (e.getAction() == KeyEvent.ACTION_MULTIPLE) return true;
            if (down) p.b |= mask;
            else p.b &= ~mask;
        }
        emit(e.getDeviceId(), p);
        return true;
    }

    private static float axis(MotionEvent e, InputDevice d, int a) {
        InputDevice.MotionRange r = d.getMotionRange(a, e.getSource());
        if (r == null) return 0;
        float v = e.getAxisValue(a);
        if (Math.abs(v) <= Math.max(r.getFlat(), 0.04f)) return 0;
        return Math.round(Math.max(-1, Math.min(1, v)) * 1000) / 1000f;
    }

    private static boolean has(InputDevice d, MotionEvent e, int a) {
        return d.getMotionRange(a, e.getSource()) != null;
    }

    /** Sticks, gâchettes analogiques et croix (hat) d'une manette. */
    boolean handleMotion(MotionEvent e) {
        InputDevice d = e.getDevice();
        if (!capture || !isGamepad(d) || e.getAction() != MotionEvent.ACTION_MOVE) return false;
        Pad p = pad(d);
        p.lx = axis(e, d, MotionEvent.AXIS_X);
        p.ly = -axis(e, d, MotionEvent.AXIS_Y);
        if (has(d, e, MotionEvent.AXIS_Z)) {
            p.rx = axis(e, d, MotionEvent.AXIS_Z);
            p.ry = -axis(e, d, MotionEvent.AXIS_RZ);
        } else {
            p.rx = axis(e, d, MotionEvent.AXIS_RX);
            p.ry = -axis(e, d, MotionEvent.AXIS_RY);
        }
        if (!p.digitalLt) p.lt = Math.max(0, Math.max(axis(e, d, MotionEvent.AXIS_LTRIGGER), axis(e, d, MotionEvent.AXIS_BRAKE)));
        if (!p.digitalRt) p.rt = Math.max(0, Math.max(axis(e, d, MotionEvent.AXIS_RTRIGGER), axis(e, d, MotionEvent.AXIS_GAS)));
        if (has(d, e, MotionEvent.AXIS_HAT_X)) {
            float hx = e.getAxisValue(MotionEvent.AXIS_HAT_X);
            float hy = e.getAxisValue(MotionEvent.AXIS_HAT_Y);
            p.b &= ~(DPAD_UP | DPAD_DOWN | DPAD_LEFT | DPAD_RIGHT);
            if (hx < -0.5f) p.b |= DPAD_LEFT;
            if (hx > 0.5f) p.b |= DPAD_RIGHT;
            if (hy < -0.5f) p.b |= DPAD_UP;
            if (hy > 0.5f) p.b |= DPAD_DOWN;
        }
        emit(e.getDeviceId(), p);
        return true;
    }

    private void emit(int id, Pad p) {
        String sig = p.b + "|" + p.lx + "|" + p.ly + "|" + p.rx + "|" + p.ry + "|" + p.lt + "|" + p.rt;
        if (sig.equals(p.last)) return;
        p.last = sig;
        JSObject o = new JSObject();
        o.put("id", id);
        o.put("name", p.name);
        o.put("b", p.b);
        o.put("lx", p.lx);
        o.put("ly", p.ly);
        o.put("rx", p.rx);
        o.put("ry", p.ry);
        o.put("lt", p.lt);
        o.put("rt", p.rt);
        notifyListeners("pad", o);
    }

    private void emitPadList() {
        JSArray list = new JSArray();
        for (int id : InputDevice.getDeviceIds()) {
            InputDevice d = InputDevice.getDevice(id);
            if (!isGamepad(d)) continue;
            JSObject o = new JSObject();
            o.put("id", id);
            o.put("name", d.getName());
            list.put(o);
        }
        JSObject r = new JSObject();
        r.put("pads", list);
        notifyListeners("pads", r);
    }

    @Override
    public void onInputDeviceAdded(int deviceId) {
        if (capture) emitPadList();
    }

    @Override
    public void onInputDeviceRemoved(int deviceId) {
        pads.remove(deviceId);
        if (capture) emitPadList();
    }

    @Override
    public void onInputDeviceChanged(int deviceId) {
        if (capture) emitPadList();
    }

    // ----- Bouton Retour ---------------------------------------------------------------------

    @PluginMethod
    public void setBackHandling(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        getActivity().runOnUiThread(() -> backCallback.setEnabled(on));
        call.resolve();
    }

    @PluginMethod
    public void exitApp(PluginCall call) {
        call.resolve();
        getActivity().runOnUiThread(() -> getActivity().finish());
    }

    private static int clamp(Integer v, int min, int max) {
        return Math.max(min, Math.min(max, v == null ? min : v));
    }
}
