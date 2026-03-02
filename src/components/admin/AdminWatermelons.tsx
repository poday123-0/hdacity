import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Sparkles, Upload, Shuffle, Image } from "lucide-react";

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

const AdminWatermelons = () => {
  const [items, setItems] = useState<PromoItem[]>([]);
  const [serviceLocations, setServiceLocations] = useState<ServiceLocation[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);

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
    if (data) setItems(data as any);
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
      for (let i = 0; i < count; i++) {
        const loc = selectedLocationId === "random"
          ? serviceLocations[Math.floor(Math.random() * serviceLocations.length)]
          : serviceLocations.find(l => l.id === selectedLocationId) || serviceLocations[0];

        const lat = randomOffset(Number(loc.lat), 0.01);
        const lng = randomOffset(Number(loc.lng), 0.01);

        rows.push({
          lat,
          lng,
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

      const { error } = await supabase.from("promo_watermelons").insert(rows);
      if (error) throw error;

      toast({ title: "🎁 Items Dropped!", description: `${count} promo items placed on the map!` });
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
      for (const item of activeItems) {
        const loc = item.service_location_id
          ? serviceLocations.find(l => l.id === item.service_location_id)
          : serviceLocations[Math.floor(Math.random() * serviceLocations.length)];
        if (!loc) continue;

        const lat = randomOffset(Number(loc.lat), 0.01);
        const lng = randomOffset(Number(loc.lng), 0.01);
        await supabase.from("promo_watermelons").update({ lat, lng }).eq("id", item.id);
      }
      toast({ title: "🔀 Reshuffled!", description: "All items moved to new random positions" });
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
    if (m.promo_type === "fee_free") return `${m.fee_free_months}mo Fee-Free`;
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
        <div className="flex gap-2">
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
                  <SelectItem value="fee_free">🎫 Center Fee-Free</SelectItem>
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
                <Label>Fee-Free Months</Label>
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
            <div
              key={m.id}
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
              </div>
              {m.status === "active" && (
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive shrink-0" onClick={() => handleDeleteOne(m.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
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
