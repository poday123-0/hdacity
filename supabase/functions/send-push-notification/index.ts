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

    const { data: tokens, error: tokenError } = await supabase
      .from("device_tokens")
      .select("token, user_id, device_type, user_type")
      .in("user_id", user_ids)
      .eq("is_active", true);

    if (tokenError) throw tokenError;
    if (!tokens || tokens.length === 0) {
      console.log("No active tokens found for user_ids:", user_ids);
      return new Response(
        JSON.stringify({ success: true, sent: 0, message: "No active tokens found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${tokens.length} active token(s) for user_ids:`, user_ids);

    let totalSent = 0;
    const failedTokens: string[] = [];
    const perTokenResults: any[] = [];

    const results = await Promise.allSettled(
      tokens.map(async (t: any) => {
        const type = data?.type || "default";
        const isTripRequest = type === "trip_requested";
        const isSOS = type === "sos_alert";
        const isUrgent = isTripRequest || isSOS;

        // Resolve sound category and URL based on recipient's user type
        const soundCategory = getSoundCategory(type, t.user_type || "passenger");
        const soundUrl = soundMap[soundCategory] || "";

        // Resolve native sound file name for Android/iOS
        const nativeSoundName = getNativeSoundName(soundCategory);
        const isNative = t.device_type === "android" || t.device_type === "ios";

        const messageData: Record<string, string> = {
          ...(data || {}),
          sound_url: soundUrl,
          sound_category: soundCategory,
          native_sound: nativeSoundName,
        };

        const fcmMessage: any = {
          token: t.token,
          notification: {
            title: title || "Notification",
            body: body || "",
          },
          data: messageData,
          android: {
            priority: "high",
            ttl: isUrgent ? "0s" : "86400s",
            notification: {
              // Use native sound file name for native apps, "default" for web
              sound: isNative ? nativeSoundName : "default",
              channel_id: isTripRequest ? "trip_requests" : isSOS ? "sos_alerts" : "general",
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
                // Use .caf file for native iOS, "default" for web
                sound: isNative ? `${nativeSoundName}.caf` : "default",
                badge: 1,
                "content-available": 1,
                "interruption-level": isUrgent ? "time-sensitive" : "active",
              },
            },
          },
          webpush: {
            headers: { Urgency: "high", TTL: "86400" },
            notification: {
              title: title || "Notification",
              body: body || "",
              icon: "/pwa-192x192.png",
              badge: "/pwa-192x192.png",
              tag: `${type}-${Date.now()}`,
              renotify: true,
              require_interaction: isUrgent,
              vibrate: isTripRequest
                ? [300, 100, 300, 100, 300, 100, 300]
                : isSOS
                ? [500, 100, 500, 100, 500]
                : [200, 100, 200],
            },
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
        total_tokens: tokens.length,
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
