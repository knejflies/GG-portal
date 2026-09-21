package com.greengrin.mileage;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.IBinder;
import android.os.Handler;
import android.os.Looper;
import androidx.core.app.NotificationCompat;

public class MileageTrackingService extends Service implements LocationListener {
    private static final String CHANNEL = "mileage_tracking";
    private LocationManager locationManager;
    private Location last;
    private final Handler ticker = new Handler(Looper.getMainLooper());
    private final Runnable tickerTask = new Runnable() { @Override public void run() { update(); if (MileageStore.running(MileageTrackingService.this)) ticker.postDelayed(this, 1000L); } };

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? MileageWidgetProvider.START : intent.getAction();
        if (MileageWidgetProvider.RESET.equals(action)) { stopTracking(); MileageStore.reset(this); update(); return START_NOT_STICKY; }
        if (MileageWidgetProvider.STOP.equals(action)) { stopTracking(); return START_NOT_STICKY; }
        if (!MileageStore.running(this)) MileageStore.start(this);
        createChannel();
        startForeground(42, notification());
        beginLocationUpdates();
        ticker.removeCallbacks(tickerTask);
        ticker.post(tickerTask);
        update();
        return START_STICKY;
    }

    private void beginLocationUpdates() {
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED && checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) return;
        locationManager = (LocationManager) getSystemService(LOCATION_SERVICE);
        try { locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 1000L, 2f, this); }
        catch (SecurityException ignored) { }
    }
    private void stopTracking() {
        if (locationManager != null) locationManager.removeUpdates(this);
        locationManager = null;
        ticker.removeCallbacks(tickerTask);
        MileageStore.stop(this);
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
        update();
    }
    @Override public void onLocationChanged(Location location) {
        if (last != null) { float delta = last.distanceTo(location) / 1609.344f; if (delta > 0f && delta < 2f) MileageStore.miles(this, MileageStore.miles(this) + delta); }
        last = location;
        update();
    }
    private void update() { MileageWidgetProvider.updateAll(this); }
    private void createChannel() { if (Build.VERSION.SDK_INT >= 26) ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).createNotificationChannel(new NotificationChannel(CHANNEL, "Mileage tracking", NotificationManager.IMPORTANCE_LOW)); }
    private Notification notification() { return new NotificationCompat.Builder(this, CHANNEL).setSmallIcon(R.drawable.ic_launcher).setContentTitle("Green Grin mileage tracking").setContentText(String.format(java.util.Locale.US, "%.1f miles", MileageStore.miles(this))).setOngoing(true).build(); }
    @Override public void onDestroy() {
        if (locationManager != null) locationManager.removeUpdates(this);
        locationManager = null;
        ticker.removeCallbacks(tickerTask);
        MileageStore.stop(this);
        update();
        super.onDestroy();
    }
    @Override public IBinder onBind(Intent intent) { return null; }
}
