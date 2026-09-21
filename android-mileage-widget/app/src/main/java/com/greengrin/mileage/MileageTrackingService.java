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
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

public class MileageTrackingService extends Service implements LocationListener {
    private static final String CHANNEL = "mileage_tracking";
    private LocationManager locationManager;
    private Location last;
    private final Handler ticker = new Handler(Looper.getMainLooper());
    private final Runnable tickerTask = new Runnable() { @Override public void run() { update(); if (MileageStore.running(MileageTrackingService.this)) ticker.postDelayed(this, 1000L); } };

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? MileageWidgetProvider.START : intent.getAction();
        if (MileageWidgetProvider.RESET.equals(action)) { stopTracking(false, "Android GPS trip", "GPS-tracked business trip"); MileageStore.reset(this); update(); return START_NOT_STICKY; }
        if (MileageWidgetProvider.STOP.equals(action)) { stopTracking(true, "Android GPS trip", intent.getStringExtra("purpose")); return START_NOT_STICKY; }
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
    private void stopTracking(boolean upload, String route, String purpose) {
        float completedMiles = MileageStore.milesValue(this);
        if (locationManager != null) locationManager.removeUpdates(this);
        locationManager = null;
        ticker.removeCallbacks(tickerTask);
        MileageStore.stop(this);
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
        if (upload && completedMiles > 0f) uploadTrip(completedMiles, route, purpose);
        update();
    }

    private void uploadTrip(float miles, String route, String purpose) {
        String pin = MileageStore.prefs(this).getString("admin_pin", "");
        if (pin.isEmpty()) { notifyResult("Trip saved on phone. Add the owner PIN in the widget app to sync it."); return; }
        new Thread(() -> {
            try {
                JSONObject body = new JSONObject();
                body.put("action", "mileage");
                body.put("expense_date", new java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US).format(new java.util.Date()));
                body.put("mileage_miles", Math.round(miles * 10f) / 10f);
                body.put("mileage_rate", 0.76);
                body.put("route", route == null || route.trim().isEmpty() ? "Android GPS trip" : route.trim());
                body.put("purpose", purpose == null || purpose.trim().isEmpty() ? "GPS-tracked business trip" : purpose.trim());
                HttpURLConnection connection = (HttpURLConnection) new URL("https://portal.greengrinlawns.com/.netlify/functions/portal-expenses").openConnection();
                connection.setRequestMethod("POST");
                connection.setRequestProperty("Content-Type", "application/json");
                connection.setRequestProperty("x-admin-pin", pin);
                connection.setDoOutput(true);
                try (OutputStream output = connection.getOutputStream()) { output.write(body.toString().getBytes(StandardCharsets.UTF_8)); }
                int status = connection.getResponseCode();
                notifyResult(status >= 200 && status < 300 ? "Trip saved to Green Grin Mileage log." : "Trip stayed on phone. Portal rejected the owner PIN.");
                connection.disconnect();
            } catch (Exception error) { notifyResult("Trip stayed on phone. Check the portal connection and try again."); }
        }).start();
    }
    private void notifyResult(String message) { createChannel(); ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).notify(43, new Notification.Builder(this, CHANNEL).setSmallIcon(R.drawable.ic_launcher).setContentTitle("Green Grin mileage").setContentText(message).setAutoCancel(true).build()); }
    @Override public void onLocationChanged(Location location) {
        if (last != null) { float delta = last.distanceTo(location) / 1609.344f; if (delta > 0f && delta < 2f) MileageStore.miles(this, MileageStore.milesValue(this) + delta); }
        last = location;
        update();
    }
    private void update() { MileageWidgetProvider.updateAll(this); }
    private void createChannel() { if (Build.VERSION.SDK_INT >= 26) ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).createNotificationChannel(new NotificationChannel(CHANNEL, "Mileage tracking", NotificationManager.IMPORTANCE_LOW)); }
    private Notification notification() { return new Notification.Builder(this, CHANNEL).setSmallIcon(R.drawable.ic_launcher).setContentTitle("Green Grin mileage tracking").setContentText(String.format(java.util.Locale.US, "%.1f miles", MileageStore.milesValue(this))).setOngoing(true).build(); }
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
