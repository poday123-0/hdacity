import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface AdminPermissions {
  permissions: string[];
  role: string | null;
  loading: boolean;
  hasPermission: (key: string) => boolean;
  /**
   * Mask a phone number when the current admin/dispatcher does NOT have
   * the `view_phone_numbers` permission. Real admins (with no specific
   * restrictions) and users granted view_phone_numbers see the full number.
   */
  maskPhone: (phone: string | null | undefined) => string;
}

/**
 * Loads the current admin's role + permissions from user_roles using the
 * profile id stored in localStorage by Admin.tsx (`hda_admin`).
 * Exposes a maskPhone helper for hiding numbers from restricted admins.
 */
export function useAdminPermissions(): AdminPermissions {
  const [permissions, setPermissions] = useState<string[]>([]);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const stored = localStorage.getItem("hda_admin") || localStorage.getItem("hda_dispatcher");
        if (!stored) {
          if (!cancelled) setLoading(false);
          return;
        }
        const parsed = JSON.parse(stored);
        if (!parsed?.id) {
          if (!cancelled) setLoading(false);
          return;
        }
        const { data } = await supabase
          .from("user_roles")
          .select("role, permissions")
          .eq("user_id", parsed.id)
          .order("role", { ascending: true });
        if (cancelled) return;
        const adminRow = (data || []).find((r: any) => r.role === "admin");
        const dispatcherRow = (data || []).find((r: any) => r.role === "dispatcher");
        const row = adminRow || dispatcherRow || null;
        setRole(row?.role || null);
        setPermissions(((row?.permissions as string[]) || []) as string[]);
      } catch {
        // ignore — defaults to no permissions
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const hasPermission = (key: string) => {
    // Admins have all permissions implicitly UNLESS the key is an opt-IN
    // restriction (like hide_phone_numbers, which is the OPPOSITE flag).
    if (role === "admin") return true;
    return permissions.includes(key);
  };

  /**
   * Hide phone numbers if the user has the `hide_phone_numbers` permission
   * flag (an opt-in restriction). Admins WITHOUT the flag see numbers.
   */
  const shouldHide = permissions.includes("hide_phone_numbers");

  const maskPhone = (phone: string | null | undefined): string => {
    if (!phone) return "";
    if (!shouldHide) return phone;
    const str = String(phone);
    if (str.length <= 3) return "•••";
    // Show last 2 digits only: "+960 ••••• 23"
    const visible = str.slice(-2);
    return `••••• ${visible}`;
  };

  return { permissions, role, loading, hasPermission, maskPhone };
}
