import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";

interface ThemeToggleProps {
  /** Render as a compact icon button (default) or a labeled row */
  variant?: "icon" | "row";
  className?: string;
}

const ThemeToggle = ({ variant = "icon", className = "" }: ThemeToggleProps) => {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  if (variant === "row") {
    return (
      <button
        onClick={toggleTheme}
        className={`w-full flex items-center justify-between bg-surface rounded-xl px-4 py-3 active:scale-[0.98] transition-transform ${className}`}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            {isDark ? <Moon className="w-5 h-5 text-primary" /> : <Sun className="w-5 h-5 text-primary" />}
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-foreground">
              {isDark ? "Dark Mode" : "Light Mode"}
            </p>
            <p className="text-xs text-muted-foreground">
              Tap to switch to {isDark ? "light" : "dark"}
            </p>
          </div>
        </div>
        <div className={`w-11 h-6 rounded-full relative transition-colors ${isDark ? "bg-primary" : "bg-border"}`}>
          <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-primary-foreground shadow transition-transform ${isDark ? "left-[22px]" : "left-0.5"}`} />
        </div>
      </button>
    );
  }

  return (
    <button
      onClick={toggleTheme}
      className={`w-10 h-10 rounded-full bg-card shadow-md flex items-center justify-center active:scale-95 transition-transform ${className}`}
      title={`Switch to ${isDark ? "light" : "dark"} mode`}
    >
      {isDark ? <Sun className="w-5 h-5 text-foreground" /> : <Moon className="w-5 h-5 text-foreground" />}
    </button>
  );
};

export default ThemeToggle;
