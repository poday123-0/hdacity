# HDA TAXI — Native App Build & Publish Guide

Complete step-by-step guide to build and publish the HDA TAXI app to Google Play Store and Apple App Store using Capacitor.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Initial Setup](#initial-setup)
3. [Android Permissions & Config](#android-permissions--config)
4. [iOS Permissions & Config](#ios-permissions--config)
5. [Custom Notification Sounds](#custom-notification-sounds)
6. [Android Build & Publish](#android-build--publish)
7. [iOS Build & Publish](#ios-build--publish)
8. [Ongoing Updates](#ongoing-updates)
9. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Accounts Required

| Account | Cost | Link |
|---------|------|------|
| Google Play Developer | $25 one-time | https://play.google.com/console/signup |
| Apple Developer Program | $99/year | https://developer.apple.com/programs/ |

### Software Required

| Software | Platform | Download |
|----------|----------|----------|
| Node.js (v18+) | All | https://nodejs.org/ |
| Android Studio | Windows/Mac/Linux | https://developer.android.com/studio |
| Xcode (v15+) | Mac only | Mac App Store |
| Git | All | https://git-scm.com/ |
| CocoaPods | Mac only | `sudo gem install cocoapods` |

---

## Initial Setup

### 1. Export from Lovable to GitHub

1. In Lovable editor, go to **Settings → GitHub**
2. Click **Connect project** and authorize the Lovable GitHub App
3. Click **Create Repository** to push your code to GitHub

### 2. Clone the Repository

```bash
git clone https://github.com/YOUR_USERNAME/hdacity.git
cd hdacity
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Build Web Assets

```bash
npm run build
```

### 5. Add Native Platforms

```bash
npx cap add android
npx cap add ios
```

### 6. Sync

```bash
npx cap sync
```

---

## Android Permissions & Config

After running `npx cap add android`, you MUST add the following permissions to `android/app/src/main/AndroidManifest.xml`.

Open the file and add these permissions **inside `<manifest>` but before `<application>`**:

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

    <application
        ...
```

### Firebase Config for Push Notifications

1. Go to [Firebase Console](https://console.firebase.google.com/) → Project **hda-taxi**
2. Go to **Project Settings → General**
3. Under **Your apps**, click **Add app → Android**
4. Use package name: `app.lovable.2395a37356b54f26bbd1d3b6b03e71bd`
5. Download `google-services.json`
6. Place it in `android/app/google-services.json`

### Add Google Services plugin

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

### Minimum SDK & Target SDK

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

---

## iOS Permissions & Config

After running `npx cap add ios`, you MUST add usage descriptions to `ios/App/App/Info.plist`.

Open the file and add these entries **inside the top-level `<dict>`**:

```xml
<!-- Location permissions -->
<key>NSLocationWhenInUseUsageDescription</key>
<string>HDA TAXI needs your location to find nearby drivers and show your position on the map.</string>

<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
<string>HDA TAXI needs your location to track your ride and provide accurate ETAs.</string>

<key>NSLocationAlwaysUsageDescription</key>
<string>HDA TAXI needs background location access to track active trips.</string>

<!-- Camera permission (for QR scanner) -->
<key>NSCameraUsageDescription</key>
<string>HDA TAXI needs camera access to scan QR codes and take profile photos.</string>

<!-- Photo library permission -->
<key>NSPhotoLibraryUsageDescription</key>
<string>HDA TAXI needs photo library access to upload documents and profile photos.</string>
```

### Enable Push Notifications in Xcode

1. Open `ios/App/App.xcworkspace` in Xcode
2. Select the **App** target
3. Go to **Signing & Capabilities**
4. Click **+ Capability** → **Push Notifications**
5. Click **+ Capability** → **Background Modes** → Check **Remote notifications** and **Location updates**

### Firebase Config for iOS Push

1. In Firebase Console → Project Settings → **Add app → iOS**
2. Use bundle ID: `app.lovable.2395a37356b54f26bbd1d3b6b03e71bd`
3. Download `GoogleService-Info.plist`
4. In Xcode, right-click **App** folder → **Add Files to "App"** → select `GoogleService-Info.plist`
5. Ensure **"Copy items if needed"** and **"Add to targets: App"** are checked

### APNs Key for Firebase

1. Go to [Apple Developer](https://developer.apple.com/account/resources/authkeys/list)
2. Create a new **Key** with **Apple Push Notifications service (APNs)** enabled
3. Download the `.p8` file
4. In Firebase Console → Project Settings → **Cloud Messaging** tab
5. Under **Apple app configuration**, upload the APNs key

---

## Custom Notification Sounds

### Android Sounds

1. Download your notification sound files (`.mp3` or `.ogg` format)
2. Place them in: `android/app/src/main/res/raw/`
3. Name them to match categories:
   ```
   trip_request.mp3
   driver_arrived.mp3
   trip_accepted.mp3
   trip_completed.mp3
   trip_cancelled.mp3
   message_received.mp3
   ```

4. Create notification channels in `android/app/src/main/java/.../MainActivity.java` inside `onCreate`:

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

        NotificationChannel tripChannel = new NotificationChannel(
            "trip_requests", "Trip Requests", NotificationManager.IMPORTANCE_HIGH);
        tripChannel.setSound(
            Uri.parse("android.resource://" + getPackageName() + "/raw/trip_request"), audioAttr);
        tripChannel.setVibrationPattern(new long[]{0, 300, 100, 300, 100, 300});
        tripChannel.enableVibration(true);
        manager.createNotificationChannel(tripChannel);

        NotificationChannel sosChannel = new NotificationChannel(
            "sos_alerts", "SOS Alerts", NotificationManager.IMPORTANCE_HIGH);
        sosChannel.setVibrationPattern(new long[]{0, 500, 100, 500, 100, 500});
        sosChannel.enableVibration(true);
        manager.createNotificationChannel(sosChannel);

        NotificationChannel generalChannel = new NotificationChannel(
            "general", "General", NotificationManager.IMPORTANCE_DEFAULT);
        generalChannel.setSound(
            Uri.parse("android.resource://" + getPackageName() + "/raw/message_received"), audioAttr);
        manager.createNotificationChannel(generalChannel);
    }
}
```

### iOS Sounds

1. Convert sounds to `.caf` format:
   ```bash
   afconvert trip_request.mp3 trip_request.caf -d ima4 -f caff -v
   ```
2. Add `.caf` files to Xcode project under **App** folder
3. Ensure **"Copy items if needed"** and **"Add to targets: App"** are checked

---

## Android Build & Publish

### Development Testing

```bash
npm run build
npx cap sync android
npx cap run android
```

### Release Build

1. **IMPORTANT: Remove the `server` block** from `capacitor.config.json` so the app uses bundled files:
   ```json
   {
     "appId": "app.lovable.2395a37356b54f26bbd1d3b6b03e71bd",
     "appName": "HDA TAXI",
     "webDir": "dist",
     "plugins": { ... },
     "android": { ... },
     "ios": { ... }
   }
   ```

2. Build:
   ```bash
   npm run build
   npx cap sync android
   ```

3. **Generate a signing key** (first time only):
   ```bash
   keytool -genkey -v -keystore hdataxi-release.keystore \
     -alias hdataxi -keyalg RSA -keysize 2048 -validity 10000
   ```
   > ⚠️ **Keep this keystore file safe!** You need it for every future update.

4. **Configure signing** in `android/app/build.gradle`:
   ```gradle
   android {
       signingConfigs {
           release {
               storeFile file('../../hdataxi-release.keystore')
               storePassword 'YOUR_PASSWORD'
               keyAlias 'hdataxi'
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

5. **Build AAB** (required by Google Play):
   ```bash
   cd android
   ./gradlew bundleRelease
   ```
   Output: `android/app/build/outputs/bundle/release/app-release.aab`

6. **Build APK** (for direct install / testing):
   ```bash
   cd android
   ./gradlew assembleRelease
   ```
   Output: `android/app/build/outputs/apk/release/app-release.apk`

### Publish to Google Play Store

1. Go to [Google Play Console](https://play.google.com/console)
2. Click **Create app** → fill in App name: **HDA TAXI**
3. Complete **Store listing** (screenshots, descriptions, graphics)
4. Complete **Content rating** questionnaire
5. Go to **Production → Create new release** → Upload `.aab` file
6. Click **Review release → Start rollout**

---

## iOS Build & Publish

### Development Testing

```bash
npm run build
npx cap sync ios
npx cap open ios
```

### Release Build

1. **Remove the `server` block** from `capacitor.config.json`
2. Build:
   ```bash
   npm run build
   npx cap sync ios
   ```
3. In Xcode:
   - Select **Any iOS Device** as build target
   - **Product → Archive**
   - In Organizer, click **Distribute App → App Store Connect**

### Publish to Apple App Store

1. Go to [App Store Connect](https://appstoreconnect.apple.com)
2. Click **My Apps → + (New App)**
3. Fill in app details, screenshots, descriptions
4. Select the uploaded build
5. **Submit for Review**

---

## Ongoing Updates

```bash
git pull
npm install
npm run build
npx cap sync
npx cap run android   # or ios
```

### Version Bumping

**Android** — edit `android/app/build.gradle`:
```gradle
defaultConfig {
    versionCode 2        // Increment for each upload
    versionName "1.1.0"
}
```

**iOS** — in Xcode under **General** → Version & Build

---

## Troubleshooting

### App Keeps Crashing on Launch

| Cause | Fix |
|-------|-----|
| Wrong `server.url` in config | Ensure URL matches your Lovable project, or remove `server` block for release |
| Missing `google-services.json` | Download from Firebase Console and place in `android/app/` |
| Missing permissions | Add all required permissions to `AndroidManifest.xml` |
| SDK version mismatch | Set `minSdkVersion 23` and `targetSdkVersion 34` |
| Missing `dist/` folder | Run `npm run build` before `npx cap sync` |

### Common Issues

| Issue | Solution |
|-------|----------|
| Blank white screen | Remove `server` block from config for release builds |
| Location not working | Check permissions in manifest/Info.plist |
| Push notifications not arriving | Verify Firebase config files are in place |
| Camera not working | Add camera permission to manifest/Info.plist |
| App rejected by store | Ensure privacy policy URL is provided |

### Testing Checklist Before Store Submission

- [ ] Remove `server` block from `capacitor.config.json`
- [ ] `npm run build` → `npx cap sync` completed
- [ ] `google-services.json` (Android) or `GoogleService-Info.plist` (iOS) added
- [ ] All permissions declared
- [ ] Tested on real device (not just emulator)
- [ ] Push notifications working
- [ ] Location tracking working
- [ ] App icon and splash screen configured

---

## App Store Assets Checklist

### Google Play Store
- [ ] App icon: 512 x 512 px PNG
- [ ] Feature graphic: 1024 x 500 px
- [ ] Phone screenshots: Min 2 (16:9 or 9:16)
- [ ] Short description (80 chars)
- [ ] Full description (4000 chars)
- [ ] Privacy Policy URL

### Apple App Store
- [ ] App icon: 1024 x 1024 px
- [ ] 6.7" screenshots: 1290 x 2796 px
- [ ] 6.5" screenshots: 1284 x 2778 px
- [ ] Description, keywords, support URL
- [ ] Privacy Policy URL
- [ ] Demo account for app review

---

## Important Notes

- **Never commit your keystore password** to Git
- **Keep your keystore file backed up** — losing it means you can never update your Android app
- **Test on real devices** before submitting to stores
- **For development/testing**, keep the `server` block to use hot-reload from Lovable
- **For production/release**, ALWAYS remove the `server` block

---

*Last updated: March 2026*
