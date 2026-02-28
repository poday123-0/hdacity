import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { useTheme } from "@/hooks/use-theme";
import { Menu, X } from "lucide-react";
import AdminLocations from "@/components/admin/AdminLocations";
import { toast } from "@/hooks/use-toast";
import AdminLogin from "@/components/admin/AdminLogin";
import AdminDashboard from "@/components/admin/AdminDashboard";
import AdminDrivers from "@/components/admin/AdminDrivers";
// Vehicles are now managed within AdminDrivers
import AdminVehicleTypes from "@/components/admin/AdminVehicleTypes";
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
import {
  LayoutDashboard,
  Users,
  Car,
  DollarSign,
  Settings,
  MapPin,
  Navigation,
  LogOut,
  Layers,
  Building2,
  Building,
  UserCheck,
  Receipt,
  ShieldCheck,
  Moon,
  Sun,
  PackageX,
  Siren,
  BellRing,
  Wallet,
} from "lucide-react";
import hdaLogo from "@/assets/hda-logo.png";

type Tab = "dashboard" | "passengers" | "drivers" | "vehicle_types" | "vehicle_makes" | "fares" | "billing" | "wallets" | "locations" | "trips" | "lost_items" | "sos_history" | "banks" | "companies" | "users" | "notifications" | "settings";

const tabs: { id: Tab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "passengers", label: "Passengers", icon: UserCheck },
  { id: "drivers", label: "Drivers", icon: Users },
  { id: "vehicle_types", label: "Vehicle Types", icon: Layers },
  { id: "vehicle_makes", label: "Makes & Models", icon: Car },
  { id: "fares", label: "Fares", icon: DollarSign },
  { id: "billing", label: "Billing", icon: Receipt },
  { id: "wallets", label: "Wallets", icon: Wallet },
  { id: "banks", label: "Banks", icon: Building2 },
  { id: "companies", label: "Companies", icon: Building },
  { id: "locations", label: "Service Areas", icon: Navigation },
  { id: "trips", label: "Trips", icon: MapPin },
  { id: "lost_items", label: "Lost Items", icon: PackageX },
  { id: "sos_history", label: "SOS Alerts", icon: Siren },
  { id: "notifications", label: "Notifications", icon: BellRing },
  { id: "users", label: "Admins & Dispatch", icon: ShieldCheck },
  { id: "settings", label: "Settings", icon: Settings },
];

const Admin = () => {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [adminProfile, setAdminProfile] = useState<any>(null);
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 1024);
  const { theme, toggleTheme } = useTheme();
  usePushNotifications(adminProfile?.id, "admin");

  useEffect(() => {
    // Check if admin is already logged in via localStorage
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

    // Batch fetch roles for all matching profiles at once
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

  return (
    <div className="h-dvh bg-background flex overflow-hidden">
      {/* Sidebar overlay on mobile */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-foreground/30 backdrop-blur-sm lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-card border-r border-border flex flex-col shrink-0 transition-transform duration-300 ${
        sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0 lg:w-0 lg:overflow-hidden lg:border-0"
      }`}>
        <div className="p-5 flex items-center justify-between border-b border-border">
          <div className="flex items-center gap-3">
            <img src={hdaLogo} alt="HDA" className="w-10 h-10 object-contain" />
            <div>
              <h1 className="text-lg font-extrabold text-foreground">
                HDA <span className="text-primary">ADMIN</span>
              </h1>
              <p className="text-xs text-muted-foreground">Management Panel</p>
            </div>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-surface lg:flex">
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto min-h-0">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-surface hover:text-foreground"
              }`}
            >
              <tab.icon className="w-5 h-5" />
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="p-3 border-t border-border space-y-2">
          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:bg-surface hover:text-foreground transition-all"
          >
            {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            {theme === "dark" ? "Light Mode" : "Dark Mode"}
          </button>

          <div className="flex items-center gap-3 px-4 py-2">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
              {adminProfile?.first_name?.[0]}{adminProfile?.last_name?.[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {adminProfile?.first_name} {adminProfile?.last_name}
              </p>
              <p className="text-xs text-muted-foreground">Admin</p>
            </div>
            <button onClick={handleLogout} className="text-muted-foreground hover:text-destructive">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto min-w-0">
        <div className="p-4 lg:p-6 xl:p-8 max-w-7xl mx-auto">
          {/* Top bar with menu toggle */}
          {!sidebarOpen && (
            <button onClick={() => setSidebarOpen(true)} className="mb-4 w-10 h-10 rounded-xl bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-surface transition-colors">
              <Menu className="w-5 h-5" />
            </button>
          )}
          {activeTab === "dashboard" && <AdminDashboard />}
          {activeTab === "passengers" && <AdminPassengers />}
          {activeTab === "drivers" && <AdminDrivers />}
          {activeTab === "vehicle_types" && <AdminVehicleTypes />}
          {activeTab === "vehicle_makes" && <AdminVehicleMakes />}
          {activeTab === "fares" && <AdminFares />}
          {activeTab === "billing" && <AdminBilling />}
          {activeTab === "wallets" && <AdminWallets />}
          {activeTab === "banks" && <AdminBanks />}
          {activeTab === "companies" && <AdminCompanies />}
          {activeTab === "locations" && <AdminLocations />}
          {activeTab === "trips" && <AdminTrips />}
          {activeTab === "lost_items" && <AdminLostItems />}
          {activeTab === "sos_history" && <AdminSOSHistory />}
          {activeTab === "users" && <AdminUsers />}
          {activeTab === "notifications" && <AdminNotifications />}
          {activeTab === "settings" && <AdminSettings />}
        </div>
      </main>
    </div>
  );
};

export default Admin;
