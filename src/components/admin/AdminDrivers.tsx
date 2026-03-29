import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Search, UserCheck, UserX, Pencil, Trash2, X, Upload, Eye, Download, FileUp, Loader2, Plus, ChevronDown, ChevronUp, Car, Star, ThumbsDown, CheckSquare, Square, AlertTriangle, Clock, ShieldCheck, Filter, Check, XCircle, Image, Building2, Ban, ShieldOff } from "lucide-react";
import VehicleMakeModelSelect from "@/components/VehicleMakeModelSelect";

const emptyVehicleForm = { plate_number: "", make: "", model: "", color: "", year: "", vehicle_type_id: "", image_url: "", registration_url: "", insurance_url: "", vehicle_status: "pending", rejection_reason: "", center_code: "" };

type StatusFilter = "all" | "Active" | "Inactive" | "Pending" | "Pending Review" | "Rejected";

const AdminDrivers = () => {
  const [drivers, setDrivers] = useState<any[]>([]);
  const [banks, setBanks] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [vehicleTypes, setVehicleTypes] = useState<any[]>([]);
  const [driverVehicles, setDriverVehicles] = useState<Record<string, any[]>>({});
  const [allBankAccountsMap, setAllBankAccountsMap] = useState<Record<string, any[]>>({});
  const [allVehicles, setAllVehicles] = useState<any[]>([]);
  const [driverRatings, setDriverRatings] = useState<Record<string, { avg: number; count: number }>>({});
  const [driverDeclines, setDriverDeclines] = useState<Record<string, { today: number; total: number }>>({});
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({
    first_name: "", last_name: "", email: "", phone_number: "",
    company_id: "", monthly_fee: "", bank_id: "", bank_account_number: "", bank_account_name: "",
    license_front_url: "", license_back_url: "", id_card_front_url: "", id_card_back_url: "",
    taxi_permit_front_url: "", taxi_permit_back_url: "",
    id_card_expiry: "", license_expiry: "",
  });
  const [uploading, setUploading] = useState<string | null>(null);
  const [previewImg, setPreviewImg] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvResult, setCsvResult] = useState<any>(null);
  const [expandedDriver, setExpandedDriver] = useState<string | null>(null);
  const [vehicleForm, setVehicleForm] = useState(emptyVehicleForm);
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);
  const [showVehicleForm, setShowVehicleForm] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [companyFilter, setCompanyFilter] = useState("");
  const [showFilters, setShowFilters] = useState(true);
  const [vehicleStatusFilter, setVehicleStatusFilter] = useState("");
  const [docFilter, setDocFilter] = useState<"all" | "complete" | "incomplete">("all");
  const [rejectVehicleId, setRejectVehicleId] = useState<string | null>(null);
  const [rejectDriverId, setRejectDriverId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [defaultCompanyId, setDefaultCompanyId] = useState<string | null>(null);
  const [blockedCodes, setBlockedCodes] = useState<string[]>([]);
  const [vehicleRideTypes, setVehicleRideTypes] = useState<Record<string, { vtId: string; status: string }[]>>({});
  const [driverBankAccounts, setDriverBankAccounts] = useState<any[]>([]);
  const [driverFavaraAccounts, setDriverFavaraAccounts] = useState<any[]>([]);
  const [showBulkAssign, setShowBulkAssign] = useState<"company" | "center" | "vehicle" | null>(null);
  const [bulkCompanyId, setBulkCompanyId] = useState("");
  const [bulkCenterStart, setBulkCenterStart] = useState("");
  const [bulkVehicleSearch, setBulkVehicleSearch] = useState("");
  const [bulkVehicleSelected, setBulkVehicleSelected] = useState<Set<string>>(new Set());

  const fetchAll = async () => {
    setLoading(true);
    // Paginate drivers to avoid 1000-row limit
    let allDrivers: any[] = [];
    let from = 0;
    const pageSize = 1000;
    while (true) {
      const { data } = await supabase.from("profiles").select("*").ilike("user_type", "%Driver%").order("created_at", { ascending: false }).range(from, from + pageSize - 1);
      if (!data || data.length === 0) break;
      allDrivers = allDrivers.concat(data);
      if (data.length < pageSize) break;
      from += pageSize;
    }
    const [banksRes, companiesRes, vtRes, vehiclesRes, settingsRes, allBankAccRes] = await Promise.all([
      supabase.from("banks").select("*").eq("is_active", true).order("name"),
      supabase.from("companies").select("*").eq("is_active", true).order("name"),
      supabase.from("vehicle_types").select("*").eq("is_active", true).order("sort_order"),
      supabase.from("vehicles").select("*, vehicle_types(name, image_url)").order("created_at", { ascending: false }),
      supabase.from("system_settings").select("key, value").in("key", ["default_company_id", "blocked_center_codes"]),
      supabase.from("driver_bank_accounts").select("driver_id, account_number, account_name").eq("is_active", true),
    ]);
    setDrivers(allDrivers);
    setBanks(banksRes.data || []);
    setCompanies(companiesRes.data || []);
    setVehicleTypes(vtRes.data || []);
    setAllVehicles(vehiclesRes.data || []);
    // Load settings
    (settingsRes.data || []).forEach((s: any) => {
      if (s.key === "default_company_id") setDefaultCompanyId(typeof s.value === "string" ? s.value : null);
      if (s.key === "blocked_center_codes") {
        const val = Array.isArray(s.value) ? s.value : [];
        setBlockedCodes(val.map(String));
      }
    });

    const vMap: Record<string, any[]> = {};
    (vehiclesRes.data || []).forEach((v: any) => {
      if (v.driver_id) {
        if (!vMap[v.driver_id]) vMap[v.driver_id] = [];
        vMap[v.driver_id].push(v);
      }
    });
    setDriverVehicles(vMap);

    // Build bank accounts map for search
    const baMap: Record<string, any[]> = {};
    (allBankAccRes.data || []).forEach((ba: any) => {
      if (ba.driver_id) {
        if (!baMap[ba.driver_id]) baMap[ba.driver_id] = [];
        baMap[ba.driver_id].push(ba);
      }
    });
    setAllBankAccountsMap(baMap);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const [ratedTripsRes, declinesRes] = await Promise.all([
      supabase.from("trips").select("driver_id, rating").eq("status", "completed").not("rating", "is", null).not("driver_id", "is", null),
      supabase.from("trip_declines").select("driver_id, declined_at"),
    ]);

    const rMap: Record<string, { sum: number; count: number }> = {};
    (ratedTripsRes.data || []).forEach((t: any) => {
      if (!rMap[t.driver_id]) rMap[t.driver_id] = { sum: 0, count: 0 };
      rMap[t.driver_id].sum += Number(t.rating);
      rMap[t.driver_id].count += 1;
    });
    const ratingsMap: Record<string, { avg: number; count: number }> = {};
    Object.entries(rMap).forEach(([id, v]) => {
      ratingsMap[id] = { avg: Math.round((v.sum / v.count) * 10) / 10, count: v.count };
    });
    setDriverRatings(ratingsMap);

    const dMap: Record<string, { today: number; total: number }> = {};
    (declinesRes.data || []).forEach((d: any) => {
      if (!dMap[d.driver_id]) dMap[d.driver_id] = { today: 0, total: 0 };
      dMap[d.driver_id].total += 1;
      if (new Date(d.declined_at) >= todayStart) dMap[d.driver_id].today += 1;
    });
    setDriverDeclines(dMap);

    // Fetch driver ride types (per vehicle)
    const { data: dvtData } = await supabase.from("driver_vehicle_types").select("driver_id, vehicle_type_id, vehicle_id, status");
    const rtMap: Record<string, { vtId: string; status: string }[]> = {};
    (dvtData || []).forEach((row: any) => {
      const key = row.vehicle_id || `driver_${row.driver_id}`;
      if (!rtMap[key]) rtMap[key] = [];
      rtMap[key].push({ vtId: row.vehicle_type_id, status: row.status || "approved" });
    });
    setVehicleRideTypes(rtMap);

    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  // Computed stats
  const pendingDrivers = drivers.filter(d => d.status === "Pending" || d.status === "Pending Review");
  const rejectedDrivers = drivers.filter(d => d.status === "Rejected");
  const pendingVehicles = allVehicles.filter(v => v.vehicle_status === "pending");
  const rejectedVehicles = allVehicles.filter(v => v.vehicle_status === "rejected");
  const incompleteDocDrivers = drivers.filter(d => {
    const count = [d.license_front_url, d.license_back_url, d.id_card_front_url, d.id_card_back_url].filter(Boolean).length;
    return count < 4 && count > 0;
  });

  // Filtered drivers
  const filteredDrivers = drivers.filter(d => {
    if (statusFilter === "Pending" && d.status !== "Pending" && d.status !== "Pending Review") return false;
    else if (statusFilter === "Rejected" && d.status !== "Rejected") return false;
    else if (statusFilter !== "all" && statusFilter !== "Pending" && statusFilter !== "Rejected" && d.status !== statusFilter) return false;
    if (companyFilter && d.company_id !== companyFilter) return false;
    if (docFilter === "complete" && [d.license_front_url, d.license_back_url, d.id_card_front_url, d.id_card_back_url].filter(Boolean).length < 4) return false;
    if (docFilter === "incomplete" && [d.license_front_url, d.license_back_url, d.id_card_front_url, d.id_card_back_url].filter(Boolean).length >= 4) return false;
    if (vehicleStatusFilter) {
      const dVehicles = driverVehicles[d.id] || [];
      if (!dVehicles.some((v: any) => v.vehicle_status === vehicleStatusFilter)) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      const nameMatch = `${d.first_name} ${d.last_name}`.toLowerCase().includes(q);
      const phoneMatch = d.phone_number?.toLowerCase().includes(q);
      const dVehicles = driverVehicles[d.id] || [];
      const plateMatch = dVehicles.some((v: any) => v.plate_number?.toLowerCase().includes(q));
      const centerMatch = dVehicles.some((v: any) => v.center_code?.toLowerCase().includes(q));
      const bankMatch = d.bank_account_number?.toLowerCase().includes(q) || d.bank_account_name?.toLowerCase().includes(q);
      const dBankAccounts = allBankAccountsMap[d.id] || [];
      const driverBankMatch = dBankAccounts.some((ba: any) => ba.account_number?.toLowerCase().includes(q) || ba.account_name?.toLowerCase().includes(q));
      if (!nameMatch && !phoneMatch && !plateMatch && !centerMatch && !bankMatch && !driverBankMatch) return false;
    }
    return true;
  });

  // Bulk actions
  const toggleSelect = (id: string) => {
    setSelected(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };
  const toggleSelectAll = () => {
    if (selected.size === filteredDrivers.length) setSelected(new Set());
    else setSelected(new Set(filteredDrivers.map(d => d.id)));
  };
  const sendDriverStatusSms = async (phone: string, countryCode: string, newStatus: string, name: string) => {
    try {
      const msg = newStatus === "Active"
        ? `Hi ${name}, congratulations! Your driver profile has been approved. You can now log in, go online and start accepting trips. - HDA Taxi`
        : `Hi ${name}, your driver profile has been deactivated. Please open the app or contact support for more details. - HDA Taxi`;
      await supabase.functions.invoke("notify-vehicle-update", {
        body: { phone_number: phone, country_code: countryCode, update_type: "driver_status", message: msg, notify_driver: true },
      });
    } catch (e) { console.error("SMS notify failed", e); }
  };

  const bulkSetStatus = async (status: string) => {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    if (status === "Active") {
      const incomplete = drivers.filter(d => ids.includes(d.id) && d.company_id !== defaultCompanyId && [d.license_front_url, d.license_back_url, d.id_card_front_url, d.id_card_back_url].filter(Boolean).length < 4);
      if (incomplete.length > 0) {
        if (!confirm(`${incomplete.length} driver(s) have incomplete documents. Approve anyway? They can submit documents later.`)) return;
      }
    }
    const { error } = await supabase.from("profiles").update({ status }).in("id", ids);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); }
    else {
      toast({ title: `${ids.length} driver(s) set to ${status}` });
      // Send SMS to each driver
      const affectedDrivers = drivers.filter(d => ids.includes(d.id));
      affectedDrivers.forEach(d => sendDriverStatusSms(d.phone_number, d.country_code, status, d.first_name));
      setSelected(new Set()); fetchAll();
    }
  };
  const bulkDelete = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} driver(s)? This cannot be undone.`)) return;
    const ids = Array.from(selected);
    const { error } = await supabase.from("profiles").delete().in("id", ids);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); }
    else { toast({ title: `${ids.length} driver(s) deleted` }); setSelected(new Set()); fetchAll(); }
  };

  const bulkAssignCompany = async () => {
    if (selected.size === 0 || !bulkCompanyId) return;
    const ids = Array.from(selected);
    const company = companies.find(c => c.id === bulkCompanyId);
    const { error } = await supabase.from("profiles").update({ company_id: bulkCompanyId, company_name: company?.name || "" }).in("id", ids);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); }
    else { toast({ title: `Company assigned to ${ids.length} driver(s)` }); setShowBulkAssign(null); setBulkCompanyId(""); fetchAll(); }
  };

  const bulkAssignCenter = async () => {
    if (bulkVehicleSelected.size === 0 || !bulkCenterStart) return;
    const startCode = parseInt(bulkCenterStart);
    if (isNaN(startCode)) { toast({ title: "Invalid start code", variant: "destructive" }); return; }
    const vehicleIds = Array.from(bulkVehicleSelected);
    let code = startCode;
    let assigned = 0;
    for (const vId of vehicleIds) {
      const codeStr = String(code);
      // Check if code is already used
      const { data: existing } = await supabase.from("vehicles").select("id").eq("center_code", codeStr).neq("id", vId).maybeSingle();
      if (existing) { code++; continue; }
      const { error } = await supabase.from("vehicles").update({ center_code: codeStr }).eq("id", vId);
      if (!error) assigned++;
      code++;
    }
    toast({ title: `Center codes assigned to ${assigned} vehicle(s)` });
    setShowBulkAssign(null); setBulkCenterStart(""); setBulkVehicleSelected(new Set()); fetchAll();
  };

  const bulkAssignVehicleType = async (vtId: string) => {
    if (bulkVehicleSelected.size === 0) return;
    const vehicleIds = Array.from(bulkVehicleSelected);
    const { error } = await supabase.from("vehicles").update({ vehicle_type_id: vtId }).in("id", vehicleIds);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); }
    else { toast({ title: `Vehicle type assigned to ${vehicleIds.length} vehicle(s)` }); setShowBulkAssign(null); setBulkVehicleSelected(new Set()); fetchAll(); }
  };

  const toggleStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === "Active" ? "Inactive" : "Active";
    const driver = drivers.find(d => d.id === id);
    if (newStatus === "Active") {
      const isDefaultCompany = driver?.company_id === defaultCompanyId;
      if (!isDefaultCompany) {
        const docCount = [driver?.license_front_url, driver?.license_back_url, driver?.id_card_front_url, driver?.id_card_back_url].filter(Boolean).length;
        if (docCount < 4 && !confirm(`Driver has only ${docCount}/4 documents uploaded. Approve anyway? They can submit documents later.`)) return;
      }
    }
    await supabase.from("profiles").update({ status: newStatus }).eq("id", id);
    toast({ title: `Driver ${newStatus === "Active" ? "approved ✅" : "deactivated"}` });
    if (driver) sendDriverStatusSms(driver.phone_number, driver.country_code, newStatus, driver.first_name);
    fetchAll();
  };

  const openEdit = async (d: any) => {
    setEditForm({
      first_name: d.first_name || "", last_name: d.last_name || "", email: d.email || "",
      phone_number: d.phone_number || "", company_id: d.company_id || "", monthly_fee: d.monthly_fee?.toString() || "0",
      bank_id: d.bank_id || "", bank_account_number: d.bank_account_number || "", bank_account_name: d.bank_account_name || "",
      license_front_url: d.license_front_url || "", license_back_url: d.license_back_url || "",
      id_card_front_url: d.id_card_front_url || "", id_card_back_url: d.id_card_back_url || "",
      taxi_permit_front_url: d.taxi_permit_front_url || "", taxi_permit_back_url: d.taxi_permit_back_url || "",
      id_card_expiry: d.id_card_expiry || "", license_expiry: d.license_expiry || "",
    });
    setEditingId(d.id);
    // Fetch driver's added bank & favara accounts
    const [bankRes, favaraRes] = await Promise.all([
      supabase.from("driver_bank_accounts").select("*").eq("driver_id", d.id).eq("is_active", true).order("is_primary", { ascending: false }),
      supabase.from("driver_favara_accounts").select("*").eq("driver_id", d.id).eq("is_active", true).order("is_primary", { ascending: false }),
    ]);
    setDriverBankAccounts(bankRes.data || []);
    setDriverFavaraAccounts(favaraRes.data || []);
    // Auto-scroll to the edit form
    setTimeout(() => {
      document.getElementById("admin-driver-edit-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  const uploadDoc = async (field: string, file: File) => {
    setUploading(field);
    // Delete old file from storage if replacing
    const oldUrl = editForm[field];
    if (oldUrl) {
      const { deleteStorageFile } = await import("@/lib/storage-utils");
      await deleteStorageFile(oldUrl);
    }
    const ext = file.name.split(".").pop();
    const path = `driver-docs/${editingId}/${field}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("driver-documents").upload(path, file);
    if (error) { toast({ title: "Upload failed", description: error.message, variant: "destructive" }); setUploading(null); return; }
    const { data: urlData } = supabase.storage.from("driver-documents").getPublicUrl(path);
    setEditForm((prev: any) => ({ ...prev, [field]: urlData.publicUrl }));
    setUploading(null);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const bankObj = banks.find((b) => b.id === editForm.bank_id);
    const { error } = await supabase.from("profiles").update({
      first_name: editForm.first_name, last_name: editForm.last_name, email: editForm.email || null, phone_number: editForm.phone_number,
      company_id: editForm.company_id || null, company_name: companies.find((c) => c.id === editForm.company_id)?.name || "",
      monthly_fee: parseFloat(editForm.monthly_fee) || 0,
      bank_id: editForm.bank_id || null, bank_name: bankObj?.name || "",
      bank_account_number: editForm.bank_account_number || "", bank_account_name: editForm.bank_account_name || "",
      license_front_url: editForm.license_front_url || null, license_back_url: editForm.license_back_url || null,
      id_card_front_url: editForm.id_card_front_url || null, id_card_back_url: editForm.id_card_back_url || null,
      taxi_permit_front_url: editForm.taxi_permit_front_url || null, taxi_permit_back_url: editForm.taxi_permit_back_url || null,
      id_card_expiry: editForm.id_card_expiry || null, license_expiry: editForm.license_expiry || null,
    } as any).eq("id", editingId);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); }
    else { toast({ title: "Driver updated!" }); setEditingId(null); fetchAll(); }
  };

  const deleteDriver = async (id: string) => {
    if (!confirm("Remove this driver profile? This cannot be undone.")) return;
    const { error } = await supabase.from("profiles").delete().eq("id", id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); }
    else { toast({ title: "Driver removed" }); fetchAll(); }
  };

  // Vehicle CRUD
  const openVehicleForm = (driverId: string, v?: any) => {
    setExpandedDriver(driverId);
    setShowVehicleForm(true);
    // Auto-scroll to vehicle form after state update
    setTimeout(() => {
      document.getElementById("admin-vehicle-edit-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 150);
    if (v) {
      setEditingVehicleId(v.id);
      setVehicleForm({
        plate_number: v.plate_number || "", make: v.make || "", model: v.model || "",
        color: v.color || "", year: v.year?.toString() || "", vehicle_type_id: v.vehicle_type_id || "",
        image_url: v.image_url || "", registration_url: v.registration_url || "", insurance_url: v.insurance_url || "",
        vehicle_status: v.vehicle_status || "pending", rejection_reason: v.rejection_reason || "",
        center_code: v.center_code || "",
      });
    } else {
      setEditingVehicleId(null);
      setVehicleForm(emptyVehicleForm);
    }
  };

  const saveVehicle = async () => {
    if (!expandedDriver || !vehicleForm.plate_number) return;
    // Check for duplicate plate number
    const normalizedPlate = vehicleForm.plate_number.trim().toUpperCase();
    const { data: existingPlate } = await supabase.from("vehicles").select("id").eq("plate_number", normalizedPlate).maybeSingle();
    if (existingPlate && existingPlate.id !== editingVehicleId) {
      toast({ title: "Duplicate plate number", description: `Vehicle ${normalizedPlate} is already registered.`, variant: "destructive" });
      return;
    }
    // Validate center code against blocked list
    if (vehicleForm.center_code) {
      const driver = drivers.find(d => d.id === expandedDriver);
      const isDefaultCompany = driver?.company_id === defaultCompanyId;
      if (!isDefaultCompany) {
        toast({ title: "Center codes only for default company", description: "Only drivers in the default company (HDA TAXI) can have center codes.", variant: "destructive" });
        return;
      }
      if (blockedCodes.includes(vehicleForm.center_code)) {
        toast({ title: "Blocked code", description: `Center code "${vehicleForm.center_code}" is reserved and cannot be used.`, variant: "destructive" });
        return;
      }
      // Check uniqueness
      const { data: existingCode } = await supabase.from("vehicles").select("id, plate_number").eq("center_code", vehicleForm.center_code).maybeSingle();
      if (existingCode && existingCode.id !== editingVehicleId) {
        toast({ title: "Duplicate center code", description: `Center code "${vehicleForm.center_code}" is already assigned to vehicle ${existingCode.plate_number}.`, variant: "destructive" });
        return;
      }
    }
    const payload: any = {
      plate_number: vehicleForm.plate_number, make: vehicleForm.make, model: vehicleForm.model, color: vehicleForm.color,
      year: vehicleForm.year ? parseInt(vehicleForm.year) : null, vehicle_type_id: vehicleForm.vehicle_type_id || null,
      driver_id: expandedDriver, image_url: vehicleForm.image_url || null,
      registration_url: vehicleForm.registration_url || null, insurance_url: vehicleForm.insurance_url || null,
      vehicle_status: vehicleForm.vehicle_status || "pending", rejection_reason: vehicleForm.rejection_reason || null,
      center_code: vehicleForm.center_code || null,
    };
    const { error } = editingVehicleId
      ? await supabase.from("vehicles").update(payload).eq("id", editingVehicleId)
      : await supabase.from("vehicles").insert(payload);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); }
    else { toast({ title: editingVehicleId ? "Vehicle updated" : "Vehicle added" }); setShowVehicleForm(false); setEditingVehicleId(null); setVehicleForm(emptyVehicleForm); fetchAll(); }
  };

  const toggleVehicleRideType = async (driverId: string, vehicleId: string, vtId: string) => {
    const current = vehicleRideTypes[vehicleId] || [];
    const existing = current.find(e => e.vtId === vtId);
    if (existing) {
      await supabase.from("driver_vehicle_types").delete().eq("driver_id", driverId).eq("vehicle_type_id", vtId).eq("vehicle_id", vehicleId);
      setVehicleRideTypes(prev => ({ ...prev, [vehicleId]: current.filter(e => e.vtId !== vtId) }));
    } else {
      // Admin adds as approved directly
      await supabase.from("driver_vehicle_types").insert({ driver_id: driverId, vehicle_type_id: vtId, vehicle_id: vehicleId, status: "approved" } as any);
      setVehicleRideTypes(prev => ({ ...prev, [vehicleId]: [...current, { vtId, status: "approved" }] }));
    }
  };

  const approveVehicleRideType = async (driverId: string, vehicleId: string, vtId: string) => {
    await supabase.from("driver_vehicle_types").update({ status: "approved" } as any).eq("driver_id", driverId).eq("vehicle_type_id", vtId).eq("vehicle_id", vehicleId);
    setVehicleRideTypes(prev => ({
      ...prev,
      [vehicleId]: (prev[vehicleId] || []).map(e => e.vtId === vtId ? { ...e, status: "approved" } : e),
    }));
    toast({ title: "Ride type approved" });
  };

  const uploadVehicleDoc = async (field: string, file: File) => {
    setUploading(`vehicle_${field}`);
    const ext = file.name.split(".").pop();
    const path = `vehicle-docs/${expandedDriver}/${field}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("vehicle-images").upload(path, file);
    if (error) { toast({ title: "Upload failed", description: error.message, variant: "destructive" }); setUploading(null); return; }
    const { data: urlData } = supabase.storage.from("vehicle-images").getPublicUrl(path);
    setVehicleForm((prev: any) => ({ ...prev, [field]: urlData.publicUrl }));
    setUploading(null);
  };

  const deleteVehicle = async (id: string) => {
    if (!confirm("Delete this vehicle?")) return;
    const { error } = await supabase.from("vehicles").delete().eq("id", id);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { toast({ title: "Vehicle deleted" }); fetchAll(); }
  };

  const toggleVehicleActive = async (id: string, current: boolean) => {
    await supabase.from("vehicles").update({ is_active: !current }).eq("id", id);
    toast({ title: current ? "Vehicle deactivated" : "Vehicle activated" });
    fetchAll();
  };

  const approveVehicle = async (id: string) => {
    const vehicle = allVehicles.find(v => v.id === id);
    await supabase.from("vehicles").update({ vehicle_status: "approved", rejection_reason: null } as any).eq("id", id);
    toast({ title: "Vehicle approved ✅" });
    // Send SMS to driver
    if (vehicle?.driver_id) {
      const driver = drivers.find(d => d.id === vehicle.driver_id);
      if (driver) {
        try {
          await supabase.functions.invoke("notify-vehicle-update", {
            body: {
              driver_name: `${driver.first_name} ${driver.last_name}`,
              phone_number: driver.phone_number,
              country_code: driver.country_code,
              plate_number: vehicle.plate_number,
              update_type: "approved",
              notify_driver: true,
            },
          });
        } catch (e) { console.error("Failed to notify driver:", e); }
      }
    }
    fetchAll();
  };

  const rejectVehicle = async (id: string, reason: string) => {
    const vehicle = allVehicles.find(v => v.id === id);
    await supabase.from("vehicles").update({ vehicle_status: "rejected", rejection_reason: reason || "Documents not acceptable" } as any).eq("id", id);
    toast({ title: "Vehicle rejected", description: reason });
    // Send SMS to driver
    if (vehicle?.driver_id) {
      const driver = drivers.find(d => d.id === vehicle.driver_id);
      if (driver) {
        try {
          await supabase.functions.invoke("notify-vehicle-update", {
            body: {
              driver_name: `${driver.first_name} ${driver.last_name}`,
              phone_number: driver.phone_number,
              country_code: driver.country_code,
              plate_number: vehicle.plate_number,
              update_type: "rejected",
              rejection_reason: reason || "Documents not acceptable",
              notify_driver: true,
            },
          });
        } catch (e) { console.error("Failed to notify driver:", e); }
      }
    }
    setRejectVehicleId(null);
    setRejectReason("");
    fetchAll();
  };

  const rejectDriver = async (id: string, reason: string) => {
    const driver = drivers.find(d => d.id === id);
    await supabase.from("profiles").update({ status: "Rejected", rejection_reason: reason || "Your application was not approved" } as any).eq("id", id);
    toast({ title: "Driver rejected", description: reason });
    if (driver) {
      try {
        const msg = `Hi ${driver.first_name}, your driver registration was not approved. Reason: ${reason || "Your application was not approved"}. Please open the app to view details and resubmit your application. - HDA Taxi`;
        await supabase.functions.invoke("notify-vehicle-update", {
          body: { phone_number: driver.phone_number, country_code: driver.country_code, update_type: "driver_status", message: msg, notify_driver: true },
        });
      } catch (e) { console.error("SMS notify failed", e); }
    }
    setRejectDriverId(null);
    setRejectReason("");
    fetchAll();
  };

  const handleCsvImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvImporting(true); setCsvResult(null);
    try {
      const text = await file.text();
      const allLines = text.split(/\r?\n/).filter((l) => l.trim());
      if (allLines.length < 2) { toast({ title: "Import failed", description: "No data rows found", variant: "destructive" }); setCsvImporting(false); return; }
      const header = allLines[0];
      const dataLines = allLines.slice(1);
      const BATCH_SIZE = 100;
      let totalResult = { drivers_created: 0, drivers_skipped: 0, vehicles_created: 0, vehicles_skipped: 0, errors: [] as string[], total_rows: 0 };
      for (let i = 0; i < dataLines.length; i += BATCH_SIZE) {
        const batchLines = dataLines.slice(i, i + BATCH_SIZE);
        const batchCsv = [header, ...batchLines].join("\n");
        const { data, error } = await supabase.functions.invoke("import-drivers-csv", { body: { csv: batchCsv } });
        if (error) { totalResult.errors.push(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${error.message}`); }
        else if (data) { totalResult.drivers_created += data.drivers_created || 0; totalResult.drivers_skipped += data.drivers_skipped || 0; totalResult.vehicles_created += data.vehicles_created || 0; totalResult.vehicles_skipped += data.vehicles_skipped || 0; totalResult.total_rows += data.total_rows || 0; if (data.errors) totalResult.errors.push(...data.errors); }
        toast({ title: "Importing...", description: `Processed ${Math.min(i + BATCH_SIZE, dataLines.length)} / ${dataLines.length} rows` });
      }
      setCsvResult(totalResult);
      toast({ title: "Import complete", description: `${totalResult.drivers_created} drivers, ${totalResult.vehicles_created} vehicles created` });
      fetchAll();
    } catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); setCsvResult({ error: err.message }); }
    setCsvImporting(false); e.target.value = "";
  };

  const inputCls = "w-full mt-1 px-3 py-2 bg-surface border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50";
  const selectCls = "w-full mt-1 px-3 py-2 bg-surface border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary";

  const DocUpload = ({ field, label }: { field: string; label: string }) => (
    <div>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <div className="flex items-center gap-2 mt-1">
        {editForm[field] ? (
          <button onClick={() => setPreviewImg(editForm[field])} className="text-xs text-primary hover:underline flex items-center gap-1">
            <Eye className="w-3 h-3" /> View
          </button>
        ) : <span className="text-xs text-muted-foreground">Not uploaded</span>}
        <label className="flex items-center gap-1 px-2 py-1 bg-surface border border-border rounded-lg text-xs text-muted-foreground cursor-pointer hover:text-foreground">
          <Upload className="w-3 h-3" />
          {uploading === field ? "..." : "Upload"}
          <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadDoc(field, e.target.files[0])} disabled={uploading === field} />
        </label>
      </div>
    </div>
  );

  // Find driver name for a vehicle
  const getDriverName = (driverId: string | null) => {
    if (!driverId) return "Unassigned";
    const d = drivers.find(dr => dr.id === driverId);
    return d ? `${d.first_name} ${d.last_name}` : "Unknown";
  };

  return (
    <div className="space-y-5">
      {/* Image preview modal */}
      {previewImg && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setPreviewImg(null)}>
          <div className="relative max-w-2xl max-h-[80vh]">
            <button onClick={() => setPreviewImg(null)} className="absolute -top-3 -right-3 bg-card rounded-full p-1.5 shadow-lg"><X className="w-5 h-5" /></button>
            <img src={previewImg} alt="Document" className="max-w-full max-h-[80vh] rounded-xl" />
          </div>
        </div>
      )}

      {/* Reject vehicle modal */}
      {rejectVehicleId && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => { setRejectVehicleId(null); setRejectReason(""); }}>
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-md space-y-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-foreground">Reject Vehicle</h3>
            <p className="text-xs text-muted-foreground">Provide a reason so the driver knows what to fix.</p>
            <div className="space-y-2">
              {["Blurry or unreadable document", "Wrong document uploaded", "Expired document", "Missing required document"].map((r) => (
                <button key={r} onClick={() => setRejectReason(r)}
                  className={`w-full text-left px-3 py-2 rounded-xl text-sm transition-colors ${rejectReason === r ? "bg-primary/10 text-primary font-semibold border border-primary/30" : "bg-surface text-foreground hover:bg-surface/80 border border-border"}`}>
                  {r}
                </button>
              ))}
            </div>
            <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Or type a custom reason..." className="w-full px-3 py-2 bg-surface border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none" rows={2} />
            <div className="flex gap-3">
              <button onClick={() => { setRejectVehicleId(null); setRejectReason(""); }} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold bg-surface text-foreground border border-border">Cancel</button>
              <button onClick={() => rejectVehicle(rejectVehicleId, rejectReason)} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold bg-destructive text-destructive-foreground">Reject</button>
            </div>
          </div>
        </div>
      )}

      {/* Reject driver modal */}
      {rejectDriverId && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => { setRejectDriverId(null); setRejectReason(""); }}>
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-md space-y-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-foreground">Reject Driver</h3>
            <p className="text-xs text-muted-foreground">Provide a reason so the driver knows what to correct and resubmit.</p>
            <div className="space-y-2">
              {["Incomplete or missing documents", "Blurry or unreadable documents", "ID card information doesn't match", "License expired or invalid", "Profile information incorrect"].map((r) => (
                <button key={r} onClick={() => setRejectReason(r)}
                  className={`w-full text-left px-3 py-2 rounded-xl text-sm transition-colors ${rejectReason === r ? "bg-primary/10 text-primary font-semibold border border-primary/30" : "bg-surface text-foreground hover:bg-surface/80 border border-border"}`}>
                  {r}
                </button>
              ))}
            </div>
            <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Or type a custom reason..." className="w-full px-3 py-2 bg-surface border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none" rows={2} />
            <div className="flex gap-3">
              <button onClick={() => { setRejectDriverId(null); setRejectReason(""); }} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold bg-surface text-foreground border border-border">Cancel</button>
              <button onClick={() => rejectDriver(rejectDriverId, rejectReason)} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold bg-destructive text-destructive-foreground">Reject Driver</button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Assign Company Modal */}
      {showBulkAssign === "company" && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setShowBulkAssign(null)}>
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-md space-y-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-foreground">Assign Company to {selected.size} Driver(s)</h3>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Company</label>
              <select value={bulkCompanyId} onChange={(e) => setBulkCompanyId(e.target.value)} className="w-full mt-1 px-3 py-2 bg-surface border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary">
                <option value="">Select company</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowBulkAssign(null)} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold bg-surface text-foreground border border-border">Cancel</button>
              <button onClick={bulkAssignCompany} disabled={!bulkCompanyId} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold bg-primary text-primary-foreground disabled:opacity-50">Assign</button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Assign Vehicles (Center Code & Vehicle Type) Modal */}
      {showBulkAssign === "vehicle" && (() => {
        const selectedDriverIds = Array.from(selected);
        const relevantVehicles = allVehicles.filter(v => selectedDriverIds.includes(v.driver_id));
        const q = bulkVehicleSearch.toLowerCase();
        const filteredVehicles = q ? relevantVehicles.filter(v =>
          v.plate_number?.toLowerCase().includes(q) || v.make?.toLowerCase().includes(q) || v.model?.toLowerCase().includes(q) || v.center_code?.toLowerCase().includes(q)
        ) : relevantVehicles;
        return (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setShowBulkAssign(null)}>
            <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-2xl space-y-4 shadow-2xl max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-base font-bold text-foreground">Bulk Vehicle Assignment — {relevantVehicles.length} vehicles from {selected.size} driver(s)</h3>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input value={bulkVehicleSearch} onChange={(e) => setBulkVehicleSearch(e.target.value)} placeholder="Search by plate number, make, model..." className="w-full pl-10 pr-4 py-2 bg-surface border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>

              {/* Vehicle list */}
              <div className="flex-1 overflow-y-auto min-h-0 space-y-1">
                <div className="flex items-center gap-2 mb-2">
                  <button onClick={() => {
                    if (bulkVehicleSelected.size === filteredVehicles.length) setBulkVehicleSelected(new Set());
                    else setBulkVehicleSelected(new Set(filteredVehicles.map(v => v.id)));
                  }} className="text-xs font-semibold text-primary hover:underline">
                    {bulkVehicleSelected.size === filteredVehicles.length && filteredVehicles.length > 0 ? "Deselect All" : `Select All (${filteredVehicles.length})`}
                  </button>
                  {bulkVehicleSelected.size > 0 && <span className="text-xs text-muted-foreground">{bulkVehicleSelected.size} selected</span>}
                </div>
                {filteredVehicles.map((v) => {
                  const driver = drivers.find(d => d.id === v.driver_id);
                  const vType = vehicleTypes.find(vt => vt.id === v.vehicle_type_id);
                  const isChecked = bulkVehicleSelected.has(v.id);
                  return (
                    <button key={v.id} onClick={() => setBulkVehicleSelected(prev => { const next = new Set(prev); next.has(v.id) ? next.delete(v.id) : next.add(v.id); return next; })}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-colors ${isChecked ? "bg-primary/10 border border-primary/30" : "bg-surface border border-border hover:border-primary/20"}`}>
                      {isChecked ? <CheckSquare className="w-4 h-4 text-primary shrink-0" /> : <Square className="w-4 h-4 text-muted-foreground shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-foreground truncate">{v.plate_number}</p>
                        <p className="text-[10px] text-muted-foreground">{v.make} {v.model} · {vType?.name || "No type"} · {driver ? `${driver.first_name} ${driver.last_name}` : "Unassigned"}{v.center_code ? ` · #${v.center_code}` : ""}</p>
                      </div>
                    </button>
                  );
                })}
                {filteredVehicles.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No vehicles found</p>}
              </div>

              {/* Actions */}
              {bulkVehicleSelected.size > 0 && (
                <div className="border-t border-border pt-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Assign Center Codes (start from)</label>
                      <div className="flex gap-2 mt-1">
                        <input value={bulkCenterStart} onChange={(e) => setBulkCenterStart(e.target.value)} placeholder="e.g. 100" className="flex-1 px-3 py-2 bg-surface border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
                        <button onClick={bulkAssignCenter} disabled={!bulkCenterStart} className="px-4 py-2 rounded-xl text-xs font-semibold bg-primary text-primary-foreground disabled:opacity-50">Assign</button>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Assign Vehicle Type</label>
                      <select onChange={(e) => { if (e.target.value) bulkAssignVehicleType(e.target.value); }} className="w-full mt-1 px-3 py-2 bg-surface border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary" defaultValue="">
                        <option value="" disabled>Select type to assign</option>
                        {vehicleTypes.map((vt) => <option key={vt.id} value={vt.id}>{vt.name}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowBulkAssign(null)} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold bg-surface text-foreground border border-border">Close</button>
              </div>
            </div>
          </div>
        );
      })()}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-foreground">Drivers & Vehicles</h1>
          <p className="text-sm text-muted-foreground">{filteredDrivers.length} of {drivers.length} drivers · {allVehicles.length} vehicles</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowImport(!showImport)} className="flex items-center gap-1.5 px-3 py-2 bg-surface border border-border rounded-xl text-xs font-semibold text-foreground hover:bg-muted transition-colors">
            <FileUp className="w-3.5 h-3.5" />Import CSV
          </button>
        </div>
      </div>

      {/* ── Statistics Grid ── */}
      {!loading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {[
            { label: "Active", value: drivers.filter(d => d.status === "Active").length, icon: UserCheck, color: "text-green-600", bg: "bg-green-500/10", filter: "Active" as StatusFilter },
            { label: "Inactive", value: drivers.filter(d => d.status === "Inactive").length, icon: UserX, color: "text-muted-foreground", bg: "bg-muted/50", filter: "Inactive" as StatusFilter },
            { label: "Pending", value: pendingDrivers.length, icon: Clock, color: "text-yellow-600", bg: "bg-yellow-500/10", filter: "Pending" as StatusFilter },
            { label: "Rejected", value: rejectedDrivers.length, icon: XCircle, color: "text-red-600", bg: "bg-red-500/10", filter: "Rejected" as StatusFilter },
            { label: "Vehicles", value: allVehicles.filter(v => v.vehicle_status === "approved").length, icon: Car, color: "text-blue-600", bg: "bg-blue-500/10", filter: null },
            { label: "Pending Vehicles", value: pendingVehicles.length, icon: Car, color: "text-orange-600", bg: "bg-orange-500/10", filter: null },
            { label: "Incomplete Docs", value: incompleteDocDrivers.length, icon: AlertTriangle, color: "text-red-500", bg: "bg-red-500/10", filter: null },
          ].map((stat) => (
            <button key={stat.label} onClick={() => { if (stat.filter) setStatusFilter(statusFilter === stat.filter ? "all" : stat.filter); }}
              className={`flex flex-col items-center gap-1 p-3 rounded-2xl border transition-all ${stat.filter && statusFilter === stat.filter ? "bg-primary/10 border-primary/30 ring-1 ring-primary/20" : "bg-card border-border hover:border-primary/20"} ${stat.filter ? "cursor-pointer" : "cursor-default"}`}>
              <div className={`w-8 h-8 rounded-xl ${stat.bg} flex items-center justify-center`}>
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
              </div>
              <p className="text-xl font-bold text-foreground leading-none">{stat.value}</p>
              <p className="text-[10px] text-muted-foreground font-medium leading-tight text-center">{stat.label}</p>
            </button>
          ))}
        </div>
      )}

      {/* ── Pending Vehicles Quick Actions ── */}
      {!loading && pendingVehicles.length > 0 && (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-surface/50 flex items-center gap-2">
            <Clock className="w-4 h-4 text-yellow-600" />
            <p className="text-sm font-bold text-foreground">Vehicles Pending Approval</p>
            <span className="text-[10px] font-bold bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">{pendingVehicles.length}</span>
          </div>
          <div className="divide-y divide-border">
            {pendingVehicles.map((v) => {
              const driver = drivers.find(d => d.id === v.driver_id);
              const isPendingDriver = driver && (driver.status === "Pending" || driver.status === "Pending Review");
              return (
                <div key={v.id} className="px-4 py-3 space-y-3">
                  {/* Vehicle row */}
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-10 rounded-lg bg-surface border border-border overflow-hidden shrink-0 flex items-center justify-center">
                      <img src={v.image_url || DEFAULT_VEHICLE_IMAGE} alt="Vehicle" className="w-full h-full object-cover cursor-pointer" onClick={() => v.image_url && setPreviewImg(v.image_url)} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-foreground truncate">{v.plate_number} — {v.make} {v.model}</p>
                      <p className="text-[11px] text-muted-foreground">{v.color} · {v.vehicle_types?.name || "No type"} · Driver: {getDriverName(v.driver_id)}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                      {[
                        { url: v.image_url, label: "Photo", bg: "bg-purple-50 dark:bg-purple-500/10", border: "border-purple-100 dark:border-purple-500/20", text: "text-purple-600", hoverBg: "hover:bg-purple-100 dark:hover:bg-purple-500/20" },
                        { url: v.registration_url, label: "Registration", bg: "bg-blue-50 dark:bg-blue-500/10", border: "border-blue-100 dark:border-blue-500/20", text: "text-blue-600", hoverBg: "hover:bg-blue-100 dark:hover:bg-blue-500/20" },
                        { url: v.insurance_url, label: "Insurance", bg: "bg-green-50 dark:bg-green-500/10", border: "border-green-100 dark:border-green-500/20", text: "text-green-600", hoverBg: "hover:bg-green-100 dark:hover:bg-green-500/20" },
                      ].map((doc) => doc.url ? (
                        <button key={doc.label} onClick={() => setPreviewImg(doc.url)} className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-semibold transition-colors ${doc.bg} ${doc.border} ${doc.text} ${doc.hoverBg} border`} title={doc.label}>
                          <Eye className="w-3 h-3" /> {doc.label}
                        </button>
                      ) : (
                        <span key={doc.label} className="text-[10px] text-muted-foreground/40 px-2 py-1">No {doc.label}</span>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => approveVehicle(v.id)} className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded-xl text-xs font-bold hover:bg-green-700 transition-colors">
                        <Check className="w-3.5 h-3.5" /> Approve
                      </button>
                      <button onClick={() => { setRejectVehicleId(v.id); setRejectReason(""); }} className="flex items-center gap-1 px-3 py-1.5 bg-destructive/10 text-destructive rounded-xl text-xs font-bold hover:bg-destructive/20 transition-colors">
                        <XCircle className="w-3.5 h-3.5" /> Reject
                      </button>
                    </div>
                  </div>

                  {/* Driver info section for new registrations */}
                  {driver && (
                    <div className="ml-[4.5rem] bg-surface/50 border border-border rounded-xl p-3 space-y-2">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          {driver.avatar_url ? (
                            <img src={driver.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                          ) : (
                            <UserCheck className="w-4 h-4 text-primary" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-foreground">{driver.first_name} {driver.last_name}</p>
                          <p className="text-[10px] text-muted-foreground">+{driver.country_code} {driver.phone_number} · {driver.email || "No email"}</p>
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isPendingDriver ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400" : driver.status === "Active" ? "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400" : "bg-muted text-muted-foreground"}`}>
                          {driver.status}
                        </span>
                        {isPendingDriver && (
                          <div className="flex items-center gap-1.5">
                            <button onClick={() => toggleStatus(driver.id, driver.status)} className="flex items-center gap-1 px-2.5 py-1 bg-green-600 text-white rounded-lg text-[10px] font-bold hover:bg-green-700 transition-colors">
                              <ShieldCheck className="w-3 h-3" /> Approve
                            </button>
                            <button onClick={() => { setRejectDriverId(driver.id); setRejectReason(""); }} className="flex items-center gap-1 px-2.5 py-1 bg-destructive/10 text-destructive rounded-lg text-[10px] font-bold hover:bg-destructive/20 transition-colors">
                              <XCircle className="w-3 h-3" /> Reject
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Driver documents */}
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          { url: driver.license_front_url, label: "License Front" },
                          { url: driver.license_back_url, label: "License Back" },
                          { url: driver.id_card_front_url, label: "ID Front" },
                          { url: driver.id_card_back_url, label: "ID Back" },
                          { url: driver.taxi_permit_front_url, label: "Permit Front" },
                          { url: driver.taxi_permit_back_url, label: "Permit Back" },
                        ].map((doc) => doc.url ? (
                          <button key={doc.label} onClick={() => setPreviewImg(doc.url)} className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold transition-colors bg-accent/50 border border-border text-foreground hover:bg-accent">
                            <Eye className="w-3 h-3" /> {doc.label}
                          </button>
                        ) : (
                          <span key={doc.label} className="text-[10px] text-muted-foreground/40 px-2 py-1 border border-dashed border-border rounded-lg">
                            No {doc.label}
                          </span>
                        ))}
                      </div>
                      {/* Expiry dates */}
                      {(driver.id_card_expiry || driver.license_expiry) && (
                        <div className="flex flex-wrap gap-2 mt-1">
                          {driver.id_card_expiry && (
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${new Date(driver.id_card_expiry) < new Date() ? "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400" : "bg-accent/50 text-foreground"}`}>
                              ID Expiry: {driver.id_card_expiry}
                            </span>
                          )}
                          {driver.license_expiry && (
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${new Date(driver.license_expiry) < new Date() ? "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400" : "bg-accent/50 text-foreground"}`}>
                              License Expiry: {driver.license_expiry}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Search + Filters ── */}
      <div className="space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, phone, plate, center code, or bank account..." className="w-full pl-10 pr-4 py-2.5 bg-card border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <button onClick={() => setShowFilters(!showFilters)} className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors shrink-0 ${showFilters ? "bg-primary text-primary-foreground" : "bg-card border border-border text-foreground hover:bg-muted"}`}>
            <Filter className="w-3.5 h-3.5" />Filters
            {(statusFilter !== "all" || companyFilter || vehicleStatusFilter || docFilter !== "all") && (
              <span className="w-2 h-2 rounded-full bg-destructive" />
            )}
          </button>
        </div>

        {showFilters && (
          <div className="bg-card border border-border rounded-2xl p-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2 block">Status</label>
                <div className="flex flex-wrap gap-1.5">
                  {(["all", "Active", "Inactive", "Pending", "Pending Review", "Rejected"] as StatusFilter[]).map((s) => {
                    const count = s === "all" ? drivers.length : drivers.filter(d => d.status === s).length;
                    return (
                      <button key={s} onClick={() => setStatusFilter(s)}
                        className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${statusFilter === s ? "bg-primary text-primary-foreground" : "bg-surface text-muted-foreground hover:text-foreground"}`}>
                        {s === "all" ? "All" : s} <span className="opacity-60">({count})</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2 block">Company</label>
                <select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)} className="w-full px-2.5 py-1.5 bg-surface border border-border rounded-lg text-[11px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary">
                  <option value="">All Companies</option>
                  {companies.map((c) => {
                    const count = drivers.filter(d => d.company_id === c.id).length;
                    return <option key={c.id} value={c.id}>{c.name} ({count})</option>;
                  })}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2 block">Vehicle Status</label>
                <select value={vehicleStatusFilter} onChange={(e) => setVehicleStatusFilter(e.target.value)} className="w-full px-2.5 py-1.5 bg-surface border border-border rounded-lg text-[11px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary">
                  <option value="">All</option>
                  <option value="pending">Pending ({allVehicles.filter(v => v.vehicle_status === "pending").length})</option>
                  <option value="approved">Approved ({allVehicles.filter(v => v.vehicle_status === "approved").length})</option>
                  <option value="rejected">Rejected ({allVehicles.filter(v => v.vehicle_status === "rejected").length})</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2 block">Documents</label>
                <select value={docFilter} onChange={(e) => setDocFilter(e.target.value as any)} className="w-full px-2.5 py-1.5 bg-surface border border-border rounded-lg text-[11px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary">
                  <option value="all">All</option>
                  <option value="complete">Complete ({drivers.filter(d => [d.license_front_url, d.license_back_url, d.id_card_front_url, d.id_card_back_url].filter(Boolean).length >= 4).length})</option>
                  <option value="incomplete">Incomplete ({incompleteDocDrivers.length})</option>
                </select>
              </div>
            </div>
            {(statusFilter !== "all" || companyFilter || vehicleStatusFilter || docFilter !== "all") && (
              <div className="flex items-center justify-between pt-2 border-t border-border">
                <p className="text-[11px] text-muted-foreground">Showing <span className="font-bold text-foreground">{filteredDrivers.length}</span> of {drivers.length} drivers</p>
                <button onClick={() => { setStatusFilter("all"); setCompanyFilter(""); setVehicleStatusFilter(""); setDocFilter("all"); }} className="text-[11px] text-primary font-semibold hover:underline">
                  Clear all filters
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* CSV Import Panel */}
      {showImport && (
        <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-foreground">Import Drivers & Vehicles from CSV</h3>
            <button onClick={() => { setShowImport(false); setCsvResult(null); }} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
          </div>
          <p className="text-sm text-muted-foreground">Upload a CSV file with driver and vehicle data. Existing drivers (by phone number) will be skipped.</p>
          <div className="flex items-center gap-3">
            <a href="/sample-drivers-import.csv" download className="flex items-center gap-2 px-4 py-2 bg-surface border border-border rounded-xl text-sm font-medium text-foreground hover:bg-muted transition-colors">
              <Download className="w-4 h-4" />Sample CSV
            </a>
            <label className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold cursor-pointer transition-all ${csvImporting ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground hover:opacity-90"}`}>
              {csvImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {csvImporting ? "Importing..." : "Upload CSV"}
              <input type="file" accept=".csv" className="hidden" onChange={handleCsvImport} disabled={csvImporting} />
            </label>
          </div>
          <div className="bg-surface rounded-xl p-3">
            <p className="text-xs font-semibold text-muted-foreground mb-1">Expected columns:</p>
            <p className="text-xs text-muted-foreground font-mono">first_name, last_name, phone_number, email, gender, country_code, status, company, monthly_fee, plate_number, vehicle_type, make, model, color, year</p>
          </div>
          {csvResult && !csvResult.error && (
            <div className="bg-surface rounded-xl p-4 space-y-1">
              <p className="text-sm font-semibold text-foreground">✅ Import Complete</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                <span className="text-muted-foreground">Total rows:</span><span className="font-medium text-foreground">{csvResult.total_rows}</span>
                <span className="text-muted-foreground">Drivers created:</span><span className="font-medium text-foreground">{csvResult.drivers_created}</span>
                <span className="text-muted-foreground">Drivers skipped:</span><span className="font-medium text-foreground">{csvResult.drivers_skipped}</span>
                <span className="text-muted-foreground">Vehicles created:</span><span className="font-medium text-foreground">{csvResult.vehicles_created}</span>
                <span className="text-muted-foreground">Vehicles skipped:</span><span className="font-medium text-foreground">{csvResult.vehicles_skipped}</span>
              </div>
              {csvResult.errors?.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-semibold text-destructive">Errors:</p>
                  {csvResult.errors.map((err: string, i: number) => <p key={i} className="text-xs text-destructive">{err}</p>)}
                </div>
              )}
            </div>
          )}
          {csvResult?.error && (<div className="bg-destructive/10 rounded-xl p-3"><p className="text-sm text-destructive">❌ {csvResult.error}</p></div>)}
        </div>
      )}

      {/* Edit Driver Form */}
      {editingId && (
        <div id="admin-driver-edit-form" className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-foreground">Edit Driver</h3>
            <button onClick={() => setEditingId(null)} className="w-8 h-8 rounded-full bg-surface flex items-center justify-center text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="text-xs font-medium text-muted-foreground">First Name</label><input value={editForm.first_name} onChange={(e) => setEditForm({ ...editForm, first_name: e.target.value })} className={inputCls} /></div>
            <div><label className="text-xs font-medium text-muted-foreground">Last Name</label><input value={editForm.last_name} onChange={(e) => setEditForm({ ...editForm, last_name: e.target.value })} className={inputCls} /></div>
            <div><label className="text-xs font-medium text-muted-foreground">Email</label><input value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} className={inputCls} /></div>
            <div><label className="text-xs font-medium text-muted-foreground">Phone</label><input value={editForm.phone_number} onChange={(e) => setEditForm({ ...editForm, phone_number: e.target.value })} className={inputCls} /></div>
          </div>
          <h4 className="text-sm font-semibold text-foreground pt-2">Company & Monthly Fee</h4>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="text-xs font-medium text-muted-foreground">Company</label>
              <select value={editForm.company_id} onChange={(e) => setEditForm({ ...editForm, company_id: e.target.value })} className={selectCls}>
                <option value="">— Select Company —</option>
                {companies.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
              </select>
            </div>
            <div><label className="text-xs font-medium text-muted-foreground">Monthly Fee (MVR)</label><input type="number" value={editForm.monthly_fee} onChange={(e) => setEditForm({ ...editForm, monthly_fee: e.target.value })} className={inputCls} /></div>
          </div>
          <h4 className="text-sm font-semibold text-foreground pt-2">Bank Account</h4>
          <div className="grid grid-cols-3 gap-4">
            <div><label className="text-xs font-medium text-muted-foreground">Bank</label>
              <select value={editForm.bank_id} onChange={(e) => setEditForm({ ...editForm, bank_id: e.target.value })} className={selectCls}>
                <option value="">— Select Bank —</option>
                {banks.map((b) => (<option key={b.id} value={b.id}>{b.name}</option>))}
              </select>
            </div>
            <div><label className="text-xs font-medium text-muted-foreground">Account Number</label><input value={editForm.bank_account_number} onChange={(e) => setEditForm({ ...editForm, bank_account_number: e.target.value })} className={inputCls} /></div>
            <div><label className="text-xs font-medium text-muted-foreground">Account Name</label><input value={editForm.bank_account_name} onChange={(e) => setEditForm({ ...editForm, bank_account_name: e.target.value })} className={inputCls} /></div>
          </div>
          {/* Driver-added bank accounts */}
          {driverBankAccounts.length > 0 && (
            <>
              <h4 className="text-sm font-semibold text-foreground pt-2 flex items-center gap-2">
                Driver Bank Accounts
                <span className="text-[10px] font-normal text-muted-foreground bg-surface px-2 py-0.5 rounded-full">{driverBankAccounts.length} added by driver</span>
              </h4>
              <div className="space-y-2">
                {driverBankAccounts.map((ba: any) => (
                  <div key={ba.id} className="flex items-center gap-3 bg-surface rounded-xl px-3 py-2 border border-border">
                    {ba.is_primary && <span className="text-[9px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">PRIMARY</span>}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-foreground">{ba.bank_name}</p>
                      <p className="text-[11px] text-muted-foreground font-mono">{ba.account_number}</p>
                      {ba.account_name && <p className="text-[10px] text-muted-foreground">{ba.account_name}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
          {/* Driver-added Favara accounts */}
          {driverFavaraAccounts.length > 0 && (
            <>
              <h4 className="text-sm font-semibold text-foreground pt-2 flex items-center gap-2">
                Favara Accounts
                <span className="text-[10px] font-normal text-muted-foreground bg-surface px-2 py-0.5 rounded-full">{driverFavaraAccounts.length} added by driver</span>
              </h4>
              <div className="space-y-2">
                {driverFavaraAccounts.map((fa: any) => (
                  <div key={fa.id} className="flex items-center gap-3 bg-surface rounded-xl px-3 py-2 border border-border">
                    {fa.is_primary && <span className="text-[9px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">PRIMARY</span>}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-foreground">{fa.favara_name || "Favara"}</p>
                      <p className="text-[11px] text-muted-foreground font-mono">{fa.favara_id}</p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
          <h4 className="text-sm font-semibold text-foreground pt-2">Driver Documents</h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <DocUpload field="license_front_url" label="License Front" />
            <DocUpload field="license_back_url" label="License Back" />
            <DocUpload field="id_card_front_url" label="ID Card Front" />
            <DocUpload field="id_card_back_url" label="ID Card Back" />
          </div>
          <h4 className="text-sm font-semibold text-foreground pt-2">Document Expiry Dates</h4>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="text-xs font-medium text-muted-foreground">ID Card Expiry</label><input type="date" value={editForm.id_card_expiry} onChange={(e) => setEditForm({ ...editForm, id_card_expiry: e.target.value })} className={inputCls} /></div>
            <div><label className="text-xs font-medium text-muted-foreground">License Expiry</label><input type="date" value={editForm.license_expiry} onChange={(e) => setEditForm({ ...editForm, license_expiry: e.target.value })} className={inputCls} /></div>
          </div>
          <h4 className="text-sm font-semibold text-foreground pt-2">Taxi Permit <span className="text-xs font-normal text-muted-foreground">(optional)</span></h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <DocUpload field="taxi_permit_front_url" label="Permit Front" />
            <DocUpload field="taxi_permit_back_url" label="Permit Back" />
          </div>
          <button onClick={saveEdit} className="bg-primary text-primary-foreground px-6 py-2.5 rounded-xl text-sm font-semibold">Save Changes</button>
        </div>
      )}

      {/* Bulk Actions Bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 bg-primary/5 border border-primary/20 rounded-2xl px-4 py-3 flex-wrap">
          <span className="text-sm font-semibold text-foreground">{selected.size} selected</span>
          <div className="flex-1" />
          <button onClick={() => bulkSetStatus("Active")} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary rounded-xl text-xs font-semibold hover:bg-primary/20 transition-colors">
            <UserCheck className="w-3.5 h-3.5" /> Approve
          </button>
          <button onClick={() => bulkSetStatus("Inactive")} className="flex items-center gap-1.5 px-3 py-1.5 bg-muted text-muted-foreground rounded-xl text-xs font-semibold hover:bg-muted/80 transition-colors">
            <UserX className="w-3.5 h-3.5" /> Deactivate
          </button>
          <button onClick={() => { setShowBulkAssign("company"); setBulkCompanyId(""); }} className="flex items-center gap-1.5 px-3 py-1.5 bg-accent/50 text-accent-foreground rounded-xl text-xs font-semibold hover:bg-accent transition-colors">
            <Building2 className="w-3.5 h-3.5" /> Assign Company
          </button>
          <button onClick={() => { setShowBulkAssign("vehicle"); setBulkVehicleSearch(""); setBulkVehicleSelected(new Set()); }} className="flex items-center gap-1.5 px-3 py-1.5 bg-accent/50 text-accent-foreground rounded-xl text-xs font-semibold hover:bg-accent transition-colors">
            <Car className="w-3.5 h-3.5" /> Assign Vehicles
          </button>
          <button onClick={bulkDelete} className="flex items-center gap-1.5 px-3 py-1.5 bg-destructive/10 text-destructive rounded-xl text-xs font-semibold hover:bg-destructive/20 transition-colors">
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
          <button onClick={() => setSelected(new Set())} className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">Clear</button>
        </div>
      )}

      {/* ── Drivers List ── */}
      <div className="bg-card border border-border rounded-2xl overflow-x-auto">
        <table className="w-full min-w-[900px] table-fixed">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-border bg-surface/80 backdrop-blur-sm">
              <th className="px-3 py-3 w-10">
                <button onClick={toggleSelectAll} className="text-muted-foreground hover:text-foreground">
                  {selected.size === filteredDrivers.length && filteredDrivers.length > 0 ? <CheckSquare className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4" />}
                </button>
              </th>
              <th className="text-left text-[11px] font-bold text-muted-foreground uppercase tracking-wider px-3 py-3 w-[160px]">Driver</th>
              <th className="text-left text-[11px] font-bold text-muted-foreground uppercase tracking-wider px-3 py-3 w-[130px]">Contact</th>
              <th className="text-left text-[11px] font-bold text-muted-foreground uppercase tracking-wider px-3 py-3 w-[110px]">Company</th>
              <th className="text-left text-[11px] font-bold text-muted-foreground uppercase tracking-wider px-3 py-3 w-[70px]">Rating</th>
              <th className="text-left text-[11px] font-bold text-muted-foreground uppercase tracking-wider px-3 py-3 w-[100px]">Vehicles</th>
              <th className="text-left text-[11px] font-bold text-muted-foreground uppercase tracking-wider px-3 py-3 w-[90px]">Bank</th>
              <th className="text-left text-[11px] font-bold text-muted-foreground uppercase tracking-wider px-3 py-3 w-[60px]">Docs</th>
              <th className="text-left text-[11px] font-bold text-muted-foreground uppercase tracking-wider px-3 py-3 w-[100px]">Status</th>
              <th className="text-left text-[11px] font-bold text-muted-foreground uppercase tracking-wider px-3 py-3 w-[140px]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} className="px-4 py-12 text-center"><Loader2 className="w-5 h-5 animate-spin text-primary mx-auto" /></td></tr>
            ) : filteredDrivers.length === 0 ? (
              <tr><td colSpan={10} className="px-4 py-12 text-center text-muted-foreground text-sm">No drivers found</td></tr>
            ) : (
              filteredDrivers.map((d) => {
                const docCount = [d.license_front_url, d.license_back_url, d.id_card_front_url, d.id_card_back_url].filter(Boolean).length;
                const permitCount = [d.taxi_permit_front_url, d.taxi_permit_back_url].filter(Boolean).length;
                const companyName = companies.find((c) => c.id === d.company_id)?.name || d.company_name || "—";
                const vehicles = driverVehicles[d.id] || [];
                const isExpanded = expandedDriver === d.id;
                const pendingVCount = vehicles.filter(v => v.vehicle_status === "pending").length;

                return (
                  <React.Fragment key={d.id}>
                    <tr className={`border-b border-border hover:bg-surface/30 transition-colors ${selected.has(d.id) ? "bg-primary/5" : ""}`}>
                      <td className="px-3 py-2.5">
                        <button onClick={() => toggleSelect(d.id)} className="text-muted-foreground hover:text-foreground">
                          {selected.has(d.id) ? <CheckSquare className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4" />}
                        </button>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            <span className="text-[10px] font-bold text-primary">{d.first_name?.[0]}{d.last_name?.[0]}</span>
                          </div>
                          <span className="text-sm font-semibold text-foreground truncate">{d.first_name} {d.last_name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">+960 {d.phone_number}</td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground truncate">{companyName}</td>
                      <td className="px-3 py-2.5">
                        {driverRatings[d.id] ? (
                          <div className="flex items-center gap-1">
                            <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                            <span className="text-xs font-semibold text-foreground">{driverRatings[d.id].avg}</span>
                            <span className="text-[10px] text-muted-foreground">({driverRatings[d.id].count})</span>
                          </div>
                        ) : <span className="text-[10px] text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        <button onClick={() => setExpandedDriver(isExpanded ? null : d.id)} className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                          <Car className="w-3.5 h-3.5" />
                          {vehicles.length}
                          {pendingVCount > 0 && <span className="w-4 h-4 rounded-full bg-yellow-500 text-white text-[9px] font-bold flex items-center justify-center">{pendingVCount}</span>}
                          {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>
                        {vehicles.length > 0 && (
                          <div className="mt-0.5 space-y-0">
                            {vehicles.slice(0, 2).map((v: any) => (
                              <p key={v.id} className="text-[10px] text-muted-foreground font-mono truncate">{v.plate_number}</p>
                            ))}
                            {vehicles.length > 2 && <p className="text-[9px] text-muted-foreground">+{vehicles.length - 2} more</p>}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        {d.bank_name || d.bank_account_number ? (
                          <div className="space-y-0">
                            {d.bank_name && <p className="text-[10px] font-semibold text-foreground truncate">{d.bank_name}</p>}
                            {d.bank_account_number && <p className="text-[10px] text-muted-foreground font-mono truncate">{d.bank_account_number}</p>}
                          </div>
                        ) : <span className="text-[10px] text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${docCount === 4 ? "bg-green-100 text-green-700" : docCount > 0 ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"}`}>
                          {docCount}/4
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        {d.status === "Pending Review" ? (
                          <div className="flex items-center gap-1.5">
                            <span className="relative flex h-2.5 w-2.5">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-orange-500"></span>
                            </span>
                            <span className="text-[10px] font-bold text-orange-600">Review Needed</span>
                          </div>
                        ) : (
                          <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full whitespace-nowrap ${
                            d.status === "Active" ? "bg-green-100 text-green-700" :
                            d.status === "Rejected" ? "bg-red-100 text-red-700" :
                            d.status === "Pending" ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"
                          }`}>
                            {d.status === "Active" ? <ShieldCheck className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                            {d.status}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1 flex-nowrap">
                          <div className="min-w-[64px]">
                            {d.status !== "Active" && docCount === 4 ? (
                              <button onClick={() => toggleStatus(d.id, d.status)} className="text-[11px] font-bold text-primary-foreground bg-green-600 px-2 py-1 rounded-lg hover:bg-green-700 transition-colors whitespace-nowrap">Approve</button>
                            ) : d.status === "Active" ? (
                              <button onClick={() => toggleStatus(d.id, d.status)} className="text-[10px] font-medium text-destructive hover:underline whitespace-nowrap">Deactivate</button>
                            ) : (
                              <span className="text-[10px] text-muted-foreground whitespace-nowrap">Docs {docCount}/4</span>
                            )}
                          </div>
                          <button onClick={() => openEdit(d)} className="w-6 h-6 shrink-0 rounded-md bg-surface flex items-center justify-center text-muted-foreground hover:text-primary transition-colors"><Pencil className="w-3 h-3" /></button>
                          <button onClick={() => deleteDriver(d.id)} className="w-6 h-6 shrink-0 rounded-md bg-surface flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors"><Trash2 className="w-3 h-3" /></button>
                        </div>
                      </td>
                    </tr>

                    {/* Expanded vehicles */}
                    {isExpanded && (
                      <tr key={`${d.id}-vehicles`} className="border-b border-border">
                        <td colSpan={10} className="px-4 py-4 bg-surface/30">
                          <div className="space-y-3">
                            {/* Resubmission alert */}
                            {d.status === "Pending Review" && (
                              <div className="bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/20 rounded-xl p-3 flex items-start gap-3">
                                <div className="w-8 h-8 rounded-lg bg-orange-100 dark:bg-orange-500/20 flex items-center justify-center shrink-0">
                                  <Upload className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                                </div>
                                <div>
                                  <p className="text-xs font-bold text-orange-700 dark:text-orange-400">🔄 Driver Resubmitted Documents</p>
                                  <p className="text-[11px] text-orange-600/80 dark:text-orange-400/70 mt-0.5">This driver has updated their profile or documents after a previous rejection. Please review the changes below.</p>
                                </div>
                                <button onClick={() => toggleStatus(d.id, d.status)} className="shrink-0 flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded-lg text-[10px] font-bold hover:bg-green-700 transition-colors">
                                  <Check className="w-3 h-3" /> Approve
                                </button>
                              </div>
                            )}

                            {/* Profile Documents */}
                            <div className="bg-card border border-border rounded-xl p-3 space-y-2">
                              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Profile Documents</p>
                              <div className="flex flex-wrap gap-1.5">
                                {[
                                  { url: d.license_front_url, label: "License Front" },
                                  { url: d.license_back_url, label: "License Back" },
                                  { url: d.id_card_front_url, label: "ID Front" },
                                  { url: d.id_card_back_url, label: "ID Back" },
                                  { url: d.taxi_permit_front_url, label: "Permit Front" },
                                  { url: d.taxi_permit_back_url, label: "Permit Back" },
                                ].map((doc) => doc.url ? (
                                  <button key={doc.label} onClick={() => setPreviewImg(doc.url)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold transition-colors bg-primary/5 border border-primary/20 text-primary hover:bg-primary/10">
                                    <Eye className="w-3 h-3" /> {doc.label}
                                  </button>
                                ) : (
                                  <span key={doc.label} className="text-[10px] text-muted-foreground/40 px-2.5 py-1.5 border border-dashed border-border rounded-lg">
                                    {doc.label} ✗
                                  </span>
                                ))}
                              </div>
                              {(d.id_card_expiry || d.license_expiry) && (
                                <div className="flex flex-wrap gap-2 pt-1">
                                  {d.id_card_expiry && (
                                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${new Date(d.id_card_expiry) < new Date() ? "bg-red-100 text-red-700" : "bg-accent/50 text-foreground"}`}>
                                      ID Exp: {d.id_card_expiry}
                                    </span>
                                  )}
                                  {d.license_expiry && (
                                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${new Date(d.license_expiry) < new Date() ? "bg-red-100 text-red-700" : "bg-accent/50 text-foreground"}`}>
                                      License Exp: {d.license_expiry}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>

                            <div className="flex items-center justify-between">
                              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Vehicles for {d.first_name}</p>
                              <button onClick={() => openVehicleForm(d.id)} className="flex items-center gap-1.5 text-xs font-bold text-primary hover:underline">
                                <Plus className="w-3.5 h-3.5" /> Add Vehicle
                              </button>
                            </div>


                            {/* Vehicle form */}
                            {showVehicleForm && expandedDriver === d.id && (
                              <div id="admin-vehicle-edit-form" className="bg-card border border-border rounded-2xl p-4 space-y-3">
                                <p className="text-xs font-bold text-foreground">{editingVehicleId ? "Edit Vehicle" : "New Vehicle"}</p>
                                <div className="grid grid-cols-3 gap-3">
                                  <div>
                                    <label className="text-xs text-muted-foreground">Plate *</label>
                                    <input value={vehicleForm.plate_number} onChange={(e) => setVehicleForm({ ...vehicleForm, plate_number: e.target.value })} placeholder="P-1234" className={inputCls} />
                                  </div>
                                  <div>
                                    <label className="text-xs text-muted-foreground">Type</label>
                                    <select value={vehicleForm.vehicle_type_id} onChange={(e) => setVehicleForm({ ...vehicleForm, vehicle_type_id: e.target.value })} className={selectCls}>
                                      <option value="">Select</option>
                                      {vehicleTypes.map((vt) => <option key={vt.id} value={vt.id}>{vt.name}</option>)}
                                    </select>
                                  </div>
                                  <VehicleMakeModelSelect
                                    make={vehicleForm.make} model={vehicleForm.model}
                                    onMakeChange={(v) => setVehicleForm({ ...vehicleForm, make: v })}
                                    onModelChange={(v) => setVehicleForm({ ...vehicleForm, model: v })}
                                    inputClassName={inputCls}
                                  />
                                  <div>
                                    <label className="text-xs text-muted-foreground">Color</label>
                                    <input value={vehicleForm.color} onChange={(e) => setVehicleForm({ ...vehicleForm, color: e.target.value })} placeholder="White" className={inputCls} />
                                  </div>
                                  <div>
                                    <label className="text-xs text-muted-foreground">Year</label>
                                    <input value={vehicleForm.year} onChange={(e) => setVehicleForm({ ...vehicleForm, year: e.target.value })} placeholder="2023" className={inputCls} />
                                  </div>
                                  {/* Center Code - only for default company drivers */}
                                  {(() => {
                                    const driver = drivers.find(d => d.id === expandedDriver);
                                    const isDefaultCompany = driver?.company_id === defaultCompanyId;
                                    return isDefaultCompany ? (
                                      <div>
                                        <label className="text-xs text-muted-foreground">Center Code</label>
                                        <input value={vehicleForm.center_code} onChange={(e) => setVehicleForm({ ...vehicleForm, center_code: e.target.value.replace(/\D/g, "") })} placeholder="e.g. 1, 2, 3..." className={inputCls} />
                                        {vehicleForm.center_code && blockedCodes.includes(vehicleForm.center_code) && (
                                          <p className="text-[10px] text-destructive mt-0.5">⚠ This code is reserved</p>
                                        )}
                                      </div>
                                    ) : null;
                                  })()}
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                  <div>
                                    <label className="text-xs text-muted-foreground">Status</label>
                                    <select value={vehicleForm.vehicle_status} onChange={(e) => setVehicleForm({ ...vehicleForm, vehicle_status: e.target.value })} className={selectCls}>
                                      <option value="pending">Pending</option>
                                      <option value="approved">Approved</option>
                                      <option value="rejected">Rejected</option>
                                    </select>
                                  </div>
                                  {vehicleForm.vehicle_status === "rejected" && (
                                    <div>
                                      <label className="text-xs text-muted-foreground">Rejection Reason</label>
                                      <input value={vehicleForm.rejection_reason} onChange={(e) => setVehicleForm({ ...vehicleForm, rejection_reason: e.target.value })} placeholder="e.g. Blurry image" className={inputCls} />
                                    </div>
                                  )}
                                </div>
                                <p className="text-xs font-bold text-muted-foreground pt-1">Vehicle Documents</p>
                                <div className="grid grid-cols-3 gap-3">
                                  {[
                                    { field: "image_url", label: "Vehicle Photo" },
                                    { field: "registration_url", label: "Registration" },
                                    { field: "insurance_url", label: "Insurance" },
                                  ].map((item) => (
                                    <div key={item.field}>
                                      <label className="text-xs text-muted-foreground">{item.label}</label>
                                      <div className="flex items-center gap-2 mt-1">
                                        {(vehicleForm as any)[item.field] ? (
                                          <button onClick={() => setPreviewImg((vehicleForm as any)[item.field])} className="text-xs text-primary hover:underline flex items-center gap-1"><Eye className="w-3 h-3" /> View</button>
                                        ) : <span className="text-xs text-muted-foreground">None</span>}
                                        <label className="flex items-center gap-1 px-2 py-1 bg-surface border border-border rounded-lg text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                                          <Upload className="w-3 h-3" />
                                          {uploading === `vehicle_${item.field}` ? "..." : "Upload"}
                                          <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadVehicleDoc(item.field, e.target.files[0])} disabled={uploading === `vehicle_${item.field}`} />
                                        </label>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                                <div className="flex gap-2">
                                  <button onClick={() => { setShowVehicleForm(false); setEditingVehicleId(null); }} className="px-4 py-2 bg-surface text-foreground rounded-xl text-xs font-semibold border border-border">Cancel</button>
                                  <button onClick={saveVehicle} className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-xs font-semibold">{editingVehicleId ? "Update" : "Add"}</button>
                                </div>
                              </div>
                            )}

                            {/* Vehicle cards */}
                            {vehicles.length === 0 ? (
                              <p className="text-xs text-muted-foreground py-2">No vehicles assigned</p>
                            ) : (
                              <div className="grid gap-2">
                                {vehicles.map((v) => (
                                  <div key={v.id} className={`rounded-2xl border p-3 transition-all ${
                                    v.vehicle_status === "pending" ? "bg-yellow-50/50 border-yellow-200 dark:bg-yellow-500/5 dark:border-yellow-500/20" :
                                    v.vehicle_status === "rejected" ? "bg-red-50/50 border-red-200 dark:bg-red-500/5 dark:border-red-500/20" :
                                    "bg-card border-border"
                                  }`}>
                                    <div className="flex items-start gap-3">
                                      {/* Vehicle photo */}
                                      <div className="w-16 h-12 rounded-xl bg-surface border border-border overflow-hidden shrink-0 flex items-center justify-center">
                                        {v.image_url ? (
                                          <img src={v.image_url} alt="Vehicle" className="w-full h-full object-cover cursor-pointer" onClick={() => setPreviewImg(v.image_url)} />
                                        ) : (
                                          <Car className="w-5 h-5 text-muted-foreground/30" />
                                        )}
                                      </div>

                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <p className="text-sm font-bold text-foreground">{v.plate_number}</p>
                                          {v.center_code && (
                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">#{v.center_code}</span>
                                          )}
                                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                            v.vehicle_status === "approved" ? "bg-green-100 text-green-700" :
                                            v.vehicle_status === "rejected" ? "bg-red-100 text-red-700" :
                                            "bg-yellow-100 text-yellow-700"
                                          }`}>{v.vehicle_status}</span>
                                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${v.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                                            {v.is_active ? "Active" : "Inactive"}
                                          </span>
                                          {v.blocked_until && new Date(v.blocked_until) > new Date() && (
                                            <button
                                              onClick={async (e) => {
                                                e.stopPropagation();
                                                await supabase.from("vehicles").update({ blocked_until: null } as any).eq("id", v.id);
                                                toast({ title: "Unblocked", description: `${v.plate_number} has been unblocked` });
                                                fetchAll();
                                              }}
                                              className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                                              title="Click to unblock"
                                            >
                                              <Ban className="w-3 h-3" />
                                              Blocked · {Math.ceil((new Date(v.blocked_until).getTime() - Date.now()) / 60000)}m
                                            </button>
                                          )}
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-0.5">{v.make} {v.model} {v.color} {v.year ? `· ${v.year}` : ""} · {v.vehicle_types?.name || "No type"}</p>
                                        {v.rejection_reason && (
                                          <p className="text-[11px] text-destructive mt-1 flex items-center gap-1">
                                            <AlertTriangle className="w-3 h-3" /> {v.rejection_reason}
                                          </p>
                                        )}

                                        {/* Doc thumbnails */}
                                        <div className="flex items-center gap-2 mt-2">
                                          {[
                                            { url: v.registration_url, label: "Reg", color: "blue" },
                                            { url: v.insurance_url, label: "Ins", color: "green" },
                                            { url: v.image_url, label: "Photo", color: "purple" },
                                          ].map((doc) => doc.url ? (
                                            <button key={doc.label} onClick={() => setPreviewImg(doc.url)} className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold transition-colors bg-${doc.color}-50 text-${doc.color}-600 hover:bg-${doc.color}-100 border border-${doc.color}-100`}>
                                              <Eye className="w-3 h-3" /> {doc.label}
                                            </button>
                                          ) : (
                                            <span key={doc.label} className="text-[10px] text-muted-foreground/50 px-2 py-1">No {doc.label}</span>
                                          ))}
                                        </div>

                                        {/* Eligible Ride Types for this vehicle */}
                                        <div className="mt-2 pt-2 border-t border-border/50">
                                          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Eligible Ride Types</p>
                                          <div className="flex flex-wrap gap-1">
                                            {vehicleTypes.map((vt) => {
                                              const entry = (vehicleRideTypes[v.id] || []).find((e: any) => e.vtId === vt.id);
                                              const isApproved = entry?.status === "approved";
                                              const isPending = entry?.status === "pending";
                                              return (
                                                <div key={vt.id} className="flex items-center gap-0.5">
                                                  <button onClick={() => toggleVehicleRideType(d.id, v.id, vt.id)} className={`px-2 py-1 rounded-lg text-[10px] font-semibold transition-colors ${isApproved ? "bg-primary text-primary-foreground" : isPending ? "bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border border-yellow-500/30" : "bg-surface text-muted-foreground border border-border hover:text-foreground"}`}>
                                                    {vt.name}{isPending ? " ⏳" : ""}
                                                  </button>
                                                  {isPending && (
                                                    <button onClick={() => approveVehicleRideType(d.id, v.id, vt.id)} className="px-1 py-1 rounded-lg bg-green-500/20 text-green-700 dark:text-green-400 text-[10px] font-bold hover:bg-green-500/30 transition-colors" title="Approve">
                                                      <Check className="w-3 h-3" />
                                                    </button>
                                                  )}
                                                </div>
                                              );
                                            })}
                                          </div>
                                        </div>
                                      </div>

                                      {/* Vehicle actions */}
                                      <div className="flex flex-col gap-1.5 shrink-0">
                                        {v.vehicle_status === "pending" && (
                                          <>
                                            <button onClick={() => approveVehicle(v.id)} className="flex items-center gap-1 px-2.5 py-1.5 bg-green-600 text-white rounded-xl text-[10px] font-bold hover:bg-green-700 transition-colors">
                                              <Check className="w-3 h-3" /> Approve
                                            </button>
                                            <button onClick={() => { setRejectVehicleId(v.id); setRejectReason(""); }} className="flex items-center gap-1 px-2.5 py-1.5 bg-destructive/10 text-destructive rounded-xl text-[10px] font-bold hover:bg-destructive/20 transition-colors">
                                              <XCircle className="w-3 h-3" /> Reject
                                            </button>
                                          </>
                                        )}
                                        {v.vehicle_status === "rejected" && (
                                          <button onClick={() => approveVehicle(v.id)} className="flex items-center gap-1 px-2.5 py-1.5 bg-green-600 text-white rounded-xl text-[10px] font-bold hover:bg-green-700 transition-colors">
                                            <Check className="w-3 h-3" /> Approve
                                          </button>
                                        )}
                                        <button onClick={() => toggleVehicleActive(v.id, v.is_active)} className="text-[10px] font-medium text-primary hover:underline text-center">
                                          {v.is_active ? "Deactivate" : "Activate"}
                                        </button>
                                        <div className="flex items-center gap-1 justify-center">
                                          <button onClick={() => openVehicleForm(d.id, v)} className="w-6 h-6 rounded-lg bg-surface flex items-center justify-center text-muted-foreground hover:text-primary"><Pencil className="w-3 h-3" /></button>
                                          <button onClick={() => deleteVehicle(v.id)} className="w-6 h-6 rounded-lg bg-surface flex items-center justify-center text-muted-foreground hover:text-destructive"><Trash2 className="w-3 h-3" /></button>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
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
    </div>
  );
};

export default AdminDrivers;
