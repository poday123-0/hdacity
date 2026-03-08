import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { useTheme } from "@/hooks/use-theme";
import {
  Menu, X, ChevronDown, ChevronRight, Pin, PinOff,
  LayoutDashboard, Users, Car, DollarSign, Settings, MapPin, Navigation, LogOut,
  Layers, Building2, Building, UserCheck, Receipt, ShieldCheck, Moon, Sun,
  PackageX, Siren, BellRing, Wallet, CreditCard, Cherry, Smartphone, MessageSquare, Trophy,
} from "lucide-react";
import AdminLocations from "@/components/admin/AdminLocations";
import { toast } from "@/hooks/use-toast";
import AdminLogin from "@/components/admin/AdminLogin";
import AdminDashboard from "@/components/admin/AdminDashboard";
import AdminDrivers from "@/components/admin/AdminDrivers";
import AdminVehicleTypes from "@/components/admin/AdminVehicleTypes";
import AdminVehicles from "@/components/admin/AdminVehicles";
import AdminVehicleMakes from "@/components/admin/AdminVehicleMakes";
import AdminFares from "@/components/admin/AdminFares";
import AdminSettings from "@/components/admin/AdminSettings";
import AdminTrips from "@/components/admin/AdminTrips";
import AdminBanks from "@/components/admin/AdminBanks";
import AdminCompanies from "@/components/admin/AdminCompanies";
import AdminPassengers from "@/components/admin/AdminPassengers";
import AdminBilling from "@/components/admin/AdminBilling";
import AdminUsers from "@/components/admin/AdminUsers";
import AdminLostItems from "@/components/admin/AdminLostItems";
import AdminSOSHistory from "@/components/admin/AdminSOSHistory";
import AdminNotifications from "@/components/admin/AdminNotifications";
import AdminWallets from "@/components/admin/AdminWallets";
import AdminTopupCards from "@/components/admin/AdminTopupCards";
import AdminWatermelons from "@/components/admin/AdminWatermelons";
import SystemLogo from "@/components/SystemLogo";
import AdminDeviceTokens from "@/components/admin/AdminDeviceTokens";
import AdminNamedLocations from "@/components/admin/AdminNamedLocations";
import AdminSMS from "@/components/admin/AdminSMS";

type Tab = "dashboard" | "passengers" | "drivers" | "vehicles" | "vehicle_types" | "vehicle_makes" | "fares" | "billing" | "wallets" | "topup_cards" | "watermelons" | "locations" | "named_locations" | "trips" | "lost_items" | "sos_history" | "banks" | "companies" | "users" | "notifications" | "sms" | "device_tokens" | "settings";

type NavGroup = {
  label: string;
  items: { id: Tab; label: string; icon: typeof LayoutDashboard }[];
};

const navGroups: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    ],
  },
  {
    label: "People",
    items: [
      { id: "passengers", label: "Passengers", icon: UserCheck },
      { id: "drivers", label: "Drivers", icon: Users },
      { id: "users", label: "Admins & Dispatch", icon: ShieldCheck },
    ],
  },
  {
    label: "Fleet",
    items: [
      { id: "vehicles", label: "All Vehicles", icon: Car },
      { id: "vehicle_types", label: "Vehicle Types", icon: Layers },
      { id: "vehicle_makes", label: "Makes & Models", icon: Car },
    ],
  },
  {
    label: "Finance",
    items: [
      { id: "fares", label: "Fares", icon: DollarSign },
      { id: "billing", label: "Billing", icon: Receipt },
      { id: "wallets", label: "Wallets", icon: Wallet },
      { id: "topup_cards", label: "Topup Cards", icon: CreditCard },
      { id: "banks", label: "Banks", icon: Building2 },
      { id: "companies", label: "Companies", icon: Building },
    ],
  },
  {
    label: "Promotions",
    items: [
      { id: "watermelons", label: "🍉 Ramadan Promos", icon: Cherry },
    ],
  },
  {
    label: "Operations",
    items: [
      { id: "trips", label: "Trips", icon: MapPin },
      { id: "locations", label: "Service Areas", icon: Navigation },
      { id: "named_locations", label: "Named Locations", icon: MapPin },
      { id: "lost_items", label: "Lost Items", icon: PackageX },
      { id: "sos_history", label: "SOS Alerts", icon: Siren },
      { id: "notifications", label: "Notifications", icon: BellRing },
      { id: "sms", label: "SMS Blast", icon: MessageSquare },
    ],
  },
  {
    label: "System",
    items: [
      { id: "device_tokens", label: "Device Tokens", icon: Smartphone },
      { id: "settings", label: "Settings", icon: Settings },
    ],
  },
];

const tabLabels = {} as Record<Tab, string>;
navGroups.forEach(g => g.items.forEach(i => { tabLabels[i.id] = i.label; }));

const Admin = () => {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    return (localStorage.getItem("hda_admin_tab") as Tab) || "dashboard";
  });
  const [adminProfile, setAdminProfile] = useState<any>(null);
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 1024);
  const [sidebarLocked, setSidebarLocked] = useState(() => {
    const stored = localStorage.getItem("hda_sidebar_locked");
    return stored === "true" || window.innerWidth >= 1024;
  });
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem("hda_nav_collapsed");
      return stored ? new Set(JSON.parse(stored)) : new Set<string>();
    } catch { return new Set<string>(); }
  });
  const { theme, toggleTheme } = useTheme();
  usePushNotifications(adminProfile?.id, "admin");

  // Persist active tab
  useEffect(() => {
    localStorage.setItem("hda_admin_tab", activeTab);
  }, [activeTab]);

  // Persist sidebar lock
  useEffect(() => {
    localStorage.setItem("hda_sidebar_locked", String(sidebarLocked));
  }, [sidebarLocked]);

  // Persist collapsed groups
  useEffect(() => {
    localStorage.setItem("hda_nav_collapsed", JSON.stringify(Array.from(collapsedGroups)));
  }, [collapsedGroups]);

  useEffect(() => {
    const stored = localStorage.getItem("hda_admin");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setAdminProfile(parsed);
        setIsAdmin(true);
      } catch {}
    }
    setLoading(false);
  }, []);

  const handleAdminLogin = async (phone: string) => {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("*")
      .eq("phone_number", phone);

    if (!profiles || profiles.length === 0) {
      toast({ title: "Access denied", description: "Profile not found", variant: "destructive" });
      return false;
    }

    const profileIds = profiles.map(p => p.id);
    const { data: allRoles } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("user_id", profileIds);

    const adminProfileMatch = profiles.find(p =>
      allRoles?.some((r: any) => r.user_id === p.id && r.role === "admin")
    );

    if (!adminProfileMatch) {
      toast({ title: "Access denied", description: "You are not an admin", variant: "destructive" });
      return false;
    }

    setAdminProfile(adminProfileMatch);
    setIsAdmin(true);
    localStorage.setItem("hda_admin", JSON.stringify(adminProfileMatch));
    return true;
  };

  const handleLogout = () => {
    setIsAdmin(false);
    setAdminProfile(null);
    localStorage.removeItem("hda_admin");
  };

  const toggleGroup = (label: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      next.has(label) ? next.delete(label) : next.add(label);
      return next;
    });
  };

  const handleTabClick = (id: Tab) => {
    setActiveTab(id);
    // On mobile, close sidebar unless locked
    if (window.innerWidth < 1024 && !sidebarLocked) {
      setSidebarOpen(false);
    }
  };

  const toggleLock = () => {
    setSidebarLocked(prev => !prev);
    if (!sidebarLocked) {
      setSidebarOpen(true);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!isAdmin) {
    return <AdminLogin onLogin={handleAdminLogin} />;
  }

  const showSidebar = sidebarOpen || sidebarLocked;

  return (
    <div className="h-dvh bg-background flex overflow-hidden">
      {/* Sidebar overlay on mobile (only when not locked) */}
      {sidebarOpen && !sidebarLocked && (
        <div className="fixed inset-0 z-40 bg-foreground/30 backdrop-blur-sm lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-card border-r border-border flex flex-col shrink-0 transition-transform duration-300 ${
        showSidebar ? "translate-x-0" : "-translate-x-full lg:translate-x-0 lg:w-0 lg:overflow-hidden lg:border-0"
      }`}>
        {/* Header */}
        <div className="px-4 py-4 flex items-center justify-between border-b border-border">
          <div className="flex items-center gap-2.5">
            <SystemLogo className="w-9 h-9 object-contain" alt="HDA" />
            <div>
              <h1 className="text-base font-extrabold text-foreground leading-tight">
                HDA <span className="text-primary">ADMIN</span>
              </h1>
              <p className="text-[10px] text-muted-foreground leading-tight">Management Panel</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {/* Lock/Unlock button */}
            <button
              onClick={toggleLock}
              className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                sidebarLocked
                  ? "text-primary bg-primary/10"
                  : "text-muted-foreground hover:text-foreground hover:bg-surface"
              }`}
              title={sidebarLocked ? "Unlock sidebar" : "Lock sidebar open"}
            >
              {sidebarLocked ? <Pin className="w-3.5 h-3.5" /> : <PinOff className="w-3.5 h-3.5" />}
            </button>
            {/* Close button (only on mobile or when not locked) */}
            {!sidebarLocked && (
              <button
                onClick={() => setSidebarOpen(false)}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-surface"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Navigation - grouped */}
        <nav className="flex-1 py-2 overflow-y-auto min-h-0">
          {navGroups.map((group) => {
            const isCollapsed = collapsedGroups.has(group.label);
            const hasActiveItem = group.items.some(i => i.id === activeTab);

            return (
              <div key={group.label} className="mb-1">
                {/* Group header */}
                <button
                  onClick={() => toggleGroup(group.label)}
                  className="w-full flex items-center justify-between px-4 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-widest hover:text-foreground transition-colors"
                >
                  <span>{group.label}</span>
                  {isCollapsed ? (
                    <ChevronRight className="w-3 h-3" />
                  ) : (
                    <ChevronDown className="w-3 h-3" />
                  )}
                </button>

                {/* Group items */}
                {!isCollapsed && (
                  <div className="px-2 space-y-0.5">
                    {group.items.map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => handleTabClick(tab.id)}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] font-medium transition-all ${
                          activeTab === tab.id
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "text-muted-foreground hover:bg-surface hover:text-foreground"
                        }`}
                      >
                        <tab.icon className="w-4 h-4 shrink-0" />
                        {tab.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-3 border-t border-border space-y-1.5">
          <button
            onClick={toggleTheme}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] font-medium text-muted-foreground hover:bg-surface hover:text-foreground transition-all"
          >
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            {theme === "dark" ? "Light Mode" : "Dark Mode"}
          </button>

          <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-surface/50">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
              {adminProfile?.first_name?.[0]}{adminProfile?.last_name?.[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-foreground truncate">
                {adminProfile?.first_name} {adminProfile?.last_name}
              </p>
              <p className="text-[10px] text-muted-foreground">Admin</p>
            </div>
            <button onClick={handleLogout} className="text-muted-foreground hover:text-destructive transition-colors" title="Logout">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto min-w-0 flex flex-col">
        {/* Sticky top bar */}
        <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b border-border px-4 lg:px-6 py-3 flex items-center gap-3 shrink-0">
          {!showSidebar && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="w-9 h-9 rounded-xl bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-surface transition-colors"
            >
              <Menu className="w-4.5 h-4.5" />
            </button>
          )}
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-foreground truncate">{tabLabels[activeTab] || "Dashboard"}</h2>
          </div>
        </header>

        {/* Page content */}
        <div className="flex-1 p-4 lg:p-6 xl:p-8 max-w-7xl w-full mx-auto">
          {activeTab === "dashboard" && <AdminDashboard />}
          {activeTab === "passengers" && <AdminPassengers />}
          {activeTab === "drivers" && <AdminDrivers />}
          {activeTab === "vehicles" && <AdminVehicles />}
          {activeTab === "vehicle_types" && <AdminVehicleTypes />}
          {activeTab === "vehicle_makes" && <AdminVehicleMakes />}
          {activeTab === "fares" && <AdminFares />}
          {activeTab === "billing" && <AdminBilling />}
          {activeTab === "wallets" && <AdminWallets />}
          {activeTab === "topup_cards" && <AdminTopupCards />}
          {activeTab === "watermelons" && <AdminWatermelons />}
          {activeTab === "banks" && <AdminBanks />}
          {activeTab === "companies" && <AdminCompanies />}
          {activeTab === "locations" && <AdminLocations />}
          {activeTab === "named_locations" && <AdminNamedLocations />}
          {activeTab === "trips" && <AdminTrips />}
          {activeTab === "lost_items" && <AdminLostItems />}
          {activeTab === "sos_history" && <AdminSOSHistory />}
          {activeTab === "users" && <AdminUsers />}
          {activeTab === "notifications" && <AdminNotifications />}
          {activeTab === "sms" && <AdminSMS />}
          {activeTab === "device_tokens" && <AdminDeviceTokens />}
          {activeTab === "settings" && <AdminSettings />}
        </div>
      </main>
    </div>
  );
};

export default Admin;
