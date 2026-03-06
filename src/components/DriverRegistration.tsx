import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { User, Phone, Loader2, UserPlus, Camera, Car, Building2, Upload, ChevronDown } from "lucide-react";
import VehicleMakeModelSelect from "@/components/VehicleMakeModelSelect";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import SystemLogo from "@/components/SystemLogo";

interface DriverRegistrationProps {
  phoneNumber: string;
  onComplete: () => void;
  onBack: () => void;
}

const DriverRegistration = ({ phoneNumber, onComplete, onBack }: DriverRegistrationProps) => {
  const [step, setStep] = useState<"profile" | "documents" | "vehicle">("profile");
  const [saving, setSaving] = useState(false);

  // Profile fields
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [gender, setGender] = useState("1");

  // Company
  const [companies, setCompanies] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");

  // Documents
  const [idCardFront, setIdCardFront] = useState<string | null>(null);
  const [idCardBack, setIdCardBack] = useState<string | null>(null);
  const [licenseFront, setLicenseFront] = useState<string | null>(null);
  const [licenseBack, setLicenseBack] = useState<string | null>(null);
  const [taxiPermitFront, setTaxiPermitFront] = useState<string | null>(null);
  const [taxiPermitBack, setTaxiPermitBack] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState("");
  const [showUploadSheet, setShowUploadSheet] = useState(false);

  // Vehicle fields
  const [vehicleTypes, setVehicleTypes] = useState<Array<{ id: string; name: string }>>([]);
  const [plateNumber, setPlateNumber] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [color, setColor] = useState("");
  const [vehicleTypeId, setVehicleTypeId] = useState("");
  const [selectedRideTypeIds, setSelectedRideTypeIds] = useState<string[]>([]);
  const [vehicleRegUrl, setVehicleRegUrl] = useState<string | null>(null);
  const [vehicleInsuranceUrl, setVehicleInsuranceUrl] = useState<string | null>(null);
  const [vehicleImageUrl, setVehicleImageUrl] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const [compRes, vtRes] = await Promise.all([
        supabase.from("companies").select("id, name").eq("is_active", true).order("name"),
        supabase.from("vehicle_types").select("id, name").eq("is_active", true).order("sort_order"),
      ]);
      setCompanies(compRes.data || []);
      setVehicleTypes(vtRes.data || []);
    };
    load();
  }, []);

  const handleFileUpload = async (file: File, target: string) => {
    setUploading(target);
    const ext = file.name.split(".").pop();
    const folder = target === "avatar" ? "avatars" : "driver-documents";
    const path = `registration/${phoneNumber}/${target}_${Date.now()}.${ext}`;
    
    const { error } = await supabase.storage.from(folder).upload(path, file, { upsert: true });
    if (error) {
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
      setUploading(null);
      return;
    }
    const { data: urlData } = supabase.storage.from(folder).getPublicUrl(path);
    const url = `${urlData.publicUrl}?t=${Date.now()}`;

    switch (target) {
      case "avatar": setAvatarUrl(url); break;
      case "id_front": setIdCardFront(url); break;
      case "id_back": setIdCardBack(url); break;
      case "license_front": setLicenseFront(url); break;
      case "license_back": setLicenseBack(url); break;
      case "permit_front": setTaxiPermitFront(url); break;
      case "permit_back": setTaxiPermitBack(url); break;
      case "vehicle_reg": setVehicleRegUrl(url); break;
      case "vehicle_insurance": setVehicleInsuranceUrl(url); break;
      case "vehicle_image": setVehicleImageUrl(url); break;
    }
    setUploading(null);
  };

  const triggerUpload = (target: string) => {
    setUploadTarget(target);
    setShowUploadSheet(true);
  };

  const pickFromGallery = () => {
    setShowUploadSheet(false);
    setTimeout(() => fileInputRef.current?.click(), 50);
  };

  const takePhoto = () => {
    setShowUploadSheet(false);
    setTimeout(() => cameraInputRef.current?.click(), 50);
  };

  const handleSubmit = async () => {
    if (!firstName.trim()) {
      toast({ title: "First name is required", variant: "destructive" });
      return;
    }
    if (!plateNumber.trim()) {
      toast({ title: "Vehicle plate number is required", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      // Find company name
      const companyName = companies.find(c => c.id === selectedCompanyId)?.name || "";

      // Create driver profile with Pending status
      const { data: profile, error: profileErr } = await supabase
        .from("profiles")
        .insert({
          phone_number: phoneNumber,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          email: email.trim() || null,
          gender,
          user_type: "Driver",
          status: "Pending Review",
          country_code: "960",
          company_id: selectedCompanyId || null,
          company_name: companyName,
          avatar_url: avatarUrl,
          id_card_front_url: idCardFront,
          id_card_back_url: idCardBack,
          license_front_url: licenseFront,
          license_back_url: licenseBack,
          taxi_permit_front_url: taxiPermitFront,
          taxi_permit_back_url: taxiPermitBack,
        })
        .select()
        .single();

      if (profileErr) throw profileErr;

      // Create vehicle
      let createdVehicleId: string | null = null;
      if (plateNumber.trim()) {
        const { data: vehicleData } = await supabase.from("vehicles").insert({
          driver_id: profile.id,
          plate_number: plateNumber.trim().toUpperCase(),
          make: make.trim() || null,
          model: model.trim() || null,
          color: color.trim() || null,
          vehicle_type_id: vehicleTypeId || null,
          is_active: true,
          vehicle_status: "pending",
          registration_url: vehicleRegUrl,
          insurance_url: vehicleInsuranceUrl,
          image_url: vehicleImageUrl,
        } as any).select().single();
        createdVehicleId = vehicleData?.id || null;
      }

      // Save eligible ride types (linked to the vehicle)
      const rideTypes = selectedRideTypeIds.length > 0 ? selectedRideTypeIds : (vehicleTypeId ? [vehicleTypeId] : []);
      if (rideTypes.length > 0 && createdVehicleId) {
        await supabase.from("driver_vehicle_types").insert(
          rideTypes.map(vtId => ({ driver_id: profile.id, vehicle_type_id: vtId, vehicle_id: createdVehicleId, status: "pending" } as any))
        );
      }

      // Notify admin
      try {
        await supabase.functions.invoke("notify-new-driver", {
          body: {
            driver_name: `${firstName.trim()} ${lastName.trim()}`.trim(),
            phone_number: phoneNumber,
            company_name: companyName,
          },
        });
      } catch {} // Non-blocking

      toast({
        title: "Registration submitted!",
        description: "Your account is pending admin approval. You'll be notified once approved.",
      });
      onComplete();
    } catch (err: any) {
      toast({ title: "Registration failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const inputClass = "w-full mt-1 px-3 py-3 bg-surface rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary";

  const DocUploadCard = ({ label, url, target }: { label: string; url: string | null; target: string }) => (
    <button
      onClick={() => triggerUpload(target)}
      disabled={uploading === target}
      className="flex flex-col items-center gap-1.5 p-3 bg-surface rounded-xl border border-border hover:border-primary/50 transition-colors"
    >
      {url ? (
        <img src={url} alt={label} className="w-14 h-10 object-cover rounded-lg" />
      ) : (
        <div className="w-14 h-10 rounded-lg bg-muted flex items-center justify-center">
          <Upload className="w-4 h-4 text-muted-foreground" />
        </div>
      )}
      <span className="text-[10px] font-medium text-muted-foreground text-center leading-tight">
        {uploading === target ? "Uploading..." : label}
      </span>
    </button>
  );

  return (
    <div className="fixed inset-0 z-40 bg-background flex flex-col max-w-lg mx-auto">
      {/* Gallery picker */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && uploadTarget) handleFileUpload(file, uploadTarget);
          e.target.value = "";
        }}
      />
      {/* Camera capture */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && uploadTarget) handleFileUpload(file, uploadTarget);
          e.target.value = "";
        }}
      />

      {/* Upload action sheet */}
      {showUploadSheet && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setShowUploadSheet(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <motion.div
            initial={{ y: 200, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="relative w-full max-w-lg mx-auto p-4 space-y-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-card rounded-2xl overflow-hidden">
              <button
                onClick={takePhoto}
                className="w-full flex items-center gap-3 px-5 py-4 text-sm font-semibold text-foreground hover:bg-surface transition-colors border-b border-border"
              >
                <Camera className="w-5 h-5 text-primary" />
                Take Photo
              </button>
              <button
                onClick={pickFromGallery}
                className="w-full flex items-center gap-3 px-5 py-4 text-sm font-semibold text-foreground hover:bg-surface transition-colors"
              >
                <Upload className="w-5 h-5 text-primary" />
                Choose from Gallery
              </button>
            </div>
            <button
              onClick={() => setShowUploadSheet(false)}
              className="w-full bg-card rounded-2xl px-5 py-4 text-sm font-semibold text-destructive hover:bg-surface transition-colors"
            >
              Cancel
            </button>
          </motion.div>
        </div>
      )}

      {/* Header */}
      <div className="px-6 pt-6 pb-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl overflow-hidden">
            <SystemLogo className="w-full h-full object-contain" alt="HDA" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-foreground">Driver Registration</h1>
            <p className="text-xs text-muted-foreground">+960 {phoneNumber}</p>
          </div>
        </div>

        {/* Step indicator */}
        <div className="flex gap-2 mt-4">
          {(["profile", "documents", "vehicle"] as const).map((s, i) => (
            <button
              key={s}
              onClick={() => setStep(s)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                step === s ? "bg-primary text-primary-foreground" : "bg-surface text-muted-foreground"
              }`}
            >
              {i + 1}. {s === "profile" ? "Profile" : s === "documents" ? "Documents" : "Vehicle"}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 pb-4">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="space-y-4 pt-2"
        >
          {step === "profile" && (
            <>
              {/* Avatar */}
              <div className="flex justify-center">
                <button
                  onClick={() => triggerUpload("avatar")}
                  className="relative w-20 h-20 rounded-full bg-surface border-2 border-border overflow-hidden"
                >
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Camera className="w-6 h-6 text-muted-foreground" />
                    </div>
                  )}
                  <div className="absolute bottom-0 inset-x-0 bg-primary/80 py-0.5 text-[9px] font-bold text-primary-foreground text-center">
                    Photo
                  </div>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground font-medium">First Name *</label>
                  <input value={firstName} onChange={(e) => setFirstName(e.target.value.slice(0, 50))} placeholder="Ahmed" className={inputClass} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground font-medium">Last Name</label>
                  <input value={lastName} onChange={(e) => setLastName(e.target.value.slice(0, 50))} placeholder="Ali" className={inputClass} />
                </div>
              </div>

              <div>
                <label className="text-xs text-muted-foreground font-medium">Email (optional)</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value.slice(0, 100))} placeholder="ahmed@example.com" className={inputClass} />
              </div>

              <div>
                <label className="text-xs text-muted-foreground font-medium">Gender</label>
                <div className="flex gap-2 mt-1">
                  {[{ value: "1", label: "Male" }, { value: "2", label: "Female" }].map((g) => (
                    <button
                      key={g.value}
                      onClick={() => setGender(g.value)}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                        gender === g.value ? "bg-primary text-primary-foreground" : "bg-surface text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs text-muted-foreground font-medium">Company *</label>
                <div className="relative mt-1">
                  <select
                    value={selectedCompanyId}
                    onChange={(e) => setSelectedCompanyId(e.target.value)}
                    className={`${inputClass} appearance-none pr-10`}
                  >
                    <option value="">Select company</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none mt-0.5" />
                </div>
              </div>

              <button
                onClick={() => setStep("documents")}
                disabled={!firstName.trim() || !selectedCompanyId}
                className="w-full bg-primary text-primary-foreground font-semibold py-3.5 rounded-xl text-sm transition-all active:scale-[0.98] hover:opacity-90 disabled:opacity-40"
              >
                Next: Upload Documents
              </button>
            </>
          )}

          {step === "documents" && (
            <>
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Upload className="w-4 h-4 text-primary" /> Upload Documents
              </div>
              <p className="text-xs text-muted-foreground">Upload clear photos of your ID card, driving license, and taxi permit (front & back).</p>

              <div className="space-y-3">
                <p className="text-xs font-semibold text-foreground">ID Card</p>
                <div className="grid grid-cols-2 gap-3">
                  <DocUploadCard label="Front" url={idCardFront} target="id_front" />
                  <DocUploadCard label="Back" url={idCardBack} target="id_back" />
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-semibold text-foreground">Driving License</p>
                <div className="grid grid-cols-2 gap-3">
                  <DocUploadCard label="Front" url={licenseFront} target="license_front" />
                  <DocUploadCard label="Back" url={licenseBack} target="license_back" />
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-semibold text-foreground">Taxi Permit <span className="font-normal text-muted-foreground">(optional)</span></p>
                <div className="grid grid-cols-2 gap-3">
                  <DocUploadCard label="Front" url={taxiPermitFront} target="permit_front" />
                  <DocUploadCard label="Back" url={taxiPermitBack} target="permit_back" />
                </div>
              </div>

              <button
                onClick={() => setStep("vehicle")}
                className="w-full bg-primary text-primary-foreground font-semibold py-3.5 rounded-xl text-sm transition-all active:scale-[0.98] hover:opacity-90"
              >
                Next: Vehicle Information
              </button>
            </>
          )}

          {step === "vehicle" && (
            <>
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Car className="w-4 h-4 text-primary" /> Vehicle Information
              </div>

              <div>
                <label className="text-xs text-muted-foreground font-medium">Plate Number *</label>
                <input
                  value={plateNumber}
                  onChange={(e) => setPlateNumber(e.target.value.slice(0, 20))}
                  placeholder="P1234"
                  className={inputClass}
                />
              </div>

              <VehicleMakeModelSelect
                make={make}
                model={model}
                onMakeChange={setMake}
                onModelChange={setModel}
                inputClassName="w-full mt-1 px-3 py-3 bg-surface rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />

              <div>
                <label className="text-xs text-muted-foreground font-medium">Color</label>
                <input value={color} onChange={(e) => setColor(e.target.value.slice(0, 20))} placeholder="White" className={inputClass} />
              </div>

              <div>
                <label className="text-xs text-muted-foreground font-medium">Vehicle Type</label>
                <div className="relative mt-1">
                  <select
                    value={vehicleTypeId}
                    onChange={(e) => {
                      setVehicleTypeId(e.target.value);
                      // Auto-add to ride types if not already there
                      if (e.target.value && !selectedRideTypeIds.includes(e.target.value)) {
                        setSelectedRideTypeIds(prev => [...prev, e.target.value]);
                      }
                    }}
                    className={`${inputClass} appearance-none pr-10`}
                  >
                    <option value="">Select type</option>
                    {vehicleTypes.map((vt) => (
                      <option key={vt.id} value={vt.id}>{vt.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none mt-0.5" />
                </div>
              </div>

              <div>
                <label className="text-xs text-muted-foreground font-medium">Eligible Ride Types</label>
                <p className="text-[10px] text-muted-foreground mt-0.5">Select all ride types you can serve (e.g. a van driver can also take car rides)</p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {vehicleTypes.map((vt) => {
                    const isSelected = selectedRideTypeIds.includes(vt.id);
                    return (
                      <button
                        key={vt.id}
                        type="button"
                        onClick={() => setSelectedRideTypeIds(prev => isSelected ? prev.filter(id => id !== vt.id) : [...prev, vt.id])}
                        className={`px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${isSelected ? "bg-primary text-primary-foreground" : "bg-surface text-muted-foreground border border-border hover:text-foreground"}`}
                      >
                        {vt.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Vehicle Documents */}
              <div className="space-y-3">
                <p className="text-xs font-semibold text-foreground">Vehicle Documents</p>
                <div className="grid grid-cols-3 gap-3">
                  <DocUploadCard label="Registration" url={vehicleRegUrl} target="vehicle_reg" />
                  <DocUploadCard label="Insurance" url={vehicleInsuranceUrl} target="vehicle_insurance" />
                  <DocUploadCard label="Vehicle Photo" url={vehicleImageUrl} target="vehicle_image" />
                </div>
              </div>

              <button
                onClick={handleSubmit}
                disabled={saving || !firstName.trim() || !plateNumber.trim()}
                className="w-full bg-primary text-primary-foreground font-semibold py-4 rounded-xl text-base transition-all active:scale-[0.98] hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {saving ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <UserPlus className="w-5 h-5" />
                    Submit Registration
                  </>
                )}
              </button>
            </>
          )}
        </motion.div>
      </div>

      {/* Back button */}
      <div className="px-6 pb-6 pt-2">
        <button
          onClick={onBack}
          className="w-full text-center text-sm text-muted-foreground font-medium py-2"
        >
          ← Back to login
        </button>
      </div>
    </div>
  );
};

export default DriverRegistration;
