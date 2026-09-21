package com.greengrin.mileage;

import android.content.Context;
import android.content.SharedPreferences;

final class MileageStore {
    private static final String PREFS = "mileage";
    private static final String RUNNING = "running";
    private static final String START = "start";
    private static final String MILES = "miles";
    private MileageStore() {}
    static SharedPreferences prefs(Context context) { return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }
    static boolean running(Context c) { return prefs(c).getBoolean(RUNNING, false); }
    static long start(Context c) { return prefs(c).getLong(START, 0L); }
    static float miles(Context c) { return prefs(c).getFloat(MILES, 0f); }
    static void start(Context c) { prefs(c).edit().putBoolean(RUNNING, true).putLong(START, System.currentTimeMillis()).putFloat(MILES, 0f).apply(); }
    static void stop(Context c) { prefs(c).edit().putBoolean(RUNNING, false).apply(); }
    static void reset(Context c) { prefs(c).edit().clear().apply(); }
    static void miles(Context c, float value) { prefs(c).edit().putFloat(MILES, value).apply(); }
}
