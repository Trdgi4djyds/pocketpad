package com.pocketpad.app;

import android.os.Bundle;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.WindowManager;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BluetoothGamepadPlugin.class);
        registerPlugin(PocketPadPlugin.class);
        super.onCreate(savedInstanceState);
        // L'écran reste allumé pendant la partie
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        // La diffusion (application TV) démarre son son sans attendre un geste
        if (getBridge() != null && getBridge().getWebView() != null) getBridge().getWebView().getSettings().setMediaPlaybackRequiresUserGesture(false);
        hideSystemBars();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    /** Manettes physiques (TV) : interceptées avant la WebView et transmises à l'application. */
    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        PocketPadPlugin p = PocketPadPlugin.instance;
        if (p != null && p.handleKey(event)) return true;
        return super.dispatchKeyEvent(event);
    }

    @Override
    public boolean dispatchGenericMotionEvent(MotionEvent event) {
        PocketPadPlugin p = PocketPadPlugin.instance;
        if (p != null && p.handleMotion(event)) return true;
        return super.dispatchGenericMotionEvent(event);
    }

    /** Plein écran immersif : barres système masquées, réaffichées d'un balayage. */
    private void hideSystemBars() {
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        controller.hide(WindowInsetsCompat.Type.systemBars());
        controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    }
}
