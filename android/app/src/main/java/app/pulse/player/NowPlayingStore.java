package app.pulse.player;

import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.os.Handler;
import android.os.Looper;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * What is playing right now, as last reported by the Pulse web app. Used by the
 * widget, the notification controls and the floating bubble. Kept in
 * SharedPreferences (and the album art in a file) so the widget survives restarts.
 */
final class NowPlayingStore {

    static final String PREFS = "pulse_native";

    static String title = "";
    static String artist = "";
    static String artUrl = "";
    static boolean playing = false;
    static int accent = 0xFF7C5CFF;
    static int bg = 0xFF0B0B12;
    static int text = 0xFFF2F2F7;
    static Bitmap art = null;

    private static boolean loaded = false;
    private static String artLoadedFor = "";
    private static final ExecutorService io = Executors.newSingleThreadExecutor();
    private static final Handler main = new Handler(Looper.getMainLooper());
    private static final List<Runnable> listeners = new ArrayList<>();

    private NowPlayingStore() {}

    static SharedPreferences prefs(Context ctx) {
        return ctx.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static synchronized void load(Context ctx) {
        if (loaded) return;
        loaded = true;
        SharedPreferences p = prefs(ctx);
        title = p.getString("title", "");
        artist = p.getString("artist", "");
        artUrl = p.getString("artUrl", "");
        playing = p.getBoolean("playing", false);
        accent = p.getInt("accent", accent);
        bg = p.getInt("bg", bg);
        text = p.getInt("text", text);
        File f = artFile(ctx);
        if (f.exists()) {
            art = BitmapFactory.decodeFile(f.getAbsolutePath());
            artLoadedFor = artUrl;
        }
    }

    static void update(Context ctx, String t, String a, String url, boolean isPlaying, String accentCss, String bgCss, String textCss) {
        load(ctx);
        title = t == null ? "" : t;
        artist = a == null ? "" : a;
        playing = isPlaying;
        accent = parseColor(accentCss, accent);
        bg = opaque(parseColor(bgCss, bg));
        text = opaque(parseColor(textCss, text));
        String newUrl = url == null ? "" : url;
        boolean artChanged = !newUrl.equals(artLoadedFor);
        artUrl = newUrl;
        prefs(ctx)
            .edit()
            .putString("title", title)
            .putString("artist", artist)
            .putString("artUrl", artUrl)
            .putBoolean("playing", playing)
            .putInt("accent", accent)
            .putInt("bg", bg)
            .putInt("text", text)
            .apply();
        changed(ctx);
        if (artChanged) loadArt(ctx.getApplicationContext(), newUrl);
    }

    static void setPlaying(Context ctx, boolean isPlaying) {
        load(ctx);
        playing = isPlaying;
        prefs(ctx).edit().putBoolean("playing", playing).apply();
        changed(ctx);
    }

    private static void loadArt(Context ctx, String url) {
        if (url.isEmpty()) {
            art = null;
            artLoadedFor = "";
            changed(ctx);
            return;
        }
        io.execute(() -> {
            Bitmap bmp = null;
            HttpURLConnection c = null;
            try {
                c = (HttpURLConnection) new URL(url).openConnection();
                c.setConnectTimeout(8000);
                c.setReadTimeout(8000);
                try (InputStream in = c.getInputStream()) {
                    bmp = BitmapFactory.decodeStream(in);
                }
                if (bmp != null && bmp.getWidth() > 300) bmp = Bitmap.createScaledBitmap(bmp, 300, 300 * bmp.getHeight() / bmp.getWidth(), true);
                if (bmp != null) {
                    try (FileOutputStream out = new FileOutputStream(artFile(ctx))) {
                        bmp.compress(Bitmap.CompressFormat.PNG, 100, out);
                    }
                }
            } catch (Exception ignored) {
                // offline or blocked: keep the old art
            } finally {
                if (c != null) c.disconnect();
            }
            final Bitmap result = bmp;
            main.post(() -> {
                if (!url.equals(artUrl)) return; // a newer song arrived meanwhile
                if (result != null) {
                    art = result;
                    artLoadedFor = url;
                }
                changed(ctx);
            });
        });
    }

    private static File artFile(Context ctx) {
        return new File(ctx.getApplicationContext().getFilesDir(), "now_playing_art.png");
    }

    static void addListener(Runnable r) {
        listeners.add(r);
    }

    static void removeListener(Runnable r) {
        listeners.remove(r);
    }

    private static void changed(Context ctx) {
        Runnable run = () -> {
            PulseWidget.updateAll(ctx.getApplicationContext());
            for (Runnable r : new ArrayList<>(listeners)) r.run();
        };
        if (Looper.myLooper() == Looper.getMainLooper()) run.run();
        else main.post(run);
    }

    private static int opaque(int c) {
        return c | 0xFF000000;
    }

    /** Parses #rgb, #rrggbb, #aarrggbb style hex, rgb(...) and rgba(...). */
    static int parseColor(String css, int fallback) {
        if (css == null) return fallback;
        String s = css.trim().toLowerCase();
        try {
            if (s.startsWith("#")) {
                if (s.length() == 4) {
                    s = "#" + s.charAt(1) + s.charAt(1) + s.charAt(2) + s.charAt(2) + s.charAt(3) + s.charAt(3);
                }
                if (s.length() == 9) {
                    // CSS is #rrggbbaa, Android is #aarrggbb
                    s = "#" + s.substring(7, 9) + s.substring(1, 7);
                }
                return Color.parseColor(s);
            }
            if (s.startsWith("rgb")) {
                String inner = s.substring(s.indexOf('(') + 1, s.lastIndexOf(')'));
                String[] parts = inner.split("[,\\s/]+");
                int r = Math.round(Float.parseFloat(parts[0]));
                int g = Math.round(Float.parseFloat(parts[1]));
                int b = Math.round(Float.parseFloat(parts[2]));
                int a = parts.length > 3 ? Math.round(Float.parseFloat(parts[3]) * 255) : 255;
                return Color.argb(a, r, g, b);
            }
        } catch (Exception ignored) {}
        return fallback;
    }
}
