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

  // Import the RSA private key
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

  // Exchange JWT for access token
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
      try {
        return { ok: res.ok, status: res.status, data: JSON.parse(text) };
      } catch {
        return { ok: false, status: res.status, data: text };
      }
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
      .select("token, user_id")
      .in("user_id", user_ids)
      .eq("is_active", true);

    if (tokenError) throw tokenError;
    if (!tokens || tokens.length === 0) {
      return new Response(
        JSON.stringify({ success: true, sent: 0, message: "No active tokens found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let totalSent = 0;
    const failedTokens: string[] = [];

    // FCM v1 sends one message at a time (or use batch endpoint)
    const results = await Promise.allSettled(
      tokens.map(async (t: any) => {
        // Send as data-only message so the service worker ALWAYS handles it,
        // even when the app is closed/minimized. The SW will show the notification.
        const result = await sendOne({
          token: t.token,
          data: {
            title: title || "Notification",
            body: body || "",
            ...(data || {}),
          },
          android: { priority: "high" },
          webpush: {
            headers: { Urgency: "high", TTL: "86400" },
          },
        });

        if (result.ok) {
          totalSent++;
        } else {
          const errMsg = result.data?.error?.details?.[0]?.errorCode || result.data?.error?.status || "";
          if (errMsg === "UNREGISTERED" || errMsg === "INVALID_ARGUMENT") {
            failedTokens.push(t.token);
          }
        }
        return result;
      })
    );

    // Deactivate invalid tokens
    if (failedTokens.length > 0) {
      await supabase
        .from("device_tokens")
        .update({ is_active: false })
        .in("token", failedTokens);
    }

    return new Response(
      JSON.stringify({
        success: true,
        sent: totalSent,
        failed: failedTokens.length,
        total_tokens: tokens.length,
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
