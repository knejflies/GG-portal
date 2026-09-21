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

public class MainActivity extends Activity {
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        if (MileageWidgetProvider.STOP.equals(getIntent().getAction())) { showStopForm(); return; }
        showSetupForm();
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
        save.setText("Save Portal Connection");
        save.setOnClickListener(v -> { MileageStore.prefs(this).edit().putString("admin_pin", pin.getText().toString().trim()).apply(); save.setText("Portal Connection Saved"); });
        layout.addView(intro); layout.addView(pin); layout.addView(save); layout.setGravity(Gravity.TOP);
        setContentView(layout);
        if (android.os.Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.POST_NOTIFICATIONS}, 10);
        else if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION}, 11);
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
