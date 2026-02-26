import { useState } from "react";
import { motion } from "framer-motion";
import { User, Phone, Plus, Trash2, Loader2, UserPlus, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import hdaLogo from "@/assets/hda-logo.png";
import type { UserProfile } from "./AuthScreen";

interface PassengerRegistrationProps {
  phoneNumber: string;
  onComplete: (profile: UserProfile) => void;
}

interface EmergencyContactInput {
  name: string;
  phone_number: string;
  relationship: string;
}

const PassengerRegistration = ({ phoneNumber, onComplete }: PassengerRegistrationProps) => {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [gender, setGender] = useState("1");
  const [email, setEmail] = useState("");
  const [emergencyContacts, setEmergencyContacts] = useState<EmergencyContactInput[]>([
    { name: "", phone_number: "", relationship: "" },
  ]);
  const [saving, setSaving] = useState(false);

  const addContact = () => {
    if (emergencyContacts.length >= 3) return;
    setEmergencyContacts([...emergencyContacts, { name: "", phone_number: "", relationship: "" }]);
  };

  const removeContact = (index: number) => {
    setEmergencyContacts(emergencyContacts.filter((_, i) => i !== index));
  };

  const updateContact = (index: number, field: keyof EmergencyContactInput, value: string) => {
    const updated = [...emergencyContacts];
    updated[index] = { ...updated[index], [field]: value };
    setEmergencyContacts(updated);
  };

  const handleSubmit = async () => {
    if (!firstName.trim()) {
      toast({ title: "First name is required", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      // Create profile
      const { data: profile, error: profileErr } = await supabase
        .from("profiles")
        .insert({
          phone_number: phoneNumber,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          gender,
          email: email.trim() || null,
          user_type: "Rider",
          status: "Active",
          country_code: "960",
        })
        .select()
        .single();

      if (profileErr) throw profileErr;

      // Save emergency contacts
      const validContacts = emergencyContacts.filter(c => c.name.trim() && c.phone_number.trim());
      if (validContacts.length > 0) {
        const contactInserts = validContacts.map(c => ({
          user_id: profile.id,
          name: c.name.trim(),
          phone_number: c.phone_number.replace(/\D/g, ""),
          relationship: c.relationship.trim() || null,
        }));
        await supabase.from("emergency_contacts").insert(contactInserts);
      }

      toast({ title: "Welcome!", description: `Account created, ${firstName}!` });
      onComplete({
        id: profile.id,
        first_name: profile.first_name,
        last_name: profile.last_name,
        email: profile.email,
        phone_number: profile.phone_number,
        gender: profile.gender || "1",
        status: profile.status,
      });
    } catch (err: any) {
      toast({ title: "Registration failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 bg-background flex flex-col max-w-lg mx-auto">
      <div className="flex-1 overflow-y-auto px-6 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl overflow-hidden">
              <img src={hdaLogo} alt="HDA" className="w-full h-full object-contain" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-foreground">Create Account</h1>
              <p className="text-xs text-muted-foreground">+960 {phoneNumber}</p>
            </div>
          </div>

          {/* Personal Info */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <User className="w-4 h-4 text-primary" /> Personal Information
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground font-medium">First Name *</label>
                <input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value.slice(0, 50))}
                  placeholder="Ahmed"
                  className="w-full mt-1 px-3 py-3 bg-surface rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground font-medium">Last Name</label>
                <input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value.slice(0, 50))}
                  placeholder="Ali"
                  className="w-full mt-1 px-3 py-3 bg-surface rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground font-medium">Email (optional)</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value.slice(0, 100))}
                placeholder="ahmed@example.com"
                className="w-full mt-1 px-3 py-3 bg-surface rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label className="text-xs text-muted-foreground font-medium">Gender</label>
              <div className="flex gap-2 mt-1">
                {[
                  { value: "1", label: "Male" },
                  { value: "2", label: "Female" },
                ].map((g) => (
                  <button
                    key={g.value}
                    onClick={() => setGender(g.value)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                      gender === g.value
                        ? "bg-primary text-primary-foreground"
                        : "bg-surface text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Emergency Contacts */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Users className="w-4 h-4 text-primary" /> Emergency Contacts
              </div>
              {emergencyContacts.length < 3 && (
                <button
                  onClick={addContact}
                  className="flex items-center gap-1 text-xs text-primary font-semibold"
                >
                  <Plus className="w-3 h-3" /> Add
                </button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              These contacts will be notified in case of an SOS emergency.
            </p>

            {emergencyContacts.map((contact, index) => (
              <div key={index} className="bg-surface rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground">Contact {index + 1}</span>
                  {emergencyContacts.length > 1 && (
                    <button onClick={() => removeContact(index)} className="text-destructive">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <input
                  value={contact.name}
                  onChange={(e) => updateContact(index, "name", e.target.value.slice(0, 50))}
                  placeholder="Contact name"
                  className="w-full px-3 py-2.5 bg-card border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-muted-foreground">
                      <Phone className="w-3 h-3" />
                      <span className="text-xs font-medium">+960</span>
                    </div>
                    <input
                      value={contact.phone_number}
                      onChange={(e) => updateContact(index, "phone_number", e.target.value.replace(/\D/g, "").slice(0, 7))}
                      placeholder="7XXXXXX"
                      className="w-full pl-[4.5rem] pr-3 py-2.5 bg-card border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <input
                    value={contact.relationship}
                    onChange={(e) => updateContact(index, "relationship", e.target.value.slice(0, 30))}
                    placeholder="Relation"
                    className="w-24 px-3 py-2.5 bg-card border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Submit */}
      <div className="px-6 pb-8 pt-3">
        <button
          onClick={handleSubmit}
          disabled={saving || !firstName.trim()}
          className="w-full bg-primary text-primary-foreground font-semibold py-4 rounded-xl text-base transition-all active:scale-[0.98] hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2"
        >
          {saving ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              <UserPlus className="w-5 h-5" />
              Create Account
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default PassengerRegistration;
