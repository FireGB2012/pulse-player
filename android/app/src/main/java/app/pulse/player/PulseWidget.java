package app.pulse.player;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.graphics.Color;
import android.widget.RemoteViews;

/** Home-screen widget: album art, song, artist and controls in the app's theme colors. */
public class PulseWidget extends AppWidgetProvider {

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        NowPlayingStore.load(ctx);
        mgr.updateAppWidget(ids, build(ctx));
    }

    static void updateAll(Context ctx) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, PulseWidget.class));
        if (ids == null || ids.length == 0) return;
        mgr.updateAppWidget(ids, build(ctx));
    }

    private static RemoteViews build(Context ctx) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.pulse_widget);
        int text = NowPlayingStore.text;
        int dim = Color.argb(170, Color.red(text), Color.green(text), Color.blue(text));
        boolean has = !NowPlayingStore.title.isEmpty();

        v.setInt(R.id.widget_bg, "setColorFilter", NowPlayingStore.bg);
        v.setTextViewText(R.id.widget_title, has ? NowPlayingStore.title : "Pulse");
        v.setTextViewText(R.id.widget_artist, has ? NowPlayingStore.artist : "Nothing playing");
        v.setTextColor(R.id.widget_title, text);
        v.setTextColor(R.id.widget_artist, dim);

        if (NowPlayingStore.art != null) v.setImageViewBitmap(R.id.widget_art, NowPlayingStore.art);
        else v.setImageViewResource(R.id.widget_art, R.mipmap.ic_launcher);

        v.setImageViewResource(R.id.widget_play, NowPlayingStore.playing ? R.drawable.ic_pulse_pause : R.drawable.ic_pulse_play);
        v.setInt(R.id.widget_play_bg, "setColorFilter", NowPlayingStore.accent);
        v.setInt(R.id.widget_play, "setColorFilter", contrastOn(NowPlayingStore.accent));
        v.setInt(R.id.widget_prev, "setColorFilter", text);
        v.setInt(R.id.widget_next, "setColorFilter", text);

        v.setOnClickPendingIntent(R.id.widget_play_box, ControlReceiver.pending(ctx, ControlReceiver.PLAY_PAUSE, 1));
        v.setOnClickPendingIntent(R.id.widget_next, ControlReceiver.pending(ctx, ControlReceiver.NEXT, 2));
        v.setOnClickPendingIntent(R.id.widget_prev, ControlReceiver.pending(ctx, ControlReceiver.PREVIOUS, 3));
        v.setOnClickPendingIntent(R.id.widget_art, ControlReceiver.openApp(ctx));
        v.setOnClickPendingIntent(R.id.widget_text, ControlReceiver.openApp(ctx));
        return v;
    }

    /** Black or white, whichever reads better on the given color. */
    static int contrastOn(int c) {
        double l = (0.299 * Color.red(c) + 0.587 * Color.green(c) + 0.114 * Color.blue(c)) / 255;
        return l > 0.6 ? 0xFF111111 : 0xFFFFFFFF;
    }
}
