import { useState } from "react";
import { Menu, Bell, Car, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import hdaLogo from "@/assets/hda-logo.png";
import { UserProfile } from "@/components/AuthScreen";

interface TopBarProps {
  onDriverMode?: () => void;
  userName?: string;
  userProfile?: UserProfile | null;
}

const TopBar = ({ onDriverMode, userName, userProfile }: TopBarProps) => {
  const [showProfile, setShowProfile] = useState(false);

  return (
    <>
      <div className="absolute top-0 left-0 right-0 z-20 p-4">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setShowProfile(true)}
            className="w-10 h-10 rounded-full bg-card shadow-md flex items-center justify-center"
          >
            <Menu className="w-5 h-5 text-foreground" />
          </button>

          <div className="flex items-center gap-1.5">
            <img src={hdaLogo} alt="HDA Taxi" className="w-8 h-8 object-contain" />
            <span className="text-lg font-extrabold tracking-tight text-foreground">HDA</span>
            <span className="text-lg font-extrabold tracking-tight text-primary">TAXI</span>
          </div>

          <div className="flex items-center gap-2">
            {onDriverMode && (
              <button
                onClick={onDriverMode}
                className="w-10 h-10 rounded-full bg-card shadow-md flex items-center justify-center"
                title="Driver Mode"
              >
                <Car className="w-5 h-5 text-foreground" />
              </button>
            )}
            <button className="w-10 h-10 rounded-full bg-card shadow-md flex items-center justify-center relative">
              <Bell className="w-5 h-5 text-foreground" />
              <div className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary" />
            </button>
          </div>
        </div>
      </div>

      {/* Profile Panel */}
      <AnimatePresence>
        {showProfile && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[600] flex items-end justify-center bg-foreground/50 backdrop-blur-sm"
            onClick={() => setShowProfile(false)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="bg-card rounded-t-2xl shadow-2xl w-full max-w-md overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-5 space-y-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-foreground">My Profile</h3>
                  <button onClick={() => setShowProfile(false)}>
                    <X className="w-5 h-5 text-muted-foreground" />
                  </button>
                </div>

                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-xl font-bold text-primary">
                    {userProfile?.first_name?.[0]}{userProfile?.last_name?.[0]}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-foreground">
                      {userProfile?.first_name} {userProfile?.last_name}
                    </h3>
                    <p className="text-sm text-muted-foreground">Passenger</p>
                  </div>
                </div>

                <div className="bg-surface rounded-xl divide-y divide-border">
                  {[
                    { label: "Phone", value: `+960 ${userProfile?.phone_number || "—"}` },
                    { label: "Email", value: userProfile?.email || "Not set" },
                    { label: "Gender", value: userProfile?.gender === "1" ? "Male" : userProfile?.gender === "2" ? "Female" : userProfile?.gender || "—" },
                    { label: "Status", value: userProfile?.status || "—" },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between px-4 py-3">
                      <span className="text-sm text-muted-foreground">{item.label}</span>
                      <span className="text-sm font-medium text-foreground">{item.value}</span>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => setShowProfile(false)}
                  className="w-full bg-surface text-foreground font-semibold py-3 rounded-xl text-sm"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default TopBar;
