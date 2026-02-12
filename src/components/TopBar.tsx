import { Menu, Bell, Car } from "lucide-react";
import hdaLogo from "@/assets/hda-logo.png";

interface TopBarProps {
  onDriverMode?: () => void;
  userName?: string;
}

const TopBar = ({ onDriverMode, userName }: TopBarProps) => {
  return (
    <div className="absolute top-0 left-0 right-0 z-20 p-4">
      <div className="flex items-center justify-between">
        <button className="w-10 h-10 rounded-full bg-card shadow-md flex items-center justify-center">
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
  );
};

export default TopBar;
