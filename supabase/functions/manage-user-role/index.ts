import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify caller is authenticated and is an admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check caller has admin role
    const { data: adminRole } = await supabaseAdmin
      .from("user_roles")
      .select("id")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!adminRole) {
      return new Response(JSON.stringify({ error: "Forbidden: admin role required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action, phone_number, user_id, role, role_id, permissions, first_name, last_name } = await req.json();

    if (action === "add") {
      // Try to find existing profile
      const { data: profiles, error: pErr } = await supabaseAdmin
        .from("profiles")
        .select("id, first_name, last_name")
        .eq("phone_number", phone_number);

      let profile: any = null;

      if (!pErr && profiles && profiles.length > 0) {
        profile = profiles[0];
      } else {
        // No existing profile — create one if name is provided
        if (!first_name || !last_name) {
          return new Response(JSON.stringify({ error: "No user found with this phone number. Provide first_name and last_name to create one." }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Create auth user first
        const { data: authUser, error: authErr } = await supabaseAdmin.auth.admin.createUser({
          phone: `+960${phone_number}`,
          phone_confirm: true,
          user_metadata: { first_name, last_name },
        });

        if (authErr) {
          return new Response(JSON.stringify({ error: `Failed to create user: ${authErr.message}` }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Create profile
        const { data: newProfile, error: profileErr } = await supabaseAdmin
          .from("profiles")
          .insert({
            id: authUser.user.id,
            first_name,
            last_name,
            phone_number,
            user_type: "Rider",
            status: "approved",
          })
          .select("id, first_name, last_name")
          .single();

        if (profileErr) {
          return new Response(JSON.stringify({ error: `Profile created but error saving: ${profileErr.message}` }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        profile = newProfile;
      }

      // Check for existing role
      const { data: existing } = await supabaseAdmin
        .from("user_roles")
        .select("id")
        .eq("user_id", profile.id)
        .eq("role", role);

      if (existing && existing.length > 0) {
        return new Response(JSON.stringify({ error: `${profile.first_name} already has the ${role} role` }), {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error: insertErr } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: profile.id, role, permissions: permissions || [] });

      if (insertErr) {
        return new Response(JSON.stringify({ error: insertErr.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true, profile }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "remove") {
      const { error: delErr } = await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("id", role_id);

      if (delErr) {
        return new Response(JSON.stringify({ error: delErr.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update_permissions") {
      const { error: updErr } = await supabaseAdmin
        .from("user_roles")
        .update({ permissions: permissions || [] })
        .eq("id", role_id);

      if (updErr) {
        return new Response(JSON.stringify({ error: updErr.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "list") {
      const { data: roles, error: rErr } = await supabaseAdmin
        .from("user_roles")
        .select("id, user_id, role, permissions, created_at")
        .in("role", ["admin", "dispatcher"])
        .order("created_at", { ascending: false });

      if (rErr) {
        return new Response(JSON.stringify({ error: rErr.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (roles && roles.length > 0) {
        const userIds = roles.map((r: any) => r.user_id);
        const { data: profiles } = await supabaseAdmin
          .from("profiles")
          .select("id, first_name, last_name, phone_number, email, user_type")
          .in("id", userIds);

        const merged = roles.map((r: any) => ({
          ...r,
          profile: profiles?.find((p: any) => p.id === r.user_id) || null,
        }));

        return new Response(JSON.stringify({ data: merged }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ data: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
