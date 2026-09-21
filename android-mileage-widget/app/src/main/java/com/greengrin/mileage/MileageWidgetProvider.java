package com.greengrin.mileage;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;

public class MileageWidgetProvider extends AppWidgetProvider {
    static final String START = "com.greengrin.mileage.START";
    static final String STOP = "com.greengrin.mileage.STOP";
    static final String RESET = "com.greengrin.mileage.RESET";

    @Override public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (START.equals(intent.getAction())) {
            Intent service = new Intent(context, MileageTrackingService.class).setAction(START);
            androidx.core.content.ContextCompat.startForegroundService(context, service);
        } else if (STOP.equals(intent.getAction())) {
            context.startService(new Intent(context, MileageTrackingService.class).setAction(STOP));
        } else if (RESET.equals(intent.getAction())) {
            context.startService(new Intent(context, MileageTrackingService.class).setAction(RESET));
        }
        updateAll(context);
    }

    @Override public void onUpdate(Context context, AppWidgetManager manager, int[] ids) { updateAll(context); }

    static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        ComponentName name = new ComponentName(context, MileageWidgetProvider.class);
        for (int id : manager.getAppWidgetIds(name)) update(context, manager, id);
    }

    static void update(Context context, AppWidgetManager manager, int id) {
        boolean running = MileageStore.running(context);
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_mileage);
        float miles = MileageStore.miles(context);
        long elapsed = running ? Math.max(0L, System.currentTimeMillis() - MileageStore.start(context)) : 0L;
        views.setTextViewText(R.id.widget_state, running ? "GPS TRACKING" : "READY");
        views.setTextViewText(R.id.widget_miles, String.format(java.util.Locale.US, "%.1f mi", miles));
        views.setTextViewText(R.id.widget_elapsed, running ? formatElapsed(elapsed) : "00:00:00");
        views.setTextViewText(R.id.widget_start, running ? "Tracking" : "Start");
        views.setTextViewText(R.id.widget_stop, running ? "Stop" : "Reset");
        views.setOnClickPendingIntent(R.id.widget_start, action(context, running ? RESET : START));
        views.setOnClickPendingIntent(R.id.widget_stop, action(context, running ? STOP : RESET));
        manager.updateAppWidget(id, views);
    }

    private static PendingIntent action(Context c, String action) {
        Intent intent = new Intent(c, MileageWidgetProvider.class).setAction(action);
        return PendingIntent.getBroadcast(c, action.hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
    static String formatElapsed(long millis) {
        long seconds = millis / 1000L;
        return String.format(java.util.Locale.US, "%02d:%02d:%02d", seconds / 3600L, (seconds / 60L) % 60L, seconds % 60L);
    }
}
