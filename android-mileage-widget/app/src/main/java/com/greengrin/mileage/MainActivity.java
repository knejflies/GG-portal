package com.greengrin.mileage;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

public class MainActivity extends Activity {
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        if (MileageWidgetProvider.STOP.equals(getIntent().getAction())) { showStopForm(); return; }
        showSetupForm();
    }

    @Override public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (MileageWidgetProvider.STOP.equals(intent.getAction())) showStopForm();
    }

    private void showSetupForm() {
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setPadding(32, 48, 32, 32);
        TextView intro = new TextView(this);
        intro.setText("Green Grin Mileage\n\nAdd the widget to your home screen. Enter your Green Grin owner PIN once so completed trips can be saved to the portal Mileage log.");
        EditText pin = new EditText(this);
        pin.setHint("Green Grin owner PIN");
        pin.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_VARIATION_PASSWORD);
        pin.setText(MileageStore.prefs(this).getString("admin_pin", ""));
        Button save = new Button(this);
        save.setText("Test & Save Portal Connection");
        TextView connectionStatus = new TextView(this);
        connectionStatus.setPadding(0, 20, 0, 0);
        save.setOnClickListener(v -> {
            String ownerPin = pin.getText().toString().trim();
            if (ownerPin.isEmpty()) {
                connectionStatus.setText("Enter the same owner PIN used to sign into the admin portal.");
                return;
            }
            save.setEnabled(false);
            save.setText("Connecting...");
            connectionStatus.setText("Testing the live Green Grin portal...");
            testPortalConnection(ownerPin, save, connectionStatus);
        });
        layout.addView(intro); layout.addView(pin); layout.addView(save); layout.addView(connectionStatus);
        float savedMiles = MileageStore.milesValue(this);
        if (!MileageStore.running(this) && savedMiles > 0f) {
            Button retryTrip = new Button(this);
            retryTrip.setText("Sync Saved Trip (" + String.format(java.util.Locale.US, "%.1f mi", savedMiles) + ")");
            retryTrip.setOnClickListener(v -> {
                if (MileageStore.prefs(this).getString("admin_pin", "").isEmpty()) {
                    connectionStatus.setText("Connect the portal first, then sync the saved trip.");
                    return;
                }
                retryTrip.setEnabled(false);
                retryTrip.setText("Syncing saved trip...");
                Intent stop = new Intent(this, MileageTrackingService.class).setAction(MileageWidgetProvider.STOP)
                    .putExtra("purpose", "Recovered Android GPS trip");
                startService(stop);
                connectionStatus.setText("Saved trip sent. Check the Green Grin mileage notification for the result.");
            });
            layout.addView(retryTrip);
        }
        layout.setGravity(Gravity.TOP);
        setContentView(layout);
        if (android.os.Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.POST_NOTIFICATIONS}, 10);
        else if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION}, 11);
    }

    private void testPortalConnection(String ownerPin, Button button, TextView statusView) {
        new Thread(() -> {
            HttpURLConnection connection = null;
            String result;
            boolean connected = false;
            try {
                connection = (HttpURLConnection) new URL("https://portal.greengrinlawns.com/.netlify/functions/portal-expenses").openConnection();
                connection.setConnectTimeout(15000);
                connection.setReadTimeout(20000);
                connection.setRequestMethod("POST");
                connection.setRequestProperty("Content-Type", "application/json");
                connection.setRequestProperty("x-admin-pin", ownerPin);
                connection.setRequestProperty("User-Agent", "GreenGrinMileage/2.1");
                connection.setDoOutput(true);
                JSONObject body = new JSONObject().put("action", "connection_test");
                try (OutputStream output = connection.getOutputStream()) {
                    output.write(body.toString().getBytes(StandardCharsets.UTF_8));
                }
                int code = connection.getResponseCode();
                InputStream stream = code >= 200 && code < 300 ? connection.getInputStream() : connection.getErrorStream();
                StringBuilder text = new StringBuilder();
                if (stream != null) {
                    try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
                        String line;
                        while ((line = reader.readLine()) != null) text.append(line);
                    }
                }
                JSONObject response = text.length() > 0 ? new JSONObject(text.toString()) : new JSONObject();
                connected = code >= 200 && code < 300 && response.optBoolean("ok", false);
                result = connected
                    ? "Connected. Completed trips will save under Records → Mileage."
                    : response.optString("error", "Portal returned error " + code + ".");
            } catch (Exception error) {
                String detail = error.getMessage();
                result = error.getClass().getSimpleName() + (detail == null || detail.trim().isEmpty() ? "" : ": " + detail);
            } finally {
                if (connection != null) connection.disconnect();
            }
            boolean connectionWorked = connected;
            String connectionResult = result;
            runOnUiThread(() -> {
                if (connectionWorked) MileageStore.prefs(this).edit().putString("admin_pin", ownerPin).apply();
                button.setEnabled(true);
                button.setText(connectionWorked ? "Portal Connected ✓" : "Try Portal Connection Again");
                statusView.setText(connectionResult);
            });
        }).start();
    }

    private void showStopForm() {
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setPadding(32, 48, 32, 32);
        TextView heading = new TextView(this);
        heading.setText("Finish GPS trip\n\nRecorded miles: " + String.format(java.util.Locale.US, "%.1f", MileageStore.milesValue(this)));
        EditText purpose = new EditText(this);
        purpose.setHint("Trip name or purpose (optional)");
        Button save = new Button(this);
        save.setText("Stop & Save to Green Grin");
        save.setOnClickListener(v -> {
            Intent stop = new Intent(this, MileageTrackingService.class).setAction(MileageWidgetProvider.STOP)
                .putExtra("purpose", purpose.getText().toString());
            startService(stop);
            finish();
        });
        Button cancel = new Button(this);
        cancel.setText("Keep Tracking");
        cancel.setOnClickListener(v -> finish());
        layout.addView(heading); layout.addView(purpose); layout.addView(save); layout.addView(cancel);
        layout.setGravity(Gravity.TOP);
        setContentView(layout);
    }
}
