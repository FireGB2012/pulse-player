package app.pulse.player;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Handles the play/pause/next/previous buttons of the widget, notification and bubble. */
public class ControlReceiver extends BroadcastReceiver {

    static final String PLAY_PAUSE = "app.pulse.player.PLAY_PAUSE";
    static final String NEXT = "app.pulse.player.NEXT";
    static final String PREVIOUS = "app.pulse.player.PREVIOUS";

    static PendingIntent pending(Context ctx, String action, int requestCode) {
        Intent i = new Intent(ctx, ControlReceiver.class).setAction(action);
        return PendingIntent.getBroadcast(ctx, requestCode, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static PendingIntent openApp(Context ctx) {
        Intent i = new Intent(ctx, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(ctx, 10, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    @Override
    public void onReceive(Context ctx, Intent intent) {
        String action = intent.getAction();
        if (action == null) return;
        NowPlayingStore.load(ctx);
        switch (action) {
            case PLAY_PAUSE:
                MediaKeys.playPause(ctx);
                // show the new state right away; Pulse corrects it on its next sync
                NowPlayingStore.setPlaying(ctx, !NowPlayingStore.playing);
                break;
            case NEXT:
                MediaKeys.next(ctx);
                break;
            case PREVIOUS:
                MediaKeys.previous(ctx);
                break;
            default:
                break;
        }
        PulseNativePlugin.emit("mediaButton", action);
    }
}
