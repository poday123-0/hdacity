#!/usr/bin/env node
/**
 * Android Native Setup Script
 * Automates ALL Gradle, Manifest, and MainActivity changes after `npx cap add android`
 * 
 * Usage: node scripts/setup-android.js
 * Run AFTER: npx cap add android && npm run build && npx cap sync
 */
const fs = require('fs');
const path = require('path');

const ANDROID_DIR = path.join(__dirname, '..', 'android');
const APP_DIR = path.join(ANDROID_DIR, 'app');

// ─── Config ───────────────────────────────────────────────────────
const CONFIG = {
  appId: 'com.hda.app',
  appName: 'HDA APP',
  targetSdk: 35,
  minSdk: 22,
  versionCode: 1,
  versionName: '1.0.0',
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
    'android.permission.FOREGROUND_SERVICE',
    'android.permission.FOREGROUND_SERVICE_LOCATION',
    'android.permission.USE_FULL_SCREEN_INTENT',
    'android.permission.POST_NOTIFICATIONS',
    'android.permission.INTERNET',
    'android.permission.RECEIVE_BOOT_COMPLETED',
    'android.permission.VIBRATE',
    'android.permission.WAKE_LOCK',
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

  fs.writeFileSync(manifestPath, content, 'utf8');
  if (added > 0) {
    logDone(`Added ${added} permissions/meta-data entries`);
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

// ─── 6. Replace MainActivity.java with notification channels ──────
function updateMainActivity() {
  logStep('Updating MainActivity.java with notification channels');
  
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
import android.os.Build;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        createNotificationChannels();
    }

    private void createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager manager = getSystemService(NotificationManager.class);

            // Trip Requests — MAX priority for immediate driver alerts
            NotificationChannel tripChannel = new NotificationChannel(
                "trip_requests_v2",
                "Trip Requests",
                NotificationManager.IMPORTANCE_MAX
            );
            tripChannel.setDescription("Incoming trip request alerts");
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
  logDone('Wrote MainActivity.java with 3 notification channels');
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
checkFirebaseConfig();

console.log('\n' + '═'.repeat(50));
console.log(`✅ Done! ${changesMade} changes applied.`);
console.log('\n📋 Remaining manual steps:');
console.log('   1. Copy google-services.json → android/app/ (if not done)');
console.log('   2. Add app icons via Android Studio → Image Asset tool');
console.log('   3. (Optional) Add signing config for release builds');
console.log('   4. Run: npx cap sync && npx cap run android');
