import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Users, Car, MapPin, DollarSign, TrendingUp, Clock, ExternalLink, Navigation, UserCheck, AlertTriangle, X, MessageSquare, Star, User, PackageX, BarChart3, Calendar, Activity, CalendarDays } from "lucide-react";
import SOSAlertPanel from "@/components/SOSAlertPanel";
import MaldivesMap from "@/components/SmartMaldivesMap";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell } from "recharts";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

type AnalyticsPeriod = "today" | "week" | "month" | "custom";

interface TripRoute {
  id: string;
  pickupLat: number;
  pickupLng: number;
  dropoffLat: number;
  dropoffLng: number;
  pickupAddress: string;
  dropoffAddress: string;
  driverName?: string;
  status: string;
}

interface RecentTrip {
  id: string;
  pickup_address: string;
  dropoff_address: string;
  status: string;
  created_at: string;
  actual_fare: number | null;
  estimated_fare: number | null;
  driver?: { first_name: string; last_name: string } | null;
  passenger?: { first_name: string; last_name: string } | null;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const PIE_COLORS = ["hsl(var(--primary))", "hsl(var(--destructive))", "hsl(var(--accent-foreground))", "hsl(142 76% 36%)", "hsl(38 92% 50%)", "hsl(280 65% 60%)"];

const AdminDashboard = () => {
  const [stats, setStats] = useState({
    drivers: 0, vehicles: 0, trips: 0, activeTrips: 0,
    passengers: 0, onlineDrivers: 0, completedToday: 0, cancelledToday: 0,
    todayRevenue: 0,
  });
  const [vehicleMarkers, setVehicleMarkers] = useState<any[]>([]);
  const [tripRoutes, setTripRoutes] = useState<TripRoute[]>([]);
  const [recentTrips, setRecentTrips] = useState<RecentTrip[]>([]);

  // Analytics state
  const [analyticsPeriod, setAnalyticsPeriod] = useState<AnalyticsPeriod>("month");
  const [customRange, setCustomRange] = useState<{ from?: Date; to?: Date }>({});
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [hourlyData, setHourlyData] = useState<{ hour: string; trips: number }[]>([]);
  const [weekdayData, setWeekdayData] = useState<{ day: string; trips: number; revenue: number }[]>([]);
  const [topAreas, setTopAreas] = useState<{ name: string; count: number }[]>([]);
  const [weeklyRevenue, setWeeklyRevenue] = useState<{ date: string; revenue: number }[]>([]);
  const [statusBreakdown, setStatusBreakdown] = useState<{ name: string; value: number }[]>([]);
  const [kpis, setKpis] = useState({ totalTrips: 0, completed: 0, cancelled: 0, revenue: 0, avgFare: 0, completionRate: 0, cancellationRate: 0 });
  const [topDrivers, setTopDrivers] = useState<{ name: string; trips: number; revenue: number }[]>([]);
  const [vehicleTypeSplit, setVehicleTypeSplit] = useState<{ name: string; value: number }[]>([]);
  const [paymentSplit, setPaymentSplit] = useState<{ name: string; value: number }[]>([]);
  const [completionRateDrivers, setCompletionRateDrivers] = useState<{ id: string; name: string; avatar: string | null; completed: number; total: number; rate: number; revenue: number }[]>([]);
  const [completionSource, setCompletionSource] = useState<"all" | "app" | "operator" | "direct">("all");

  useEffect(() => {
    const fetchStats = async () => {
      // Use Maldives timezone (UTC+5) for "today" calculations — hardcoded offset avoids browser TZ issues
      const nowUTC = Date.now();
      const maldivesMs = nowUTC + 5 * 3600000;
      const maldivesMidnight = new Date(maldivesMs);
      maldivesMidnight.setUTCHours(0, 0, 0, 0);
      const todayStartUTC = new Date(maldivesMidnight.getTime() - 5 * 3600000);

      const todayISO = todayStartUTC.toISOString();
      // Match Live Map definition: only count drivers whose location heartbeat
      // has been updated within the last 3 hours. Anything older is treated as
      // stale/offline so the dashboard count can't drift above what's actually
      // visible on the map.
      const threeHoursAgoISO = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
      const [drivers, vehicles, trips, activeTrips, passengers, onlineDrivers, completedToday, cancelledToday, todayRevenueData] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }).ilike("user_type", "%Driver%"),
        supabase.from("vehicles").select("id", { count: "exact", head: true }),
        supabase.from("trips").select("id", { count: "exact", head: true }),
        supabase.from("trips").select("id", { count: "exact", head: true }).in("status", ["requested", "accepted", "started", "arrived"]),
        supabase.from("profiles").select("id", { count: "exact", head: true }).eq("user_type", "Rider"),
        supabase.from("driver_locations").select("id", { count: "exact", head: true }).eq("is_online", true).gte("updated_at", threeHoursAgoISO),
        supabase.from("trips").select("id", { count: "exact", head: true }).eq("status", "completed").gte("completed_at", todayISO),
        supabase.from("trips").select("id", { count: "exact", head: true }).eq("status", "cancelled").gte("cancelled_at", todayISO),
        supabase.from("trips").select("actual_fare").eq("status", "completed").gte("completed_at", todayISO),
      ]);

      const revenue = (todayRevenueData.data || []).reduce((sum: number, t: any) => sum + (t.actual_fare || 0), 0);

      setStats({
        drivers: drivers.count || 0,
        vehicles: vehicles.count || 0,
        trips: trips.count || 0,
        activeTrips: activeTrips.count || 0,
        passengers: passengers.count || 0,
        onlineDrivers: onlineDrivers.count || 0,
        completedToday: completedToday.count || 0,
        cancelledToday: cancelledToday.count || 0,
        todayRevenue: revenue,
      });
    };
    fetchStats();
    const interval = setInterval(fetchStats, 10000);

    // Realtime subscription so auto-completed / dispatch trips update instantly
    const channel = supabase
      .channel("admin-dashboard-trips")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "trips" }, () => {
        fetchStats();
      })
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, []);

  const getAnalyticsDateRange = useCallback(() => {
    const maldivesNow = new Date(Date.now() + 5 * 3600000);
    const maldivesToday = maldivesNow.toISOString().split("T")[0];

    if (analyticsPeriod === "today") {
      const start = new Date(maldivesToday + "T00:00:00Z");
      start.setTime(start.getTime() - 5 * 3600000); // convert to UTC
      return { start, days: 1 };
    } else if (analyticsPeriod === "week") {
      const start = new Date(maldivesToday + "T00:00:00Z");
      start.setUTCDate(start.getUTCDate() - 6);
      start.setTime(start.getTime() - 5 * 3600000);
      return { start, days: 7 };
    } else if (analyticsPeriod === "custom" && customRange.from) {
      const fromStr = format(customRange.from, "yyyy-MM-dd");
      const toStr = customRange.to ? format(customRange.to, "yyyy-MM-dd") : fromStr;
      const start = new Date(fromStr + "T00:00:00Z");
      start.setTime(start.getTime() - 5 * 3600000);
      const end = new Date(toStr + "T23:59:59Z");
      end.setTime(end.getTime() - 5 * 3600000);
      const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000));
      return { start, days };
    } else {
      // month (default)
      const start = new Date(maldivesToday + "T00:00:00Z");
      start.setUTCDate(start.getUTCDate() - 29);
      start.setTime(start.getTime() - 5 * 3600000);
      return { start, days: 30 };
    }
  }, [analyticsPeriod, customRange]);

  const getPeriodLabel = () => {
    if (analyticsPeriod === "today") return "Today";
    if (analyticsPeriod === "week") return "Last 7 days";
    if (analyticsPeriod === "custom" && customRange.from) {
      const from = format(customRange.from, "MMM d");
      const to = customRange.to ? format(customRange.to, "MMM d") : from;
      return `${from} – ${to}`;
    }
    return "Last 30 days";
  };

  // Fetch analytics data
  useEffect(() => {
    const fetchAnalytics = async () => {
      setAnalyticsLoading(true);
      const { start, days } = getAnalyticsDateRange();

      // Fetch all trips (handle 1000-row limit by paginating)
      let allTrips: any[] = [];
      let from = 0;
      const batchSize = 1000;
      while (true) {
        const { data } = await supabase
          .from("trips")
          .select("created_at, status, actual_fare, estimated_fare, pickup_address, completed_at, driver_id, vehicle_type_id, payment_method, payment_confirmed_method, dispatch_type")
          .gte("created_at", start.toISOString())
          .order("created_at", { ascending: true })
          .range(from, from + batchSize - 1);
        if (!data || data.length === 0) break;
        allTrips = allTrips.concat(data);
        if (data.length < batchSize) break;
        from += batchSize;
      }

      if (allTrips.length === 0) {
        setHourlyData([]);
        setWeekdayData([]);
        setTopAreas([]);
        setWeeklyRevenue([]);
        setStatusBreakdown([]);
        setKpis({ totalTrips: 0, completed: 0, cancelled: 0, revenue: 0, avgFare: 0, completionRate: 0, cancellationRate: 0 });
        setTopDrivers([]);
        setVehicleTypeSplit([]);
        setPaymentSplit([]);
        setAnalyticsLoading(false);
        return;
      }
      const analyticsTrips = allTrips;

      // Helper: convert UTC date to Maldives hour/day
      const toMaldivesDate = (utcStr: string) => new Date(new Date(utcStr).getTime() + 5 * 3600000);

      // Hourly distribution (Maldives time)
      const hourCounts = new Array(24).fill(0);
      analyticsTrips.forEach(t => {
        const hour = toMaldivesDate(t.created_at).getUTCHours();
        hourCounts[hour]++;
      });
      setHourlyData(HOURS.map(h => ({
        hour: h === 0 ? "12am" : h < 12 ? `${h}am` : h === 12 ? "12pm" : `${h - 12}pm`,
        trips: hourCounts[h],
      })));

      // Weekday distribution (Maldives time)
      const dayCounts = new Array(7).fill(0);
      const dayRevenue = new Array(7).fill(0);
      analyticsTrips.forEach(t => {
        const day = toMaldivesDate(t.created_at).getUTCDay();
        dayCounts[day]++;
        if (t.status === "completed" && t.actual_fare) dayRevenue[day] += t.actual_fare;
      });
      setWeekdayData(WEEKDAYS.map((d, i) => ({ day: d, trips: dayCounts[i], revenue: Math.round(dayRevenue[i]) })));

      // Top pickup areas
      const areaCounts: Record<string, number> = {};
      analyticsTrips.forEach(t => {
        if (!t.pickup_address) return;
        const area = t.pickup_address.split(",")[0].trim().substring(0, 30);
        if (area) areaCounts[area] = (areaCounts[area] || 0) + 1;
      });
      const sortedAreas = Object.entries(areaCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([name, count]) => ({ name, count }));
      setTopAreas(sortedAreas);

      // Revenue trend per day
      const maldivesNow = new Date(Date.now() + 5 * 3600000);
      const maldivesTodayStr = maldivesNow.toISOString().split("T")[0];
      const trendDays = Math.min(days, 30); // cap at 30 for chart readability
      const revTrend = [];
      for (let i = trendDays - 1; i >= 0; i--) {
        const d = new Date(maldivesTodayStr + "T00:00:00Z");
        if (analyticsPeriod === "custom" && customRange.to) {
          const toStr = format(customRange.to, "yyyy-MM-dd");
          const baseDate = new Date(toStr + "T00:00:00Z");
          d.setTime(baseDate.getTime());
        }
        d.setUTCDate(d.getUTCDate() - i);
        const dateStr = d.toISOString().split("T")[0];
        const dayLabel = `${d.getUTCDate()} ${["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getUTCDay()]}`;

        const dayRevTotal = analyticsTrips
          .filter(t => {
            if (t.status !== "completed" || !t.actual_fare || !t.completed_at) return false;
            const completedMaldives = toMaldivesDate(t.completed_at);
            return completedMaldives.toISOString().split("T")[0] === dateStr;
          })
          .reduce((s, t) => s + (t.actual_fare || 0), 0);
        revTrend.push({ date: dayLabel, revenue: Math.round(dayRevTotal) });
      }
      setWeeklyRevenue(revTrend);

      // Status breakdown
      const statusCounts: Record<string, number> = {};
      analyticsTrips.forEach(t => {
        statusCounts[t.status] = (statusCounts[t.status] || 0) + 1;
      });
      setStatusBreakdown(Object.entries(statusCounts).map(([name, value]) => ({
        name: name.replace("_", " ").replace(/\b\w/g, l => l.toUpperCase()),
        value,
      })));

      // KPI summary
      const completedTrips = analyticsTrips.filter(t => t.status === "completed");
      const cancelledTrips = analyticsTrips.filter(t => t.status === "cancelled" || t.status === "expired");
      const totalRevenue = completedTrips.reduce((s, t) => s + (t.actual_fare || 0), 0);
      const avgFare = completedTrips.length ? totalRevenue / completedTrips.length : 0;
      setKpis({
        totalTrips: analyticsTrips.length,
        completed: completedTrips.length,
        cancelled: cancelledTrips.length,
        revenue: Math.round(totalRevenue),
        avgFare: Math.round(avgFare),
        completionRate: analyticsTrips.length ? Math.round((completedTrips.length / analyticsTrips.length) * 100) : 0,
        cancellationRate: analyticsTrips.length ? Math.round((cancelledTrips.length / analyticsTrips.length) * 100) : 0,
      });

      // Top drivers (by completed trips & revenue)
      const driverAgg: Record<string, { trips: number; revenue: number }> = {};
      completedTrips.forEach(t => {
        if (!t.driver_id) return;
        if (!driverAgg[t.driver_id]) driverAgg[t.driver_id] = { trips: 0, revenue: 0 };
        driverAgg[t.driver_id].trips += 1;
        driverAgg[t.driver_id].revenue += t.actual_fare || 0;
      });
      const topDriverIds = Object.entries(driverAgg)
        .sort((a, b) => b[1].trips - a[1].trips)
        .slice(0, 5);
      if (topDriverIds.length > 0) {
        const { data: driverProfiles } = await supabase
          .from("profiles")
          .select("id, first_name, last_name")
          .in("id", topDriverIds.map(([id]) => id));
        const nameMap = new Map((driverProfiles || []).map((p: any) => [p.id, `${p.first_name} ${p.last_name}`.trim()]));
        setTopDrivers(topDriverIds.map(([id, agg]) => ({
          name: nameMap.get(id) || "Unknown",
          trips: agg.trips,
          revenue: Math.round(agg.revenue),
        })));
      } else {
        setTopDrivers([]);
      }

      // Vehicle type split
      const vtCounts: Record<string, number> = {};
      analyticsTrips.forEach(t => {
        if (!t.vehicle_type_id) return;
        vtCounts[t.vehicle_type_id] = (vtCounts[t.vehicle_type_id] || 0) + 1;
      });
      const vtIds = Object.keys(vtCounts);
      if (vtIds.length > 0) {
        const { data: vts } = await supabase.from("vehicle_types").select("id, name").in("id", vtIds);
        const vtNameMap = new Map((vts || []).map((v: any) => [v.id, v.name]));
        setVehicleTypeSplit(
          Object.entries(vtCounts)
            .map(([id, value]) => ({ name: vtNameMap.get(id) || "Other", value }))
            .sort((a, b) => b.value - a.value)
        );
      } else {
        setVehicleTypeSplit([]);
      }

      // Payment method split (use confirmed if present, fallback to chosen)
      const payCounts: Record<string, number> = {};
      completedTrips.forEach(t => {
        const method = (t.payment_confirmed_method || t.payment_method || "unknown").toString().toLowerCase();
        const label = method.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
        payCounts[label] = (payCounts[label] || 0) + 1;
      });
      setPaymentSplit(
        Object.entries(payCounts)
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value)
      );

      setAnalyticsLoading(false);
    };
    fetchAnalytics();
  }, [analyticsPeriod, customRange, getAnalyticsDateRange]);

  // Fetch live driver locations — only drivers linked to an active vehicle
  useEffect(() => {
    const fetchLocations = async () => {
      const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from("driver_locations")
        .select("id, lat, lng, heading, driver_id, is_on_trip, vehicle_type_id, vehicle_id, vehicle_types:vehicle_type_id(name, image_url, icon, map_icon_url), profiles:driver_id(first_name, last_name, phone_number), vehicles:vehicle_id(plate_number, center_code, make, model, color)")
        .eq("is_online", true)
        .gte("updated_at", threeHoursAgo);
      if (data) {
        // Only show drivers linked to an active vehicle
        const activeDrivers = data.filter((d: any) => d.vehicle_id && d.vehicles);
        setVehicleMarkers(activeDrivers.map((d: any) => ({
          id: d.id,
          lat: d.lat,
          lng: d.lng,
          name: d.vehicle_types?.name || "Driver",
          imageUrl: d.vehicle_types?.map_icon_url || undefined,
          isOnTrip: d.is_on_trip,
          driverId: d.driver_id,
          driverName: d.profiles ? `${(d.profiles as any).first_name} ${(d.profiles as any).last_name}` : undefined,
          driverPhone: (d.profiles as any)?.phone_number || undefined,
          plate: (d.vehicles as any)?.plate_number || undefined,
          centerCode: (d.vehicles as any)?.center_code || undefined,
          vehicleInfo: d.vehicles ? `${(d.vehicles as any).make || ""} ${(d.vehicles as any).model || ""}`.trim() || undefined : undefined,
          heading: d.heading,
        })));
      }
    };
    fetchLocations();
    const interval = setInterval(fetchLocations, 5000);
    return () => clearInterval(interval);
  }, []);

  // Fetch active trip routes
  useEffect(() => {
    const fetchTrips = async () => {
      const { data } = await supabase
        .from("trips")
        .select("id, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, pickup_address, dropoff_address, status, driver_id, profiles:driver_id(first_name, last_name)")
        .in("status", ["accepted", "in_progress"]);
      if (data) {
        setTripRoutes(data.filter((t: any) => t.pickup_lat && t.dropoff_lat).map((t: any) => ({
          id: t.id,
          pickupLat: t.pickup_lat,
          pickupLng: t.pickup_lng,
          dropoffLat: t.dropoff_lat,
          dropoffLng: t.dropoff_lng,
          pickupAddress: t.pickup_address,
          dropoffAddress: t.dropoff_address,
          driverName: t.profiles ? `${t.profiles.first_name} ${t.profiles.last_name}` : undefined,
          status: t.status,
        })));
      }
    };
    fetchTrips();
    const interval = setInterval(fetchTrips, 5000);
    return () => clearInterval(interval);
  }, []);

  // Fetch recent trips
  useEffect(() => {
    const fetchRecent = async () => {
      const { data } = await supabase
        .from("trips")
        .select("*, passenger:profiles!trips_passenger_id_fkey(first_name, last_name), driver:profiles!trips_driver_id_fkey(first_name, last_name)")
        .order("created_at", { ascending: false })
        .limit(10);
      if (data) setRecentTrips(data as any[]);
    };
    fetchRecent();
  }, []);

  // Trip detail state
  const [selectedTrip, setSelectedTrip] = useState<any>(null);
  const [tripMessages, setTripMessages] = useState<any[]>([]);
  const [tripLostItems, setTripLostItems] = useState<any[]>([]);

  const viewTripDetail = async (trip: any) => {
    setSelectedTrip(trip);
    const [{ data: msgs }, { data: items }] = await Promise.all([
      supabase.from("trip_messages").select("*").eq("trip_id", trip.id).order("created_at", { ascending: true }),
      supabase.from("lost_item_reports").select("*").eq("trip_id", trip.id).order("created_at", { ascending: false }),
    ]);
    setTripMessages((msgs as any[]) || []);
    setTripLostItems((items as any[]) || []);
  };

  const liveCards = [
    { label: "Online Drivers", value: stats.onlineDrivers, icon: Navigation, accent: true, pulse: true },
    { label: "Active Trips", value: stats.activeTrips, icon: MapPin, accent: true, pulse: true },
    { label: "Completed Today", value: stats.completedToday, icon: TrendingUp, accent: false },
    { label: "Today Revenue", value: `MVR ${Math.round(stats.todayRevenue).toLocaleString()}`, icon: DollarSign, accent: false },
  ];

  const secondaryCards = [
    { label: "Total Drivers", value: stats.drivers, icon: Users },
    { label: "Passengers", value: stats.passengers, icon: UserCheck },
    { label: "Vehicles", value: stats.vehicles, icon: Car },
    { label: "Cancelled Today", value: stats.cancelledToday, icon: AlertTriangle, destructive: true },
  ];

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      completed: "bg-primary/10 text-primary",
      in_progress: "bg-accent text-foreground",
      accepted: "bg-accent text-foreground",
      requested: "bg-accent text-foreground",
      cancelled: "bg-destructive/10 text-destructive",
    };
    return styles[status] || "bg-muted text-muted-foreground";
  };

  const maxAreaCount = Math.max(...topAreas.map(a => a.count), 1);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-lg">
        <p className="text-xs font-semibold text-foreground">{label}</p>
        {payload.map((p: any, i: number) => (
          <p key={i} className="text-xs text-muted-foreground">{p.name}: <span className="font-medium text-foreground">{p.value}</span></p>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* SOS Alerts */}
      <SOSAlertPanel />

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-foreground">Dashboard</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Real-time overview of your operations</p>
        </div>
        <a
          href="/live-map"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 bg-primary text-primary-foreground px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold hover:opacity-90 transition-opacity"
        >
          <ExternalLink className="w-4 h-4" />
          Open Live Map
        </a>
      </div>

      {/* Live stats - highlighted */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {liveCards.map((card) => (
          <div key={card.label} className="relative bg-card border border-border rounded-2xl p-4 overflow-hidden group hover:border-primary/30 transition-colors">
            {card.pulse && card.accent && (
              <div className="absolute top-3 right-3 w-2 h-2 rounded-full bg-primary animate-pulse" />
            )}
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${card.accent ? "bg-primary/10" : "bg-muted"}`}>
                <card.icon className={`w-5 h-5 ${card.accent ? "text-primary" : "text-muted-foreground"}`} />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] sm:text-xs text-muted-foreground truncate">{card.label}</p>
                <p className="text-xl sm:text-2xl font-bold text-foreground truncate">{card.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Secondary stats */}
      <div className="grid grid-cols-4 gap-2">
        {secondaryCards.map((card) => (
          <div key={card.label} className="bg-card/50 border border-border/50 rounded-xl px-3 py-2.5 text-center">
            <p className="text-lg sm:text-xl font-bold text-foreground">{card.value}</p>
            <p className="text-[9px] sm:text-[10px] text-muted-foreground truncate">{card.label}</p>
          </div>
        ))}
      </div>

      {/* Live Map */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <div>
              <h3 className="text-sm font-semibold text-foreground">Live Map</h3>
              <p className="text-[10px] text-muted-foreground">
                {vehicleMarkers.length} driver{vehicleMarkers.length !== 1 ? "s" : ""} online
                {tripRoutes.length > 0 && ` · ${tripRoutes.length} active trip${tripRoutes.length !== 1 ? "s" : ""}`}
              </p>
            </div>
          </div>
          <a href="/live-map" target="_blank" rel="noopener noreferrer" className="text-xs text-primary font-medium flex items-center gap-1 hover:underline">
            <ExternalLink className="w-3 h-3" /> Fullscreen
          </a>
        </div>
        <div className="h-[250px] sm:h-[400px]">
          <MaldivesMap vehicleMarkers={vehicleMarkers} tripRoutes={tripRoutes} />
        </div>
      </div>

      {/* Analytics Section */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-bold text-foreground">Analytics</h3>
            <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{getPeriodLabel()}</span>
            {analyticsLoading && <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />}
          </div>
          <div className="flex items-center gap-1.5">
            {(["today", "week", "month"] as AnalyticsPeriod[]).map(p => (
              <button
                key={p}
                onClick={() => setAnalyticsPeriod(p)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                  analyticsPeriod === p
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                )}
              >
                {p === "today" ? "Today" : p === "week" ? "Week" : "Month"}
              </button>
            ))}
            <Popover>
              <PopoverTrigger asChild>
                <button
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1",
                    analyticsPeriod === "custom"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  )}
                >
                  <CalendarDays className="w-3 h-3" />
                  Custom
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <CalendarPicker
                  mode="range"
                  selected={customRange.from ? { from: customRange.from, to: customRange.to } : undefined}
                  onSelect={(range: any) => {
                    setCustomRange({ from: range?.from, to: range?.to });
                    if (range?.from) setAnalyticsPeriod("custom");
                  }}
                  disabled={(date) => date > new Date()}
                  numberOfMonths={1}
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* KPI Summary for selected period */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
          {[
            { label: "Total Trips", value: kpis.totalTrips.toLocaleString() },
            { label: "Completed", value: kpis.completed.toLocaleString() },
            { label: "Cancelled", value: kpis.cancelled.toLocaleString(), destructive: true },
            { label: "Revenue", value: `MVR ${kpis.revenue.toLocaleString()}` },
            { label: "Avg Fare", value: `MVR ${kpis.avgFare.toLocaleString()}` },
            { label: "Completion %", value: `${kpis.completionRate}%`, accent: true },
            { label: "Cancel %", value: `${kpis.cancellationRate}%`, destructive: true },
          ].map((k) => (
            <div key={k.label} className="bg-card border border-border rounded-xl px-3 py-2">
              <p className="text-[10px] text-muted-foreground truncate">{k.label}</p>
              <p className={cn("text-base sm:text-lg font-bold truncate", k.destructive ? "text-destructive" : k.accent ? "text-primary" : "text-foreground")}>
                {k.value}
              </p>
            </div>
          ))}
        </div>

        {/* Revenue Trend + Status Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="lg:col-span-2 bg-card border border-border rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-primary" /> Revenue Trend
              </h4>
            </div>
            <div className="h-[200px]">
              {weeklyRevenue.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={weeklyRevenue}>
                    <defs>
                      <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} width={45} tickFormatter={(v) => `${v}`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area type="monotone" dataKey="revenue" name="Revenue (MVR)" stroke="hsl(var(--primary))" strokeWidth={2.5} fill="url(#revenueGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">No data yet</div>
              )}
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl p-4">
            <h4 className="text-sm font-semibold text-foreground mb-3">Trip Status</h4>
            <div className="h-[160px]">
              {statusBreakdown.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={statusBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={65} innerRadius={35} strokeWidth={0}>
                      {statusBreakdown.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">No data</div>
              )}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
              {statusBreakdown.map((s, i) => (
                <div key={s.name} className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                  <span className="text-[10px] text-muted-foreground">{s.name} ({s.value})</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Hourly + Weekday */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="bg-card border border-border rounded-2xl p-4">
            <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-primary" /> Busiest Hours
            </h4>
            <div className="h-[180px]">
              {hourlyData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={hourlyData} barSize={10}>
                    <XAxis dataKey="hour" axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} interval={2} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} width={30} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="trips" name="Trips" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">No data yet</div>
              )}
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl p-4">
            <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-primary" /> Trips by Weekday
            </h4>
            <div className="h-[180px]">
              {weekdayData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weekdayData} barSize={24}>
                    <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} width={30} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="trips" name="Trips" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">No data yet</div>
              )}
            </div>
          </div>
        </div>

        {/* Top Pickup Areas */}
        <div className="bg-card border border-border rounded-2xl p-4">
          <h4 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-1.5">
            <MapPin className="w-4 h-4 text-primary" /> Busiest Pickup Areas
          </h4>
          {topAreas.length > 0 ? (
            <div className="space-y-2.5">
              {topAreas.map((area, i) => (
                <div key={area.name} className="flex items-center gap-3">
                  <span className="text-xs font-bold text-muted-foreground w-5 text-right">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-medium text-foreground truncate">{area.name}</p>
                      <span className="text-xs font-semibold text-primary ml-2 shrink-0">{area.count} trips</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-500"
                        style={{ width: `${(area.count / maxAreaCount) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-6">No trip data available yet</p>
          )}
        </div>

        {/* Top Drivers + Vehicle Type + Payment */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="bg-card border border-border rounded-2xl p-4">
            <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
              <Star className="w-4 h-4 text-primary" /> Top Drivers
            </h4>
            {topDrivers.length > 0 ? (
              <div className="space-y-2">
                {topDrivers.map((d, i) => (
                  <div key={d.name + i} className="flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-bold text-muted-foreground w-4">{i + 1}</span>
                      <span className="text-foreground truncate">{d.name}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-primary font-semibold">{d.trips} trips</span>
                      <span className="text-muted-foreground">MVR {d.revenue.toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-6">No completed trips</p>
            )}
          </div>

          <div className="bg-card border border-border rounded-2xl p-4">
            <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
              <Car className="w-4 h-4 text-primary" /> Vehicle Type Mix
            </h4>
            <div className="h-[160px]">
              {vehicleTypeSplit.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={vehicleTypeSplit} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={60} innerRadius={30} strokeWidth={0}>
                      {vehicleTypeSplit.map((_, i) => (<Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">No data</div>
              )}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
              {vehicleTypeSplit.map((s, i) => (
                <div key={s.name} className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                  <span className="text-[10px] text-muted-foreground">{s.name} ({s.value})</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl p-4">
            <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
              <DollarSign className="w-4 h-4 text-primary" /> Payment Methods
            </h4>
            {paymentSplit.length > 0 ? (
              <div className="space-y-2">
                {paymentSplit.map((p, i) => {
                  const total = paymentSplit.reduce((s, x) => s + x.value, 0);
                  const pct = total ? Math.round((p.value / total) * 100) : 0;
                  return (
                    <div key={p.name} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-foreground">{p.name}</span>
                        <span className="text-muted-foreground">{p.value} ({pct}%)</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-6">No completed trips</p>
            )}
          </div>
        </div>
      </div>

      {/* Recent Trips */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">Recent Trips</h3>
        </div>
        <div className="divide-y divide-border">
          {recentTrips.length === 0 && (
            <div className="px-5 py-8 text-center text-sm text-muted-foreground">No trips yet</div>
          )}
          {recentTrips.map((trip) => (
            <div key={trip.id} onClick={() => viewTripDetail(trip)} className="px-3 sm:px-5 py-3 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{trip.pickup_address}</p>
                <p className="text-xs text-muted-foreground truncate">→ {trip.dropoff_address}</p>
              </div>
              <div className="flex items-center gap-2 sm:gap-3">
                <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${getStatusBadge(trip.status)}`}>
                  {trip.status.replace("_", " ")}
                </span>
                <p className="text-xs text-muted-foreground">
                  {trip.actual_fare ? `MVR ${trip.actual_fare}` : trip.estimated_fare ? `~MVR ${trip.estimated_fare}` : ""}
                </p>
                <p className="text-xs text-muted-foreground shrink-0">
                  <Clock className="w-3 h-3 inline mr-1" />
                  {new Date(trip.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Trip detail modal */}
      {selectedTrip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50 backdrop-blur-sm" onClick={() => setSelectedTrip(null)}>
          <div className="bg-card rounded-2xl shadow-2xl mx-4 w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="font-bold text-foreground flex items-center gap-2"><MessageSquare className="w-4 h-4 text-primary" /> Trip Details</h3>
              <button onClick={() => setSelectedTrip(null)} className="w-8 h-8 rounded-full bg-muted flex items-center justify-center"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="bg-muted/50 rounded-xl p-3 space-y-2">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <User className="w-3 h-3" />
                    <span>Passenger: <span className="text-foreground font-medium">{selectedTrip.passenger ? `${selectedTrip.passenger.first_name} ${selectedTrip.passenger.last_name}` : selectedTrip.customer_name || "—"}</span></span>
                  </div>
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <User className="w-3 h-3" />
                    <span>Driver: <span className="text-foreground font-medium">{selectedTrip.driver ? `${selectedTrip.driver.first_name} ${selectedTrip.driver.last_name}` : "—"}</span></span>
                  </div>
                  <div className="flex items-center gap-1.5 text-muted-foreground col-span-2">
                    <MapPin className="w-3 h-3 shrink-0" />
                    <span className="truncate">{selectedTrip.pickup_address} → {selectedTrip.dropoff_address}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <DollarSign className="w-3 h-3" />
                    <span>Fare: <span className="text-foreground font-medium">{selectedTrip.actual_fare ? `MVR ${selectedTrip.actual_fare}` : selectedTrip.estimated_fare ? `~MVR ${selectedTrip.estimated_fare}` : "—"}</span></span>
                  </div>
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    <span>{selectedTrip.duration_minutes ? `${selectedTrip.duration_minutes} min` : "—"} • {selectedTrip.distance_km ? `${selectedTrip.distance_km} km` : "—"}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Users className="w-3 h-3" />
                    <span>{selectedTrip.passenger_count} pax • {selectedTrip.luggage_count} bags</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    <span>{new Date(selectedTrip.created_at).toLocaleString()}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-1 border-t border-border">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${getStatusBadge(selectedTrip.status)}`}>{selectedTrip.status.replace("_", " ")}</span>
                  {selectedTrip.dispatch_type && <span className="text-[10px] text-muted-foreground">via {selectedTrip.dispatch_type}</span>}
                  {selectedTrip.fare_type && <span className="text-[10px] text-muted-foreground">• {selectedTrip.fare_type}</span>}
                </div>
                {selectedTrip.rating && (
                  <div className="flex items-center gap-2 pt-1 border-t border-border">
                    <div className="flex items-center gap-0.5">
                      {[1,2,3,4,5].map(s => (
                        <Star key={s} className={`w-3.5 h-3.5 ${s <= selectedTrip.rating ? "text-yellow-500 fill-yellow-500" : "text-muted-foreground"}`} />
                      ))}
                    </div>
                    {selectedTrip.feedback_text && <p className="text-xs text-muted-foreground italic">"{selectedTrip.feedback_text}"</p>}
                  </div>
                )}
                {selectedTrip.cancel_reason && (
                  <div className="pt-1 border-t border-border">
                    <p className="text-xs text-destructive">Cancel reason: {selectedTrip.cancel_reason}</p>
                  </div>
                )}
              </div>

              {tripLostItems.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-destructive uppercase tracking-wider flex items-center gap-1"><PackageX className="w-3.5 h-3.5" /> Lost Item Reports</p>
                  {tripLostItems.map((item: any) => (
                    <div key={item.id} className="bg-destructive/5 border border-destructive/20 rounded-xl p-3">
                      <p className="text-sm text-foreground">{item.description}</p>
                      <p className="text-xs text-muted-foreground mt-1">Status: <span className="font-medium">{item.status}</span> • {new Date(item.created_at).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              )}

              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Chat History ({tripMessages.length})</p>
              {tripMessages.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No messages in this trip</p>
              ) : (
                tripMessages.map((msg: any) => (
                  <div key={msg.id} className={`flex ${msg.sender_type === "system" ? "justify-center" : msg.sender_type === "driver" ? "justify-end" : "justify-start"}`}>
                    {msg.sender_type === "system" ? (
                      <span className="text-[10px] text-muted-foreground bg-muted px-3 py-1 rounded-full">{msg.message}</span>
                    ) : (
                      <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 ${msg.sender_type === "driver" ? "bg-primary text-primary-foreground rounded-br-md" : "bg-muted text-foreground rounded-bl-md"}`}>
                        <p className="text-[10px] font-semibold opacity-70 mb-0.5">{msg.sender_type === "driver" ? "Driver" : "Passenger"}</p>
                        <p className="text-sm">{msg.message}</p>
                        <p className="text-[9px] mt-1 opacity-60">{new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
