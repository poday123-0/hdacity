import { useState, useEffect } from "react";

type Theme = "light" | "dark";

const THEME_KEY = "hda_theme";

export const useTheme = () => {
  const [theme, setThemeState] = useState<Theme>(() => {
    try {
      const stored = localStorage.getItem(THEME_KEY);
      if (stored === "dark" || stored === "light") return stored;
      if (window.matchMedia("(prefers-color-scheme: dark)").matches) return "dark";
    } catch {}
    return "light";
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  const toggleTheme = () => setThemeState(prev => prev === "dark" ? "light" : "dark");
  const setTheme = (t: Theme) => setThemeState(t);

  return { theme, toggleTheme, setTheme };
};
