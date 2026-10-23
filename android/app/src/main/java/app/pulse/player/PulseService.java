package app.pulse.player;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.media.AudioDeviceCallback;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.SystemClock;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

/**
 * Keeps Pulse's extras alive in the background: themed notification controls,
 * the floating bubble and headphone detection. Runs only while one of them is on.
 */
public class PulseService extends Service {

    static final String CHANNEL = "pulse_controls";
    static final int NOTIF_ID = 4242;

    private Bubble bubble;
    private AudioManager audio;
    private AudioDeviceCallback deviceCallback;
    private long registeredAt;
    private final Runnable onChange = this::refresh;

    /** Starts or stops the service to match the saved settings. */
    static void sync(Context ctx) {
        SharedPreferences p = NowPlayingStore.prefs(ctx);
        boolean needed = p.getBoolean("notification", false) || p.getBoolean("bubble", false) || p.getBoolean("headphoneResume", false);
        Intent i = new Intent(ctx, PulseService.class);
        if (needed) {
            try {
                ContextCompat.startForegroundService(ctx, i);
            } catch (Exception ignored) {
                // not allowed from the background right now; Pulse retries when opened
            }
        } else {
            ctx.stopService(i);
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        NowPlayingStore.load(this);
        bubble = new Bubble(this);
        audio = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Player controls", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("Play, pause and skip from your notifications");
            ch.setShowBadge(false);
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(ch);
        }
        NowPlayingStore.addListener(onChange);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Notification n = buildNotification();
        if (Build.VERSION.SDK_INT >= 34) startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        else startForeground(NOTIF_ID, n);
        refresh();
        return START_STICKY;
    }

    private void refresh() {
        SharedPreferences p = NowPlayingStore.prefs(this);
        if (p.getBoolean("bubble", false)) {
            bubble.show();
            bubble.update();
        } else bubble.hide();

        if (p.getBoolean("headphoneResume", false)) registerHeadphones();
        else unregisterHeadphones();

        try {
            NotificationManagerCompat.from(this).notify(NOTIF_ID, buildNotification());
        } catch (SecurityException ignored) {
            // notifications not allowed; the service keeps working
        }
    }

    private Notification buildNotification() {
        boolean controls = NowPlayingStore.prefs(this).getBoolean("notification", false);
        NotificationCompat.Builder b = new NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_pulse)
            .setContentIntent(ControlReceiver.openApp(this))
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .setSilent(true)
            .setPriority(NotificationCompat.PRIORITY_LOW);
        if (!controls) {
            return b.setContentTitle("Pulse").setContentText("Floating player / headphone detection is on").build();
        }
        boolean has = !NowPlayingStore.title.isEmpty();
        b.setContentTitle(has ? NowPlayingStore.title : "Pulse")
            .setContentText(has ? NowPlayingStore.artist : "Nothing playing")
            .setLargeIcon(NowPlayingStore.art)
            .setColor(NowPlayingStore.accent)
            .setColorized(true)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
            .addAction(R.drawable.ic_pulse_prev, "Previous", ControlReceiver.pending(this, ControlReceiver.PREVIOUS, 13))
            .addAction(
                NowPlayingStore.playing ? R.drawable.ic_pulse_pause : R.drawable.ic_pulse_play,
                NowPlayingStore.playing ? "Pause" : "Play",
                ControlReceiver.pending(this, ControlReceiver.PLAY_PAUSE, 11)
            )
            .addAction(R.drawable.ic_pulse_next, "Next", ControlReceiver.pending(this, ControlReceiver.NEXT, 12))
            .setStyle(new androidx.media.app.NotificationCompat.MediaStyle().setShowActionsInCompactView(0, 1, 2));
        return b.build();
    }

    // ---- headphones ----
    private static boolean isHeadphones(int type) {
        return (
            type == AudioDeviceInfo.TYPE_WIRED_HEADSET ||
            type == AudioDeviceInfo.TYPE_WIRED_HEADPHONES ||
            type == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP ||
            type == AudioDeviceInfo.TYPE_USB_HEADSET ||
            type == AudioDeviceInfo.TYPE_BLE_HEADSET
        );
    }

    private void registerHeadphones() {
        if (deviceCallback != null || audio == null) return;
        deviceCallback = new AudioDeviceCallback() {
            @Override
            public void onAudioDevicesAdded(AudioDeviceInfo[] added) {
                // the first call lists devices that were already connected; skip it
                if (SystemClock.elapsedRealtime() - registeredAt < 2000) return;
                for (AudioDeviceInfo d : added) {
                    if (d.isSink() && isHeadphones(d.getType())) {
                        MediaKeys.play(PulseService.this);
                        NowPlayingStore.setPlaying(PulseService.this, true);
                        PulseNativePlugin.emit("headphonesConnected", null);
                        return;
                    }
                }
            }
        };
        registeredAt = SystemClock.elapsedRealtime();
        audio.registerAudioDeviceCallback(deviceCallback, new Handler(Looper.getMainLooper()));
    }

    private void unregisterHeadphones() {
        if (deviceCallback == null || audio == null) return;
        audio.unregisterAudioDeviceCallback(deviceCallback);
        deviceCallback = null;
    }

    @Override
    public void onDestroy() {
        NowPlayingStore.removeListener(onChange);
        bubble.hide();
        unregisterHeadphones();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
