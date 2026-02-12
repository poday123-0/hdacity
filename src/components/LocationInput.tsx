import { MapPin, Navigation, Clock, Star } from "lucide-react";
import { motion } from "framer-motion";

interface LocationInputProps {
  onSearch: () => void;
}

const recentLocations = [
  { name: "Aéroport HDA", address: "Aéroport International", icon: Star },
  { name: "Gare Centrale", address: "Avenue Mohammed V", icon: Clock },
  { name: "Centre Commercial", address: "Boulevard Principal", icon: Clock },
];

const LocationInput = ({ onSearch }: LocationInputProps) => {
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
          <h2 className="text-xl font-bold text-foreground">Où allez-vous ?</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Réservez votre course HDA TAXI</p>
        </div>

        {/* Search Input */}
        <button
          onClick={onSearch}
          className="w-full flex items-center gap-3 bg-surface rounded-xl px-4 py-3.5 text-left transition-colors hover:bg-muted"
        >
          <Navigation className="w-5 h-5 text-primary shrink-0" />
          <span className="text-muted-foreground text-sm">Rechercher une destination</span>
        </button>

        {/* Pickup location */}
        <div className="flex items-center gap-3 px-1">
          <div className="flex flex-col items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse-dot" />
            <div className="w-0.5 h-8 bg-border" />
            <div className="w-2.5 h-2.5 rounded-sm bg-foreground" />
          </div>
          <div className="flex-1 space-y-3">
            <div className="bg-surface rounded-xl px-4 py-3">
              <p className="text-xs text-muted-foreground">Point de départ</p>
              <p className="text-sm font-medium text-foreground">Ma position actuelle</p>
            </div>
            <div
              onClick={onSearch}
              className="bg-surface rounded-xl px-4 py-3 cursor-pointer hover:bg-muted transition-colors"
            >
              <p className="text-xs text-muted-foreground">Destination</p>
              <p className="text-sm text-muted-foreground">Choisir la destination</p>
            </div>
          </div>
        </div>

        {/* Recent locations */}
        <div className="space-y-1 pt-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">Récents</p>
          {recentLocations.map((loc) => (
            <button
              key={loc.name}
              onClick={onSearch}
              className="flex items-center gap-3 w-full px-3 py-3 rounded-xl hover:bg-surface transition-colors"
            >
              <div className="w-10 h-10 rounded-full bg-surface flex items-center justify-center shrink-0">
                <loc.icon className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="text-left">
                <p className="text-sm font-medium text-foreground">{loc.name}</p>
                <p className="text-xs text-muted-foreground">{loc.address}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </motion.div>
  );
};

export default LocationInput;
