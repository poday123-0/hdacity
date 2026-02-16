import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const statusColors: Record<string, string> = {
  requested: "bg-yellow-100 text-yellow-700",
  accepted: "bg-blue-100 text-blue-700",
  in_progress: "bg-primary/10 text-primary",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

const AdminTrips = () => {
  const [trips, setTrips] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  const fetchTrips = async () => {
    setLoading(true);
    let query = supabase
      .from("trips")
      .select("*, passenger:profiles!trips_passenger_id_fkey(first_name, last_name), driver:profiles!trips_driver_id_fkey(first_name, last_name)")
      .order("created_at", { ascending: false })
      .limit(50);

    if (filter !== "all") query = query.eq("status", filter);
    const { data } = await query;
    setTrips(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchTrips(); }, [filter]);

  // Subscribe to realtime updates
  useEffect(() => {
    const channel = supabase
      .channel("admin-trips")
      .on("postgres_changes", { event: "*", schema: "public", table: "trips" }, () => fetchTrips())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [filter]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">Trips</h2>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="px-3 py-2 bg-surface border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="all">All Trips</option>
          <option value="requested">Requested</option>
          <option value="accepted">Accepted</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-surface">
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Passenger</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Driver</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Pickup</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Dropoff</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Fare</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Status</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Time</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
            ) : trips.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No trips found</td></tr>
            ) : (
              trips.map((t) => (
                <tr key={t.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 text-sm text-foreground">
                    {t.passenger ? `${t.passenger.first_name} ${t.passenger.last_name}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {t.driver ? `${t.driver.first_name} ${t.driver.last_name}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground truncate max-w-[150px]">{t.pickup_address || "—"}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground truncate max-w-[150px]">{t.dropoff_address || "—"}</td>
                  <td className="px-4 py-3 text-sm font-medium text-foreground">{t.estimated_fare ? `${t.estimated_fare} MVR` : "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${statusColors[t.status] || "bg-muted text-muted-foreground"}`}>
                      {t.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(t.created_at).toLocaleString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminTrips;
