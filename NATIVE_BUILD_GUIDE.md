# HDA APP — Native App Build & Publish Guide

Complete step-by-step guide to build and publish the HDA APP to Google Play Store and Apple App Store using Capacitor.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Initial Setup](#initial-setup)
3. [Android Configuration](#android-configuration)
4. [iOS Configuration](#ios-configuration)
5. [Push Notifications — How They Work](#push-notifications--how-they-work)
6. [Custom Notification Sounds](#custom-notification-sounds)
7. [Android Build & Publish](#android-build--publish)
8. [iOS Build & Publish](#ios-build--publish)
9. [App Store Listings — Detailed Checklist](#app-store-listings--detailed-checklist)
10. [App Review — Demo Access (OTP Login)](#app-review--demo-access-otp-login)
11. [Ongoing Updates](#ongoing-updates)
12. [Troubleshooting](#troubleshooting)
13. [Legal Pages & Privacy Policy](#legal-pages--privacy-policy)

---

## Prerequisites

### Accounts Required

| Account | Cost | Link |
|---------|------|------|
| Google Play Developer | $25 one-time | https://play.google.com/console/signup |
| Apple Developer Program | $99/year | https://developer.apple.com/programs/ |
| Firebase Account | Free | https://console.firebase.google.com/ |

### Software Required

| Software | Platform | Download |
|----------|----------|----------|
| Node.js (v18+) | All | https://nodejs.org/ |
| Android Studio (Hedgehog+) | Windows/Mac/Linux | https://developer.android.com/studio |
| Xcode (v15+) | Mac only | Mac App Store |
| Git | All | https://git-scm.com/ |
| CocoaPods | Mac only | `sudo gem install cocoapods` |
| JDK 17 | All | Included with Android Studio |

---

## Initial Setup

### Step 1: Export from Lovable to GitHub

1. In the Lovable editor, go to **Settings → GitHub**
2. Click **Connect project** and authorize the Lovable GitHub App
3. Click **Create Repository** — this pushes your entire codebase to GitHub

### Step 2: Clone the Repository

```bash
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git
cd YOUR_REPO
```

### Step 3: Install Dependencies

```bash
npm install
```

### Step 4: Build Web Assets

```bash
npm run build
```

This creates a `dist/` folder with all the compiled HTML, CSS, and JavaScript.

### Step 5: Add Native Platforms

```bash
npx cap add android
npx cap add ios
```

This creates `android/` and `ios/` folders in your project.

### Step 6: Sync Web Assets to Native

```bash
npx cap sync
```

This copies your `dist/` folder into the native projects and installs native plugins.

---

## Android Configuration

After running `npx cap add android`, you must configure permissions, Firebase, and notification channels.

### Step 1: Add Permissions to AndroidManifest.xml

Open `android/app/src/main/AndroidManifest.xml` and add these permissions **inside `<manifest>` but before `<application>`**:

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <!-- Internet (already present) -->
    <uses-permission android:name="android.permission.INTERNET" />

    <!-- Location permissions (required for GPS/maps) -->
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
    <uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />

    <!-- Push Notifications (Android 13+) -->
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />

    <!-- Vibration for notifications -->
    <uses-permission android:name="android.permission.VIBRATE" />

    <!-- Camera (for QR scanner, profile photos) -->
    <uses-permission android:name="android.permission.CAMERA" />

    <!-- Keep screen on during trip -->
    <uses-permission android:name="android.permission.WAKE_LOCK" />

    <!-- Foreground service for location tracking -->
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />

    <!-- Network state -->
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />

    <!-- Full-screen intent for heads-up trip notifications on lock screen -->
    <uses-permission android:name="android.permission.USE_FULL_SCREEN_INTENT" />

    <application
        ...
```

### Step 2: Add Firebase Configuration

1. Go to [Firebase Console](https://console.firebase.google.com/) → your project
2. Go to **Project Settings → General**
3. Under **Your apps**, click **Add app → Android**
4. Use package name: `app.lovable.2395a37356b54f26bbd1d3b6b03e71bd`
5. Download `google-services.json`
6. Place it in `android/app/google-services.json`

### Step 3: Add Google Services Plugin

In `android/build.gradle` (project-level), add:

```gradle
buildscript {
    dependencies {
        classpath 'com.google.gms:google-services:4.4.0'
    }
}
```

In `android/app/build.gradle` (app-level), add at the top:

```gradle
apply plugin: 'com.google.gms.google-services'
```

And add the Firebase dependency:

```gradle
dependencies {
    implementation platform('com.google.firebase:firebase-bom:32.7.0')
    implementation 'com.google.firebase:firebase-messaging'
}
```

### Step 4: Set SDK Versions

In `android/app/build.gradle`, ensure:

```gradle
android {
    compileSdkVersion 34
    defaultConfig {
        minSdkVersion 23
        targetSdkVersion 34
    }
}
```

### Step 5: Create High-Priority Notification Channels

In `android/app/src/main/java/.../MainActivity.java`, add this inside `onCreate`:

```java
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;

@Override
public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        NotificationManager manager = getSystemService(NotificationManager.class);
        AudioAttributes audioAttr = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build();

        // Trip Requests — IMPORTANCE_MAX for heads-up / full-screen display
        NotificationChannel tripChannel = new NotificationChannel(
            "trip_requests_v2", "Trip Requests", NotificationManager.IMPORTANCE_MAX);
        tripChannel.setDescription("Incoming trip requests that require immediate attention");
        tripChannel.setSound(
            Uri.parse("android.resource://" + getPackageName() + "/raw/trip_request"), audioAttr);
        tripChannel.setVibrationPattern(new long[]{0, 300, 100, 300, 100, 300, 100, 300});
        tripChannel.enableVibration(true);
        tripChannel.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
        tripChannel.setBypassDnd(true);
        manager.createNotificationChannel(tripChannel);

        // SOS Alerts — IMPORTANCE_MAX for emergency visibility
        NotificationChannel sosChannel = new NotificationChannel(
            "sos_alerts_v2", "SOS Alerts", NotificationManager.IMPORTANCE_MAX);
        sosChannel.setDescription("Emergency SOS alerts requiring immediate response");
        sosChannel.setVibrationPattern(new long[]{0, 500, 100, 500, 100, 500, 100, 500});
        sosChannel.enableVibration(true);
        sosChannel.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
        sosChannel.setBypassDnd(true);
        manager.createNotificationChannel(sosChannel);

        // General notifications
        NotificationChannel generalChannel = new NotificationChannel(
            "general_v2", "General", NotificationManager.IMPORTANCE_HIGH);
        generalChannel.setDescription("General app notifications");
        generalChannel.setSound(
            Uri.parse("android.resource://" + getPackageName() + "/raw/message_received"), audioAttr);
        manager.createNotificationChannel(generalChannel);

        // Delete old channels if upgrading
        manager.deleteNotificationChannel("trip_requests");
        manager.deleteNotificationChannel("sos_alerts");
        manager.deleteNotificationChannel("general");
    }
}
```

> **Why IMPORTANCE_MAX?** This makes notifications appear as **heads-up banners** that pop up over other apps and on the lock screen — just like Uber and other ride-hailing apps. Without this, notifications only appear in the notification shade and drivers may miss trip requests.

---

## iOS Configuration

### Step 1: Add Privacy Usage Descriptions

Open `ios/App/App/Info.plist` and add these entries **inside the top-level `<dict>`**:

```xml
<!-- Location permissions -->
<key>NSLocationWhenInUseUsageDescription</key>
<string>HDA APP needs your location to find nearby drivers and show your position on the map.</string>

<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
<string>HDA APP needs your location to track your ride and provide accurate ETAs.</string>

<key>NSLocationAlwaysUsageDescription</key>
<string>HDA APP needs background location access to track active trips.</string>

<!-- Camera permission (for QR scanner) -->
<key>NSCameraUsageDescription</key>
<string>HDA APP needs camera access to scan QR codes and take profile photos.</string>

<!-- Photo library permission -->
<key>NSPhotoLibraryUsageDescription</key>
<string>HDA APP needs photo library access to upload documents and profile photos.</string>
```

### Step 2: Enable Push Notifications in Xcode

1. Open `ios/App/App.xcworkspace` in Xcode
2. Select the **App** target in the project navigator
3. Go to **Signing & Capabilities** tab
4. Click the **+ Capability** button
5. Search and add **Push Notifications**
6. Click **+ Capability** again
7. Search and add **Background Modes**
8. In the Background Modes section, check:
   - **Remote notifications** (required for push)
   - **Location updates** (required for trip tracking)

### Step 3: Add Firebase Configuration File

1. In Firebase Console → Project Settings → **Add app → Apple (iOS)**
2. Use bundle ID: `app.lovable.2395a37356b54f26bbd1d3b6b03e71bd`
3. Download `GoogleService-Info.plist`
4. In Xcode, right-click the **App** folder → **Add Files to "App"**
5. Select `GoogleService-Info.plist`
6. Ensure **"Copy items if needed"** is checked
7. Ensure **"Add to targets: App"** is checked

### Step 4: Create APNs Key and Upload to Firebase

This step connects Apple's push notification service to Firebase so your server can send push notifications to iOS devices.

1. Go to [Apple Developer → Keys](https://developer.apple.com/account/resources/authkeys/list)
2. Click the **+** button to create a new key
3. Give it a name like "HDA APP Push Key"
4. Check **Apple Push Notifications service (APNs)**
5. Click **Continue** → **Register**
6. **Download the `.p8` file** — you can only download it once, so save it safely
7. Note the **Key ID** shown on the page
8. Note your **Team ID** from the top-right of the Apple Developer page

Now upload to Firebase:

9. Go to [Firebase Console](https://console.firebase.google.com/) → your project
10. Go to **Project Settings → Cloud Messaging** tab
11. Scroll to **Apple app configuration**
12. Click **Upload** under APNs Authentication Key
13. Upload the `.p8` file
14. Enter the **Key ID** and **Team ID**
15. Click **Upload**

### Step 5: Install CocoaPods Dependencies

```bash
cd ios/App
pod install
cd ../..
```

### iOS Push Notification Behavior — What Works Automatically

Once configured, iOS handles these automatically with NO code changes needed:

| Feature | How It Works |
|---------|-------------|
| **Lock screen banners** | Automatic — all notifications show on lock screen |
| **Heads-up banners** | Automatic — iOS always shows notification banners over other apps |
| **Focus/DND bypass** | Your app uses `time-sensitive` interruption level — bypasses Focus mode for trip requests and SOS |
| **Background wake** | `content-available: 1` wakes the app to process data in the background |
| **Badge count** | Automatic — shows unread count on app icon |
| **Sound** | Uses system default notification sound |

### Optional: Critical Alerts (SOS on Silent Mode)

To play sounds **even when the phone is on silent/vibrate mode** (ideal for SOS alerts):

1. Apply for the **Critical Alerts entitlement** at [developer.apple.com](https://developer.apple.com/contact/request/notifications-critical-alerts-entitlement/)
2. Apple reviews this manually — you need to justify why your app needs it (emergency/safety features)
3. Once approved, add the **Critical Alerts** capability in Xcode
4. This allows SOS notifications to bypass silent mode

> **Note:** This is optional and only recommended for the SOS alert feature. Regular trip notifications work fine without it.

---

## Push Notifications — How They Work

### Architecture Overview

The app uses **Firebase Cloud Messaging (FCM) v1** to send push notifications. Here is the flow:

```
Trip Request Created
        ↓
App calls Edge Function (send-push-notification)
        ↓
Edge Function finds driver device tokens from database
        ↓
Edge Function sends FCM message to each token
        ↓
FCM delivers to device (Android/iOS/Web)
        ↓
Device shows notification with sound + vibration
```

### Notification Types

| Type | Recipients | Priority | Sound |
|------|-----------|----------|-------|
| Trip Requested | Available drivers | MAX | Trip request sound |
| Trip Accepted | Passenger | HIGH | Accepted sound |
| Driver Arrived | Passenger | HIGH | Arrival sound |
| Trip Started | Passenger | HIGH | Start sound |
| Trip Completed | Passenger | HIGH | Completion sound |
| Trip Cancelled | Both parties | HIGH | Cancellation sound |
| Trip Taken | Other drivers | HIGH | Cancellation sound |
| Chat Message | Recipient | HIGH | Message sound |
| SOS Alert | Admins | MAX | System default |

### Android vs iOS Behavior

| Feature | Android | iOS |
|---------|---------|-----|
| Heads-up banners | Requires IMPORTANCE_MAX channel | Automatic |
| Lock screen display | Requires channel configuration | Automatic |
| Custom sounds | Via notification channel | Via APNs payload |
| Bypass DND | `setBypassDnd(true)` on channel | `time-sensitive` interruption level |
| Bypass silent mode | Not applicable | Requires Critical Alerts entitlement |
| Background delivery | FCM handles via data messages | APNs with `content-available` |

---

## Custom Notification Sounds

### Android Sounds

1. Prepare your sound files in `.mp3` or `.ogg` format
2. Place them in: `android/app/src/main/res/raw/`
3. Name them to match these exact filenames:

```
android/app/src/main/res/raw/
├── trip_request.mp3
├── driver_arrived.mp3
├── trip_accepted.mp3
├── trip_started.mp3
├── trip_completed.mp3
├── trip_cancelled.mp3
└── message_received.mp3
```

The notification channels created in `MainActivity.java` (Step 5 above) reference these file names.

### iOS Sounds

1. Convert sounds to `.caf` format using Terminal:
   ```bash
   afconvert trip_request.mp3 trip_request.caf -d ima4 -f caff -v
   afconvert driver_arrived.mp3 driver_arrived.caf -d ima4 -f caff -v
   afconvert trip_accepted.mp3 trip_accepted.caf -d ima4 -f caff -v
   afconvert trip_completed.mp3 trip_completed.caf -d ima4 -f caff -v
   afconvert trip_cancelled.mp3 trip_cancelled.caf -d ima4 -f caff -v
   afconvert message_received.mp3 message_received.caf -d ima4 -f caff -v
   ```
2. In Xcode, right-click the **App** folder → **Add Files to "App"**
3. Select all `.caf` files
4. Ensure **"Copy items if needed"** and **"Add to targets: App"** are checked

> **Note:** iOS custom sounds must be under 30 seconds. Longer sounds are ignored and the default sound plays instead.

---

## Android Build & Publish

### Development Testing

```bash
npm run build
npx cap sync android
npx cap run android
```

This builds and installs the app on a connected Android device or emulator.

### Release Build — Step by Step

#### Step 1: Remove the Server Block

In `capacitor.config.json`, remove or comment out the `server` block so the app uses bundled files instead of loading from the internet:

```json
{
  "appId": "app.lovable.2395a37356b54f26bbd1d3b6b03e71bd",
  "appName": "HDA APP",
  "webDir": "dist",
  "plugins": { ... },
  "android": { ... },
  "ios": { ... }
}
```

> **Important:** If you keep the `server` block in release builds, the app will crash when it cannot reach the development server.

#### Step 2: Build Web Assets and Sync

```bash
npm run build
npx cap sync android
```

#### Step 3: Generate a Signing Key (First Time Only)

```bash
keytool -genkey -v -keystore hda-release.keystore \
  -alias hdaapp -keyalg RSA -keysize 2048 -validity 10000
```

You will be prompted for a password and your name/organization details. Remember the password.

> **CRITICAL: Keep this keystore file safe and backed up!** If you lose it, you can never update your app on the Play Store. You would need to create a completely new app listing.

#### Step 4: Configure Signing in Gradle

In `android/app/build.gradle`, add the signing configuration:

```gradle
android {
    signingConfigs {
        release {
            storeFile file('../../hda-release.keystore')
            storePassword 'YOUR_PASSWORD'
            keyAlias 'hdaapp'
            keyPassword 'YOUR_KEY_PASSWORD'
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled true
            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
        }
    }
}
```

> **Security Tip:** Do not commit passwords to Git. Use environment variables or a `keystore.properties` file that is in `.gitignore`.

#### Step 5: Build the AAB Bundle

Google Play requires `.aab` format (not `.apk`):

```bash
cd android
./gradlew bundleRelease
```

Output file: `android/app/build/outputs/bundle/release/app-release.aab`

#### Step 6 (Optional): Build APK for Direct Testing

```bash
cd android
./gradlew assembleRelease
```

Output: `android/app/build/outputs/apk/release/app-release.apk`

You can install this directly on a device for testing before uploading to the Play Store.

### Upload to Google Play Store

#### Step 1: Open Google Play Console

Go to https://play.google.com/console and sign in with your developer account.

#### Step 2: Create a New App

1. Click **Create app**
2. Fill in:
   - **App name:** HDA APP
   - **Default language:** English
   - **App type:** App (not Game)
   - **Free or paid:** Free (or Paid if applicable)
3. Accept the declarations
4. Click **Create app**

#### Step 3: Complete the Dashboard Checklist

Google Play shows a checklist. Here is what to fill in each section:

| Section | What to Do |
|---------|-----------|
| **App access** | Select "All or some functionality is restricted" → Add demo credentials (see Demo Access section) |
| **Ads** | Select "Yes, my app contains ads" (your app has ad banners) |
| **Content rating** | Complete the IARC questionnaire — select your content categories |
| **Target audience** | Select age groups (typically 18+ for taxi apps) |
| **News apps** | Select "No" |
| **COVID-19 apps** | Select "No" |
| **Data safety** | Declare: Location (precise), Phone number, Name, Email, Payment info, Photos |
| **Government apps** | Select "No" |

#### Step 4: Create Store Listing

Go to **Main store listing** and fill in:

- **App name:** HDA APP
- **Short description (80 chars max):** "Book taxis, track rides, and pay securely — Maldives ride-hailing app"
- **Full description (4000 chars max):** Write a detailed description of all features
- **App icon:** 512 × 512 px PNG (32-bit, no alpha)
- **Feature graphic:** 1024 × 500 px JPEG or PNG
- **Phone screenshots:** At least 2 screenshots (recommended 4-8), size 16:9 or 9:16
- **Privacy policy URL:** `https://hdacity.lovable.app/privacy`

#### Step 5: Upload the AAB and Release

1. Go to **Production** → **Create new release**
2. Upload your `app-release.aab` file
3. Add release notes describing the version
4. Click **Review release**
5. Click **Start rollout to Production**

Google reviews typically take 1-3 days for new apps.

---

## iOS Build & Publish

### Development Testing

```bash
npm run build
npx cap sync ios
npx cap open ios
```

This opens the project in Xcode. Select your device or simulator and press **Run (▶)**.

### Release Build — Step by Step

#### Step 1: Remove the Server Block

Same as Android — remove the `server` block from `capacitor.config.json`.

#### Step 2: Build and Sync

```bash
npm run build
npx cap sync ios
cd ios/App && pod install && cd ../..
```

#### Step 3: Configure Signing in Xcode

1. Open `ios/App/App.xcworkspace` in Xcode
2. Select the **App** target
3. Go to **Signing & Capabilities**
4. Check **Automatically manage signing**
5. Select your **Team** (your Apple Developer account)
6. The Bundle Identifier should be: `app.lovable.2395a37356b54f26bbd1d3b6b03e71bd`

#### Step 4: Set Version and Build Number

1. In Xcode, select the **App** target → **General** tab
2. Set **Version** (e.g., `1.0.0`)
3. Set **Build** (e.g., `1`) — increment this for each upload

#### Step 5: Archive the App

1. Select **Any iOS Device (arm64)** as the build target (not a simulator)
2. Go to **Product → Archive**
3. Wait for the archive to complete
4. The **Organizer** window opens automatically

#### Step 6: Upload to App Store Connect

1. In the Organizer, select your archive
2. Click **Distribute App**
3. Select **App Store Connect** → **Upload**
4. Follow the prompts (accept defaults)
5. Wait for the upload to complete

### Publish on App Store Connect

#### Step 1: Create App in App Store Connect

1. Go to [App Store Connect](https://appstoreconnect.apple.com)
2. Click **My Apps** → **+** (New App)
3. Fill in:
   - **Platform:** iOS
   - **Name:** HDA APP
   - **Primary language:** English
   - **Bundle ID:** Select from dropdown (matches your Xcode project)
   - **SKU:** Any unique string (e.g., `hdaapp001`)

#### Step 2: Fill in App Information

1. **Privacy Policy URL:** `https://hdacity.lovable.app/privacy`
2. **Category:** Travel (Primary), Navigation (Secondary)
3. **Content Rights:** Does not contain third-party content (or declare if it does)
4. **Age Rating:** Complete the questionnaire

#### Step 3: Add Screenshots and Metadata

Required screenshot sizes:

| Device | Size (pixels) |
|--------|-------------|
| iPhone 6.7" (iPhone 15 Pro Max) | 1290 × 2796 |
| iPhone 6.5" (iPhone 14 Plus) | 1284 × 2778 |
| iPhone 5.5" (iPhone 8 Plus) — optional | 1242 × 2208 |
| iPad 12.9" — required if app supports iPad | 2048 × 2732 |

- Upload at least **3 screenshots** per required size
- Add a **Description** and **Keywords**
- Add a **Support URL** and **Marketing URL** (optional)

#### Step 4: Add Build and Submit

1. Go to the **App Store** tab → your version
2. Under **Build**, click **+** and select the uploaded build
3. Fill in **"What's New in This Version"**
4. Add **App Review Information:**
   - Demo phone number and OTP (see Demo Access section below)
   - Notes for the reviewer explaining how to test
5. Click **Submit for Review**

Apple reviews typically take 1-2 days.

---

## App Store Listings — Detailed Checklist

### Google Play Store Assets

| Asset | Specification |
|-------|-------------|
| App icon | 512 × 512 px, PNG, 32-bit color, no alpha/transparency |
| Feature graphic | 1024 × 500 px, JPEG or 24-bit PNG |
| Phone screenshots | Minimum 2 (recommended 4-8), JPEG or PNG, 16:9 or 9:16 |
| 7-inch tablet screenshots | Optional, minimum 320px on each side |
| 10-inch tablet screenshots | Optional, minimum 320px on each side |
| Short description | Maximum 80 characters |
| Full description | Maximum 4,000 characters |
| Privacy Policy URL | Required — use your app's privacy policy page |
| App category | Travel & Local |
| Content rating | Complete IARC questionnaire |
| Contact email | Required for store listing |

### Apple App Store Assets

| Asset | Specification |
|-------|-------------|
| App icon | 1024 × 1024 px, PNG, no alpha, no rounded corners |
| 6.7" screenshots | 1290 × 2796 px (required for iPhone 15 Pro Max) |
| 6.5" screenshots | 1284 × 2778 px (required for iPhone 14 Plus) |
| 5.5" screenshots | 1242 × 2208 px (optional, for iPhone 8 Plus) |
| iPad screenshots | 2048 × 2732 px (required if supporting iPad) |
| Description | No character limit, but keep it concise |
| Keywords | 100 characters total, comma-separated |
| Support URL | Required |
| Marketing URL | Optional |
| Privacy Policy URL | Required |
| Category | Travel (primary), Navigation (secondary) |
| Age Rating | Complete Apple's questionnaire |
| Demo credentials | Required for app review (see below) |

---

## App Review — Demo Access (OTP Login)

Both Google and Apple require **demo access** for apps that need login. Since HDA APP uses SMS OTP login, you need to provide a way for reviewers to log in.

### Option 1: Whitelist a Test Phone Number (Recommended)

Set up a fixed test phone number with a fixed OTP code that always works:

1. In your admin panel, create a test phone number (e.g., `+9607777777`)
2. Configure the OTP system to accept a fixed code (e.g., `123456`) for this number
3. Provide these credentials to the app review team:
   - **Phone Number:** +960 7777777
   - **OTP Code:** 123456

### Option 2: Provide Test Credentials in Review Notes

When submitting for review, in the **App Review Information** section:

**For Google Play:**
1. Go to **App access** in the dashboard
2. Select **"All or some functionality is restricted"**
3. Click **Add new instructions**
4. Enter the test phone number and OTP code
5. Add clear instructions: "Enter the phone number, tap Send OTP, then enter the code shown above"

**For Apple App Store:**
1. In App Store Connect → your app version → **App Review Information**
2. Under **Sign-In Information**, check **"Sign-in required"**
3. Enter the demo phone number and OTP code
4. In **Notes**, write step-by-step login instructions

### Important Review Tips

- Test the demo credentials yourself before submitting
- Ensure the test account has realistic data (some trips, a driver profile, etc.)
- If possible, have both a driver account and passenger account for testing
- Mention in the review notes that the app has two modes: Passenger and Driver

---

## Ongoing Updates

### Pulling Changes from Lovable

Whenever you make changes in Lovable, update your native app:

```bash
git pull
npm install
npm run build
npx cap sync
```

### Testing Updates

```bash
npx cap run android   # Test on Android
npx cap run ios       # Test on iOS (Mac only)
```

### Version Bumping for Store Updates

**Android** — edit `android/app/build.gradle`:

```gradle
defaultConfig {
    versionCode 2        // Increment by 1 for each upload (2, 3, 4, ...)
    versionName "1.1.0"  // Human-readable version
}
```

**iOS** — in Xcode:
1. Select the **App** target → **General** tab
2. Increment **Version** (e.g., `1.0.0` → `1.1.0`)
3. Increment **Build** (e.g., `1` → `2`)

### Submitting Updates

**Google Play:**
1. Build a new AAB (`./gradlew bundleRelease`)
2. Go to **Production → Create new release**
3. Upload new AAB → Add release notes → **Start rollout**

**Apple App Store:**
1. In Xcode, increment version/build → **Product → Archive**
2. Upload via Organizer
3. In App Store Connect, create a new version → Select build → **Submit for Review**

---

## Troubleshooting

### App Crashes on Launch

| Cause | Fix |
|-------|-----|
| `server.url` still in config | Remove the `server` block from `capacitor.config.json` for release builds |
| Missing `google-services.json` | Download from Firebase Console and place in `android/app/` |
| Missing `GoogleService-Info.plist` | Download from Firebase Console and add to Xcode project |
| Missing permissions | Add all required permissions to AndroidManifest.xml / Info.plist |
| SDK version mismatch | Set `minSdkVersion 23` and `targetSdkVersion 34` |
| Missing `dist/` folder | Run `npm run build` before `npx cap sync` |
| CocoaPods not installed | Run `cd ios/App && pod install` |

### Push Notifications Not Working

| Issue | Android Fix | iOS Fix |
|-------|------------|---------|
| No notifications at all | Check `google-services.json` is in `android/app/` | Check Push Notifications capability in Xcode |
| Not appearing on lock screen | Verify channel has `IMPORTANCE_MAX` | Automatic — check notification settings |
| No sound | Check sound files exist in `res/raw/` | Check `.caf` files added to Xcode target |
| Blocked by DND | Verify `setBypassDnd(true)` on channel | `time-sensitive` already configured |
| Not arriving in background | Check Firebase BOM version | Check Background Modes → Remote notifications |
| Token not registering | Check FCM setup in `MainActivity.java` | Upload APNs key to Firebase |

### Location Not Working

| Issue | Fix |
|-------|-----|
| "Location permission denied" | Check permissions in AndroidManifest.xml / Info.plist |
| Location freezes when app backgrounded | Ensure `FOREGROUND_SERVICE_LOCATION` (Android) and `Location updates` Background Mode (iOS) |
| GPS accuracy is poor | Request `ACCESS_FINE_LOCATION` (not just COARSE) |

### Common Build Errors

| Error | Fix |
|-------|-----|
| `Execution failed for task ':app:processReleaseResources'` | Check resource file names (no uppercase, no special chars) |
| `No signing certificate` | Add your Apple Developer account in Xcode → Preferences → Accounts |
| `Pod install failed` | Run `cd ios/App && pod repo update && pod install` |
| `Gradle build failed` | Ensure JDK 17 is installed (Android Studio includes it) |

### Testing Checklist Before Store Submission

- [ ] Remove `server` block from `capacitor.config.json`
- [ ] Run `npm run build` → `npx cap sync`
- [ ] Firebase config files added (`google-services.json` / `GoogleService-Info.plist`)
- [ ] APNs key uploaded to Firebase (for iOS push notifications)
- [ ] All permissions declared (Android Manifest / iOS Info.plist)
- [ ] Push Notifications and Background Modes capabilities added (iOS)
- [ ] CocoaPods installed (`pod install` in `ios/App/`)
- [ ] Tested on a real device (not just emulator)
- [ ] Push notifications working (including lock screen and background)
- [ ] Notification channels created (trip_requests_v2, sos_alerts_v2, general_v2)
- [ ] Location tracking working (foreground and background)
- [ ] Camera/QR scanner working
- [ ] App icon and splash screen configured
- [ ] Version and build numbers set correctly
- [ ] Demo account configured for app review
- [ ] Privacy policy URL accessible
- [ ] Full-screen intent permission granted (Android: Settings → Apps → HDA APP → Notifications)

---

## Legal Pages & Privacy Policy

Your app includes built-in legal pages accessible at:

- **Privacy Policy:** `https://hdacity.lovable.app/privacy`
- **Terms of Service:** `https://hdacity.lovable.app/terms`

Use these URLs when submitting to both stores. The content is managed from the admin panel.

Drivers and passengers can access these pages from:
- The side menu (Terms of Service and Privacy Policy links)
- Direct URL in any browser

---

## Important Security Notes

- **Never commit your keystore password** to Git — use environment variables or a `.gitignore`'d properties file
- **Back up your keystore file** in at least 2 secure locations — losing it means you can never update your Android app on the same listing
- **Keep your APNs `.p8` key secure** — it grants access to send push notifications to all your iOS users
- **Test on real devices** before submitting to stores — emulators do not fully replicate push notification behavior
- **For development/testing**, keep the `server` block in `capacitor.config.json` to use hot-reload from Lovable
- **For production/release**, ALWAYS remove the `server` block

---

*Last updated: March 2026*
