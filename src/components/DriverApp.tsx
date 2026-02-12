import { useState } from "react";
import { motion } from "framer-motion";
import {
  MapPin,
  Navigation,
  Power,
  DollarSign,
  Clock,
  Star,
  CheckCircle,
  X,
  Phone,
  User,
} from "lucide-react";

type DriverScreen = "offline" | "online" | "ride-request" | "navigating" | "complete";

interface DriverAppProps {
  onSwitchToPassenger: () => void;
}

const DriverApp = ({ onSwitchToPassenger }: DriverAppProps) => {
  const [screen, setScreen] = useState<DriverScreen>("offline");

  return (
    <div className="relative w-full h-screen max-w-md mx-auto overflow-hidden bg-surface">
      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 z-20 p-4">
        <div className="flex items-center justify-between">
          <button
            onClick={onSwitchToPassenger}
            className="px-3 py-2 rounded-full bg-card shadow-md text-xs font-semibold text-muted-foreground"
          >
            Passenger Mode
          </button>
          <div className="flex items-center gap-2">
            <span className="text-lg font-extrabold tracking-tight text-foreground">HDA</span>
            <span className="text-lg font-extrabold tracking-tight text-primary">DRIVER</span>
          </div>
          <div className="w-10 h-10 rounded-full bg-card shadow-md flex items-center justify-center">
            <User className="w-5 h-5 text-foreground" />
          </div>
        </div>
      </div>

      {/* Map placeholder */}
      <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-surface to-surface" />

      {screen === "offline" && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-center space-y-6 px-8"
          >
            <div className="w-20 h-20 rounded-full bg-muted mx-auto flex items-center justify-center">
              <Power className="w-10 h-10 text-muted-foreground" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">You're offline</h2>
              <p className="text-muted-foreground text-sm mt-1">Go online to start receiving rides</p>
            </div>
            <button
              onClick={() => setScreen("online")}
              className="w-full bg-primary text-primary-foreground font-semibold py-4 rounded-xl text-base transition-all active:scale-[0.98]"
            >
              Start driving
            </button>
          </motion.div>
        </div>
      )}

      {screen === "online" && (
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          transition={{ type: "spring", damping: 30, stiffness: 300 }}
          className="absolute bottom-0 left-0 right-0 bg-card rounded-t-2xl shadow-[0_-4px_30px_rgba(0,0,0,0.1)] z-10"
        >
          <div className="p-5 space-y-5">
            <div className="flex justify-center">
              <div className="w-10 h-1 rounded-full bg-border" />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-primary animate-pulse-dot" />
                  <span className="font-semibold text-foreground">Online</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">Waiting for ride requests...</p>
              </div>
              <button
                onClick={() => setScreen("offline")}
                className="px-4 py-2 bg-surface rounded-lg text-sm font-medium text-foreground"
              >
                Go offline
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Rides", value: "12", icon: Navigation },
                { label: "Earnings", value: "960 MVR", icon: DollarSign },
                { label: "Hours", value: "6h30", icon: Clock },
              ].map((stat) => (
                <div key={stat.label} className="bg-surface rounded-xl p-3 text-center">
                  <stat.icon className="w-5 h-5 text-primary mx-auto mb-1" />
                  <p className="text-lg font-bold text-foreground">{stat.value}</p>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                </div>
              ))}
            </div>

            <button
              onClick={() => setScreen("ride-request")}
              className="w-full bg-primary/10 text-primary font-semibold py-3 rounded-xl text-sm"
            >
              Simulate ride request
            </button>
          </div>
        </motion.div>
      )}

      {screen === "ride-request" && (
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", damping: 20 }}
          className="absolute inset-0 z-30 flex items-end sm:items-center justify-center bg-foreground/50 backdrop-blur-sm"
        >
          <motion.div
            initial={{ y: 100 }}
            animate={{ y: 0 }}
            className="bg-card rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:mx-6 sm:max-w-sm overflow-hidden"
          >
            <div className="bg-primary px-4 py-4 text-center">
              <p className="text-primary-foreground/80 text-xs">New ride</p>
              <p className="text-2xl font-bold text-primary-foreground">70 MVR</p>
              <p className="text-primary-foreground/70 text-xs mt-0.5">~4.2 km • ~12 min</p>
            </div>

            <div className="px-4 py-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-surface flex items-center justify-center text-sm font-bold text-foreground shrink-0">
                  AN
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-sm text-foreground truncate">Ahmed Naseem</p>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Star className="w-3 h-3 text-primary fill-primary shrink-0" />
                    4.8 • 45 rides
                  </div>
                </div>
              </div>

              <div className="bg-surface rounded-xl p-3 space-y-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-2 h-2 rounded-full bg-primary shrink-0" />
                  <p className="text-xs text-foreground truncate">Majeedhee Magu, Malé</p>
                </div>
                <div className="ml-1 w-0.5 h-2.5 bg-border" />
                <div className="flex items-center gap-2 min-w-0">
                  <MapPin className="w-2 h-2 text-foreground shrink-0" />
                  <p className="text-xs text-foreground truncate">Velana International Airport</p>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setScreen("online")}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-surface text-foreground rounded-xl py-3 text-sm font-semibold"
                >
                  <X className="w-4 h-4" />
                  Decline
                </button>
                <button
                  onClick={() => setScreen("navigating")}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-primary text-primary-foreground rounded-xl py-3 text-sm font-semibold"
                >
                  <CheckCircle className="w-4 h-4" />
                  Accept
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}

      {screen === "navigating" && (
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          transition={{ type: "spring", damping: 30, stiffness: 300 }}
          className="absolute bottom-0 left-0 right-0 bg-card rounded-t-2xl shadow-[0_-4px_30px_rgba(0,0,0,0.1)] z-10"
        >
          <div className="p-5 space-y-4">
            <div className="flex justify-center">
              <div className="w-10 h-1 rounded-full bg-border" />
            </div>

            <div className="bg-primary rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="text-primary-foreground/80 text-xs">Heading to passenger</p>
                <p className="text-2xl font-bold text-primary-foreground">3 min</p>
              </div>
              <Navigation className="w-8 h-8 text-primary-foreground" />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-surface flex items-center justify-center text-lg font-bold text-foreground">
                  AN
                </div>
                <div>
                  <p className="font-semibold text-foreground">Ahmed Naseem</p>
                  <p className="text-xs text-muted-foreground">Majeedhee Magu, Malé</p>
                </div>
              </div>
              <button className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
                <Phone className="w-5 h-5 text-primary-foreground" />
              </button>
            </div>

            <div className="bg-surface rounded-xl p-3 space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-primary" />
                <p className="text-sm text-foreground">Majeedhee Magu, Malé</p>
              </div>
              <div className="ml-1 w-0.5 h-3 bg-border" />
              <div className="flex items-center gap-2">
                <MapPin className="w-2.5 h-2.5 text-foreground" />
                <p className="text-sm text-foreground">Velana International Airport</p>
              </div>
            </div>

            <button
              onClick={() => setScreen("complete")}
              className="w-full bg-primary text-primary-foreground font-semibold py-4 rounded-xl text-base active:scale-[0.98]"
            >
              Complete ride
            </button>
          </div>
        </motion.div>
      )}

      {screen === "complete" && (
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="absolute inset-0 z-30 flex items-center justify-center bg-foreground/50 backdrop-blur-sm"
        >
          <motion.div
            initial={{ y: 30 }}
            animate={{ y: 0 }}
            className="bg-card rounded-2xl shadow-2xl mx-6 w-full max-w-sm p-6 text-center space-y-5"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", delay: 0.2 }}
              className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto"
            >
              <CheckCircle className="w-10 h-10 text-primary" />
            </motion.div>

            <div>
              <h3 className="text-xl font-bold text-foreground">Ride complete!</h3>
              <p className="text-muted-foreground text-sm mt-1">Well done, Ibrahim</p>
            </div>

            <div className="bg-surface rounded-xl p-4">
              <p className="text-3xl font-bold text-primary">70 MVR</p>
              <p className="text-xs text-muted-foreground mt-1">Earnings from this ride</p>
            </div>

            <div className="flex gap-3">
              {[
                { label: "Distance", value: "4.2 km" },
                { label: "Duration", value: "12 min" },
                { label: "Rating", value: "⭐ 5.0" },
              ].map((s) => (
                <div key={s.label} className="flex-1 bg-surface rounded-lg p-2">
                  <p className="text-sm font-bold text-foreground">{s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>

            <button
              onClick={() => setScreen("online")}
              className="w-full bg-primary text-primary-foreground font-semibold py-4 rounded-xl"
            >
              Continue
            </button>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
};

export default DriverApp;
