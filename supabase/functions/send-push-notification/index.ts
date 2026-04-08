import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encodeBase64Url } from "https://deno.land/std@0.224.0/encoding/base64url.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/** Get an OAuth2 access token from a Google Service Account JSON key */
async function getAccessToken(serviceAccount: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
  };

  const headerB64 = encodeBase64Url(new TextEncoder().encode(JSON.stringify(header)));
  const payloadB64 = encodeBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const unsignedToken = `${headerB64}.${payloadB64}`;

  const pemContents = serviceAccount.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\n/g, "");
  const binaryKey = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(unsignedToken)
  );

  const signatureB64 = encodeBase64Url(new Uint8Array(signature));
  const jwt = `${unsignedToken}.${signatureB64}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) {
    throw new Error(`Failed to get access token: ${JSON.stringify(tokenData)}`);
  }
  return tokenData.access_token;
}

/**
 * Map notification data.type to the notification_sounds category,
 * depending on whether the recipient is a driver or passenger.
 *
 * notification_sounds categories:
 *   trip_request, driver_trip_accepted, driver_arrived, driver_trip_started,
 *   driver_trip_completed, driver_trip_cancelled, driver_message_received,
 *   passenger_accepted, passenger_arrived, passenger_started,
 *   passenger_completed, passenger_cancelled, passenger_message_received
 */
function getSoundCategory(notificationType: string, recipientUserType: string): string {
  const isDriver = recipientUserType === "driver";

  switch (notificationType) {
    case "trip_requested":
      return "trip_request";
    case "trip_accepted":
      return isDriver ? "driver_trip_accepted" : "passenger_accepted";
    case "driver_arrived":
      return isDriver ? "driver_arrived" : "passenger_arrived";
    case "trip_started":
      return isDriver ? "driver_trip_started" : "passenger_started";
    case "trip_completed":
      return isDriver ? "driver_trip_completed" : "passenger_completed";
    case "trip_cancelled":
      return isDriver ? "driver_trip_cancelled" : "passenger_cancelled";
    case "message_received":
      return isDriver ? "driver_message_received" : "passenger_message_received";
    case "trip_taken":
      return "driver_trip_cancelled"; // reuse cancellation sound for trip taken
    default:
      return notificationType;
  }
}

/**
 * Map sound category to native sound file name (without extension).
 * Android: place matching .mp3 files in android/app/src/main/res/raw/
 * iOS: place matching .caf files in the Xcode project bundle
 */
function getNativeSoundName(soundCategory: string): string {
  const map: Record<string, string> = {
    trip_request: "trip_request",
    driver_trip_accepted: "trip_accepted",
    driver_arrived: "driver_arrived",
    driver_trip_started: "trip_started",
    driver_trip_completed: "trip_completed",
    driver_trip_cancelled: "trip_cancelled",
    driver_message_received: "message_received",
    passenger_accepted: "trip_accepted",
    passenger_arrived: "driver_arrived",
    passenger_started: "trip_started",
    passenger_completed: "trip_completed",
    passenger_cancelled: "trip_cancelled",
    passenger_message_received: "message_received",
  };
  return map[soundCategory] || "default";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const serviceAccountJson = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");
    if (!serviceAccountJson) {
      throw new Error("FIREBASE_SERVICE_ACCOUNT secret is not configured");
    }

    const serviceAccount = JSON.parse(serviceAccountJson);
    const projectId = serviceAccount.project_id;
    const accessToken = await getAccessToken(serviceAccount);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { user_ids, title, body, data, topic } = await req.json();

    // Fetch ALL default sounds (one per category) in a single query
    const soundMap: Record<string, string> = {};
    try {
      const { data: soundRows } = await supabase
        .from("notification_sounds")
        .select("category, file_url")
        .eq("is_default", true)
        .eq("is_active", true);
      if (soundRows) {
        for (const row of soundRows) {
          soundMap[row.category] = row.file_url;
        }
      }
    } catch {}
    console.log("Loaded default sounds for categories:", Object.keys(soundMap).join(", "));

    const fcmUrl = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

    const sendOne = async (message: any) => {
      const res = await fetch(fcmUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message }),
      });
      const text = await res.text();
      let parsed: any;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
      console.log(`FCM response [${res.status}]:`, JSON.stringify(parsed).slice(0, 500));
      return { ok: res.ok, status: res.status, data: parsed };
    };

    // Topic-based notification
    if (topic) {
      const result = await sendOne({
        topic,
        notification: { title, body },
        data: data || {},
        android: { priority: "high" },
        webpush: { headers: { Urgency: "high" } },
      });

      return new Response(JSON.stringify({ success: result.ok, result: result.data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // User-targeted notifications
    if (!user_ids || !Array.isArray(user_ids) || user_ids.length === 0) {
      throw new Error("user_ids array is required");
    }

    // For trip_requested notifications, filter out drivers who are offline or not in driver mode
    const isTripRequestType = data?.type === "trip_requested";
    let filteredUserIds = user_ids;

    if (isTripRequestType && user_ids.length > 0) {
      // Check driver_locations to see who is actually online and available
      const { data: onlineDrivers } = await supabase
        .from("driver_locations")
        .select("driver_id")
        .in("driver_id", user_ids)
        .eq("is_online", true);

      const onlineSet = new Set((onlineDrivers || []).map((d: any) => d.driver_id));

      // Also check device_tokens user_type — only send to tokens registered as "driver"
      filteredUserIds = user_ids.filter((id: string) => onlineSet.has(id));

      if (filteredUserIds.length === 0) {
        console.log("No online drivers found among user_ids — skipping trip_requested notification");
        return new Response(
          JSON.stringify({ success: true, sent: 0, message: "No online drivers found" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      console.log(`Filtered ${user_ids.length} → ${filteredUserIds.length} online driver(s) for trip_requested`);
    }

    const { data: tokens, error: tokenError } = await supabase
      .from("device_tokens")
      .select("token, user_id, device_type, user_type")
      .in("user_id", filteredUserIds)
      .eq("is_active", true);

    if (tokenError) throw tokenError;

    // For trip requests, only send to tokens registered as "driver" user_type
    const filteredTokens = isTripRequestType
      ? (tokens || []).filter((t: any) => t.user_type === "driver")
      : (tokens || []);

    if (filteredTokens.length === 0) {
      console.log("No active tokens found for user_ids:", filteredUserIds);
      return new Response(
        JSON.stringify({ success: true, sent: 0, message: "No active tokens found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${filteredTokens.length} active token(s) for user_ids:`, filteredUserIds);

    let totalSent = 0;
    const failedTokens: string[] = [];
    const perTokenResults: any[] = [];

    // Pre-fetch driver-specific trip_sound_id preferences for all target drivers
    const driverUserIds = filteredTokens
      .filter((t: any) => t.user_type === "driver")
      .map((t: any) => t.user_id);
    const driverSoundPrefs: Record<string, { sound_url: string }> = {};
    if (driverUserIds.length > 0) {
      try {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, trip_sound_id")
          .in("id", driverUserIds)
          .not("trip_sound_id", "is", null);
        if (profiles) {
          const soundIds = profiles.map((p: any) => p.trip_sound_id).filter(Boolean);
          if (soundIds.length > 0) {
            const { data: sounds } = await supabase
              .from("notification_sounds")
              .select("id, file_url")
              .in("id", soundIds)
              .eq("is_active", true);
            const soundById: Record<string, string> = {};
            if (sounds) {
              for (const s of sounds) soundById[s.id] = s.file_url;
            }
            for (const p of profiles) {
              if (p.trip_sound_id && soundById[p.trip_sound_id]) {
                driverSoundPrefs[p.id] = { sound_url: soundById[p.trip_sound_id] };
              }
            }
          }
        }
      } catch (e) {
        console.warn("Failed to load driver sound prefs:", e);
      }
    }
    console.log(`Loaded ${Object.keys(driverSoundPrefs).length} driver-specific sound preference(s)`);

    const results = await Promise.allSettled(
      filteredTokens.map(async (t: any) => {
        const type = data?.type || "default";
        const isTripRequest = type === "trip_requested";
        const isSOS = type === "sos_alert";
        const isUrgent = isTripRequest || isSOS;

        // Resolve sound category and URL based on recipient's user type
        const soundCategory = getSoundCategory(type, t.user_type || "passenger");
        // Driver's personal sound preference overrides the category default
        const driverPref = driverSoundPrefs[t.user_id];
        const soundUrl = driverPref?.sound_url || soundMap[soundCategory] || "";

        // Resolve native sound file name for Android/iOS
        const nativeSoundName = getNativeSoundName(soundCategory);
        const isNative = t.device_type === "android" || t.device_type === "ios";

        const messageData: Record<string, string> = {
          ...(data || {}),
          sound_url: soundUrl,
          sound_category: soundCategory,
          native_sound: nativeSoundName,
        };

        // For web devices, send data-only messages so the service worker's
        // onBackgroundMessage handler fires and plays custom sounds.
        // For native devices, include the notification payload for OS-level display.
        const isWebDevice = t.device_type === "web";

        // For native: play the custom bundled sound if available.
        // Android expects the raw resource name, iOS expects the bundled .caf file name.
        // Always fall back to "default" so iOS plays at least the system sound.
        const nativeBackgroundSound = isNative && nativeSoundName !== "default" ? nativeSoundName : "default";
        const iosBackgroundSound =
          isNative && nativeSoundName !== "default"
            ? `${nativeSoundName}.caf`
            : "default";

        const fcmMessage: any = {
          token: t.token,
          // Native devices: top-level notification for OS display
          ...(isWebDevice ? {} : {
            notification: {
              title: title || "Notification",
              body: body || "",
            },
          }),
          data: {
            ...messageData,
            // Pass title/body in data so foreground handler + SW can use them
            title: title || "Notification",
            body: body || "",
          },
          android: {
            priority: "high",
            ttl: isUrgent ? "0s" : "86400s",
            notification: {
              sound: nativeBackgroundSound || undefined,
              default_sound: !isTripRequest,
              channel_id: isTripRequest ? "trip_requests_v2" : isSOS ? "sos_alerts_v2" : "general_v2",
              notification_priority: isUrgent ? "PRIORITY_MAX" : "PRIORITY_HIGH",
              vibrate_timings: isTripRequest
                ? ["0.3s", "0.1s", "0.3s", "0.1s", "0.3s", "0.1s", "0.3s"]
                : ["0.2s", "0.1s", "0.2s"],
              default_vibrate_timings: false,
            },
          },
          apns: {
            headers: {
              "apns-priority": "10",
              "apns-push-type": "alert",
            },
            payload: {
              aps: {
                sound: iosBackgroundSound,
                badge: 1,
                "content-available": 1,
                "interruption-level": isUrgent ? "time-sensitive" : "active",
              },
            },
          },
          webpush: {
            headers: { Urgency: "high", TTL: "86400" },
            // Data-only for web: no webpush.notification block.
            // This ensures only the SW's onBackgroundMessage handler fires,
            // preventing duplicate notifications (browser auto-display + SW display).
            // The SW will show the notification AND play the custom admin sound.
            fcm_options: { link: isTripRequest ? "/driver" : isSOS ? "/admin" : "/" },
          },
        };

        console.log(`Sending [${soundCategory}] to ${t.device_type}/${t.user_type} token ${t.token.slice(0, 15)}... for user ${t.user_id}${soundUrl ? " with sound" : " (no sound)"}`);
        const result = await sendOne(fcmMessage);

        const tokenResult: any = {
          token_prefix: t.token.slice(0, 15),
          device_type: t.device_type,
          user_type: t.user_type,
          sound_category: soundCategory,
          has_sound: !!soundUrl,
          ok: result.ok,
          status: result.status,
        };

        if (result.ok) {
          totalSent++;
        } else {
          const errMsg = result.data?.error?.details?.[0]?.errorCode || result.data?.error?.status || "";
          tokenResult.error = errMsg;
          if (errMsg === "UNREGISTERED" || errMsg === "INVALID_ARGUMENT") {
            failedTokens.push(t.token);
          }
        }

        perTokenResults.push(tokenResult);
        return result;
      })
    );

    // Deactivate invalid tokens
    if (failedTokens.length > 0) {
      console.log(`Deactivating ${failedTokens.length} invalid token(s)`);
      await supabase
        .from("device_tokens")
        .update({ is_active: false })
        .in("token", failedTokens);
    }

    console.log("Push results:", JSON.stringify(perTokenResults));

    return new Response(
      JSON.stringify({
        success: true,
        sent: totalSent,
        failed: failedTokens.length,
        total_tokens: filteredTokens.length,
        details: perTokenResults,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Push notification error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
