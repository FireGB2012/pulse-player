package app.pulse.player;

import android.app.ActivityOptions;
import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;

/**
 * Wake-up alarm. Uses the system alarm clock, which opens Pulse at the right time
 * even when it is closed; Pulse then starts the music.
 */
final class AlarmScheduler {

    static final String ACTION_ALARM = "app.pulse.player.ALARM";

    private AlarmScheduler() {}

    private static PendingIntent fireIntent(Context ctx) {
        Intent i = new Intent(ctx, MainActivity.class)
            .setAction(ACTION_ALARM)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        Bundle opts = null;
        if (Build.VERSION.SDK_INT >= 35) {
            // allow this alarm to open Pulse from the background
            ActivityOptions ao = ActivityOptions.makeBasic();
            ao.setPendingIntentCreatorBackgroundActivityStartMode(ActivityOptions.MODE_BACKGROUND_ACTIVITY_START_ALLOWED);
            opts = ao.toBundle();
        }
        return PendingIntent.getActivity(ctx, 77, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE, opts);
    }

    static void schedule(Context ctx, long at, String label) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        NowPlayingStore.prefs(ctx).edit().putLong("alarmAt", at).putString("alarmLabel", label).apply();
        PendingIntent fire = fireIntent(ctx);
        if (Build.VERSION.SDK_INT >= 31 && !am.canScheduleExactAlarms()) {
            // no exact-alarm permission: still ring, maybe a little late
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, fire);
            return;
        }
        am.setAlarmClock(new AlarmManager.AlarmClockInfo(at, ControlReceiver.openApp(ctx)), fire);
    }

    static void cancel(Context ctx) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am != null) am.cancel(fireIntent(ctx));
        NowPlayingStore.prefs(ctx).edit().remove("alarmAt").remove("alarmLabel").apply();
    }

    /** After a reboot alarms are gone; put the saved one back. */
    static void restore(Context ctx) {
        long at = NowPlayingStore.prefs(ctx).getLong("alarmAt", 0);
        if (at > System.currentTimeMillis()) schedule(ctx, at, NowPlayingStore.prefs(ctx).getString("alarmLabel", "Pulse alarm"));
    }
}
