package app.pulse.player;

import android.Manifest;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.Base64;
import android.view.WindowManager;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.File;
import java.io.FileOutputStream;

/** Pulse's own Android features, called from src/core/native.js. */
@CapacitorPlugin(name = "PulseNative", permissions = { @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS }) })
public class PulseNativePlugin extends Plugin {

    private static PulseNativePlugin instance;
    private static final Handler main = new Handler(Looper.getMainLooper());
    private String pendingAction = null;

    @Override
    public void load() {
        instance = this;
        NowPlayingStore.load(getContext());
        Intent launch = getActivity() != null ? getActivity().getIntent() : null;
        if (launch != null && AlarmScheduler.ACTION_ALARM.equals(launch.getAction())) pendingAction = "alarm";
    }

    /** Sends an event to the web app if it is running. */
    static void emit(String event, String value) {
        main.post(() -> {
            if (instance == null) return;
            JSObject data = new JSObject();
            if (value != null) data.put("value", value);
            instance.notifyListeners(event, data);
        });
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        if (intent != null && AlarmScheduler.ACTION_ALARM.equals(intent.getAction())) {
            JSObject data = new JSObject();
            data.put("action", "alarm");
            notifyListeners("launchAction", data);
        }
    }

    @PluginMethod
    public void takeLaunchAction(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("action", pendingAction);
        pendingAction = null;
        call.resolve(ret);
    }

    @PluginMethod
    public void updateNowPlaying(PluginCall call) {
        NowPlayingStore.update(
            getContext(),
            call.getString("title", ""),
            call.getString("artist", ""),
            call.getString("artUrl", ""),
            call.getBoolean("isPlaying", false),
            call.getString("accent"),
            call.getString("bg"),
            call.getString("text")
        );
        call.resolve();
    }

    @PluginMethod
    public void setControls(PluginCall call) {
        NowPlayingStore.prefs(getContext())
            .edit()
            .putBoolean("notification", call.getBoolean("notification", false))
            .putBoolean("bubble", call.getBoolean("bubble", false) && Bubble.allowed(getContext()))
            .putBoolean("headphoneResume", call.getBoolean("headphoneResume", false))
            .apply();
        PulseService.sync(getContext());
        call.resolve();
    }

    @PluginMethod
    public void canDrawOverlays(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("value", Bubble.allowed(getContext()));
        call.resolve(ret);
    }

    @PluginMethod
    public void openOverlaySettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 23) {
            Intent i = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
        }
        call.resolve();
    }

    @PluginMethod
    public void requestNotifications(PluginCall call) {
        if (Build.VERSION.SDK_INT < 33 || getPermissionState("notifications") == PermissionState.GRANTED) {
            JSObject ret = new JSObject();
            ret.put("granted", true);
            call.resolve(ret);
            return;
        }
        requestPermissionForAlias("notifications", call, "notificationsResult");
    }

    @PermissionCallback
    private void notificationsResult(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", getPermissionState("notifications") == PermissionState.GRANTED);
        call.resolve(ret);
    }

    @PluginMethod
    public void keepAwake(PluginCall call) {
        boolean on = call.getBoolean("on", false);
        getActivity()
            .runOnUiThread(() -> {
                if (on) getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                else getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            });
        call.resolve();
    }

    @PluginMethod
    public void scheduleAlarm(PluginCall call) {
        Double at = call.getDouble("at");
        if (at == null) {
            call.reject("Missing alarm time");
            return;
        }
        AlarmScheduler.schedule(getContext(), at.longValue(), call.getString("label", "Pulse alarm"));
        call.resolve();
    }

    @PluginMethod
    public void cancelAlarm(PluginCall call) {
        AlarmScheduler.cancel(getContext());
        call.resolve();
    }

    @PluginMethod
    public void shareImage(PluginCall call) {
        String b64 = call.getString("base64");
        if (b64 == null) {
            call.reject("No image");
            return;
        }
        try {
            File dir = new File(getContext().getCacheDir(), "share");
            if (!dir.exists() && !dir.mkdirs()) throw new Exception("Could not make a share folder");
            File f = new File(dir, "pulse-now-playing.png");
            try (FileOutputStream out = new FileOutputStream(f)) {
                out.write(Base64.decode(b64, Base64.DEFAULT));
            }
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", f);
            Intent send = new Intent(Intent.ACTION_SEND)
                .setType("image/png")
                .putExtra(Intent.EXTRA_STREAM, uri)
                .putExtra(Intent.EXTRA_TEXT, call.getString("title", "Now playing on Pulse"))
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent chooser = Intent.createChooser(send, "Share now playing");
            chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().startActivity(chooser);
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not share: " + e.getMessage());
        }
    }
}
