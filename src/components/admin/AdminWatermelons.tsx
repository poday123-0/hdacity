import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Sparkles, Upload, Shuffle, Image, MapPin, Check, X } from "lucide-react";
import { useGoogleMaps } from "@/hooks/use-google-maps";

interface ServiceLocation {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

interface PromoItem {
  id: string;
  lat: number;
  lng: number;
  promo_type: string;
  amount: number;
  fee_free_months: number;
  free_trips: number;
  target_user_type: string;
  status: string;
  claimed_by: string | null;
  claimed_at: string | null;
  claim_radius_m: number;
  service_location_id: string | null;
  icon_url: string | null;
  created_at: string;
}

const randomOffset = (base: number, range: number) => base + (Math.random() - 0.5) * range;

const MIN_DISTANCE_METERS = 50; // Minimum distance between items

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isTooClose(lat: number, lng: number, existingItems: { lat: number; lng: number }[]): boolean {
  return existingItems.some(item => haversineDistance(lat, lng, item.lat, item.lng) < MIN_DISTANCE_METERS);
}
/** Visual map component for dragging a single marker to a new position */
const MoveOnMap = ({ lat, lng, onConfirm, onCancel }: { lat: number; lng: number; onConfirm: (lat: number, lng: number) => void; onCancel: () => void }) => {
  const { isLoaded } = useGoogleMaps();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInst = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const posRef = useRef({ lat, lng });

  useEffect(() => {
    if (!isLoaded || !mapRef.current) return;
    const g = (window as any).google;
    if (!g?.maps) return;

    const map = new g.maps.Map(mapRef.current, {
      center: { lat, lng }, zoom: 17, mapId: "hda_move_map",
      disableDefaultUI: true, zoomControl: true,
    });
    mapInst.current = map;

    const el = document.createElement("div");
    el.innerHTML = `<div style="font-size:28px;cursor:grab;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.3));">🍉</div>`;
    const marker = new g.maps.marker.AdvancedMarkerElement({
      map, position: { lat, lng }, content: el, gmpDraggable: true,
    });
    markerRef.current = marker;

    marker.addListener("dragend", () => {
      const p = marker.position;
      posRef.current = { lat: p.lat, lng: p.lng };
    });

    return () => { marker.map = null; };
  }, [isLoaded, lat, lng]);

  return (
    <div className="border border-primary/30 rounded-xl overflow-hidden bg-primary/5">
      <div ref={mapRef} style={{ width: "100%", height: 200 }} />
      <div className="flex items-center justify-between px-3 py-2">
        <p className="text-[10px] text-muted-foreground">Drag the 🍉 to the new position</p>
        <div className="flex gap-1.5">
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onCancel}>Cancel</Button>
          <Button size="sm" className="h-7 text-xs gap-1" onClick={() => onConfirm(posRef.current.lat, posRef.current.lng)}>
            <Check className="w-3 h-3" /> Confirm
          </Button>
        </div>
      </div>
    </div>
  );
};

/** Bulk map view to drag multiple items at once */
const BulkMoveMap = ({ items, onConfirm, onCancel }: { items: PromoItem[]; onConfirm: (updates: { id: string; lat: number; lng: number }[]) => void; onCancel: () => void }) => {
  const { isLoaded } = useGoogleMaps();
  const mapRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const positionsRef = useRef<Map<string, { lat: number; lng: number }>>(new Map());
  const [movedCount, setMovedCount] = useState(0);

  useEffect(() => {
    if (!isLoaded || !mapRef.current || items.length === 0) return;
    const g = (window as any).google;
    if (!g?.maps) return;

    const bounds = new g.maps.LatLngBounds();
    items.forEach(item => bounds.extend({ lat: item.lat, lng: item.lng }));

    const map = new g.maps.Map(mapRef.current, {
      center: bounds.getCenter(), zoom: 15, mapId: "hda_bulk_move",
      disableDefaultUI: true, zoomControl: true,
    });
    map.fitBounds(bounds, 40);

    // Init positions
    items.forEach(item => {
      positionsRef.current.set(item.id, { lat: item.lat, lng: item.lng });
    });

    // Create draggable markers
    const movedIds = new Set<string>();
    items.forEach(item => {
      const el = document.createElement("div");
      el.innerHTML = `<div style="font-size:24px;cursor:grab;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.3));transition:transform 0.1s;" title="${item.amount} MVR - ${item.target_user_type}">🍉</div>`;
      const marker = new g.maps.marker.AdvancedMarkerElement({
        map, position: { lat: item.lat, lng: item.lng }, content: el, gmpDraggable: true,
      });
      markersRef.current.set(item.id, marker);

      marker.addListener("dragend", () => {
        const p = marker.position;
        positionsRef.current.set(item.id, { lat: p.lat, lng: p.lng });
        movedIds.add(item.id);
        setMovedCount(movedIds.size);
        // Highlight moved marker
        el.innerHTML = `<div style="font-size:24px;cursor:grab;filter:drop-shadow(0 2px 6px rgba(34,197,94,0.6));transform:scale(1.2);" title="${item.amount} MVR - ${item.target_user_type}">🍉</div>`;
      });
    });

    return () => {
      markersRef.current.forEach(m => { m.map = null; });
      markersRef.current.clear();
    };
  }, [isLoaded, items]);

  const handleConfirm = () => {
    const updates: { id: string; lat: number; lng: number }[] = [];
    positionsRef.current.forEach((pos, id) => {
      const orig = items.find(i => i.id === id);
      if (orig && (Math.abs(orig.lat - pos.lat) > 0.000001 || Math.abs(orig.lng - pos.lng) > 0.000001)) {
        updates.push({ id, lat: pos.lat, lng: pos.lng });
      }
    });
    onConfirm(updates);
  };

  return (
    <div className="border-2 border-primary/30 rounded-2xl overflow-hidden bg-primary/5">
      <div ref={mapRef} style={{ width: "100%", height: 400 }} />
      <div className="flex items-center justify-between px-4 py-3 bg-card/80">
        <div>
          <p className="text-xs font-semibold text-foreground">Drag any 🍉 to reposition</p>
          <p className="text-[10px] text-muted-foreground">{movedCount} item{movedCount !== 1 ? "s" : ""} moved • {items.length} total on map</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={onCancel}>
            <X className="w-3.5 h-3.5 mr-1" /> Cancel
          </Button>
          <Button size="sm" className="h-8 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleConfirm} disabled={movedCount === 0}>
            <Check className="w-3.5 h-3.5" /> Save {movedCount} Change{movedCount !== 1 ? "s" : ""}
          </Button>
        </div>
      </div>
    </div>
  );
};

/**
 * Snap a lat/lng to the nearest road using Google Maps Geocoder.
 * Returns snapped coords or null if no road found nearby.
 */
async function snapToRoad(lat: number, lng: number): Promise<{ lat: number; lng: number } | null> {
  const g = (window as any).google;
  if (!g?.maps?.Geocoder) return { lat, lng }; // fallback if no Google Maps

  const geocoder = new g.maps.Geocoder();
  return new Promise((resolve) => {
    geocoder.geocode({ location: { lat, lng } }, (results: any[], status: string) => {
      if (status !== "OK" || !results?.length) {
        resolve(null);
        return;
      }
      // Look for a result that includes a road/street — means it's on land near a road
      for (const r of results) {
        const types: string[] = r.types || [];
        if (
          types.some((t: string) =>
            ["street_address", "route", "intersection", "premise", "subpremise",
             "point_of_interest", "establishment", "neighborhood", "sublocality"].includes(t)
          )
        ) {
          const loc = r.geometry?.location;
          if (loc) {
            return resolve({ lat: loc.lat(), lng: loc.lng() });
          }
        }
      }
      // If first result is at least not "natural_feature" or "water" type, accept it
      const first = results[0];
      const firstTypes: string[] = first.types || [];
      if (firstTypes.some((t: string) => ["natural_feature", "water", "ocean"].includes(t))) {
        resolve(null); // In water
      } else if (first.geometry?.location) {
        resolve({ lat: first.geometry.location.lat(), lng: first.geometry.location.lng() });
      } else {
        resolve(null);
      }
    });
  });
}

/**
 * Generate a random point near a service location and snap it to a road.
 * Retries up to maxRetries times with smaller offsets.
 */
async function generateRoadPoint(baseLat: number, baseLng: number, maxRetries = 5): Promise<{ lat: number; lng: number } | null> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    // Use smaller range for Maldives islands (0.003 ≈ 300m)
    const range = 0.003 - attempt * 0.0004; // shrink range on retries
    const lat = randomOffset(baseLat, Math.max(range, 0.001));
    const lng = randomOffset(baseLng, Math.max(range, 0.001));
    const snapped = await snapToRoad(lat, lng);
    if (snapped) return snapped;
  }
  return null;
}

const AdminWatermelons = () => {
  const [items, setItems] = useState<PromoItem[]>([]);
  const [claimerProfiles, setClaimerProfiles] = useState<Map<string, { first_name: string; last_name: string; phone_number: string; user_type: string }>>(new Map());
  const [serviceLocations, setServiceLocations] = useState<ServiceLocation[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);

  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editLat, setEditLat] = useState("");
  const [editLng, setEditLng] = useState("");
  const [showBulkMove, setShowBulkMove] = useState(false);

  // Form state
  const [promoType, setPromoType] = useState("wallet_amount");
  const [amount, setAmount] = useState("25");
  const [feeMonths, setFeeMonths] = useState("1");
  const [freeTrips, setFreeTrips] = useState("1");
  const [targetUser, setTargetUser] = useState("driver");
  const [itemCount, setItemCount] = useState("5");
  const [claimRadius, setClaimRadius] = useState("150");
  const [selectedLocationId, setSelectedLocationId] = useState("random");
  const [iconUrl, setIconUrl] = useState("");
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const iconInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchItems();
    fetchLocations();
  }, []);

  const fetchItems = async () => {
    const { data } = await supabase
      .from("promo_watermelons")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) {
      setItems(data as any);
      // Fetch profiles for claimed items
      const claimedUserIds = [...new Set((data as any[]).filter(d => d.claimed_by).map(d => d.claimed_by))];
      if (claimedUserIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, first_name, last_name, phone_number, user_type")
          .in("id", claimedUserIds);
        if (profiles) {
          const map = new Map<string, any>();
          profiles.forEach(p => map.set(p.id, p));
          setClaimerProfiles(map);
        }
      }
    }
  };

  const fetchLocations = async () => {
    const { data } = await supabase
      .from("service_locations")
      .select("id, name, lat, lng")
      .eq("is_active", true);
    if (data) setServiceLocations(data as any);
  };

  const handleIconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingIcon(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `promo-icons/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("notification-images").upload(path, file);
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("notification-images").getPublicUrl(path);
      setIconUrl(urlData.publicUrl);
      toast({ title: "Icon uploaded!" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploadingIcon(false);
    }
  };

  const handleCreate = async () => {
    const count = parseInt(itemCount);
    const amt = parseFloat(amount);
    const radius = parseFloat(claimRadius);

    if (count < 1 || count > 50) {
      toast({ title: "Invalid count", description: "Max 50 at a time", variant: "destructive" });
      return;
    }

    if (serviceLocations.length === 0) {
      toast({ title: "No service locations", description: "Add service locations first", variant: "destructive" });
      return;
    }

    setCreating(true);
    try {
      const rows = [];
      let skipped = 0;
      for (let i = 0; i < count; i++) {
        const loc = selectedLocationId === "random"
          ? serviceLocations[Math.floor(Math.random() * serviceLocations.length)]
          : serviceLocations.find(l => l.id === selectedLocationId) || serviceLocations[0];

        const snapped = await generateRoadPoint(Number(loc.lat), Number(loc.lng));
        if (!snapped) {
          skipped++;
          continue;
        }

        // Enforce minimum distance from existing items AND items being created
        const allExisting = [...items.filter(x => x.status === "active"), ...rows].map(r => ({ lat: r.lat, lng: r.lng }));
        if (isTooClose(snapped.lat, snapped.lng, allExisting)) {
          // Try again with a different position
          const retry = await generateRoadPoint(Number(loc.lat), Number(loc.lng));
          if (!retry || isTooClose(retry.lat, retry.lng, allExisting)) {
            skipped++;
            continue;
          }
          rows.push({
            lat: retry.lat,
            lng: retry.lng,
            promo_type: promoType,
            amount: promoType === "wallet_amount" ? amt : 0,
            fee_free_months: promoType === "fee_free" ? parseInt(feeMonths) : 0,
            free_trips: promoType === "free_trip" ? parseInt(freeTrips) : 0,
            target_user_type: targetUser,
            claim_radius_m: radius,
            service_location_id: loc.id,
            icon_url: iconUrl || null,
          });
          continue;
        }

        rows.push({
          lat: snapped.lat,
          lng: snapped.lng,
          promo_type: promoType,
          amount: promoType === "wallet_amount" ? amt : 0,
          fee_free_months: promoType === "fee_free" ? parseInt(feeMonths) : 0,
          free_trips: promoType === "free_trip" ? parseInt(freeTrips) : 0,
          target_user_type: targetUser,
          claim_radius_m: radius,
          service_location_id: loc.id,
          icon_url: iconUrl || null,
        });
      }

      if (rows.length === 0) {
        toast({ title: "No valid positions", description: "Could not find road positions near the selected location(s). Try a different area.", variant: "destructive" });
        setCreating(false);
        return;
      }

      const { error } = await supabase.from("promo_watermelons").insert(rows);
      if (error) throw error;

      const msg = skipped > 0
        ? `${rows.length} items placed on roads! (${skipped} skipped — in water)`
        : `${rows.length} promo items placed on roads!`;
      toast({ title: "🎁 Items Dropped!", description: msg });
      setShowCreate(false);
      fetchItems();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const handleReshuffle = async () => {
    if (!confirm("Randomly move all active items to new positions within service areas?")) return;
    const activeItems = items.filter(i => i.status === "active");
    if (activeItems.length === 0) return;

    try {
      let moved = 0;
      for (const item of activeItems) {
        const loc = item.service_location_id
          ? serviceLocations.find(l => l.id === item.service_location_id)
          : serviceLocations[Math.floor(Math.random() * serviceLocations.length)];
        if (!loc) continue;

        const snapped = await generateRoadPoint(Number(loc.lat), Number(loc.lng));
        if (!snapped) continue;

        await supabase.from("promo_watermelons").update({ lat: snapped.lat, lng: snapped.lng }).eq("id", item.id);
        moved++;
      }
      toast({ title: "🔀 Reshuffled!", description: `${moved} items moved to road positions` });
      fetchItems();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleDeleteAll = async (status?: string) => {
    const msg = status === "claimed" ? "Delete all claimed items?" : "Delete ALL active items?";
    if (!confirm(msg)) return;
    let query = supabase.from("promo_watermelons").delete();
    if (status) query = query.eq("status", status);
    else query = query.eq("status", "active");
    await query;
    toast({ title: "Deleted" });
    fetchItems();
  };

  const handleMoveItem = async (id: string) => {
    const lat = parseFloat(editLat);
    const lng = parseFloat(editLng);
    if (isNaN(lat) || isNaN(lng)) {
      toast({ title: "Invalid coordinates", variant: "destructive" });
      return;
    }
    // Check minimum distance
    const others = items.filter(i => i.id !== id && i.status === "active");
    if (isTooClose(lat, lng, others)) {
      toast({ title: "Too close to another item", description: `Items must be at least ${MIN_DISTANCE_METERS}m apart`, variant: "destructive" });
      return;
    }
    await supabase.from("promo_watermelons").update({ lat, lng }).eq("id", id);
    toast({ title: "📍 Item moved!" });
    setEditingItemId(null);
    fetchItems();
  };

  const handleDeleteOne = async (id: string) => {
    await supabase.from("promo_watermelons").delete().eq("id", id);
    setItems(prev => prev.filter(m => m.id !== id));
  };

  const activeItems = items.filter(m => m.status === "active");
  const claimedItems = items.filter(m => m.status === "claimed");
  const driverItems = activeItems.filter(m => m.target_user_type === "driver");
  const passengerItems = activeItems.filter(m => m.target_user_type === "passenger");

  const promoLabel = (m: PromoItem) => {
    if (m.promo_type === "wallet_amount") return `${m.amount} MVR`;
    if (m.promo_type === "fee_free") return `${m.fee_free_months}mo Free`;
    if (m.promo_type === "free_trip") return `${m.free_trips} Free Trip${m.free_trips > 1 ? "s" : ""}`;
    return m.promo_type;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <span className="text-2xl">🎁</span>
            Map Promo Items
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">Drop promo items (watermelons, oranges, etc.) on the map for users to collect!</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {activeItems.length > 1 && (
            <Button variant="outline" onClick={() => setShowBulkMove(!showBulkMove)} className="gap-2">
              <MapPin className="w-4 h-4" />
              {showBulkMove ? "Close Map" : "Move on Map"}
            </Button>
          )}
          {activeItems.length > 0 && (
            <Button variant="outline" onClick={handleReshuffle} className="gap-2">
              <Shuffle className="w-4 h-4" />
              Reshuffle
            </Button>
          )}
          <Button onClick={() => setShowCreate(!showCreate)} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
            <Plus className="w-4 h-4" />
            Drop Items
          </Button>
        </div>
      </div>

      {/* Bulk Move Map */}
      {showBulkMove && activeItems.length > 0 && (
        <BulkMoveMap
          items={activeItems}
          onConfirm={async (updates) => {
            if (updates.length === 0) {
              toast({ title: "No changes", description: "Drag items to reposition them" });
              return;
            }
            try {
              for (const u of updates) {
                await supabase.from("promo_watermelons").update({ lat: u.lat, lng: u.lng }).eq("id", u.id);
              }
              toast({ title: "📍 Items moved!", description: `${updates.length} item${updates.length !== 1 ? "s" : ""} repositioned` });
              setShowBulkMove(false);
              fetchItems();
            } catch (err: any) {
              toast({ title: "Error", description: err.message, variant: "destructive" });
            }
          }}
          onCancel={() => setShowBulkMove(false)}
        />
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Active", count: activeItems.length, color: "text-emerald-600", icon: "🎁" },
          { label: "For Drivers", count: driverItems.length, color: "text-blue-600", icon: "🚗" },
          { label: "For Passengers", count: passengerItems.length, color: "text-purple-600", icon: "👤" },
          { label: "Claimed", count: claimedItems.length, color: "text-amber-600", icon: "✅" },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4 text-center">
            <span className="text-2xl">{s.icon}</span>
            <p className={`text-2xl font-extrabold ${s.color} mt-1`}>{s.count}</p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Create Form */}
      {showCreate && (
        <div className="bg-card border-2 border-emerald-200 dark:border-emerald-800 rounded-2xl p-6 space-y-4">
          <h3 className="text-base font-bold text-foreground flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-500" />
            Drop New Promo Items
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Custom Icon Upload */}
            <div className="sm:col-span-2 lg:col-span-3">
              <Label className="flex items-center gap-1.5 mb-2"><Image className="w-3.5 h-3.5" /> Item Icon (optional)</Label>
              <div className="flex items-center gap-3">
                {iconUrl ? (
                  <div className="relative">
                    <img src={iconUrl} alt="Icon" className="w-14 h-14 rounded-lg object-contain border border-border bg-muted/30" />
                    <button onClick={() => setIconUrl("")} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-white flex items-center justify-center text-xs">×</button>
                  </div>
                ) : (
                  <div className="w-14 h-14 rounded-lg border-2 border-dashed border-border flex items-center justify-center text-2xl bg-muted/20">🍉</div>
                )}
                <div className="flex-1">
                  <input ref={iconInputRef} type="file" accept="image/*" onChange={handleIconUpload} className="hidden" />
                  <Button variant="outline" size="sm" onClick={() => iconInputRef.current?.click()} disabled={uploadingIcon} className="gap-1.5">
                    <Upload className="w-3.5 h-3.5" />
                    {uploadingIcon ? "Uploading..." : "Upload Icon"}
                  </Button>
                  <p className="text-[10px] text-muted-foreground mt-1">Upload watermelon, orange, coconut, fish — any image!</p>
                </div>
              </div>
            </div>

            <div>
              <Label>Target Users</Label>
              <Select value={targetUser} onValueChange={setTargetUser}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="driver">🚗 Drivers</SelectItem>
                  <SelectItem value="passenger">👤 Passengers</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Promo Type</Label>
              <Select value={promoType} onValueChange={setPromoType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="wallet_amount">💰 Wallet Amount</SelectItem>
                  <SelectItem value="fee_free">🎫 Free</SelectItem>
                  <SelectItem value="free_trip">🚗 Free Trip</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {promoType === "wallet_amount" && (
              <div>
                <Label>Amount (MVR)</Label>
                <Input type="number" min="1" value={amount} onChange={e => setAmount(e.target.value)} />
              </div>
            )}
            {promoType === "fee_free" && (
              <div>
                <Label>Free Months</Label>
                <Input type="number" min="1" max="12" value={feeMonths} onChange={e => setFeeMonths(e.target.value)} />
              </div>
            )}
            {promoType === "free_trip" && (
              <div>
                <Label>Free Trips</Label>
                <Input type="number" min="1" max="10" value={freeTrips} onChange={e => setFreeTrips(e.target.value)} />
              </div>
            )}
            <div>
              <Label>Number of Items</Label>
              <Input type="number" min="1" max="50" value={itemCount} onChange={e => setItemCount(e.target.value)} />
            </div>
            <div>
              <Label>Claim Radius (meters)</Label>
              <Input type="number" min="50" max="1000" value={claimRadius} onChange={e => setClaimRadius(e.target.value)} />
            </div>
            <div>
              <Label>Near Location</Label>
              <Select value={selectedLocationId} onValueChange={setSelectedLocationId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="random">🎲 Random (all locations)</SelectItem>
                  {serviceLocations.map(loc => (
                    <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleCreate} disabled={creating} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
              {creating ? "Dropping..." : `🎁 Drop ${itemCount} Items`}
            </Button>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Bulk Actions */}
      {items.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {activeItems.length > 0 && (
            <Button variant="outline" size="sm" className="text-destructive gap-1" onClick={() => handleDeleteAll()}>
              <Trash2 className="w-3.5 h-3.5" />
              Delete Active ({activeItems.length})
            </Button>
          )}
          {claimedItems.length > 0 && (
            <Button variant="outline" size="sm" className="gap-1" onClick={() => handleDeleteAll("claimed")}>
              <Trash2 className="w-3.5 h-3.5" />
              Clear Claimed ({claimedItems.length})
            </Button>
          )}
        </div>
      )}

      {/* Items List */}
      {items.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <span className="text-5xl block mb-3 opacity-30">🎁</span>
          <p className="text-sm">No promo items on the map yet. Drop some!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.slice(0, 60).map(m => (
            <div key={m.id} className="space-y-1">
              <div
                className={`border rounded-xl p-4 flex items-center gap-3 transition-colors ${
                  m.status === "claimed"
                    ? "border-muted bg-muted/20 opacity-60"
                    : "border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20"
                }`}
              >
                {m.icon_url ? (
                  <img src={m.icon_url} alt="" className="w-10 h-10 rounded-lg object-contain" />
                ) : (
                  <span className="text-3xl">{m.status === "claimed" ? "💥" : "🍉"}</span>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-bold text-sm text-foreground">{promoLabel(m)}</span>
                    <Badge variant={m.target_user_type === "driver" ? "default" : "secondary"} className="text-[10px]">
                      {m.target_user_type === "driver" ? "🚗 Driver" : "👤 Passenger"}
                    </Badge>
                    {m.status === "claimed" && <Badge variant="outline" className="text-[10px]">Claimed</Badge>}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                    {m.lat.toFixed(4)}, {m.lng.toFixed(4)} • {m.claim_radius_m}m radius
                  </p>
                  {m.status === "claimed" && m.claimed_by && (() => {
                    const claimer = claimerProfiles.get(m.claimed_by);
                    return (
                      <div className="mt-1 space-y-0.5">
                        <p className="text-[10px] font-semibold text-foreground">
                          👤 {claimer ? `${claimer.first_name} ${claimer.last_name}` : m.claimed_by.slice(0, 8)}
                          {claimer && <span className="text-muted-foreground font-normal"> • {claimer.phone_number} • {claimer.user_type}</span>}
                        </p>
                        {m.claimed_at && (
                          <p className="text-[9px] text-muted-foreground">
                            Claimed: {new Date(m.claimed_at).toLocaleString()}
                          </p>
                        )}
                      </div>
                    );
                  })()}
                </div>
                {m.status === "active" && (
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-primary" onClick={() => { setEditingItemId(m.id); setEditLat(m.lat.toFixed(6)); setEditLng(m.lng.toFixed(6)); }}>
                      <MapPin className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDeleteOne(m.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                )}
              </div>
              {editingItemId === m.id && (
                <MoveOnMap
                  lat={m.lat}
                  lng={m.lng}
                  onConfirm={async (lat, lng) => {
                    await supabase.from("promo_watermelons").update({ lat, lng }).eq("id", m.id);
                    toast({ title: "📍 Item moved!" });
                    setEditingItemId(null);
                    fetchItems();
                  }}
                  onCancel={() => setEditingItemId(null)}
                />
              )}
            </div>
          ))}
          {items.length > 60 && (
            <p className="col-span-full text-center text-sm text-muted-foreground py-2">
              Showing 60 of {items.length} items
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminWatermelons;
