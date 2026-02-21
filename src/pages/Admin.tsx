import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import AdminLocations from "@/components/admin/AdminLocations";
import { toast } from "@/hooks/use-toast";
import AdminLogin from "@/components/admin/AdminLogin";
import AdminDashboard from "@/components/admin/AdminDashboard";
import AdminDrivers from "@/components/admin/AdminDrivers";
import AdminVehicles from "@/components/admin/AdminVehicles";
import AdminVehicleTypes from "@/components/admin/AdminVehicleTypes";
import AdminFares from "@/components/admin/AdminFares";
import AdminSettings from "@/components/admin/AdminSettings";
import AdminTrips from "@/components/admin/AdminTrips";
import AdminBanks from "@/components/admin/AdminBanks";
import AdminCompanies from "@/components/admin/AdminCompanies";
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
} from "lucide-react";
import hdaLogo from "@/assets/hda-logo.png";

type Tab = "dashboard" | "drivers" | "vehicles" | "vehicle_types" | "fares" | "locations" | "trips" | "banks" | "companies" | "settings";

const tabs: { id: Tab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "drivers", label: "Drivers", icon: Users },
  { id: "vehicle_types", label: "Vehicle Types", icon: Layers },
  { id: "vehicles", label: "Vehicles", icon: Car },
  { id: "fares", label: "Fares", icon: DollarSign },
  { id: "banks", label: "Banks", icon: Building2 },
  { id: "companies", label: "Companies", icon: Building },
  { id: "locations", label: "Service Areas", icon: Navigation },
  { id: "trips", label: "Trips", icon: MapPin },
  { id: "settings", label: "Settings", icon: Settings },
];

const Admin = () => {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [adminProfile, setAdminProfile] = useState<any>(null);

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
    // Look up the profile and check if they have admin role
    // Fetch all profiles matching this phone, then pick the one with admin role
    const { data: profiles } = await supabase
      .from("profiles")
      .select("*")
      .eq("phone_number", phone);

    if (!profiles || profiles.length === 0) {
      toast({ title: "Access denied", description: "Profile not found", variant: "destructive" });
      return false;
    }

    // Check each profile for admin role, pick the first admin
    let adminProfileMatch: any = null;
    for (const p of profiles) {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", p.id);
      if (roles?.some((r: any) => r.role === "admin")) {
        adminProfileMatch = p;
        break;
      }
    }

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
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="w-64 bg-card border-r border-border flex flex-col shrink-0">
        <div className="p-5 flex items-center gap-3 border-b border-border">
          <img src={hdaLogo} alt="HDA" className="w-10 h-10 object-contain" />
          <div>
            <h1 className="text-lg font-extrabold text-foreground">
              HDA <span className="text-primary">ADMIN</span>
            </h1>
            <p className="text-xs text-muted-foreground">Management Panel</p>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
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

        <div className="p-3 border-t border-border">
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
      <main className="flex-1 overflow-auto">
        <div className="p-8">
          {activeTab === "dashboard" && <AdminDashboard />}
          {activeTab === "drivers" && <AdminDrivers />}
          {activeTab === "vehicle_types" && <AdminVehicleTypes />}
          {activeTab === "vehicles" && <AdminVehicles />}
          {activeTab === "fares" && <AdminFares />}
          {activeTab === "banks" && <AdminBanks />}
          {activeTab === "companies" && <AdminCompanies />}
          {activeTab === "locations" && <AdminLocations />}
          {activeTab === "trips" && <AdminTrips />}
          {activeTab === "settings" && <AdminSettings />}
        </div>
      </main>
    </div>
  );
};

export default Admin;
