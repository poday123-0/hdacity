import { useState, useEffect } from "react";
import { Menu, Bell, Car, X, Clock, LogOut, BellOff } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import hdaLogo from "@/assets/hda-logo.png";
import { UserProfile } from "@/components/AuthScreen";
import RideHistory from "@/components/RideHistory";
import ThemeToggle from "@/components/ThemeToggle";
import { useTheme } from "@/hooks/use-theme";

interface TopBarProps {
  onDriverMode?: () => void;
  onLogout?: () => void;
  userName?: string;
  userProfile?: UserProfile | null;
}

const TopBar = ({ onLogout, userName, userProfile }: TopBarProps) => {
  useTheme(); // Initialize theme on mount
  const [showProfile, setShowProfile] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [hasUnread, setHasUnread] = useState(true);

  return (
    <>
      <div className="absolute top-0 left-0 right-0 z-[700] p-4 safe-area-top">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setShowProfile(true)}
            className="w-10 h-10 rounded-full bg-card shadow-md flex items-center justify-center active:scale-95 transition-transform"
          >
            <Menu className="w-5 h-5 text-foreground" />
          </button>

          <div className="flex items-center gap-1.5">
            <img src={hdaLogo} alt="HDA Taxi" className="w-8 h-8 object-contain" />
            <span className="text-lg font-extrabold tracking-tight text-foreground">HDA</span>
            <span className="text-lg font-extrabold tracking-tight text-primary">TAXI</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => { setShowNotifications(true); setHasUnread(false); }}
              className="w-10 h-10 rounded-full bg-card shadow-md flex items-center justify-center relative active:scale-95 transition-transform"
            >
              <Bell className="w-5 h-5 text-foreground" />
              {hasUnread && <div className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary" />}
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
              className="bg-card rounded-t-3xl shadow-2xl w-full max-w-md overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4 pb-6 space-y-4">
                <div className="flex justify-center"><div className="w-10 h-1 rounded-full bg-border" /></div>

                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-foreground">My Profile</h3>
                  <button onClick={() => setShowProfile(false)} className="w-8 h-8 rounded-full bg-surface flex items-center justify-center">
                    <X className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>

                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center text-xl font-bold text-primary">
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

                {/* Theme toggle */}
                <ThemeToggle variant="row" />

                {/* Ride History button */}
                <button
                  onClick={() => { setShowProfile(false); setShowHistory(true); }}
                  className="w-full flex items-center gap-3 bg-surface rounded-xl px-4 py-3 active:scale-[0.98] transition-transform"
                >
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Clock className="w-5 h-5 text-primary" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-semibold text-foreground">Ride History</p>
                    <p className="text-xs text-muted-foreground">View past trips & receipts</p>
                  </div>
                </button>

                {onLogout && (
                  <button
                    onClick={() => { setShowProfile(false); onLogout(); }}
                    className="w-full flex items-center justify-center gap-2 bg-destructive/10 text-destructive font-semibold py-3 rounded-xl text-sm active:scale-95 transition-transform"
                  >
                    <LogOut className="w-4 h-4" />
                    Logout
                  </button>
                )}

                <button
                  onClick={() => setShowProfile(false)}
                  className="w-full bg-surface text-foreground font-semibold py-3 rounded-xl text-sm active:scale-95 transition-transform"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Ride History */}
      <AnimatePresence>
        {showHistory && (
          <RideHistory userId={userProfile?.id} onClose={() => setShowHistory(false)} />
        )}
      </AnimatePresence>

      {/* Notifications Panel */}
      <AnimatePresence>
        {showNotifications && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[600] flex items-end justify-center bg-foreground/50 backdrop-blur-sm"
            onClick={() => setShowNotifications(false)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="bg-card rounded-t-3xl shadow-2xl w-full max-w-md overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4 pb-6 space-y-4">
                <div className="flex justify-center"><div className="w-10 h-1 rounded-full bg-border" /></div>
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-foreground">Notifications</h3>
                  <button onClick={() => setShowNotifications(false)} className="w-8 h-8 rounded-full bg-surface flex items-center justify-center">
                    <X className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>
                <div className="flex flex-col items-center justify-center py-8 text-center gap-3">
                  <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
                    <BellOff className="w-7 h-7 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">No notifications yet</p>
                  <p className="text-xs text-muted-foreground/70">You'll see ride updates and alerts here</p>
                </div>
                <button
                  onClick={() => setShowNotifications(false)}
                  className="w-full bg-surface text-foreground font-semibold py-3 rounded-xl text-sm active:scale-95 transition-transform"
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
