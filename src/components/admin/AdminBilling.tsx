import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Search, DollarSign, ShieldCheck, Calendar, X, CheckCircle, XCircle, Eye, Clock, Image, Users, Car, Pencil, Save, ChevronRight, ChevronDown, Building2, MessageSquare, Send, Loader2 } from "lucide-react";

const AdminBilling = () => {
  const [drivers, setDrivers] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [vehicleTypes, setVehicleTypes] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [freeUntilDriver, setFreeUntilDriver] = useState<string | null>(null);
  const [freeUntilDate, setFreeUntilDate] = useState("");
  const [payments, setPayments] = useState<any[]>([]);
  const [paymentFilter, setPaymentFilter] = useState("submitted");
  const [selectedPayment, setSelectedPayment] = useState<any>(null);
  const [billingDueDay, setBillingDueDay] = useState(25);
  const [tab, setTab] = useState<"drivers" | "payments" | "center">("drivers");
  const [expandedDriver, setExpandedDriver] = useState<string | null>(null);
  const [showBillingSettings, setShowBillingSettings] = useState(false);
  const [driverPayments, setDriverPayments] = useState<any[]>([]);

  // Bulk fee-free state
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkFilterType, setBulkFilterType] = useState<"company" | "vehicle_type">("company");
  const [bulkFilterId, setBulkFilterId] = useState("");
  const [bulkFreeDate, setBulkFreeDate] = useState("");
  const [bulkApplying, setBulkApplying] = useState(false);

  // Filter state for drivers table
  const [filterCompany, setFilterCompany] = useState("");
  const [filterVehicleType, setFilterVehicleType] = useState("");
  const [editingVtFee, setEditingVtFee] = useState<string | null>(null);
  const [editingVtFeeValue, setEditingVtFeeValue] = useState(0);
  const [savingVtFee, setSavingVtFee] = useState(false);

  // Center billing state
  const [centerPayments, setCenterPayments] = useState<any[]>([]);
  const [centerFilter, setCenterFilter] = useState("pending");
  const [centerVehicles, setCenterVehicles] = useState<any[]>([]);
  const [centerMonthPayments, setCenterMonthPayments] = useState<any[]>([]);
  const [centerWallets, setCenterWallets] = useState<Map<string, number>>(new Map());
  const [editingCenterFee, setEditingCenterFee] = useState<string | null>(null);
  const [editingCenterFeeValue, setEditingCenterFeeValue] = useState(0);
  const [savingCenterFee, setSavingCenterFee] = useState(false);
  const [selectedCenterPayment, setSelectedCenterPayment] = useState<any>(null);
  const [editingCenterVehicle, setEditingCenterVehicle] = useState<string | null>(null);
  const [editCenterVehicleData, setEditCenterVehicleData] = useState<any>({});
  const [centerSearch, setCenterSearch] = useState("");
  const [centerHistoryVehicle, setCenterHistoryVehicle] = useState<any>(null);
  const [centerHistory, setCenterHistory] = useState<any[]>([]);
  const [centerHistoryLoading, setCenterHistoryLoading] = useState(false);
  const [selectedCenterIds, setSelectedCenterIds] = useState<Set<string>>(new Set());
  const [bulkPaying, setBulkPaying] = useState(false);
  // SMS Reminder state
  const [smsTemplate, setSmsTemplate] = useState("Dear {driver_name}, your center fee of {amount} MVR for vehicle {plate} (Code: {center_code}) for {month} is due. Please pay at the earliest. - HDA");
  const [smsTemplateLoading, setSmsTemplateLoading] = useState(false);
  const [smsTemplateSaving, setSmsTemplateSaving] = useState(false);
  const [showSmsReminderModal, setShowSmsReminderModal] = useState(false);
  const [smsReminderSending, setSmsReminderSending] = useState(false);
  const [smsReminderResult, setSmsReminderResult] = useState<{ sent: number; failed: number; total: number } | null>(null);
  const [showSmsTemplateEditor, setShowSmsTemplateEditor] = useState(false);
  const [centerMonth, setCenterMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  // Load SMS template from system_settings
  useEffect(() => {
    (async () => {
      setSmsTemplateLoading(true);
      const { data } = await supabase.from("system_settings").select("value").eq("key", "center_payment_sms_template").maybeSingle();
      if (data?.value && typeof data.value === "string") setSmsTemplate(data.value);
      setSmsTemplateLoading(false);
    })();
  }, []);

  const saveSmsTemplate = async () => {
    setSmsTemplateSaving(true);
    const { data: existing } = await supabase.from("system_settings").select("id").eq("key", "center_payment_sms_template").maybeSingle();
    if (existing) {
      await supabase.from("system_settings").update({ value: smsTemplate as any, updated_at: new Date().toISOString() }).eq("key", "center_payment_sms_template");
    } else {
      await supabase.from("system_settings").insert({ key: "center_payment_sms_template", value: smsTemplate as any, description: "SMS template for center payment reminders" });
    }
    setSmsTemplateSaving(false);
    toast({ title: "SMS template saved" });
  };

  const sendCenterPaymentReminders = async () => {
    setSmsReminderSending(true);
    setSmsReminderResult(null);
    try {
      // Find unpaid center vehicles for the selected month
      const unpaidVehicles = centerVehicles.filter(cv => {
        if (cv.center_fee_exempt) return false;
        const monthPayment = centerMonthPayments.find((cp: any) => cp.vehicle_id === cv.id);
        return !monthPayment || (monthPayment.status !== "approved" && monthPayment.status !== "completed");
      });

      if (unpaidVehicles.length === 0) {
        toast({ title: "No unpaid vehicles found for this month" });
        setSmsReminderSending(false);
        return;
      }

      // Group by driver to avoid duplicate SMS
      const driverMessages = new Map<string, { phone: string; cc: string; messages: string[] }>();
      for (const cv of unpaidVehicles) {
        const driver = drivers.find(d => d.id === cv.driver_id);
        if (!driver?.phone_number) continue;
        const vt = vehicleTypes.find(v => v.id === cv.vehicle_type_id);
        const fee = (vt as any)?.center_fee || 0;
        const msg = smsTemplate
          .replace(/\{driver_name\}/g, `${driver.first_name} ${driver.last_name}`)
          .replace(/\{amount\}/g, String(fee))
          .replace(/\{plate\}/g, cv.plate_number || "")
          .replace(/\{center_code\}/g, cv.center_code || "")
          .replace(/\{month\}/g, centerMonth);

        if (!driverMessages.has(driver.id)) {
          driverMessages.set(driver.id, { phone: driver.phone_number, cc: "960", messages: [] });
        }
        driverMessages.get(driver.id)!.messages.push(msg);
      }

      // Send SMS via bulk function — one per driver with all vehicle reminders
      const phoneNumbers: string[] = [];
      const smsTexts: string[] = [];
      for (const [, info] of driverMessages) {
        const fullPhone = info.phone.startsWith("+") ? info.phone : `+${info.cc}${info.phone}`;
        phoneNumbers.push(fullPhone);
        smsTexts.push(info.messages.join("\n\n"));
      }

      // Send individually via bulk-sms with custom phone_numbers
      let sent = 0, failed = 0;
      for (let i = 0; i < phoneNumbers.length; i++) {
        const { error } = await supabase.functions.invoke("send-bulk-sms", {
          body: {
            message: smsTexts[i],
            target_type: "custom",
            phone_numbers: [phoneNumbers[i]],
            sender_id: "HDA TAXI",
          },
        });
        if (error) failed++;
        else sent++;
      }

      setSmsReminderResult({ sent, failed, total: phoneNumbers.length });
      toast({ title: `SMS sent: ${sent} success, ${failed} failed out of ${phoneNumbers.length}` });
    } catch (err: any) {
      toast({ title: "Failed to send reminders", description: err.message, variant: "destructive" });
    }
    setSmsReminderSending(false);
  };

  const fetchDrivers = async () => {
    setLoading(true);
    const [driversRes, companiesRes, vehicleTypesRes, vehiclesRes, settingsRes] = await Promise.all([
      (() => {
        let q = supabase.from("profiles").select("id, first_name, last_name, phone_number, company_id, company_name, monthly_fee, status, fee_free_until").ilike("user_type", "%Driver%").order("first_name");
        if (search) q = q.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,phone_number.ilike.%${search}%`);
        return q;
      })(),
      supabase.from("companies").select("id, name, fee_free, monthly_fee").eq("is_active", true),
      supabase.from("vehicle_types").select("id, name, base_fare, monthly_fee, center_fee").eq("is_active", true).order("sort_order"),
      supabase.from("vehicles").select("id, driver_id, vehicle_type_id, plate_number").eq("is_active", true),
      supabase.from("system_settings").select("key, value").in("key", ["billing_due_day"]),
    ]);
    setDrivers((driversRes.data as any[]) || []);
    setCompanies((companiesRes.data as any[]) || []);
    setVehicleTypes((vehicleTypesRes.data as any[]) || []);
    setVehicles((vehiclesRes.data as any[]) || []);

    settingsRes.data?.forEach((s: any) => {
      if (s.key === "billing_due_day") setBillingDueDay(typeof s.value === "number" ? s.value : parseInt(s.value) || 25);
    });
    setLoading(false);
  };

  const fetchPayments = async () => {
    let q = supabase.from("driver_payments").select("*, driver:driver_id(first_name, last_name, phone_number)").order("created_at", { ascending: false });
    if (paymentFilter !== "all") q = q.eq("status", paymentFilter);
    const { data } = await q;
    setPayments((data as any[]) || []);
  };

  const fetchCenterData = async () => {
    const now = new Date();
    const currentCenterMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const [cvRes, cpRes, cmRes, walletsRes] = await Promise.all([
      supabase.from("vehicles").select("id, plate_number, center_code, driver_id, vehicle_type_id, pays_app_fee, center_fee_exempt, make, model, color, is_active").not("center_code", "is", null),
      (() => {
        let q = supabase.from("center_payments").select("*, driver:driver_id(first_name, last_name, phone_number), vehicle:vehicle_id(plate_number, center_code)").order("created_at", { ascending: false });
        if (centerFilter !== "all") q = q.eq("status", centerFilter);
        return q;
      })(),
      supabase.from("center_payments").select("id, vehicle_id, payment_month, status, amount, slip_url, approved_at, submitted_at").eq("payment_month", currentCenterMonth),
      supabase.from("wallets").select("user_id, balance"),
    ]);
    const sorted = ((cvRes.data as any[]) || []).sort((a: any, b: any) => {
      const codeA = parseInt(a.center_code || "0", 10);
      const codeB = parseInt(b.center_code || "0", 10);
      if (isNaN(codeA) && isNaN(codeB)) return (a.center_code || "").localeCompare(b.center_code || "");
      if (isNaN(codeA)) return 1;
      if (isNaN(codeB)) return -1;
      return codeA - codeB;
    });
    setCenterVehicles(sorted);
    setCenterPayments((cpRes.data as any[]) || []);
    setCenterMonthPayments((cmRes.data as any[]) || []);
    const wMap = new Map<string, number>();
    for (const w of (walletsRes.data as any[]) || []) { wMap.set(w.user_id, w.balance || 0); }
    setCenterWallets(wMap);
  };

  useEffect(() => { fetchDrivers(); }, [search]);
  useEffect(() => { fetchPayments(); }, [paymentFilter]);
  useEffect(() => { fetchCenterData(); }, [centerFilter]);

  const getDriverVehicleType = (driverId: string) => {
    const vehicle = vehicles.find(v => v.driver_id === driverId);
    if (!vehicle?.vehicle_type_id) return null;
    return vehicleTypes.find(vt => vt.id === vehicle.vehicle_type_id) || null;
  };

  const toggleExpandDriver = async (driverId: string) => {
    if (expandedDriver === driverId) {
      setExpandedDriver(null);
      setDriverPayments([]);
      return;
    }
    setExpandedDriver(driverId);
    const { data } = await supabase
      .from("driver_payments")
      .select("*")
      .eq("driver_id", driverId)
      .order("created_at", { ascending: false });
    setDriverPayments((data as any[]) || []);
  };

  const getDriverVehicleTypeName = (driverId: string) => {
    return getDriverVehicleType(driverId)?.name || "—";
  };

  // Calculate total monthly fee for a driver based on their vehicles' vehicle types
  const getDriverFee = (driverId: string): number => {
    const driverVehs = vehicles.filter(v => v.driver_id === driverId);
    return driverVehs.reduce((sum, v) => {
      const vt = vehicleTypes.find(t => t.id === v.vehicle_type_id);
      return sum + (vt?.monthly_fee || 0);
    }, 0);
  };

  // Toggle fee-free is now handled via fee_free_until or company setting
  // The old toggle that set monthly_fee=0 on profile is no longer relevant
  // since fees come from vehicle types. We keep the "Make Free" button to set fee_free_until far in the future.
  const toggleFeeFree = async (driverId: string) => {
    const driver = drivers.find(d => d.id === driverId);
    const isFree = isFreeUntilActive(driver);
    if (isFree) {
      // Remove free period
      await supabase.from("profiles").update({ fee_free_until: null } as any).eq("id", driverId);
      toast({ title: "Free period removed" });
    } else {
      // Set free forever (year 2099)
      await supabase.from("profiles").update({ fee_free_until: "2099-12-31T23:59:59Z" } as any).eq("id", driverId);
      toast({ title: "Driver set to free (permanent)" });
    }
    fetchDrivers();
  };

  const setFreeUntil = async () => {
    if (!freeUntilDriver || !freeUntilDate) return;
    await supabase.from("profiles").update({ fee_free_until: freeUntilDate } as any).eq("id", freeUntilDriver);
    toast({ title: "Free period set", description: `Free until ${freeUntilDate}` });
    setFreeUntilDriver(null);
    setFreeUntilDate("");
    fetchDrivers();
  };

  const clearFreeUntil = async (driverId: string) => {
    await supabase.from("profiles").update({ fee_free_until: null } as any).eq("id", driverId);
    toast({ title: "Free period removed" });
    fetchDrivers();
  };

  const saveBillingSettings = async () => {
    const entries: [string, any][] = [["billing_due_day", billingDueDay]];
    for (const [key, value] of entries) {
      const { data: existing } = await supabase.from("system_settings").select("id").eq("key", key as string).single();
      if (existing) {
        await supabase.from("system_settings").update({ value, updated_at: new Date().toISOString() }).eq("key", key as string);
      } else {
        await supabase.from("system_settings").insert({ key: key as string, value });
      }
    }
    toast({ title: "Billing settings saved" });
  };

  const applyBulkFeeFree = async () => {
    if ((!bulkFilterId && bulkFilterType !== "company") || !bulkFreeDate) return;
    setBulkApplying(true);

    let targetDriverIds: string[] = [];

    if (bulkFilterType === "company") {
      if (bulkFilterId === "__all__") {
        targetDriverIds = drivers.map(d => d.id);
      } else if (bulkFilterId) {
        targetDriverIds = drivers.filter(d => d.company_id === bulkFilterId).map(d => d.id);
      }
    } else {
      // Filter by vehicle type - find drivers whose vehicles match
      const matchingDriverIds = vehicles.filter(v => v.vehicle_type_id === bulkFilterId).map(v => v.driver_id).filter(Boolean);
      targetDriverIds = drivers.filter(d => matchingDriverIds.includes(d.id)).map(d => d.id);
    }

    if (targetDriverIds.length === 0) {
      toast({ title: "No drivers found", description: "No drivers match the selected filter.", variant: "destructive" });
      setBulkApplying(false);
      return;
    }

    // Update in batches of 50
    for (let i = 0; i < targetDriverIds.length; i += 50) {
      const batch = targetDriverIds.slice(i, i + 50);
      await supabase.from("profiles").update({ fee_free_until: bulkFreeDate } as any).in("id", batch);
    }

    toast({ title: "Bulk free period applied", description: `${targetDriverIds.length} driver(s) set free until ${bulkFreeDate}` });
    setBulkApplying(false);
    setShowBulkModal(false);
    setBulkFilterId("");
    setBulkFreeDate("");
    fetchDrivers();
  };

  const approvePayment = async (paymentId: string) => {
    const adminProfile = JSON.parse(localStorage.getItem("hda_admin") || "{}");
    const payment = payments.find(p => p.id === paymentId);
    await supabase.from("driver_payments").update({
      status: "approved",
      approved_at: new Date().toISOString(),
      approved_by: adminProfile.id || null,
      updated_at: new Date().toISOString(),
    } as any).eq("id", paymentId);

    // Reactivate driver if they were on billing hold
    if (payment?.driver_id) {
      const { data: driverProfile } = await supabase.from("profiles").select("status").eq("id", payment.driver_id).single();
      if (driverProfile?.status === "Billing_hold") {
        await supabase.from("profiles").update({ status: "Active" } as any).eq("id", payment.driver_id);
      }
    }

    toast({ title: "Payment approved!", description: "Driver has been reactivated." });
    fetchPayments();
    fetchDrivers();
    setSelectedPayment(null);
  };

  const rejectPayment = async (paymentId: string, reason: string) => {
    await supabase.from("driver_payments").update({
      status: "rejected",
      rejection_reason: reason,
      updated_at: new Date().toISOString(),
    } as any).eq("id", paymentId);
    toast({ title: "Payment rejected" });
    fetchPayments();
    setSelectedPayment(null);
  };

  const getCompanyName = (d: any) => companies.find(c => c.id === d.company_id)?.name || d.company_name || "—";
  const isCompanyFeeFree = (d: any) => companies.find(c => c.id === d.company_id)?.fee_free || false;
  const isFreeUntilActive = (d: any) => d.fee_free_until && new Date(d.fee_free_until) > new Date();

  // Apply table filters — exclude drivers whose vehicles are ALL center-code (they have separate billing)
  const filteredDrivers = drivers.filter(d => {
    // Exclude drivers who only have center-code vehicles (no app-fee vehicles)
    const driverVehicles = vehicles.filter(v => v.driver_id === d.id);
    if (driverVehicles.length > 0 && driverVehicles.every(v => v.center_code && !v.pays_app_fee)) return false;

    if (filterCompany && d.company_id !== filterCompany) return false;
    if (filterVehicleType) {
      const driverVehicle = vehicles.find(v => v.driver_id === d.id);
      if (!driverVehicle || driverVehicle.vehicle_type_id !== filterVehicleType) return false;
    }
    return true;
  });

  const totalMonthlyRevenue = drivers.reduce((sum, d) => {
    const fee = getDriverFee(d.id);
    if (fee === 0 || isCompanyFeeFree(d) || isFreeUntilActive(d)) return sum;
    return sum + fee;
  }, 0);

  const freeDriversCount = drivers.filter(d => getDriverFee(d.id) === 0 || isCompanyFeeFree(d) || isFreeUntilActive(d)).length;
  const payingDriversCount = drivers.length - freeDriversCount;
  const pendingPayments = payments.filter(p => p.status === "submitted").length;

  // Count for bulk preview
  const getBulkCount = () => {
    if (bulkFilterType === "company" && bulkFilterId === "__all__") return drivers.length;
    if (!bulkFilterId) return 0;
    if (bulkFilterType === "company") {
      return drivers.filter(d => d.company_id === bulkFilterId).length;
    }
    const matchingDriverIds = vehicles.filter(v => v.vehicle_type_id === bulkFilterId).map(v => v.driver_id).filter(Boolean);
    return drivers.filter(d => matchingDriverIds.includes(d.id)).length;
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-foreground">Driver Billing</h2>

      {/* Billing Settings - Collapsible */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <button onClick={() => setShowBillingSettings(p => !p)} className="w-full flex items-center gap-3 px-4 py-3 bg-surface hover:bg-muted/50 transition-colors">
          {showBillingSettings ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
          <span className="text-sm font-bold text-foreground">Billing Settings</span>
        </button>
        {showBillingSettings && (
          <div className="p-5 space-y-4 border-t border-border">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Billing Due Day (of month)</label>
                <input type="number" min={1} max={28} value={billingDueDay} onChange={(e) => setBillingDueDay(parseInt(e.target.value) || 25)} className="w-full mt-1 px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
                <p className="text-[10px] text-muted-foreground mt-1">Drivers not paid by this date will be deactivated</p>
              </div>
              <div className="flex items-end">
                <button onClick={saveBillingSettings} className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold">Save Settings</button>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground bg-surface rounded-lg px-3 py-2">
              💡 Admin notification phones are managed in <strong>Settings → Admin Notification Recipients</strong>
            </p>
          </div>
        )}
      </div>

      {/* Vehicle Type Fee Summary */}
      {tab !== "center" && vehicleTypes.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-3">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><Car className="w-4 h-4" /> Monthly Fee by Vehicle Type</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {vehicleTypes.map(vt => {
              const vtDriverCount = vehicles.filter(v => v.vehicle_type_id === vt.id).length;
              const isEditing = editingVtFee === vt.id;
              return (
                <div key={vt.id} className="bg-surface rounded-lg p-3 border border-border">
                  <p className="text-xs font-semibold text-foreground">{vt.name}</p>
                  {isEditing ? (
                    <div className="flex items-center gap-1.5 mt-1">
                      <input
                        type="number"
                        min={0}
                        value={editingVtFeeValue}
                        onChange={e => setEditingVtFeeValue(parseFloat(e.target.value) || 0)}
                        className="w-20 px-2 py-1 bg-card border border-primary rounded-lg text-sm font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        autoFocus
                      />
                      <button
                        disabled={savingVtFee}
                        onClick={async () => {
                          setSavingVtFee(true);
                          await supabase.from("vehicle_types").update({ monthly_fee: editingVtFeeValue, updated_at: new Date().toISOString() } as any).eq("id", vt.id);
                          setSavingVtFee(false);
                          setEditingVtFee(null);
                          toast({ title: `${vt.name} monthly fee updated to ${editingVtFeeValue} MVR` });
                          fetchDrivers();
                        }}
                        className="w-7 h-7 rounded-lg bg-primary text-primary-foreground flex items-center justify-center"
                      >
                        <Save className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setEditingVtFee(null)} className="w-7 h-7 rounded-lg bg-surface border border-border text-muted-foreground flex items-center justify-center">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <p className="text-lg font-bold text-primary">{vt.monthly_fee || 0} MVR</p>
                      <button onClick={() => { setEditingVtFee(vt.id); setEditingVtFeeValue(vt.monthly_fee || 0); }} className="w-6 h-6 rounded-md bg-primary/10 text-primary flex items-center justify-center hover:bg-primary/20 transition-colors">
                        <Pencil className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                  <p className="text-[10px] text-muted-foreground">{vtDriverCount} driver{vtDriverCount !== 1 ? "s" : ""}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Stats */}
      {tab !== "center" && (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Expected Revenue</p>
          <p className="text-2xl font-bold text-foreground mt-0.5">{totalMonthlyRevenue.toLocaleString()} MVR</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Paying Drivers</p>
          <p className="text-2xl font-bold text-foreground mt-0.5">{payingDriversCount}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Free</p>
          <p className="text-2xl font-bold text-primary mt-0.5">{freeDriversCount}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Pending Approvals</p>
          <p className="text-2xl font-bold text-foreground mt-0.5">{pendingPayments}</p>
        </div>
      </div>
      )}

      {/* Tab toggle */}
      <div className="flex gap-2">
        <button onClick={() => setTab("drivers")} className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${tab === "drivers" ? "bg-primary text-primary-foreground" : "bg-surface text-muted-foreground hover:text-foreground"}`}>Drivers</button>
        <button onClick={() => setTab("payments")} className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors relative ${tab === "payments" ? "bg-primary text-primary-foreground" : "bg-surface text-muted-foreground hover:text-foreground"}`}>
          Payments
          {pendingPayments > 0 && <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">{pendingPayments}</span>}
        </button>
        <button onClick={() => setTab("center")} className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors relative ${tab === "center" ? "bg-primary text-primary-foreground" : "bg-surface text-muted-foreground hover:text-foreground"}`}>
          <span className="flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5" /> Center Billing</span>
          {centerPayments.filter(cp => cp.status === "pending" || cp.status === "submitted").length > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
              {centerPayments.filter(cp => cp.status === "pending" || cp.status === "submitted").length}
            </span>
          )}
        </button>
      </div>

      {tab === "drivers" && (
        <>
          {/* Search + Filters + Bulk Action */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search drivers..." className="w-full pl-10 pr-4 py-2 bg-surface border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>

            <select value={filterCompany} onChange={e => setFilterCompany(e.target.value)} className="px-3 py-2 bg-surface border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary">
              <option value="">All Companies</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>

            <select value={filterVehicleType} onChange={e => setFilterVehicleType(e.target.value)} className="px-3 py-2 bg-surface border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary">
              <option value="">All Vehicle Types</option>
              {vehicleTypes.map(vt => <option key={vt.id} value={vt.id}>{vt.name}</option>)}
            </select>

            <button onClick={() => setShowBulkModal(true)} className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors">
              <Users className="w-4 h-4" /> Bulk Free
            </button>
          </div>

          {/* Drivers billing table */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-surface">
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Driver</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Phone</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Company</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Vehicle Type</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Monthly Fee</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Status</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
                ) : filteredDrivers.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No drivers found</td></tr>
                ) : (
                  filteredDrivers.map((d) => {
                    const companyFeeFree = isCompanyFeeFree(d);
                    const temporaryFree = isFreeUntilActive(d);
                    const driverFee = getDriverFee(d.id);
                    const effectivelyFree = driverFee === 0 || companyFeeFree || temporaryFree;

                      return (
                        <React.Fragment key={d.id}>
                        <tr className="border-b border-border last:border-0 cursor-pointer hover:bg-surface/50" onClick={() => toggleExpandDriver(d.id)}>
                          <td className="px-4 py-3 text-sm font-medium text-foreground">
                            <div className="flex items-center gap-2">
                              <ChevronRight className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${expandedDriver === d.id ? "rotate-90" : ""}`} />
                              {d.first_name} {d.last_name}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">+960 {d.phone_number}</td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">
                            {getCompanyName(d)}
                            {companyFeeFree && <span className="ml-1 text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">Free</span>}
                          </td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">{getDriverVehicleTypeName(d.id)}</td>
                          <td className="px-4 py-3">
                            {effectivelyFree ? (
                              <span className="text-sm font-semibold text-primary">FREE</span>
                            ) : (
                              <span className="text-sm font-semibold text-foreground">{driverFee} MVR</span>
                            )}
                            {temporaryFree && <p className="text-[10px] text-muted-foreground">Free until {new Date(d.fee_free_until).toLocaleDateString()}</p>}
                            {temporaryFree && new Date(d.fee_free_until) < new Date("2099-01-01") && <p className="text-[9px] text-primary">🎁 From map promo / competition</p>}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-xs font-medium px-2 py-1 rounded-full ${d.status === "Active" ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`}>
                              {d.status}
                            </span>
                          </td>
                          <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {!companyFeeFree && (
                                <button onClick={() => toggleFeeFree(d.id)} className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${(isFreeUntilActive(d)) ? "text-destructive bg-destructive/10 hover:bg-destructive/20" : "text-primary bg-primary/10 hover:bg-primary/20"}`}>
                                  <ShieldCheck className="w-3 h-3" />
                                  {isFreeUntilActive(d) ? "Remove Free" : "Make Free"}
                                </button>
                              )}
                              {temporaryFree ? (
                                <button onClick={() => clearFreeUntil(d.id)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-destructive bg-destructive/10 hover:bg-destructive/20 transition-colors">
                                  <X className="w-3 h-3" /> Clear Period
                                </button>
                              ) : (
                                <button onClick={() => { setFreeUntilDriver(d.id); setFreeUntilDate(""); }} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-muted-foreground bg-surface hover:bg-muted transition-colors">
                                  <Calendar className="w-3 h-3" /> Free Period
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                        {/* Expanded billing history */}
                        {expandedDriver === d.id && (
                          <tr>
                            <td colSpan={7} className="bg-surface/30 px-6 py-4">
                              <div className="space-y-3">
                                {/* Vehicle breakdown */}
                                <div>
                                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Vehicle Fee Breakdown</p>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                    {vehicles.filter(v => v.driver_id === d.id).map(v => {
                                      const vt = vehicleTypes.find(t => t.id === v.vehicle_type_id);
                                      return (
                                        <div key={v.id} className="bg-card border border-border rounded-lg px-3 py-2 flex justify-between items-center">
                                          <div>
                                            <p className="text-xs font-medium text-foreground">{v.plate_number}</p>
                                            <p className="text-[10px] text-muted-foreground">{vt?.name || "Unknown"}</p>
                                          </div>
                                          <p className="text-sm font-bold text-foreground">{vt?.monthly_fee || 0} MVR</p>
                                        </div>
                                      );
                                    })}
                                    {vehicles.filter(v => v.driver_id === d.id).length === 0 && (
                                      <p className="text-xs text-muted-foreground col-span-full">No vehicles assigned</p>
                                    )}
                                  </div>
                                </div>
                                {/* Payment history */}
                                <div>
                                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Payment History</p>
                                  {driverPayments.length === 0 ? (
                                    <p className="text-xs text-muted-foreground">No payments recorded</p>
                                  ) : (
                                    <div className="bg-card border border-border rounded-lg overflow-hidden">
                                      <table className="w-full">
                                        <thead>
                                          <tr className="border-b border-border bg-surface">
                                            <th className="text-left text-[10px] font-semibold text-muted-foreground px-3 py-2">Month</th>
                                            <th className="text-left text-[10px] font-semibold text-muted-foreground px-3 py-2">Amount</th>
                                            <th className="text-left text-[10px] font-semibold text-muted-foreground px-3 py-2">Status</th>
                                            <th className="text-left text-[10px] font-semibold text-muted-foreground px-3 py-2">Submitted</th>
                                            <th className="text-left text-[10px] font-semibold text-muted-foreground px-3 py-2">Slip</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {driverPayments.map(p => (
                                            <tr key={p.id} className="border-b border-border last:border-0">
                                              <td className="px-3 py-2 text-xs text-foreground">{p.payment_month}</td>
                                              <td className="px-3 py-2 text-xs font-semibold text-foreground">{p.amount} MVR</td>
                                              <td className="px-3 py-2">
                                                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                                                  p.status === "approved" ? "bg-primary/10 text-primary" :
                                                  p.status === "rejected" ? "bg-destructive/10 text-destructive" :
                                                  p.status === "submitted" ? "bg-accent text-accent-foreground" :
                                                  "bg-muted text-muted-foreground"
                                                }`}>{p.status}</span>
                                              </td>
                                              <td className="px-3 py-2 text-[10px] text-muted-foreground">{p.submitted_at ? new Date(p.submitted_at).toLocaleDateString() : "—"}</td>
                                              <td className="px-3 py-2">
                                                {p.slip_url ? (
                                                  <button onClick={() => setSelectedPayment({ ...p, driver: d })} className="text-[10px] text-primary font-medium hover:underline flex items-center gap-0.5">
                                                    <Eye className="w-3 h-3" /> View
                                                  </button>
                                                ) : (
                                                  <span className="text-[10px] text-muted-foreground">—</span>
                                                )}
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                        </React.Fragment>
                      );
                    })
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "payments" && (
        <>
          <div className="flex items-center gap-3">
            <select value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value)} className="px-3 py-2 bg-surface border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary">
              <option value="all">All Payments</option>
              <option value="submitted">Pending Approval</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-surface">
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Driver</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Amount</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Month</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Slip</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Status</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Submitted</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {payments.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No payments found</td></tr>
                ) : (
                  payments.map((p) => (
                    <tr key={p.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 text-sm font-medium text-foreground">
                        {p.driver?.first_name} {p.driver?.last_name}
                        <p className="text-[10px] text-muted-foreground">+960 {p.driver?.phone_number}</p>
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-foreground">{p.amount} MVR</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{p.payment_month}</td>
                      <td className="px-4 py-3">
                        {p.slip_url ? (
                          <button onClick={() => setSelectedPayment(p)} className="flex items-center gap-1 text-xs text-primary font-medium hover:underline">
                            <Image className="w-3 h-3" /> View Slip
                          </button>
                        ) : (
                          <span className="text-xs text-muted-foreground">No slip</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                          p.status === "approved" ? "bg-primary/10 text-primary" :
                          p.status === "rejected" ? "bg-destructive/10 text-destructive" :
                          p.status === "submitted" ? "bg-accent text-accent-foreground" :
                          "bg-muted text-muted-foreground"
                        }`}>{p.status}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{p.submitted_at ? new Date(p.submitted_at).toLocaleString() : "—"}</td>
                      <td className="px-4 py-3">
                        {p.status === "submitted" && (
                          <div className="flex items-center gap-1.5">
                            <button onClick={() => setSelectedPayment(p)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/20">
                              <Eye className="w-3 h-3" /> Review
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Single driver Free-until modal */}
      {freeUntilDriver && (
        <div className="fixed inset-0 z-50 bg-foreground/30 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setFreeUntilDriver(null)}>
          <div className="bg-card border border-border rounded-xl p-5 w-full max-w-sm space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-foreground">Set Free Period</h3>
              <button onClick={() => setFreeUntilDriver(null)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-sm text-muted-foreground">Driver: <span className="font-medium text-foreground">{drivers.find(d => d.id === freeUntilDriver)?.first_name} {drivers.find(d => d.id === freeUntilDriver)?.last_name}</span></p>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Free until date</label>
              <input type="date" value={freeUntilDate} onChange={(e) => setFreeUntilDate(e.target.value)} className="w-full mt-1 px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <button onClick={setFreeUntil} disabled={!freeUntilDate} className="w-full bg-primary text-primary-foreground py-2 rounded-lg text-sm font-semibold disabled:opacity-50">Set Free Period</button>
          </div>
        </div>
      )}

      {/* Bulk Free Modal */}
      {showBulkModal && (
        <div className="fixed inset-0 z-50 bg-foreground/30 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowBulkModal(false)}>
          <div className="bg-card border border-border rounded-xl p-5 w-full max-w-md space-y-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-foreground flex items-center gap-2"><Users className="w-5 h-5 text-primary" /> Bulk Free Period</h3>
              <button onClick={() => setShowBulkModal(false)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>

            <p className="text-sm text-muted-foreground">Set a free period for multiple drivers at once by selecting a company or vehicle type.</p>

            {/* Filter type toggle */}
            <div className="flex gap-2">
              <button onClick={() => { setBulkFilterType("company"); setBulkFilterId(""); }} className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors ${bulkFilterType === "company" ? "bg-primary text-primary-foreground" : "bg-surface text-muted-foreground hover:text-foreground border border-border"}`}>
                <Users className="w-4 h-4" /> By Company
              </button>
              <button onClick={() => { setBulkFilterType("vehicle_type"); setBulkFilterId(""); }} className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors ${bulkFilterType === "vehicle_type" ? "bg-primary text-primary-foreground" : "bg-surface text-muted-foreground hover:text-foreground border border-border"}`}>
                <Car className="w-4 h-4" /> By Vehicle Type
              </button>
            </div>

            {/* Filter selection */}
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                {bulkFilterType === "company" ? "Select Company" : "Select Vehicle Type"}
              </label>
              <select value={bulkFilterId} onChange={e => setBulkFilterId(e.target.value)} className="w-full mt-1 px-3 py-2.5 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary">
                <option value="">— Select —</option>
                {bulkFilterType === "company"
                  ? <><option value="__all__">All Companies</option>{companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</>
                  : vehicleTypes.map(vt => <option key={vt.id} value={vt.id}>{vt.name} ({vt.base_fare} MVR)</option>)
                }
              </select>
            </div>

            {/* Preview count */}
            {bulkFilterId && (
              <div className="bg-surface rounded-lg px-4 py-3 border border-border">
                <p className="text-sm text-foreground">
                  <span className="font-bold text-primary">{getBulkCount()}</span> driver{getBulkCount() !== 1 ? "s" : ""} will be affected
                </p>
              </div>
            )}

            {/* Date picker */}
            <div>
              <label className="text-xs font-medium text-muted-foreground">Free until date</label>
              <input type="date" value={bulkFreeDate} onChange={(e) => setBulkFreeDate(e.target.value)} className="w-full mt-1 px-3 py-2.5 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>

            <button onClick={applyBulkFeeFree} disabled={(!bulkFilterId && bulkFilterType !== "company") || !bulkFreeDate || bulkApplying || getBulkCount() === 0} className="w-full bg-primary text-primary-foreground py-3 rounded-xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2">
              {bulkApplying ? (
                <><Clock className="w-4 h-4 animate-spin" /> Applying...</>
              ) : (
                <>Apply to {getBulkCount()} Driver{getBulkCount() !== 1 ? "s" : ""}</>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Payment review modal */}
      {selectedPayment && (
        <div className="fixed inset-0 z-50 bg-foreground/30 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setSelectedPayment(null)}>
          <div className="bg-card border border-border rounded-2xl w-full max-w-sm max-h-[85vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
              <h3 className="font-bold text-foreground">Review Payment</h3>
              <button onClick={() => setSelectedPayment(null)} className="w-8 h-8 rounded-full bg-surface flex items-center justify-center"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-4 space-y-4 overflow-y-auto min-h-0">
              <div className="bg-surface rounded-xl p-3 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Driver</span><span className="font-medium text-foreground">{selectedPayment.driver?.first_name} {selectedPayment.driver?.last_name}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Phone</span><span className="font-medium text-foreground">+960 {selectedPayment.driver?.phone_number}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Amount</span><span className="font-bold text-foreground">{selectedPayment.amount} MVR</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Month</span><span className="font-medium text-foreground">{selectedPayment.payment_month}</span></div>
              </div>

              {selectedPayment.slip_url && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Payment Slip</p>
                  <img src={selectedPayment.slip_url} alt="Payment slip" className="w-full max-h-64 object-contain rounded-xl border border-border bg-surface" />
                </div>
              )}

              {selectedPayment.status === "submitted" && (
                <div className="flex gap-3">
                  <button onClick={() => approvePayment(selectedPayment.id)} className="flex-1 flex items-center justify-center gap-2 bg-primary text-primary-foreground py-3 rounded-xl text-sm font-semibold">
                    <CheckCircle className="w-4 h-4" /> Approve
                  </button>
                  <button onClick={() => {
                    const reason = prompt("Rejection reason:");
                    if (reason) rejectPayment(selectedPayment.id, reason);
                  }} className="flex-1 flex items-center justify-center gap-2 bg-destructive/10 text-destructive py-3 rounded-xl text-sm font-semibold">
                    <XCircle className="w-4 h-4" /> Reject
                  </button>
                </div>
              )}

              {selectedPayment.status === "approved" && (
                <div className="bg-primary/10 text-primary text-sm font-medium p-3 rounded-xl flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" /> Approved {selectedPayment.approved_at ? `on ${new Date(selectedPayment.approved_at).toLocaleString()}` : ""}
                </div>
              )}

              {selectedPayment.status === "rejected" && (
                <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-xl">
                  <p className="font-medium flex items-center gap-2"><XCircle className="w-4 h-4" /> Rejected</p>
                  {selectedPayment.rejection_reason && <p className="text-xs mt-1">{selectedPayment.rejection_reason}</p>}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ==================== CENTER BILLING TAB ==================== */}
      {tab === "center" && (
        <div className="space-y-5">
          {/* Center Fee Settings by Vehicle Type */}
          <div className="bg-card border border-border rounded-xl p-5 space-y-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><Building2 className="w-4 h-4" /> Center Fee by Vehicle Type</h3>
            <p className="text-[11px] text-muted-foreground">Set the monthly center fee for vehicles with center codes. These vehicles are app-free but pay to the center.</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {vehicleTypes.map(vt => {
                const centerVtCount = centerVehicles.filter(v => v.vehicle_type_id === vt.id).length;
                const isEditing = editingCenterFee === vt.id;
                return (
                  <div key={vt.id} className="bg-surface rounded-lg p-3 border border-border">
                    <p className="text-xs font-semibold text-foreground">{vt.name}</p>
                    {isEditing ? (
                      <div className="flex items-center gap-1.5 mt-1">
                        <input
                          type="number"
                          min={0}
                          value={editingCenterFeeValue}
                          onChange={e => setEditingCenterFeeValue(parseFloat(e.target.value) || 0)}
                          className="w-20 px-2 py-1 bg-card border border-primary rounded-lg text-sm font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                          autoFocus
                        />
                        <button
                          disabled={savingCenterFee}
                          onClick={async () => {
                            setSavingCenterFee(true);
                            await supabase.from("vehicle_types").update({ center_fee: editingCenterFeeValue, updated_at: new Date().toISOString() } as any).eq("id", vt.id);
                            setSavingCenterFee(false);
                            setEditingCenterFee(null);
                            toast({ title: `${vt.name} center fee updated to ${editingCenterFeeValue} MVR` });
                            fetchDrivers();
                          }}
                          className="w-7 h-7 rounded-lg bg-primary text-primary-foreground flex items-center justify-center"
                        >
                          <Save className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setEditingCenterFee(null)} className="w-7 h-7 rounded-lg bg-surface border border-border text-muted-foreground flex items-center justify-center">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <p className="text-lg font-bold text-chart-2">{(vt as any).center_fee || 0} MVR</p>
                        <button onClick={() => { setEditingCenterFee(vt.id); setEditingCenterFeeValue((vt as any).center_fee || 0); }} className="w-6 h-6 rounded-md bg-chart-2/10 text-chart-2 flex items-center justify-center hover:bg-chart-2/20 transition-colors">
                          <Pencil className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                    <p className="text-[10px] text-muted-foreground">{centerVtCount} center vehicle{centerVtCount !== 1 ? "s" : ""}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Center Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs text-muted-foreground">Center Vehicles</p>
              <p className="text-2xl font-bold text-foreground mt-0.5">{centerVehicles.length}</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs text-muted-foreground">Expected Revenue</p>
              <p className="text-2xl font-bold text-foreground mt-0.5">
                {centerVehicles.reduce((sum, cv) => {
                  if (cv.center_fee_exempt) return sum;
                  const vt = vehicleTypes.find(v => v.id === cv.vehicle_type_id);
                  return sum + ((vt as any)?.center_fee || 0);
                }, 0).toLocaleString()} MVR
              </p>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs text-muted-foreground">Received</p>
              <p className="text-2xl font-bold text-primary mt-0.5">
                {centerMonthPayments.filter(cp => cp.status === "approved").reduce((sum, cp) => sum + (cp.amount || 0), 0).toLocaleString()} MVR
              </p>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs text-muted-foreground">Pending</p>
              <p className="text-2xl font-bold text-chart-4 mt-0.5">{centerMonthPayments.filter(cp => cp.status === "pending" || cp.status === "submitted").length}</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs text-muted-foreground">Approved</p>
              <p className="text-2xl font-bold text-primary mt-0.5">{centerMonthPayments.filter(cp => cp.status === "approved").length}</p>
            </div>
          </div>

          {/* SMS Reminder & Template Section */}
          <div className="bg-card border border-border rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <MessageSquare className="w-4 h-4" /> Payment Reminder SMS
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowSmsTemplateEditor(!showSmsTemplateEditor)}
                  className="px-3 py-1.5 bg-surface border border-border rounded-lg text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
                >
                  <Pencil className="w-3 h-3" /> Edit Template
                </button>
                <button
                  onClick={() => { setSmsReminderResult(null); setShowSmsReminderModal(true); }}
                  className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:bg-primary/90 transition-colors flex items-center gap-1.5"
                >
                  <Send className="w-3 h-3" /> Send Reminders
                </button>
              </div>
            </div>

            {/* Template Editor */}
            {showSmsTemplateEditor && (
              <div className="space-y-2 border-t border-border pt-3">
                <p className="text-[11px] text-muted-foreground">
                  Available placeholders: <code className="bg-surface px-1 rounded text-[10px]">{"{driver_name}"}</code> <code className="bg-surface px-1 rounded text-[10px]">{"{amount}"}</code> <code className="bg-surface px-1 rounded text-[10px]">{"{plate}"}</code> <code className="bg-surface px-1 rounded text-[10px]">{"{center_code}"}</code> <code className="bg-surface px-1 rounded text-[10px]">{"{month}"}</code>
                </p>
                <textarea
                  value={smsTemplate}
                  onChange={e => setSmsTemplate(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 bg-surface border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                  placeholder="Enter SMS template..."
                />
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-muted-foreground">{smsTemplate.length} chars · {Math.ceil(smsTemplate.length / 160) || 0} SMS</p>
                  <button
                    onClick={saveSmsTemplate}
                    disabled={smsTemplateSaving}
                    className="px-4 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-semibold disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <Save className="w-3 h-3" /> {smsTemplateSaving ? "Saving..." : "Save Template"}
                  </button>
                </div>

                {/* Preview */}
                <div className="bg-surface rounded-lg p-3 border border-border">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Preview</p>
                  <p className="text-xs text-foreground whitespace-pre-wrap">
                    {smsTemplate
                      .replace(/\{driver_name\}/g, "Ahmed Ali")
                      .replace(/\{amount\}/g, "600")
                      .replace(/\{plate\}/g, "P1234")
                      .replace(/\{center_code\}/g, "5")
                      .replace(/\{month\}/g, centerMonth)}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Center Vehicles List */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-wrap gap-2">
              <h3 className="text-sm font-semibold text-foreground">Center Vehicles</h3>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Plate / Code"
                    value={centerSearch}
                    onChange={e => setCenterSearch(e.target.value)}
                    className="pl-6 pr-2 py-1 w-28 bg-surface border border-border rounded-lg text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <input
                  type="month"
                  value={centerMonth}
                  onChange={e => setCenterMonth(e.target.value)}
                  className="px-2 py-1 bg-surface border border-border rounded-lg text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <select value={centerFilter} onChange={e => setCenterFilter(e.target.value)} className="px-2 py-1 bg-surface border border-border rounded-lg text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary">
                  <option value="all">All</option>
                  <option value="pending">Pending</option>
                  <option value="submitted">Submitted</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>
                {selectedCenterIds.size > 0 && (
                  <>
                    <button
                      disabled={bulkPaying}
                      onClick={async () => {
                        if (!confirm(`Mark ${selectedCenterIds.size} vehicles as paid for ${centerMonth}?`)) return;
                        setBulkPaying(true);
                        for (const cvId of selectedCenterIds) {
                          const cv = centerVehicles.find((v: any) => v.id === cvId);
                          if (!cv) continue;
                          const existing = centerMonthPayments.find((cp: any) => cp.vehicle_id === cvId);
                          if (existing?.status === "approved") continue;
                          const vt = vehicleTypes.find((v: any) => v.id === cv.vehicle_type_id);
                          const fee = cv.center_fee_exempt ? 0 : ((vt as any)?.center_fee || 0);
                          if (existing) {
                            await supabase.from("center_payments").update({ status: "approved", approved_at: new Date().toISOString(), updated_at: new Date().toISOString() } as any).eq("id", existing.id);
                          } else {
                            await supabase.from("center_payments").insert({ driver_id: cv.driver_id, vehicle_id: cv.id, vehicle_type_id: cv.vehicle_type_id, amount: fee, payment_month: centerMonth, status: "approved", approved_at: new Date().toISOString() } as any);
                          }
                          if (!cv.is_active) {
                            await supabase.from("vehicles").update({ is_active: true } as any).eq("id", cv.id);
                          }
                        }
                        setBulkPaying(false);
                        setSelectedCenterIds(new Set());
                        toast({ title: `${selectedCenterIds.size} vehicles marked as paid` });
                        fetchCenterData();
                      }}
                      className="px-3 py-1 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:bg-primary/90 disabled:opacity-50"
                    >
                      {bulkPaying ? "Processing..." : `Mark ${selectedCenterIds.size} Paid`}
                    </button>
                    <button
                      disabled={bulkPaying}
                      onClick={async () => {
                        if (!confirm(`Mark ${selectedCenterIds.size} vehicles as unpaid for ${centerMonth}?`)) return;
                        setBulkPaying(true);
                        for (const cvId of selectedCenterIds) {
                          const existing = centerMonthPayments.find((cp: any) => cp.vehicle_id === cvId);
                          if (existing) {
                            await supabase.from("center_payments").delete().eq("id", existing.id);
                          }
                        }
                        setBulkPaying(false);
                        setSelectedCenterIds(new Set());
                        toast({ title: `${selectedCenterIds.size} vehicles marked as unpaid` });
                        fetchCenterData();
                      }}
                      className="px-3 py-1 bg-destructive/10 text-destructive rounded-lg text-xs font-semibold hover:bg-destructive/20 disabled:opacity-50"
                    >
                      {bulkPaying ? "Processing..." : `Mark ${selectedCenterIds.size} Unpaid`}
                    </button>
                  </>
                )}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-surface">
                    <th className="px-2 py-2">
                      <input
                        type="checkbox"
                        checked={selectedCenterIds.size > 0 && selectedCenterIds.size === centerVehicles.length}
                        onChange={e => {
                          if (e.target.checked) {
                            setSelectedCenterIds(new Set(centerVehicles.map(cv => cv.id)));
                          } else {
                            setSelectedCenterIds(new Set());
                          }
                        }}
                        className="w-3.5 h-3.5 rounded border-border accent-primary"
                      />
                    </th>
                    <th className="text-left text-[10px] font-semibold text-muted-foreground px-3 py-2">Driver</th>
                    <th className="text-left text-[10px] font-semibold text-muted-foreground px-3 py-2">Wallet</th>
                    <th className="text-left text-[10px] font-semibold text-muted-foreground px-3 py-2">Plate</th>
                    <th className="text-left text-[10px] font-semibold text-muted-foreground px-3 py-2">Center Code</th>
                    <th className="text-left text-[10px] font-semibold text-muted-foreground px-3 py-2">Type</th>
                    <th className="text-left text-[10px] font-semibold text-muted-foreground px-3 py-2">Center Fee</th>
                    <th className="text-left text-[10px] font-semibold text-muted-foreground px-3 py-2">App Fee</th>
                    <th className="text-left text-[10px] font-semibold text-muted-foreground px-3 py-2">{centerMonth} Status</th>
                    <th className="text-left text-[10px] font-semibold text-muted-foreground px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {centerVehicles.filter(cv => {
                    if (!centerSearch) return true;
                    const s = centerSearch.toLowerCase();
                    const driver = drivers.find(d => d.id === cv.driver_id);
                    const driverName = driver ? `${driver.first_name} ${driver.last_name}`.toLowerCase() : "";
                    return (cv.plate_number || "").toLowerCase().includes(s) || (cv.center_code || "").toLowerCase().includes(s) || driverName.includes(s);
                  }).map(cv => {
                    const driver = drivers.find(d => d.id === cv.driver_id);
                    const vt = vehicleTypes.find(v => v.id === cv.vehicle_type_id);
                    const centerFee = cv.center_fee_exempt ? 0 : ((vt as any)?.center_fee || 0);
                    const monthPayment = centerMonthPayments.find(cp => cp.vehicle_id === cv.id);
                    const isEditing = editingCenterVehicle === cv.id;
                    return (
                      <tr key={cv.id} className={`border-t border-border hover:bg-muted/30 ${selectedCenterIds.has(cv.id) ? "bg-primary/5" : ""}`}>
                        <td className="px-2 py-2">
                            <input
                              type="checkbox"
                              checked={selectedCenterIds.has(cv.id)}
                              onChange={e => {
                                const next = new Set(selectedCenterIds);
                                e.target.checked ? next.add(cv.id) : next.delete(cv.id);
                                setSelectedCenterIds(next);
                              }}
                              className="w-3.5 h-3.5 rounded border-border accent-primary"
                            />
                        </td>
                        <td className="px-3 py-2 text-xs text-foreground">
                          {driver ? `${driver.first_name} ${driver.last_name}` : "—"}
                          <div className="text-[10px] text-muted-foreground">{driver?.phone_number}</div>
                        </td>
                        <td className="px-3 py-2 text-xs font-semibold text-chart-2">
                          {cv.driver_id ? `${(centerWallets.get(cv.driver_id) || 0).toLocaleString()} MVR` : "—"}
                        </td>
                        <td className="px-3 py-2 text-xs font-mono text-foreground">
                          {isEditing ? (
                            <input value={editCenterVehicleData.plate_number || ""} onChange={e => setEditCenterVehicleData((p: any) => ({ ...p, plate_number: e.target.value }))} className="w-20 px-1 py-0.5 bg-surface border border-border rounded text-[10px]" />
                          ) : cv.plate_number}
                        </td>
                        <td className="px-3 py-2 text-xs font-mono font-bold text-chart-2">
                          {isEditing ? (
                            <input value={editCenterVehicleData.center_code || ""} onChange={e => setEditCenterVehicleData((p: any) => ({ ...p, center_code: e.target.value }))} className="w-16 px-1 py-0.5 bg-surface border border-border rounded text-[10px]" />
                          ) : cv.center_code}
                        </td>
                        <td className="px-3 py-2 text-xs text-foreground">
                          {isEditing ? (
                            <select value={editCenterVehicleData.vehicle_type_id || ""} onChange={e => setEditCenterVehicleData((p: any) => ({ ...p, vehicle_type_id: e.target.value }))} className="px-1 py-0.5 bg-surface border border-border rounded text-[10px]">
                              {vehicleTypes.map(vt2 => <option key={vt2.id} value={vt2.id}>{vt2.name}</option>)}
                            </select>
                          ) : (vt?.name || "—")}
                        </td>
                        <td className="px-3 py-2 text-xs font-bold text-foreground">
                          <div className="flex items-center gap-1">
                            <span className={cv.center_fee_exempt ? "line-through text-muted-foreground" : ""}>{centerFee} MVR</span>
                            <button
                              onClick={async () => {
                                const newVal = !cv.center_fee_exempt;
                                await supabase.from("vehicles").update({ center_fee_exempt: newVal } as any).eq("id", cv.id);
                                toast({ title: newVal ? "Vehicle exempt from center fee" : "Center fee restored" });
                                fetchCenterData();
                              }}
                              className={`px-1.5 py-0.5 rounded-full text-[9px] font-semibold ${cv.center_fee_exempt ? "bg-chart-2/10 text-chart-2" : "bg-muted text-muted-foreground"}`}
                            >
                              {cv.center_fee_exempt ? "Free" : "Exempt"}
                            </button>
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <button
                            onClick={async () => {
                              const newVal = !cv.pays_app_fee;
                              await supabase.from("vehicles").update({ pays_app_fee: newVal } as any).eq("id", cv.id);
                              toast({ title: newVal ? "App fee enabled" : "App fee disabled" });
                              fetchCenterData();
                            }}
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${cv.pays_app_fee ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}
                          >
                            {cv.pays_app_fee ? "Yes" : "No"}
                          </button>
                        </td>
                        <td className="px-3 py-2">
                          {monthPayment ? (
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              monthPayment.status === "approved" ? "bg-primary/10 text-primary" :
                              monthPayment.status === "rejected" ? "bg-destructive/10 text-destructive" :
                              monthPayment.status === "submitted" ? "bg-chart-4/10 text-chart-4" :
                              "bg-muted text-muted-foreground"
                            }`}>
                              {monthPayment.status === "approved" && <CheckCircle className="w-3 h-3" />}
                              {monthPayment.status === "rejected" && <XCircle className="w-3 h-3" />}
                              {monthPayment.status === "submitted" && <Clock className="w-3 h-3" />}
                              {monthPayment.status}
                            </span>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">Not paid</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            {isEditing ? (
                              <>
                                <button
                                  onClick={async () => {
                                    await supabase.from("vehicles").update({
                                      plate_number: editCenterVehicleData.plate_number,
                                      center_code: editCenterVehicleData.center_code,
                                      vehicle_type_id: editCenterVehicleData.vehicle_type_id,
                                    } as any).eq("id", cv.id);
                                    toast({ title: "Vehicle updated" });
                                    setEditingCenterVehicle(null);
                                    fetchCenterData();
                                  }}
                                  className="px-2 py-1 bg-primary/10 text-primary rounded-lg text-[10px] font-semibold hover:bg-primary/20"
                                >
                                  <Save className="w-3 h-3" />
                                </button>
                                <button onClick={() => setEditingCenterVehicle(null)} className="px-2 py-1 bg-muted text-muted-foreground rounded-lg text-[10px] font-semibold hover:text-foreground">
                                  <X className="w-3 h-3" />
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => {
                                  setEditingCenterVehicle(cv.id);
                                  setEditCenterVehicleData({ plate_number: cv.plate_number, center_code: cv.center_code, vehicle_type_id: cv.vehicle_type_id });
                                }}
                                className="px-2 py-1 bg-surface border border-border rounded-lg text-[10px] font-semibold text-muted-foreground hover:text-foreground"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                            )}
                            <button
                              onClick={async () => {
                                setCenterHistoryVehicle(cv);
                                setCenterHistoryLoading(true);
                                const { data } = await supabase.from("center_payments").select("*").eq("vehicle_id", cv.id).order("payment_month", { ascending: false });
                                setCenterHistory((data as any[]) || []);
                                setCenterHistoryLoading(false);
                              }}
                              className="px-2 py-1 bg-surface border border-border rounded-lg text-[10px] font-semibold text-muted-foreground hover:text-foreground"
                              title="Payment history"
                            >
                              <Calendar className="w-3 h-3" />
                            </button>
                            {(!monthPayment || monthPayment.status === "rejected") && (
                              <button
                                onClick={async () => {
                                  if (monthPayment) {
                                    await supabase.from("center_payments").update({ status: "approved", approved_at: new Date().toISOString(), updated_at: new Date().toISOString() } as any).eq("id", monthPayment.id);
                                  } else {
                                    await supabase.from("center_payments").insert({
                                      driver_id: cv.driver_id,
                                      vehicle_id: cv.id,
                                      vehicle_type_id: cv.vehicle_type_id,
                                      amount: centerFee,
                                      payment_month: centerMonth,
                                      status: "approved",
                                      approved_at: new Date().toISOString(),
                                    } as any);
                                  }
                                  // Reactivate vehicle if it was deactivated
                                  if (!cv.is_active) {
                                    await supabase.from("vehicles").update({ is_active: true } as any).eq("id", cv.id);
                                  }
                                  toast({ title: "Marked as paid" });
                                  fetchCenterData();
                                }}
                                className="px-2 py-1 bg-primary/10 text-primary rounded-lg text-[10px] font-semibold hover:bg-primary/20"
                              >
                                Mark Paid
                              </button>
                            )}
                            {monthPayment?.status === "submitted" && (
                              <>
                                <button
                                  onClick={async () => {
                                    await supabase.from("center_payments").update({ status: "approved", approved_at: new Date().toISOString(), updated_at: new Date().toISOString() } as any).eq("id", monthPayment.id);
                                    if (!cv.is_active) {
                                      await supabase.from("vehicles").update({ is_active: true } as any).eq("id", cv.id);
                                    }
                                    toast({ title: "Payment approved" });
                                    fetchCenterData();
                                  }}
                                  className="px-2 py-1 bg-primary/10 text-primary rounded-lg text-[10px] font-semibold hover:bg-primary/20"
                                >
                                  Approve
                                </button>
                                <button
                                  onClick={async () => {
                                    const reason = prompt("Rejection reason:");
                                    if (reason === null) return;
                                    await supabase.from("center_payments").update({ status: "rejected", admin_notes: reason, updated_at: new Date().toISOString() } as any).eq("id", monthPayment.id);
                                    toast({ title: "Payment rejected" });
                                    fetchCenterData();
                                  }}
                                  className="px-2 py-1 bg-destructive/10 text-destructive rounded-lg text-[10px] font-semibold hover:bg-destructive/20"
                                >
                                  Reject
                                </button>
                              </>
                            )}
                            {monthPayment?.slip_url && (
                              <button
                                onClick={() => setSelectedCenterPayment(monthPayment)}
                                className="px-2 py-1 bg-surface border border-border rounded-lg text-[10px] font-semibold text-muted-foreground hover:text-foreground"
                              >
                                <Eye className="w-3 h-3" />
                              </button>
                            )}
                            {monthPayment?.status === "approved" && (
                              <span className="text-[10px] text-primary font-semibold">✓ Paid</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {centerVehicles.length === 0 && (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-muted-foreground">No center vehicles found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Center Payment Slip Viewer */}
      {selectedCenterPayment && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setSelectedCenterPayment(null)}>
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-foreground">Center Payment Slip</h3>
              <button onClick={() => setSelectedCenterPayment(null)} className="w-8 h-8 rounded-full bg-surface flex items-center justify-center text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>
            {selectedCenterPayment.slip_url && (
              <img src={selectedCenterPayment.slip_url} alt="Payment slip" className="w-full rounded-xl border border-border" />
            )}
            <div className="text-xs text-muted-foreground space-y-1">
              <p><strong>Amount:</strong> {selectedCenterPayment.amount} MVR</p>
              <p><strong>Month:</strong> {selectedCenterPayment.payment_month}</p>
              <p><strong>Status:</strong> {selectedCenterPayment.status}</p>
              {selectedCenterPayment.notes && <p><strong>Notes:</strong> {selectedCenterPayment.notes}</p>}
            </div>
          </div>
        </div>
      )}

      {/* Center Payment History Modal */}
      {centerHistoryVehicle && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setCenterHistoryVehicle(null)}>
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-lg p-5 space-y-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-foreground">Payment History</h3>
                <p className="text-xs text-muted-foreground">{centerHistoryVehicle.plate_number} — Code {centerHistoryVehicle.center_code}</p>
              </div>
              <button onClick={() => setCenterHistoryVehicle(null)} className="w-8 h-8 rounded-full bg-surface flex items-center justify-center text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>
            {centerHistoryLoading ? (
              <p className="text-sm text-muted-foreground text-center py-4">Loading...</p>
            ) : centerHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No payment history found</p>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="bg-surface">
                    <th className="text-left text-[10px] font-semibold text-muted-foreground px-3 py-2">Month</th>
                    <th className="text-left text-[10px] font-semibold text-muted-foreground px-3 py-2">Amount</th>
                    <th className="text-left text-[10px] font-semibold text-muted-foreground px-3 py-2">Status</th>
                    <th className="text-left text-[10px] font-semibold text-muted-foreground px-3 py-2">Date</th>
                    <th className="text-left text-[10px] font-semibold text-muted-foreground px-3 py-2">Slip</th>
                  </tr>
                </thead>
                <tbody>
                  {centerHistory.map((h: any) => (
                    <tr key={h.id} className="border-t border-border">
                      <td className="px-3 py-2 text-xs font-mono text-foreground">{h.payment_month}</td>
                      <td className="px-3 py-2 text-xs font-semibold text-foreground">{h.amount} MVR</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          h.status === "approved" ? "bg-primary/10 text-primary" :
                          h.status === "rejected" ? "bg-destructive/10 text-destructive" :
                          h.status === "submitted" ? "bg-chart-4/10 text-chart-4" :
                          "bg-muted text-muted-foreground"
                        }`}>
                          {h.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-[10px] text-muted-foreground">
                        {h.approved_at ? new Date(h.approved_at).toLocaleDateString() : h.submitted_at ? new Date(h.submitted_at).toLocaleDateString() : "—"}
                      </td>
                      <td className="px-3 py-2">
                        {h.slip_url ? (
                          <button onClick={() => { setCenterHistoryVehicle(null); setSelectedCenterPayment(h); }} className="text-[10px] text-primary font-semibold underline">View</button>
                        ) : <span className="text-[10px] text-muted-foreground">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* SMS Reminder Confirmation Modal */}
      {showSmsReminderModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-foreground/40 backdrop-blur-sm p-4" onClick={() => !smsReminderSending && setShowSmsReminderModal(false)}>
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="bg-primary/10 p-4 text-center">
              <Send className="w-8 h-8 text-primary mx-auto mb-2" />
              <h3 className="text-lg font-bold text-foreground">Send Payment Reminders</h3>
              <p className="text-xs text-muted-foreground mt-1">Send SMS to drivers with unpaid center fees for {centerMonth}</p>
            </div>
            <div className="p-4 space-y-3">
              {(() => {
                const unpaidCount = centerVehicles.filter(cv => {
                  if (cv.center_fee_exempt) return false;
                  const mp = centerMonthPayments.find((cp: any) => cp.vehicle_id === cv.id);
                  return !mp || (mp.status !== "approved" && mp.status !== "completed");
                }).length;
                const unpaidDriverIds = new Set(
                  centerVehicles.filter(cv => {
                    if (cv.center_fee_exempt) return false;
                    const mp = centerMonthPayments.find((cp: any) => cp.vehicle_id === cv.id);
                    return !mp || (mp.status !== "approved" && mp.status !== "completed");
                  }).map(cv => cv.driver_id)
                );
                return (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-surface rounded-lg p-3 text-center">
                        <p className="text-lg font-bold text-foreground">{unpaidCount}</p>
                        <p className="text-[10px] text-muted-foreground">Unpaid Vehicles</p>
                      </div>
                      <div className="bg-surface rounded-lg p-3 text-center">
                        <p className="text-lg font-bold text-foreground">{unpaidDriverIds.size}</p>
                        <p className="text-[10px] text-muted-foreground">Drivers to notify</p>
                      </div>
                    </div>
                    <div className="bg-surface rounded-lg p-3 border border-border">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Message Preview</p>
                      <p className="text-xs text-foreground whitespace-pre-wrap">
                        {smsTemplate
                          .replace(/\{driver_name\}/g, "Driver Name")
                          .replace(/\{amount\}/g, "XXX")
                          .replace(/\{plate\}/g, "PXXXX")
                          .replace(/\{center_code\}/g, "XX")
                          .replace(/\{month\}/g, centerMonth)}
                      </p>
                    </div>
                  </>
                );
              })()}

              {smsReminderResult && (
                <div className={`rounded-lg p-3 text-center ${smsReminderResult.failed > 0 ? "bg-destructive/10" : "bg-primary/10"}`}>
                  <p className="text-sm font-semibold text-foreground">
                    ✅ {smsReminderResult.sent} sent {smsReminderResult.failed > 0 && <span className="text-destructive">· ❌ {smsReminderResult.failed} failed</span>}
                  </p>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => setShowSmsReminderModal(false)}
                  disabled={smsReminderSending}
                  className="flex-1 py-2.5 rounded-xl bg-surface text-foreground text-sm font-semibold disabled:opacity-50"
                >
                  {smsReminderResult ? "Close" : "Cancel"}
                </button>
                {!smsReminderResult && (
                  <button
                    onClick={sendCenterPaymentReminders}
                    disabled={smsReminderSending}
                    className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {smsReminderSending ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending...</> : <><Send className="w-4 h-4" /> Send Now</>}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminBilling;
