package com.greengrin.mileage;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.UUID;

final class MileageStore {
    private static final String PREFS = "mileage";
    private static final String RUNNING = "running";
    private static final String START = "start";
    private static final String MILES = "miles";
    private static final String TRIP_ID = "trip_id";
    private MileageStore() {}
    static SharedPreferences prefs(Context context) { return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }
    static boolean running(Context c) { return prefs(c).getBoolean(RUNNING, false); }
    static long startTime(Context c) { return prefs(c).getLong(START, 0L); }
    static float milesValue(Context c) { return prefs(c).getFloat(MILES, 0f); }
    static void start(Context c) { prefs(c).edit().putBoolean(RUNNING, true).putLong(START, System.currentTimeMillis()).putFloat(MILES, 0f).putString(TRIP_ID, UUID.randomUUID().toString()).apply(); }
    static void stop(Context c) { prefs(c).edit().putBoolean(RUNNING, false).apply(); }
    static String tripId(Context c) {
        String id = prefs(c).getString(TRIP_ID, "");
        if (!id.isEmpty()) return id;
        id = UUID.randomUUID().toString();
        prefs(c).edit().putString(TRIP_ID, id).apply();
        return id;
    }
    static void reset(Context c) { prefs(c).edit().remove(RUNNING).remove(START).remove(MILES).remove(TRIP_ID).apply(); }
    static void miles(Context c, float value) { prefs(c).edit().putFloat(MILES, value).apply(); }
}
