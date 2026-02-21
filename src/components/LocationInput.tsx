import { MapPin, Navigation, ChevronDown, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface ServiceLocation {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
}

interface LocationInputProps {
  onSearch: (pickup: ServiceLocation, dropoff: ServiceLocation) => void;
}

const LocationInput = ({ onSearch }: LocationInputProps) => {
  const [locations, setLocations] = useState<ServiceLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [pickup, setPickup] = useState<ServiceLocation | null>(null);
  const [dropoff, setDropoff] = useState<ServiceLocation | null>(null);
  const [selecting, setSelecting] = useState<"pickup" | "dropoff" | null>(null);

  useEffect(() => {
    const fetchLocations = async () => {
      const { data } = await supabase
        .from("service_locations")
        .select("id, name, address, lat, lng")
        .eq("is_active", true)
        .order("name");
      setLocations(data || []);
      setLoading(false);
    };
    fetchLocations();
  }, []);

  const handleSelect = (loc: ServiceLocation) => {
    if (selecting === "pickup") {
      setPickup(loc);
      // If no dropoff yet, auto-open dropoff selector
      if (!dropoff) {
        setSelecting("dropoff");
        return;
      }
    } else if (selecting === "dropoff") {
      setDropoff(loc);
    }
    setSelecting(null);
  };

  const availableForDropoff = locations.filter((l) => l.id !== pickup?.id);
  const availableForPickup = locations.filter((l) => l.id !== dropoff?.id);
  const displayList = selecting === "pickup" ? availableForPickup : availableForDropoff;

  const canConfirm = pickup && dropoff;

  return (
    <motion.div
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      transition={{ type: "spring", damping: 30, stiffness: 300 }}
      className="absolute bottom-0 left-0 right-0 bg-card rounded-t-2xl shadow-[0_-4px_30px_rgba(0,0,0,0.1)] z-10"
    >
      <div className="p-5 space-y-4">
        {/* Handle */}
        <div className="flex justify-center">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>

        {/* Greeting */}
        <div>
          <h2 className="text-xl font-bold text-foreground">Where to?</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Select pickup & destination</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* Pickup & Dropoff selectors */}
            <div className="flex items-center gap-3 px-1">
              <div className="flex flex-col items-center gap-1">
                <div className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse-dot" />
                <div className="w-0.5 h-8 bg-border" />
                <div className="w-2.5 h-2.5 rounded-sm bg-foreground" />
              </div>
              <div className="flex-1 space-y-3">
                {/* Pickup selector */}
                <button
                  onClick={() => setSelecting(selecting === "pickup" ? null : "pickup")}
                  className={`w-full flex items-center justify-between rounded-xl px-4 py-3 transition-colors ${
                    selecting === "pickup" ? "bg-primary/10 ring-2 ring-primary" : "bg-surface hover:bg-muted"
                  }`}
                >
                  <div className="text-left">
                    <p className="text-xs text-muted-foreground">Point A — Pickup</p>
                    <p className={`text-sm font-medium ${pickup ? "text-foreground" : "text-muted-foreground"}`}>
                      {pickup ? pickup.name : "Select pickup area"}
                    </p>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${selecting === "pickup" ? "rotate-180" : ""}`} />
                </button>

                {/* Dropoff selector */}
                <button
                  onClick={() => setSelecting(selecting === "dropoff" ? null : "dropoff")}
                  className={`w-full flex items-center justify-between rounded-xl px-4 py-3 transition-colors ${
                    selecting === "dropoff" ? "bg-primary/10 ring-2 ring-primary" : "bg-surface hover:bg-muted"
                  }`}
                >
                  <div className="text-left">
                    <p className="text-xs text-muted-foreground">Point B — Destination</p>
                    <p className={`text-sm font-medium ${dropoff ? "text-foreground" : "text-muted-foreground"}`}>
                      {dropoff ? dropoff.name : "Select destination area"}
                    </p>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${selecting === "dropoff" ? "rotate-180" : ""}`} />
                </button>
              </div>
            </div>

            {/* Location list dropdown */}
            {selecting && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-1 max-h-48 overflow-y-auto"
              >
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
                  {selecting === "pickup" ? "Select pickup" : "Select destination"}
                </p>
                {displayList.length === 0 ? (
                  <p className="text-sm text-muted-foreground px-3 py-2">No service areas available</p>
                ) : (
                  displayList.map((loc) => (
                    <button
                      key={loc.id}
                      onClick={() => handleSelect(loc)}
                      className="flex items-center gap-3 w-full px-3 py-3 rounded-xl hover:bg-surface transition-colors"
                    >
                      <div className="w-10 h-10 rounded-full bg-surface flex items-center justify-center shrink-0">
                        <MapPin className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-medium text-foreground">{loc.name}</p>
                        <p className="text-xs text-muted-foreground">{loc.address}</p>
                      </div>
                    </button>
                  ))
                )}
              </motion.div>
            )}

            {/* Confirm button */}
            <button
              onClick={() => canConfirm && onSearch(pickup!, dropoff!)}
              disabled={!canConfirm}
              className="w-full bg-primary text-primary-foreground font-semibold py-4 rounded-xl text-base transition-transform active:scale-[0.98] hover:opacity-90 disabled:opacity-40"
            >
              {canConfirm ? "Find a ride" : "Select pickup & destination"}
            </button>
          </>
        )}
      </div>
    </motion.div>
  );
};

export default LocationInput;
