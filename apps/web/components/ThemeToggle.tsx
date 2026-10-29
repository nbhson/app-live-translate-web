"use client";
import { useEffect, useState } from "react";
import { applyTheme, loadSettings, saveSetting, type Theme } from "../lib/settings";

/**
 * Dark/light toggle (R2-7). The <html> element ships class="dark" + a
 * pre-paint bootstrap script in layout.tsx; this component only syncs state
 * after mount and flips the class + persisted setting on click.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const t = loadSettings().theme;
    setTheme(t);
    applyTheme(t);
  }, []);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    saveSetting("theme", next);
    applyTheme(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className="icon-btn"
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title={theme === "dark" ? "Light mode" : "Dark mode"}
    >
      {theme === "dark" ? "🌙" : "☀️"}
    </button>
  );
}
