# Green Grin Mileage Widget

This is a native Android companion for the Green Grin portal. It adds a home-screen widget with Start, Stop, current miles, and elapsed time. GPS runs in an Android foreground service so tracking can continue while the portal is closed.

## Build and install

Open this `android-mileage-widget` folder in Android Studio, let Gradle sync, and run the `app` configuration on the Android phone. Grant precise location permission and notification permission. Long-press the Android home screen, choose **Widgets**, and add **Green Grin Mileage**.

Open the widget app once after installing it and enter the Green Grin owner PIN. The widget stores that connection locally, then posts each completed trip to the portal's `portal-expenses` mileage endpoint when you tap Stop. A trip with no PIN or no network remains on the phone and reports the sync result in a notification.
