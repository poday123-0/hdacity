# HDA TAXI — Native App Build & Publish Guide

Complete step-by-step guide to build and publish the HDA TAXI app to Google Play Store and Apple App Store using Capacitor.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Initial Setup](#initial-setup)
3. [Custom Notification Sounds](#custom-notification-sounds)
4. [Android Build & Publish](#android-build--publish)
5. [iOS Build & Publish](#ios-build--publish)
6. [Ongoing Updates](#ongoing-updates)
7. [Troubleshooting](#troubleshooting)

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

### 4. Add Native Platforms

```bash
npx cap add android
npx cap add ios
```

### 5. Build & Sync

```bash
npm run build
npx cap sync
```

### 6. Verify Configuration

Your `capacitor.config.json` should contain:

```json
{
  "appId": "app.lovable.2395a37356b54f26bbd1d3b6b03e71bd",
  "appName": "hdacity",
  "webDir": "dist",
  "server": {
    "url": "https://2395a373-56b5-4f26-bbd1-d3b6b03e71bd.lovableproject.com?forceHideBadge=true",
    "cleartext": true
  }
}
```

> **Important**: The `server.url` enables live hot-reload during development. **Remove the entire `server` block before building a release version** so the app uses the bundled local files.

---

## Custom Notification Sounds

Custom sounds allow notifications to play admin-uploaded audio even when the app is fully closed.

### Android Sounds

1. Download your notification sound files (`.mp3` or `.ogg` format)
2. Place them in:
   ```
   android/app/src/main/res/raw/
   ```
3. Name them to match categories:
   ```
   android/app/src/main/res/raw/trip_request.mp3
   android/app/src/main/res/raw/driver_arrived.mp3
   android/app/src/main/res/raw/trip_accepted.mp3
   android/app/src/main/res/raw/trip_started.mp3
   android/app/src/main/res/raw/trip_completed.mp3
   android/app/src/main/res/raw/trip_cancelled.mp3
   android/app/src/main/res/raw/message_received.mp3
   ```

4. Create notification channels in `android/app/src/main/java/app/lovable/.../MainActivity.java`:

   Add this inside the `onCreate` method:

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

           // Trip Requests channel (high priority)
           NotificationChannel tripChannel = new NotificationChannel(
               "trip_requests", "Trip Requests", NotificationManager.IMPORTANCE_HIGH);
           tripChannel.setSound(
               Uri.parse("android.resource://" + getPackageName() + "/raw/trip_request"), audioAttr);
           tripChannel.setVibrationPattern(new long[]{0, 300, 100, 300, 100, 300});
           tripChannel.enableVibration(true);
           manager.createNotificationChannel(tripChannel);

           // SOS Alerts channel
           NotificationChannel sosChannel = new NotificationChannel(
               "sos_alerts", "SOS Alerts", NotificationManager.IMPORTANCE_HIGH);
           sosChannel.setVibrationPattern(new long[]{0, 500, 100, 500, 100, 500});
           sosChannel.enableVibration(true);
           manager.createNotificationChannel(sosChannel);

           // General notifications channel
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
   afconvert driver_arrived.mp3 driver_arrived.caf -d ima4 -f caff -v
   afconvert trip_completed.mp3 trip_completed.caf -d ima4 -f caff -v
   afconvert trip_cancelled.mp3 trip_cancelled.caf -d ima4 -f caff -v
   afconvert message_received.mp3 message_received.caf -d ima4 -f caff -v
   ```

2. Add `.caf` files to Xcode:
   - Open `ios/App/App.xcworkspace` in Xcode
   - Right-click the **App** folder → **Add Files to "App"**
   - Select all `.caf` files
   - Ensure **"Copy items if needed"** and **"Add to targets: App"** are checked

3. The edge function already sends `apns.payload.aps.sound` — just ensure the filename matches (e.g., `trip_request.caf`).

---

## Android Build & Publish

### Development Testing

```bash
# Build web assets and sync
npm run build
npx cap sync android

# Open in Android Studio
npx cap open android

# Or run directly on connected device/emulator
npx cap run android
```

### Release Build

1. **Remove the `server` block** from `capacitor.config.json` (so the app uses bundled files, not the live URL)

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
   > ⚠️ **Keep this keystore file safe!** You need it for every future update. If you lose it, you cannot update your app on Google Play.

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

5. **Build AAB** (Android App Bundle — required by Google Play):
   ```bash
   cd android
   ./gradlew bundleRelease
   ```
   Output: `android/app/build/outputs/bundle/release/app-release.aab`

### Publish to Google Play Store

1. Go to [Google Play Console](https://play.google.com/console)
2. Click **Create app**
3. Fill in:
   - App name: **HDA TAXI**
   - Default language: **English**
   - App or Game: **App**
   - Free or Paid: Choose accordingly
4. Complete the **Store listing**:
   - Short description (80 chars max)
   - Full description (4000 chars max)
   - Screenshots: At least 2 phone screenshots (min 320px, max 3840px)
   - Feature graphic: 1024 x 500 px
   - App icon: 512 x 512 px
5. Complete **Content rating** questionnaire
6. Set up **Pricing & distribution**
7. Go to **Production → Create new release**
8. Upload the `.aab` file
9. Add release notes
10. Click **Review release → Start rollout to production**
11. Wait for review (typically 1–3 days for first submission)

---

## iOS Build & Publish

### Prerequisites (Mac only)

```bash
# Install CocoaPods if not installed
sudo gem install cocoapods

# Sync iOS project
npm run build
npx cap sync ios
```

### Development Testing

```bash
# Open in Xcode
npx cap open ios

# Or run on simulator
npx cap run ios
```

### Configure Xcode Project

1. Open `ios/App/App.xcworkspace` in Xcode
2. Select the **App** target
3. Under **Signing & Capabilities**:
   - Set Team to your Apple Developer account
   - Set Bundle Identifier: `app.lovable.2395a37356b54f26bbd1d3b6b03e71bd`
4. Under **General**:
   - Set Display Name: **HDA TAXI**
   - Set Version and Build number
5. Add **Push Notifications** capability:
   - Click **+ Capability** → **Push Notifications**
6. Add **Background Modes** capability:
   - Check **Remote notifications**

### Release Build

1. **Remove the `server` block** from `capacitor.config.json`

2. Build:
   ```bash
   npm run build
   npx cap sync ios
   ```

3. In Xcode:
   - Select **Any iOS Device** as the build target
   - Go to **Product → Archive**
   - Wait for archive to complete
   - In the **Organizer** window, click **Distribute App**
   - Choose **App Store Connect**
   - Follow the prompts to upload

### Publish to Apple App Store

1. Go to [App Store Connect](https://appstoreconnect.apple.com)
2. Click **My Apps → + (New App)**
3. Fill in:
   - Platform: **iOS**
   - Name: **HDA TAXI**
   - Primary Language: **English**
   - Bundle ID: Select from dropdown
   - SKU: `hdataxi` (any unique string)
4. Complete the **App Information**:
   - Privacy Policy URL (required)
   - Category: **Travel** or **Transportation**
5. Add **Screenshots** (required sizes):
   - 6.7" display (iPhone 15 Pro Max): 1290 x 2796 px
   - 6.5" display (iPhone 14 Plus): 1284 x 2778 px
   - iPad Pro 12.9": 2048 x 2732 px (if supporting iPad)
6. Fill in **Description**, **Keywords**, **Support URL**
7. Under **Build**, select the uploaded build
8. Complete the **App Review Information**:
   - Contact info
   - Demo account credentials (provide a test login)
   - Notes for reviewer
9. Click **Submit for Review**
10. Wait for review (typically 1–2 days)

---

## Ongoing Updates

After making changes in Lovable, the code auto-syncs to GitHub. To update your native apps:

### Quick Update Workflow

```bash
# 1. Pull latest changes
git pull

# 2. Install any new dependencies
npm install

# 3. Build web assets
npm run build

# 4. Sync to native platforms
npx cap sync

# 5. Test on device
npx cap run android   # or ios

# 6. Build release (when ready)
cd android && ./gradlew bundleRelease   # Android
# Or in Xcode: Product → Archive          # iOS
```

### Version Bumping

**Android** — edit `android/app/build.gradle`:
```gradle
android {
    defaultConfig {
        versionCode 2        // Increment for each upload
        versionName "1.1.0"  // User-visible version
    }
}
```

**iOS** — in Xcode under **General**:
- Version: `1.1.0` (user-visible)
- Build: `2` (increment for each upload)

---

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| `npx cap sync` fails | Run `npm run build` first — the `dist/` folder must exist |
| Android build fails with SDK error | Open Android Studio → SDK Manager → Install required SDK |
| iOS signing error | Ensure your Apple Developer account is configured in Xcode → Preferences → Accounts |
| Push notifications not working on device | Ensure `google-services.json` (Android) or `GoogleService-Info.plist` (iOS) is added from Firebase Console |
| App shows blank screen | Make sure you removed the `server` block from `capacitor.config.json` for release builds |
| Sounds not playing when closed | Verify sound files are in `res/raw/` (Android) or added to Xcode target (iOS) |

### Firebase Setup for Native Push

1. Go to [Firebase Console](https://console.firebase.google.com/) → Project **hda-taxi**
2. **Android**: Download `google-services.json` → place in `android/app/`
3. **iOS**: Download `GoogleService-Info.plist` → add to Xcode project under `ios/App/App/`

### Testing Push Notifications

Use the Firebase Console → Cloud Messaging → Send test message, or use the admin panel's notification feature to test on a real device.

---

## App Store Assets Checklist

### Google Play Store
- [ ] App icon: 512 x 512 px PNG
- [ ] Feature graphic: 1024 x 500 px
- [ ] Phone screenshots: Min 2, recommended 8 (16:9 or 9:16)
- [ ] Short description (80 chars)
- [ ] Full description (4000 chars)
- [ ] Privacy Policy URL
- [ ] Content rating questionnaire completed

### Apple App Store
- [ ] App icon: 1024 x 1024 px (no transparency, no rounded corners)
- [ ] 6.7" screenshots: 1290 x 2796 px
- [ ] 6.5" screenshots: 1284 x 2778 px
- [ ] iPad screenshots (if supporting iPad)
- [ ] Description, keywords, support URL
- [ ] Privacy Policy URL
- [ ] Demo account for app review
- [ ] App Review notes

---

## Important Notes

- **Never commit your keystore password** to Git. Use environment variables or a local properties file.
- **Keep your keystore file backed up** — losing it means you can never update your Android app.
- **Test on real devices** before submitting to stores — emulators don't fully test push notifications.
- **For development/testing**, keep the `server` block in `capacitor.config.json` to use hot-reload from Lovable's preview.
- **For production/release builds**, always remove the `server` block so the app uses bundled local files.

---

*Last updated: March 2026*
