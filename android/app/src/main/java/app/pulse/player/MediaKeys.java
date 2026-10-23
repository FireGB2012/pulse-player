package app.pulse.player;

import android.content.Context;
import android.media.AudioManager;
import android.os.SystemClock;
import android.view.KeyEvent;

/**
 * Sends media key presses to whatever app is playing (the Spotify app). This
 * works without a Spotify login, so the widget, notification and bubble keep
 * working even when Pulse itself is asleep.
 */
final class MediaKeys {

    private MediaKeys() {}

    static void send(Context ctx, int keyCode) {
        AudioManager am = (AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE);
        if (am == null) return;
        long now = SystemClock.uptimeMillis();
        am.dispatchMediaKeyEvent(new KeyEvent(now, now, KeyEvent.ACTION_DOWN, keyCode, 0));
        am.dispatchMediaKeyEvent(new KeyEvent(now, now, KeyEvent.ACTION_UP, keyCode, 0));
    }

    static void playPause(Context ctx) {
        send(ctx, KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE);
    }

    static void play(Context ctx) {
        send(ctx, KeyEvent.KEYCODE_MEDIA_PLAY);
    }

    static void next(Context ctx) {
        send(ctx, KeyEvent.KEYCODE_MEDIA_NEXT);
    }

    static void previous(Context ctx) {
        send(ctx, KeyEvent.KEYCODE_MEDIA_PREVIOUS);
    }
}
