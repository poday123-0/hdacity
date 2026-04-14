#!/usr/bin/env node
/**
 * Android Native Setup Script
 * Automates ALL Gradle, Manifest, and MainActivity changes after `npx cap add android`
 * 
 * Usage: node scripts/setup-android.cjs
 * Run AFTER: npx cap add android && npm run build && npx cap sync
 */
const fs = require('fs');
const path = require('path');

const ANDROID_DIR = path.join(__dirname, '..', 'android');
const APP_DIR = path.join(ANDROID_DIR, 'app');

// ─── Config ───────────────────────────────────────────────────────
const CONFIG = {
  appId: 'com.hdataxi.passenger',
  appName: 'HDA APP',
  targetSdk: 35,
  minSdk: 22,
  versionCode: 61,
  versionName: '2.0.3',
};

let changesMade = 0;

function logStep(msg) { console.log(`\n🔧 ${msg}`); }
function logDone(msg) { console.log(`   ✅ ${msg}`); changesMade++; }
function logSkip(msg) { console.log(`   ⏭️  ${msg}`); }
function logWarn(msg) { console.log(`   ⚠️  ${msg}`); }

// ─── 1. Remove server block from capacitor.config.json ────────────
function removeServerBlock() {
  logStep('Removing server block from capacitor.config.json');
  const configPath = path.join(__dirname, '..', 'capacitor.config.json');
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(raw);
    if (config.server) {
      delete config.server;
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
      logDone('Removed server block');
    } else {
      logSkip('No server block found — already clean');
    }
  } catch (err) {
    logWarn('Could not process capacitor.config.json: ' + err.message);
  }
}

// ─── 2. Update app/build.gradle ───────────────────────────────────
function updateAppBuildGradle() {
  logStep('Updating app/build.gradle');
  const gradlePath = path.join(APP_DIR, 'build.gradle');
  if (!fs.existsSync(gradlePath)) {
    logWarn('app/build.gradle not found — run npx cap add android first');
    return;
  }

  let content = fs.readFileSync(gradlePath, 'utf8');

  // Update targetSdkVersion
  content = content.replace(
    /targetSdkVersion\s+\d+/,
    `targetSdkVersion ${CONFIG.targetSdk}`
  );
  
  // Update minSdkVersion
  content = content.replace(
    /minSdkVersion\s+\d+/,
    `minSdkVersion ${CONFIG.minSdk}`
  );

  // Update versionCode
  content = content.replace(
    /versionCode\s+\d+/,
    `versionCode ${CONFIG.versionCode}`
  );

  // Update versionName
  content = content.replace(
    /versionName\s+"[^"]*"/,
    `versionName "${CONFIG.versionName}"`
  );

  // Add Firebase plugin at the bottom if not present
  if (!content.includes("com.google.gms.google-services")) {
    content += "\napply plugin: 'com.google.gms.google-services'\n";
  }

  fs.writeFileSync(gradlePath, content, 'utf8');
  logDone(`Updated build.gradle (target SDK ${CONFIG.targetSdk}, min SDK ${CONFIG.minSdk})`);
}

// ─── 3. Update project-level build.gradle ─────────────────────────
function updateProjectBuildGradle() {
  logStep('Updating project-level build.gradle');
  const gradlePath = path.join(ANDROID_DIR, 'build.gradle');
  if (!fs.existsSync(gradlePath)) {
    logWarn('Project build.gradle not found');
    return;
  }

  let content = fs.readFileSync(gradlePath, 'utf8');

  if (!content.includes('google-services')) {
    // Add google-services classpath in dependencies block
    content = content.replace(
      /(dependencies\s*\{)/,
      `$1\n        classpath 'com.google.gms:google-services:4.4.0'`
    );
    fs.writeFileSync(gradlePath, content, 'utf8');
    logDone('Added google-services classpath');
  } else {
    logSkip('google-services classpath already present');
  }
}

// ─── 4. Update AndroidManifest.xml with permissions ───────────────
function updateManifest() {
  logStep('Updating AndroidManifest.xml with permissions');
  const manifestPath = path.join(APP_DIR, 'src', 'main', 'AndroidManifest.xml');
  if (!fs.existsSync(manifestPath)) {
    logWarn('AndroidManifest.xml not found');
    return;
  }

  let content = fs.readFileSync(manifestPath, 'utf8');

  const permissions = [
    'android.permission.ACCESS_FINE_LOCATION',
    'android.permission.ACCESS_COARSE_LOCATION',
    'android.permission.ACCESS_BACKGROUND_LOCATION',
    'android.permission.CAMERA',
    'android.permission.FOREGROUND_SERVICE',
    'android.permission.FOREGROUND_SERVICE_LOCATION',
    'android.permission.USE_FULL_SCREEN_INTENT',
    'android.permission.POST_NOTIFICATIONS',
    'android.permission.INTERNET',
    'android.permission.RECEIVE_BOOT_COMPLETED',
    'android.permission.VIBRATE',
    'android.permission.WAKE_LOCK',
    'android.permission.SYSTEM_ALERT_WINDOW',
  ];

  let added = 0;
  for (const perm of permissions) {
    if (!content.includes(perm)) {
      content = content.replace(
        '<application',
        `<uses-permission android:name="${perm}" />\n    <application`
      );
      added++;
    }
  }

  // Add Firebase default notification icon meta-data inside <application>
  if (!content.includes('default_notification_icon')) {
    content = content.replace(
      '</application>',
      `\n        <meta-data android:name="com.google.firebase.messaging.default_notification_icon" android:resource="@mipmap/ic_stat_notification" />\n    </application>`
    );
    added++;
    logDone('Added Firebase default_notification_icon meta-data');
  }

  // Add FloatingBubbleService inside <application>
  if (!content.includes('FloatingBubbleService')) {
    content = content.replace(
      '</application>',
      `\n        <service
            android:name=".plugins.FloatingBubbleService"
            android:exported="false"
            android:foregroundServiceType="specialUse" />\n    </application>`
    );
    added++;
    logDone('Added FloatingBubbleService to manifest');
  }

  fs.writeFileSync(manifestPath, content, 'utf8');
  if (added > 0) {
    logDone(`Added ${added} permissions/meta-data/service entries`);
  } else {
    logSkip('All permissions and meta-data already present');
  }
}

// ─── 5. Update strings.xml ────────────────────────────────────────
function updateStringsXml() {
  logStep('Updating strings.xml with app name');
  const stringsPath = path.join(APP_DIR, 'src', 'main', 'res', 'values', 'strings.xml');
  if (!fs.existsSync(stringsPath)) {
    logWarn('strings.xml not found');
    return;
  }

  let content = fs.readFileSync(stringsPath, 'utf8');
  content = content.replace(
    /<string name="app_name">[^<]*<\/string>/,
    `<string name="app_name">${CONFIG.appName}</string>`
  );
  
  // Add custom strings for notification channels if not present
  if (!content.includes('trip_channel_name')) {
    content = content.replace(
      '</resources>',
      `    <string name="trip_channel_name">Trip Requests</string>\n` +
      `    <string name="sos_channel_name">SOS Alerts</string>\n` +
      `    <string name="general_channel_name">General</string>\n` +
      `</resources>`
    );
  }

  fs.writeFileSync(stringsPath, content, 'utf8');
  logDone(`Set app name to "${CONFIG.appName}"`);
}

// ─── 6. Replace MainActivity.java with notification channels + plugin ──
function updateMainActivity() {
  logStep('Updating MainActivity.java with notification channels + FloatingBubble plugin');
  
  // Find the MainActivity.java file
  const javaBase = path.join(APP_DIR, 'src', 'main', 'java');
  const packagePath = CONFIG.appId.replace(/\./g, path.sep);
  const activityPath = path.join(javaBase, packagePath, 'MainActivity.java');
  
  if (!fs.existsSync(activityPath)) {
    logWarn(`MainActivity.java not found at ${activityPath}`);
    // Try to find it
    const altPaths = findFile(javaBase, 'MainActivity.java');
    if (altPaths.length > 0) {
      logWarn(`Found at: ${altPaths[0]}`);
    }
    return;
  }

  const mainActivityContent = `package ${CONFIG.appId};

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;
import com.hdataxi.passenger.plugins.FloatingBubblePlugin;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Register the FloatingBubble plugin before super.onCreate
        registerPlugin(FloatingBubblePlugin.class);

        super.onCreate(savedInstanceState);

        // Enable edge-to-edge so env(safe-area-inset-bottom) works with 3-button nav
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        // Make status bar and nav bar transparent
        getWindow().setStatusBarColor(android.graphics.Color.TRANSPARENT);
        getWindow().setNavigationBarColor(android.graphics.Color.TRANSPARENT);

        createNotificationChannels();
    }

    private void createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager manager = getSystemService(NotificationManager.class);

            // Delete old channel so sound setting takes effect
            // (Android won't update sound on an existing channel)
            manager.deleteNotificationChannel("trip_requests_v2");

            // Custom sound URI pointing to res/raw/trip_request.mp3
            Uri tripSoundUri = Uri.parse("android.resource://" + getPackageName() + "/raw/trip_request");
            AudioAttributes audioAttr = new AudioAttributes.Builder()
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .build();

            // Trip Requests — MAX priority with custom sound
            NotificationChannel tripChannel = new NotificationChannel(
                "trip_requests_v2",
                "Trip Requests",
                NotificationManager.IMPORTANCE_MAX
            );
            tripChannel.setDescription("Incoming trip request alerts");
            tripChannel.setSound(tripSoundUri, audioAttr);
            tripChannel.enableVibration(true);
            tripChannel.setShowBadge(true);
            tripChannel.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
            manager.createNotificationChannel(tripChannel);

            // SOS Alerts — MAX priority for emergency alerts
            NotificationChannel sosChannel = new NotificationChannel(
                "sos_alerts_v2",
                "SOS Alerts",
                NotificationManager.IMPORTANCE_MAX
            );
            sosChannel.setDescription("Emergency SOS alerts");
            sosChannel.enableVibration(true);
            sosChannel.setShowBadge(true);
            sosChannel.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
            manager.createNotificationChannel(sosChannel);

            // General — HIGH priority for general notifications
            NotificationChannel generalChannel = new NotificationChannel(
                "general_v2",
                "General",
                NotificationManager.IMPORTANCE_HIGH
            );
            generalChannel.setDescription("General notifications");
            generalChannel.enableVibration(true);
            manager.createNotificationChannel(generalChannel);
        }
    }
}
`;

  fs.writeFileSync(activityPath, mainActivityContent, 'utf8');
  logDone('Wrote MainActivity.java with notification channels + FloatingBubble plugin');
}

// ─── 7. Check for google-services.json ────────────────────────────
function checkFirebaseConfig() {
  logStep('Checking for Firebase config');
  const gsPath = path.join(APP_DIR, 'google-services.json');
  if (fs.existsSync(gsPath)) {
    logDone('google-services.json found');
  } else {
    logWarn('google-services.json NOT found — copy it to android/app/ for push notifications');
  }
}

// ─── 8. Copy native plugin files ──────────────────────────────────
function copyNativePluginFiles() {
  logStep('Copying FloatingBubble native plugin files');
  
  const javaBase = path.join(APP_DIR, 'src', 'main', 'java');
  const packagePath = CONFIG.appId.replace(/\./g, path.sep);
  const pluginsDir = path.join(javaBase, packagePath, 'plugins');
  const drawableDir = path.join(APP_DIR, 'src', 'main', 'res', 'drawable');
  
  // Create directories
  if (!fs.existsSync(pluginsDir)) {
    fs.mkdirSync(pluginsDir, { recursive: true });
    logDone(`Created plugins directory: ${pluginsDir}`);
  }
  if (!fs.existsSync(drawableDir)) {
    fs.mkdirSync(drawableDir, { recursive: true });
  }
  
  const nativeDir = path.join(__dirname, '..', 'android-native');
  
  // Copy Java files
  const filesToCopy = [
    { src: 'FloatingBubblePlugin.java', dest: path.join(pluginsDir, 'FloatingBubblePlugin.java') },
    { src: 'FloatingBubbleService.java', dest: path.join(pluginsDir, 'FloatingBubbleService.java') },
    { src: 'bubble_bg.xml', dest: path.join(drawableDir, 'bubble_bg.xml') },
  ];
  
  for (const file of filesToCopy) {
    const srcPath = path.join(nativeDir, file.src);
    if (fs.existsSync(srcPath)) {
      fs.copyFileSync(srcPath, file.dest);
      logDone(`Copied ${file.src}`);
    } else {
      logWarn(`Source file not found: ${srcPath}`);
    }
  }
}

// ─── Helper: find file recursively ────────────────────────────────
function findFile(dir, filename) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      results.push(...findFile(fullPath, filename));
    } else if (item.name === filename) {
      results.push(fullPath);
    }
  }
  return results;
}

// ─── Run all steps ────────────────────────────────────────────────
console.log('🚀 HDA Android Setup Script');
console.log('═'.repeat(50));

if (!fs.existsSync(ANDROID_DIR)) {
  console.error('\n❌ android/ directory not found!');
  console.error('   Run: npx cap add android');
  process.exit(1);
}

removeServerBlock();
updateAppBuildGradle();
updateProjectBuildGradle();
updateManifest();
updateStringsXml();
updateMainActivity();
copyNativePluginFiles();
checkFirebaseConfig();

console.log('\n' + '═'.repeat(50));
console.log(`✅ Done! ${changesMade} changes applied.`);
console.log('\n📋 Remaining manual steps:');
console.log('   1. Copy google-services.json → android/app/ (if not done)');
console.log('   2. Add app icons via Android Studio → Image Asset tool');
console.log('   3. (Optional) Add signing config for release builds');
console.log('   4. Run: npx cap sync && npx cap run android');
console.log('\n📱 Floating Bubble:');
console.log('   • Users must enable "Display over other apps" in Android Settings');
console.log('   • The bubble shows when a trip request arrives while app is minimized');
