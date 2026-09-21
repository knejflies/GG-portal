# Green Grin Mileage Widget

This is a native Android companion for the Green Grin portal. It adds a home-screen widget with Start, Stop, current miles, and elapsed time. GPS runs in an Android foreground service so tracking can continue while the portal is closed.

## Build and install

Open this `android-mileage-widget` folder in Android Studio, let Gradle sync, and run the `app` configuration on the Android phone. Grant precise location permission and notification permission. Long-press the Android home screen, choose **Widgets**, and add **Green Grin Mileage**.

The current trip is stored locally on the phone. The portal still needs a signed-in Save Mileage action to record the trip as a business expense; the next integration step can upload the finished trip to `portal-expenses` after the user signs in.
