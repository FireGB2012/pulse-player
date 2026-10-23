package app.pulse.player;

import android.annotation.SuppressLint;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.PixelFormat;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.provider.Settings;
import android.util.DisplayMetrics;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewConfiguration;
import android.view.WindowManager;
import android.widget.ImageView;
import android.widget.LinearLayout;
import androidx.core.graphics.drawable.RoundedBitmapDrawable;
import androidx.core.graphics.drawable.RoundedBitmapDrawableFactory;

/** Floating mini-player bubble drawn over other apps. Tap to show controls, drag to move. */
final class Bubble {

    private final Context ctx;
    private final WindowManager wm;
    private LinearLayout root;
    private ImageView art;
    private LinearLayout panel;
    private ImageView playBtn;
    private ImageView[] icons;
    private WindowManager.LayoutParams lp;

    Bubble(Context ctx) {
        this.ctx = ctx;
        this.wm = (WindowManager) ctx.getSystemService(Context.WINDOW_SERVICE);
    }

    static boolean allowed(Context ctx) {
        return Build.VERSION.SDK_INT < 23 || Settings.canDrawOverlays(ctx);
    }

    private int dp(float v) {
        return Math.round(v * ctx.getResources().getDisplayMetrics().density);
    }

    void show() {
        if (root != null || !allowed(ctx)) return;
        build();
        try {
            wm.addView(root, lp);
        } catch (Exception e) {
            root = null;
            return;
        }
        update();
    }

    void hide() {
        if (root == null) return;
        try {
            wm.removeView(root);
        } catch (Exception ignored) {}
        root = null;
    }

    void update() {
        if (root == null) return;
        int accent = NowPlayingStore.accent;
        int bg = NowPlayingStore.bg;
        int text = NowPlayingStore.text;

        if (NowPlayingStore.art != null) {
            RoundedBitmapDrawable d = RoundedBitmapDrawableFactory.create(ctx.getResources(), NowPlayingStore.art);
            d.setCircular(true);
            art.setImageDrawable(d);
        } else {
            art.setImageResource(R.mipmap.ic_launcher_round);
        }
        GradientDrawable ring = new GradientDrawable();
        ring.setShape(GradientDrawable.OVAL);
        ring.setColor(bg);
        ring.setStroke(dp(3), accent);
        art.setBackground(ring);

        GradientDrawable pill = new GradientDrawable();
        pill.setCornerRadius(dp(28));
        pill.setColor(bg);
        pill.setStroke(dp(1), (accent & 0x00FFFFFF) | 0x66000000);
        panel.setBackground(pill);
        playBtn.setImageResource(NowPlayingStore.playing ? R.drawable.ic_pulse_pause : R.drawable.ic_pulse_play);
        for (ImageView i : icons) i.setColorFilter(text);
        playBtn.setColorFilter(accent);
    }

    private ImageView button(int icon, String label, View.OnClickListener onClick) {
        ImageView b = new ImageView(ctx);
        b.setImageResource(icon);
        b.setContentDescription(label);
        int pad = dp(10);
        b.setPadding(pad, pad, pad, pad);
        b.setLayoutParams(new LinearLayout.LayoutParams(dp(46), dp(46)));
        b.setOnClickListener(onClick);
        return b;
    }

    @SuppressLint("ClickableViewAccessibility")
    private void build() {
        root = new LinearLayout(ctx);
        root.setOrientation(LinearLayout.HORIZONTAL);
        root.setGravity(Gravity.CENTER_VERTICAL);

        art = new ImageView(ctx);
        int size = dp(60);
        art.setLayoutParams(new LinearLayout.LayoutParams(size, size));
        art.setPadding(dp(4), dp(4), dp(4), dp(4));
        art.setScaleType(ImageView.ScaleType.CENTER_CROP);
        art.setElevation(dp(6));
        art.setContentDescription("Pulse player");

        panel = new LinearLayout(ctx);
        panel.setOrientation(LinearLayout.HORIZONTAL);
        panel.setGravity(Gravity.CENTER_VERTICAL);
        panel.setPadding(dp(6), 0, dp(6), 0);
        LinearLayout.LayoutParams plp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, dp(56));
        plp.setMarginStart(dp(6));
        panel.setLayoutParams(plp);
        panel.setVisibility(View.GONE);

        ImageView prev = button(R.drawable.ic_pulse_prev, "Previous", v -> MediaKeys.previous(ctx));
        playBtn = button(R.drawable.ic_pulse_play, "Play or pause", v -> {
            MediaKeys.playPause(ctx);
            NowPlayingStore.setPlaying(ctx, !NowPlayingStore.playing);
        });
        ImageView next = button(R.drawable.ic_pulse_next, "Next", v -> MediaKeys.next(ctx));
        ImageView close = button(R.drawable.ic_pulse_close, "Close bubble", v -> {
            NowPlayingStore.prefs(ctx).edit().putBoolean("bubble", false).apply();
            PulseNativePlugin.emit("bubbleClosed", null);
            PulseService.sync(ctx);
        });
        icons = new ImageView[] { prev, next, close };
        panel.addView(prev);
        panel.addView(playBtn);
        panel.addView(next);
        panel.addView(close);

        root.addView(art);
        root.addView(panel);

        int type = Build.VERSION.SDK_INT >= 26 ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY : WindowManager.LayoutParams.TYPE_PHONE;
        lp = new WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            type,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
            PixelFormat.TRANSLUCENT
        );
        lp.gravity = Gravity.TOP | Gravity.START;
        SharedPreferences p = NowPlayingStore.prefs(ctx);
        DisplayMetrics dm = ctx.getResources().getDisplayMetrics();
        lp.x = p.getInt("bubbleX", dm.widthPixels - size - dp(8));
        lp.y = p.getInt("bubbleY", dp(220));

        final int slop = ViewConfiguration.get(ctx).getScaledTouchSlop();
        art.setOnTouchListener(new View.OnTouchListener() {
            float downX;
            float downY;
            int startX;
            int startY;
            boolean moved;

            @Override
            public boolean onTouch(View v, MotionEvent e) {
                switch (e.getActionMasked()) {
                    case MotionEvent.ACTION_DOWN:
                        downX = e.getRawX();
                        downY = e.getRawY();
                        startX = lp.x;
                        startY = lp.y;
                        moved = false;
                        return true;
                    case MotionEvent.ACTION_MOVE:
                        float dx = e.getRawX() - downX;
                        float dy = e.getRawY() - downY;
                        if (Math.abs(dx) > slop || Math.abs(dy) > slop) moved = true;
                        if (moved) {
                            lp.x = startX + Math.round(dx);
                            lp.y = Math.max(0, startY + Math.round(dy));
                            relayout();
                        }
                        return true;
                    case MotionEvent.ACTION_UP:
                        if (!moved) toggle();
                        else snapToEdge();
                        return true;
                    default:
                        return false;
                }
            }
        });
    }

    private void relayout() {
        if (root == null) return;
        try {
            wm.updateViewLayout(root, lp);
        } catch (Exception ignored) {}
    }

    private void toggle() {
        boolean open = panel.getVisibility() != View.VISIBLE;
        panel.setVisibility(open ? View.VISIBLE : View.GONE);
        relayout();
        // keep the opened panel on screen
        root.post(() -> {
            int w = root.getWidth();
            int screen = ctx.getResources().getDisplayMetrics().widthPixels;
            if (lp.x + w > screen) {
                lp.x = Math.max(0, screen - w);
                relayout();
            }
        });
    }

    private void snapToEdge() {
        int screen = ctx.getResources().getDisplayMetrics().widthPixels;
        int w = root.getWidth();
        lp.x = (lp.x + w / 2 < screen / 2) ? 0 : Math.max(0, screen - w);
        relayout();
        NowPlayingStore.prefs(ctx).edit().putInt("bubbleX", lp.x).putInt("bubbleY", lp.y).apply();
    }
}
