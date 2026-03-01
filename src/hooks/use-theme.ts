import { useState, useEffect, useCallback } from "react";

type Theme = "light" | "dark";

const THEME_KEY = "hda_theme";

export const useTheme = () => {
  const [theme, setThemeState] = useState<Theme>(() => {
    try {
      const stored = localStorage.getItem(THEME_KEY);
      if (stored === "dark" || stored === "light") return stored;
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

  const toggleTheme = useCallback(() => {
    // Create a full-screen overlay that captures the current look, then fades out
    const overlay = document.createElement("div");
    overlay.style.cssText = `
      position: fixed; inset: 0; z-index: 99999;
      background: ${document.documentElement.classList.contains("dark") ? "hsl(210,30%,6%)" : "hsl(0,0%,100%)"};
      pointer-events: none;
      transition: opacity 0.35s cubic-bezier(0.4, 0, 0.2, 1);
      opacity: 1;
    `;
    document.body.appendChild(overlay);

    // Switch theme
    setThemeState(prev => prev === "dark" ? "light" : "dark");

    // Fade out the overlay to reveal new theme
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        overlay.style.opacity = "0";
        overlay.addEventListener("transitionend", () => overlay.remove(), { once: true });
        // Fallback removal
        setTimeout(() => overlay.remove(), 500);
      });
    });
  }, []);

  const setTheme = (t: Theme) => setThemeState(t);

  return { theme, toggleTheme, setTheme };
};
